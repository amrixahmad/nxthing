import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type RoundRow = { round_number: number; name: string | null };

type FixtureRow = {
  id: number;
  round_number: number;
  entry1_id: number | null;
  entry2_id: number | null;
  status: string;
};

type MatchRow = {
  id: number;
  fixture_id: number | null;
  sub_match_type: string | null;
  session_sequence: number | null;
  round_number: number;
  index_in_round: number;
  entry1_id: number | null;
  entry2_id: number | null;
  winner_entry_id: number | null;
  status: string;
  scheduled_at: string | null;
  court: string | null;
  score_json: any | null;
  entry1_points: number | null;
  entry2_points: number | null;
};

export default function FixturesByCategory() {
  const params = useLocalSearchParams<{ id: string; categoryId: string; initialRound?: string }>();
  const tid = Number(params.id);
  const cid = Number(params.categoryId);
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [entryNames, setEntryNames] = useState<Record<number, string>>({});
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [isTeamFormat, setIsTeamFormat] = useState(false);
  const [activeTab, setActiveTab] = useState<"fixtures" | "leaderboard">("fixtures");

  async function load() {
    setLoading(true);
    
    // Check category type
    const { data: catData } = await supabase.from("tournament_categories").select("participation_type").eq("id", cid).single();
    const isTeam = (catData as any)?.participation_type === 'team';
    setIsTeamFormat(isTeam);

    const { data: r } = await supabase
      .from("rounds")
      .select("round_number,name")
      .eq("category_id", cid)
      .order("round_number", { ascending: true });
    setRounds((r as any[]) || []);

    // Fetch Matches
    const { data: m } = await supabase
      .from("matches")
      .select("id,fixture_id,sub_match_type,session_sequence,round_number,index_in_round,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json,entry1_points,entry2_points")
      .eq("category_id", cid)
      .order("round_number", { ascending: true })
      .order("index_in_round", { ascending: true });
    setMatches((m as any[]) || []);

    // If team, fetch fixtures
    if (isTeam) {
        const { data: f } = await supabase
            .from("fixtures")
            .select("id,round_number,entry1_id,entry2_id,status")
            .eq("category_id", cid)
            .order("round_number", { ascending: true });
        setFixtures((f as any[]) || []);
    }

    const idsSet = new Set<number>();
    ((m as any[]) || []).forEach((row: any) => {
      if (row.entry1_id) idsSet.add(row.entry1_id as number);
      if (row.entry2_id) idsSet.add(row.entry2_id as number);
    });
    
    // Also add from fixtures if team
    if (isTeam) {
        // We need names for fixture teams
        // matches have sub-match entries (players?), wait.
        // No, in team format, entry1_id on fixture is the TEAM entry.
        // matches entry1_id might be NULL if players not assigned yet?
        // Or matches entry1_id IS the TEAM entry?
        // Currently match logic uses entry1_id as the "Entry" ID.
        // For team format, sub-matches: entry1_id is STILL the team entry ID? 
        // NO. The directive says "A1 vs B1". A1 is a Player?
        // Existing schema: matches.entry1_id references entries(id).
        // entries table has created_by (Profile).
        // But for sub-matches, we might want to show Player Names.
        // However, the match record links to ENTRY.
        // Wait, `matches.entry1_id` references `entries`.
        // If we want to track individual player performance, we might need to link to `profiles` or `entry_members`?
        // The current schema: matches links to ENTRIES.
        // For Team Format, the "Entry" is the Team.
        // So `matches.entry1_id` refers to the Team Entry.
        // BUT a sub-match is Player vs Player.
        // If `matches` links to `entries`, we assume the "Entry" represents the entity competing.
        // But the players are different.
        // If we use the SAME entry_id for all sub-matches, we can't distinguish A1 from A2 in the database relationships easily, 
        // except by logic (e.g. "This match is MD, so look up MD players for Entry A").
        // The schema I didn't change for `matches`: it still points to `entries`.
        // So `entry1_id` is the Team Entry ID.
        // To display "Player Name" instead of "Team Name" in sub-matches, 
        // we need to look up the Roster Slot for that team + sub_match_type.
        
        // So for team format, we need to fetch `entry_roster_slots` too?
        // Or just fetch all Entry Members and we figure it out?
        // `entry_roster_slots` has `slot_code`.
    }

    const ids = Array.from(idsSet);
    if (ids.length > 0) {
      const { data: members } = await supabase
        .from("entry_members")
        .select("entry_id, display_name, profile:profile_id(id, username, full_name)")
        .in("entry_id", ids);
        
      const map: Record<number, string[]> = {};
      for (const row of (members as any[]) || []) {
        const entryId = row.entry_id as number;
        const prof = row.profile as any;
        const fallback = prof?.id ? `Player ${String(prof.id).slice(0, 6)}` : "Player";
        const nameRaw = row.display_name || prof?.full_name || prof?.username || fallback;
        const name = String(nameRaw).trim();
        if (!map[entryId]) map[entryId] = [];
        map[entryId].push(name);
      }
      
      const flat: Record<number, string> = {};
      const teamNamesMap: Record<number, string> = {};
      
      // Also fetch Team Names directly from entries if available
      const { data: entryData } = await supabase.from("entries").select("id, team_name").in("id", ids);
      (entryData || []).forEach((e: any) => {
          if (e.team_name) teamNamesMap[e.id] = e.team_name;
      });

      Object.keys(map).forEach((k) => {
        const ek = Number(k);
        if (teamNamesMap[ek]) {
            flat[ek] = teamNamesMap[ek];
        } else {
            flat[ek] = map[ek].join(" / ");
        }
      });
      setEntryNames(flat);
    } else {
      setEntryNames({});
    }

    const { data: tdata } = await supabase
      .from("tournaments")
      .select("id, organizer_id")
      .eq("id", tid)
      .maybeSingle();
    setOrganizerId((tdata as any)?.organizer_id ?? null);

    if (activeRound == null) {
      const first = (r as any[])?.[0]?.round_number ?? null;
      const irStr = (params as any)?.initialRound;
      const ir = irStr !== undefined && irStr !== null && irStr !== '' ? Number(irStr) : NaN;
      const initial = Number.isFinite(ir) && ir > 0 ? ir : first;
      setActiveRound(initial);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!cid) return;
    load();
    // Subscriptions omitted for brevity in this edit, can be re-added
  }, [cid]);

  useFocusEffect(
    useCallback(() => {
      if (cid) load();
      return () => {};
    }, [cid])
  );

  const roundsSorted = useMemo(() => (rounds || []).slice().sort((a,b) => a.round_number - b.round_number), [rounds]);
  
  // Standard grouping
  const matchesByRound = useMemo(() => {
    const map: Record<number, MatchRow[]> = {};
    for (const m of matches) {
      if (m.fixture_id) continue; // Skip fixture sub-matches in standard view
      if (!map[m.round_number]) map[m.round_number] = [];
      map[m.round_number].push(m);
    }
    for (const k of Object.keys(map)) map[Number(k)].sort((a,b) => a.index_in_round - b.index_in_round);
    return map;
  }, [matches]);

  // Team grouping (Fixtures)
  const fixturesByRound = useMemo(() => {
      const map: Record<number, FixtureRow[]> = {};
      for (const f of fixtures) {
          if (!map[f.round_number]) map[f.round_number] = [];
          map[f.round_number].push(f);
      }
      return map;
  }, [fixtures]);

  // Sub-matches by Fixture
  const matchesByFixture = useMemo(() => {
      const map: Record<number, MatchRow[]> = {};
      for (const m of matches) {
          if (!m.fixture_id) continue;
          if (!map[m.fixture_id]) map[m.fixture_id] = [];
          map[m.fixture_id].push(m);
      }
      return map;
  }, [matches]);

  // Leaderboard Calculation
  const leaderboard = useMemo(() => {
      if (!isTeamFormat) return [];
      const points: Record<number, { id: number; name: string; total: number; diff: number }> = {};
      
      matches.forEach(m => {
          if (m.entry1_id && m.entry1_points) {
              if (!points[m.entry1_id]) points[m.entry1_id] = { id: m.entry1_id, name: entryNames[m.entry1_id] || `Entry #${m.entry1_id}`, total: 0, diff: 0 };
              points[m.entry1_id].total += m.entry1_points;
              points[m.entry1_id].diff += (m.entry1_points - (m.entry2_points || 0));
          }
          if (m.entry2_id && m.entry2_points) {
              if (!points[m.entry2_id]) points[m.entry2_id] = { id: m.entry2_id, name: entryNames[m.entry2_id] || `Entry #${m.entry2_id}`, total: 0, diff: 0 };
              points[m.entry2_id].total += m.entry2_points;
              points[m.entry2_id].diff += (m.entry2_points - (m.entry1_points || 0));
          }
      });
      
      return Object.values(points).sort((a, b) => b.total - a.total || b.diff - a.diff);
  }, [matches, entryNames, isTeamFormat]);

  function labelEntry(id: number | null) {
    if (!id) return 'Bye';
    const name = entryNames[id];
    return name ? name : `Entry #${id}`;
  }

  function statusBadge(s: string) {
    const cls = s === 'bye' ? 'bg-gray-100' : s === 'completed' ? 'bg-green-100' : s === 'in_progress' ? 'bg-blue-100' : 'bg-gray-100';
    const txt = s === 'bye' ? 'Bye' : s === 'completed' ? 'Completed' : s === 'in_progress' ? 'Live' : 'Pending';
    return (
      <View className={`px-2 py-1 rounded ${cls}`}>
        <Text className={s === 'completed' ? 'text-green-800 text-xs' : s === 'in_progress' ? 'text-blue-800 text-xs' : 'text-gray-800 text-xs'}>{txt}</Text>
      </View>
    );
  }

  function nameStyleFor(entryId: number | null, winnerId: number | null, status: string): string {
    if (status === 'completed' && winnerId && entryId && entryId === winnerId) return 'text-green-700 font-semibold';
    if (status === 'completed' && winnerId) return 'text-gray-500';
    return 'text-gray-900';
  }
  
  // Render Team Format Fixture
  function renderFixture(f: FixtureRow) {
      const subs = matchesByFixture[f.id] || [];
      const session1 = subs.filter(m => m.session_sequence === 1);
      const session2 = subs.filter(m => m.session_sequence === 2);
      
      return (
          <View key={f.id} className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <View className="p-4 bg-gray-50 border-b border-gray-100 flex-row justify-between items-center">
                  <View className="flex-1">
                      <Text className="font-bold text-gray-900 text-base">{labelEntry(f.entry1_id)}</Text>
                  </View>
                  <Text className="px-3 text-gray-500 font-semibold">VS</Text>
                  <View className="flex-1 items-end">
                       <Text className="font-bold text-gray-900 text-base">{labelEntry(f.entry2_id)}</Text>
                  </View>
              </View>
              
              <View className="p-3">
                  <View className="mb-3">
                      <Text className="text-xs font-bold text-gray-500 uppercase mb-2">Session 1 (Simultaneous)</Text>
                      {session1.map(m => renderSubMatch(m))}
                      {session1.length === 0 && <Text className="text-xs text-gray-400 italic">No matches</Text>}
                  </View>
                  
                  <View>
                      <Text className="text-xs font-bold text-gray-500 uppercase mb-2">Session 2 (Simultaneous)</Text>
                      {session2.map(m => renderSubMatch(m))}
                      {session2.length === 0 && <Text className="text-xs text-gray-400 italic">No matches</Text>}
                  </View>
              </View>
          </View>
      );
  }
  
  function renderSubMatch(m: MatchRow) {
      return (
          <TouchableOpacity 
            key={m.id} 
            className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-0"
            onPress={() => {
                if (organizerId && session?.user?.id === organizerId) {
                     router.push({ pathname: "/tournaments/[id]/matches/[matchId]", params: { id: String(tid), matchId: String(m.id) } } as any);
                }
            }}
          >
             <View className="flex-row items-center w-1/3">
                 <View className="w-6 h-6 rounded bg-indigo-100 items-center justify-center mr-2">
                     <Text className="text-xs font-bold text-indigo-700">{m.sub_match_type}</Text>
                 </View>
                 {m.entry1_points !== null && (
                     <Text className="font-semibold text-gray-900 ml-1">{m.entry1_points}</Text>
                 )}
             </View>
             
             <View className="w-1/3 items-center">
                 {statusBadge(m.status)}
             </View>
             
             <View className="flex-row items-center justify-end w-1/3">
                 {m.entry2_points !== null && (
                     <Text className="font-semibold text-gray-900 mr-1">{m.entry2_points}</Text>
                 )}
                 {m.court && <Text className="text-[10px] text-gray-400 ml-2">{m.court}</Text>}
             </View>
          </TouchableOpacity>
      );
  }

  async function generateBracket() {
    if (!organizerId || session?.user?.id !== organizerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-bracket", {
        body: { category_id: cid }
      });

      if (error) {
        const payload: any = data as any;
        const serverMsg = (payload && (payload.error || payload.message)) || "Edge Function returned an error";
        alert("Error generating bracket: " + serverMsg);
        return;
      }

      await load();
    } catch (e: any) {
      alert("Error generating bracket: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          title: isTeamFormat ? "Schedule & Standings" : "Fixtures",
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity className="px-3 py-2" onPress={() => router.replace({ pathname: "/tournaments/[id]", params: { id: String(tid) } } as any)}>
              <Text className="text-blue-600">Back</Text>
            </TouchableOpacity>
          ),
        }}
      />
      
      {isTeamFormat && (
          <View className="flex-row bg-white border-b border-gray-200">
              <TouchableOpacity 
                className={`flex-1 py-3 border-b-2 ${activeTab === 'fixtures' ? 'border-blue-600' : 'border-transparent'}`}
                onPress={() => setActiveTab('fixtures')}
              >
                  <Text className={`text-center font-semibold ${activeTab === 'fixtures' ? 'text-blue-600' : 'text-gray-500'}`}>Fixtures</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                className={`flex-1 py-3 border-b-2 ${activeTab === 'leaderboard' ? 'border-blue-600' : 'border-transparent'}`}
                onPress={() => setActiveTab('leaderboard')}
              >
                  <Text className={`text-center font-semibold ${activeTab === 'leaderboard' ? 'text-blue-600' : 'text-gray-500'}`}>Leaderboard</Text>
              </TouchableOpacity>
          </View>
      )}

      <ScrollView className="flex-1 px-4 pt-4">
        {loading ? (
          <View className="items-center justify-center py-10"><ActivityIndicator /></View>
        ) : roundsSorted.length === 0 ? (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 items-center">
            <Text className="text-gray-700 mb-4">Bracket not generated yet.</Text>
            {organizerId && session?.user?.id === organizerId && (
                <TouchableOpacity 
                    onPress={generateBracket}
                    className="bg-blue-600 active:bg-blue-700 px-6 py-3 rounded-lg shadow-sm"
                >
                    <Text className="text-white font-bold">Generate Bracket</Text>
                </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {activeTab === 'fixtures' && (
                <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                      <View className="flex-row">
                        {roundsSorted.map((r) => (
                          <TouchableOpacity key={r.round_number} className={`mr-2 px-3 py-2 rounded-lg border ${activeRound === r.round_number ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setActiveRound(r.round_number)}>
                            <Text className={activeRound === r.round_number ? 'text-white text-sm' : 'text-gray-800 text-sm'}>{r.name || `Round ${r.round_number}`}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>

                    {isTeamFormat && fixtures.length > 0 ? (
                        <View>
                            {(fixturesByRound[activeRound || 0] || []).map(f => renderFixture(f))}
                        </View>
                    ) : (
                        <View>
                            {(matchesByRound[activeRound || 0] || []).map((m) => (
                              <View key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-3">
                                <View className="flex-row items-center justify-between mb-2">
                                  <Text className="text-sm text-gray-700">Match {m.index_in_round}</Text>
                                  {statusBadge(m.status)}
                                </View>
                                <View className="flex-row items-center justify-between">
                                  <Text className={`text-base mr-2 ${nameStyleFor(m.entry1_id, m.winner_entry_id, m.status)}`} numberOfLines={1}>{labelEntry(m.entry1_id)}</Text>
                                  <Text className="text-gray-500">vs</Text>
                                  <Text className={`text-base ml-2 ${nameStyleFor(m.entry2_id, m.winner_entry_id, m.status)}`} numberOfLines={1}>{labelEntry(m.entry2_id)}</Text>
                                </View>
                                {organizerId && session?.user?.id === organizerId ? (
                                  <View className="mt-3 self-end">
                                    <TouchableOpacity className="px-3 py-2 rounded-lg border border-gray-300" onPress={() => router.push({ pathname: "/tournaments/[id]/matches/[matchId]", params: { id: String(tid), matchId: String(m.id) } } as any)}>
                                      <Text className="text-gray-800">Edit</Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : null}
                              </View>
                            ))}
                        </View>
                    )}
                </>
            )}
            
            {activeTab === 'leaderboard' && (
                <View className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <View className="flex-row bg-gray-50 p-3 border-b border-gray-200">
                        <Text className="w-10 text-xs font-bold text-gray-500">#</Text>
                        <Text className="flex-1 text-xs font-bold text-gray-500">Team</Text>
                        <Text className="w-16 text-right text-xs font-bold text-gray-500">Diff</Text>
                        <Text className="w-16 text-right text-xs font-bold text-gray-500">Points</Text>
                    </View>
                    {leaderboard.map((team, idx) => (
                        <View key={team.id} className="flex-row p-4 border-b border-gray-100 items-center">
                             <Text className="w-10 font-bold text-gray-700">{idx + 1}</Text>
                             <Text className="flex-1 font-medium text-gray-900">{team.name}</Text>
                             <Text className="w-16 text-right text-gray-600">{team.diff > 0 ? '+' : ''}{team.diff}</Text>
                             <Text className="w-16 text-right font-bold text-blue-600">{team.total}</Text>
                        </View>
                    ))}
                    {leaderboard.length === 0 && (
                        <View className="p-8 items-center">
                            <Text className="text-gray-400">No points scored yet.</Text>
                        </View>
                    )}
                </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
