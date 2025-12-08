import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSession } from "@/context/SessionProvider";
import { formatDateTimeLocal } from "@/src/utils/datetime";
import { supabase } from "@/lib/supabase";

type RoundRow = { round_number: number; name: string | null };

type FixtureRow = {
  id: number;
  round_number: number;
  entry1_id: number | null;
  entry2_id: number | null;
  status: string;
  stage?: string | null;
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
  referee_profile_id: string | null;
};

export default function FixturesByCategory() {
  const params = useLocalSearchParams<{ id: string; categoryId: string; initialRound?: string }>();
  const tid = Number(params.id);
  const cid = Number(params.categoryId);
  const { session } = useSession();
  const userId = session?.user?.id || null;

  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [entryNames, setEntryNames] = useState<Record<number, string>>({});
  const [rosterByEntry, setRosterByEntry] = useState<Record<number, Record<string, string[]>>>({});
  const [refereeNames, setRefereeNames] = useState<Record<string, string>>({});
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [isTeamFormat, setIsTeamFormat] = useState(false);
  const [activeTab, setActiveTab] = useState<"fixtures" | "leaderboard">("fixtures");
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const TEAM_COLOR_CLASSES = [
    "bg-rose-200",
    "bg-amber-200",
    "bg-emerald-200",
    "bg-sky-200",
    "bg-indigo-200",
    "bg-purple-200",
    "bg-pink-200",
    "bg-teal-200",
  ];

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
      .select("id,fixture_id,sub_match_type,session_sequence,round_number,index_in_round,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json,entry1_points,entry2_points,referee_profile_id")
      .eq("category_id", cid)
      .order("round_number", { ascending: true })
      .order("index_in_round", { ascending: true });
    setMatches((m as any[]) || []);

    // If team, fetch fixtures
    let fixturesData: any[] = [];
    if (isTeam) {
      const { data: f } = await supabase
        .from("fixtures")
        .select("id,round_number,entry1_id,entry2_id,status,stage")
        .eq("category_id", cid)
        .order("round_number", { ascending: true });
      fixturesData = (f as any[]) || [];
      setFixtures(fixturesData);
    }

    const idsSet = new Set<number>();
    ((m as any[]) || []).forEach((row: any) => {
      if (row.entry1_id) idsSet.add(row.entry1_id as number);
      if (row.entry2_id) idsSet.add(row.entry2_id as number);
    });

    // Also add from fixtures if team so we can label fixtures with team names
    if (isTeam && fixturesData.length > 0) {
      fixturesData.forEach((row: any) => {
        if (row.entry1_id) idsSet.add(row.entry1_id as number);
        if (row.entry2_id) idsSet.add(row.entry2_id as number);
      });
    }

    const ids = Array.from(idsSet);
    if (ids.length > 0) {
      const { data: members } = await supabase
        .from("entry_members")
        .select("entry_id, display_name, profile:profile_id(id, username, full_name)")
        .in("entry_id", ids);

      const map: Record<number, string[]> = {};
      const profileNameById: Record<string, string> = {};
      const nameByEntryProfile: Record<number, Record<string, string>> = {};
      for (const row of (members as any[]) || []) {
        const entryId = row.entry_id as number;
        const prof = row.profile as any;
        const pid = String(prof?.id || "");
        const fallback = pid ? `Player ${pid.slice(0, 6)}` : "Player";
        const nameRaw = row.display_name || prof?.full_name || prof?.username || fallback;
        const name = String(nameRaw).trim();
        if (!map[entryId]) map[entryId] = [];
        map[entryId].push(name);
        if (pid) {
          profileNameById[pid] = name;
          if (!nameByEntryProfile[entryId]) nameByEntryProfile[entryId] = {};
          nameByEntryProfile[entryId][pid] = name;
        }
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

      // Load roster slots for these entries to resolve MD/WD/XD/S pairs
      const { data: rosterRows } = await supabase
        .from("entry_roster_slots")
        .select("entry_id, profile_id, slot_code")
        .in("entry_id", ids);

      const rosterMap: Record<number, Record<string, string[]>> = {};
      for (const row of (rosterRows as any[]) || []) {
        const entryId = row.entry_id as number;
        const code = String(row.slot_code || "");
        const pid = String(row.profile_id || "");
        const perEntryNames = nameByEntryProfile[entryId];
        const seededName = perEntryNames ? perEntryNames[pid] : undefined;
        const baseName =
          seededName ||
          profileNameById[pid] ||
          (pid ? `Player ${pid.slice(0, 6)}` : "Player");
        if (!rosterMap[entryId]) rosterMap[entryId] = {};
        if (!rosterMap[entryId][code]) rosterMap[entryId][code] = [];
        rosterMap[entryId][code].push(baseName);
      }

      setRosterByEntry(rosterMap);
    } else {
      setEntryNames({});
      setRosterByEntry({});
    }

    const { data: tdata } = await supabase
      .from("tournaments")
      .select("id, organizer_id")
      .eq("id", tid)
      .maybeSingle();
    setOrganizerId((tdata as any)?.organizer_id ?? null);

    // Load referee display names for this tournament
    const { data: refRows } = await supabase
      .from("tournament_referees")
      .select("profile_id, profile:profile_id(id, full_name, username)")
      .eq("tournament_id", tid);
    const refMap: Record<string, string> = {};
    for (const row of (refRows as any[]) || []) {
      const prof = (row as any).profile as any;
      const pid = String((row as any).profile_id || "");
      const fallback = pid ? `Ref ${pid.slice(0, 6)}` : "Referee";
      const nameRaw = prof?.full_name || prof?.username || fallback;
      const name = String(nameRaw).trim();
      if (pid) refMap[pid] = name;
    }
    setRefereeNames(refMap);

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

  const hasKnockout = useMemo(
    () => fixtures.some((f) => f.stage === "knockout"),
    [fixtures]
  );

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

  // Infer groups for team formats based on group-stage fixtures (same idea as team-knockout)
  const groupInfo = useMemo(() => {
      if (!isTeamFormat) return { groups: [] as number[][], entryToGroup: {} as Record<number, number> };

      const groupStageFixtures = fixtures.filter((f) => !f.stage || f.stage === "group");
      const neighbors: Record<number, Set<number>> = {};
      const teamIdsSet = new Set<number>();

      for (const f of groupStageFixtures) {
          const e1 = f.entry1_id;
          const e2 = f.entry2_id;
          if (e1 != null) {
              teamIdsSet.add(e1);
              if (!neighbors[e1]) neighbors[e1] = new Set();
          }
          if (e2 != null) {
              teamIdsSet.add(e2);
              if (!neighbors[e2]) neighbors[e2] = new Set();
          }
          if (e1 != null && e2 != null) {
              neighbors[e1].add(e2);
              neighbors[e2].add(e1);
          }
      }

      const visited = new Set<number>();
      const groups: number[][] = [];
      const entryToGroup: Record<number, number> = {};

      for (const id of teamIdsSet) {
          if (visited.has(id)) continue;
          const queue: number[] = [id];
          visited.add(id);
          const group: number[] = [];
          while (queue.length > 0) {
              const cur = queue.shift() as number;
              group.push(cur);
              const neigh = neighbors[cur];
              if (neigh) {
                  for (const n of neigh) {
                      if (!visited.has(n)) {
                          visited.add(n);
                          queue.push(n);
                      }
                  }
              }
          }
          const idx = groups.length;
          groups.push(group);
          for (const eid of group) {
              entryToGroup[eid] = idx;
          }
      }

      return { groups, entryToGroup };
  }, [fixtures, isTeamFormat]);

  const fixturesByGroup = useMemo(() => {
      const map: Record<number, FixtureRow[]> = {};
      if (!isTeamFormat) return map;
      const { entryToGroup } = groupInfo;
      for (const f of fixtures) {
          if (f.stage === "knockout") continue;
          const e = f.entry1_id ?? f.entry2_id;
          if (e == null) continue;
          const gi = entryToGroup[e];
          if (gi === undefined) continue;
          if (!map[gi]) map[gi] = [];
          map[gi].push(f);
      }
      return map;
  }, [fixtures, isTeamFormat, groupInfo]);

  const groupLabels = useMemo(
      () => groupInfo.groups.map((_g, idx) => ({ index: idx, label: `Group ${idx + 1}` })),
      [groupInfo]
  );

  const visibleGroups = useMemo(
      () =>
        activeGroupIndex == null
          ? groupLabels
          : groupLabels.filter((g) => g.index === activeGroupIndex),
      [groupLabels, activeGroupIndex]
  );

  const knockoutFixturesByRound = useMemo(() => {
      const map: Record<number, FixtureRow[]> = {};
      if (!isTeamFormat) return map;
      for (const f of fixtures) {
          if (f.stage !== "knockout") continue;
          if (!map[f.round_number]) map[f.round_number] = [];
          map[f.round_number].push(f);
      }
      return map;
  }, [fixtures, isTeamFormat]);

  // Leaderboard Calculation
  const leaderboard = useMemo(() => {
      if (!isTeamFormat) return [];

      // Aggregate at the team fixture level (4 sub-matches per fixture)
      const stats: Record<
        number,
        { id: number; name: string; wins: number; played: number; pointsFor: number; pointsAgainst: number; diff: number }
      > = {};

      // Index sub-matches by fixture for quick lookup
      const byFixture: Record<number, MatchRow[]> = {};
      for (const m of matches) {
        if (!m.fixture_id) continue;
        if (!byFixture[m.fixture_id]) byFixture[m.fixture_id] = [];
        byFixture[m.fixture_id].push(m);
      }

      const groupFixtures = fixtures.filter((f) => !f.stage || f.stage === "group");

      for (const f of groupFixtures) {
        const t1 = f.entry1_id;
        const t2 = f.entry2_id;

        // Ignore bye fixtures
        if (t1 == null || t2 == null) continue;

        const subs = byFixture[f.id] || [];
        if (subs.length === 0) continue;

        let total1 = 0;
        let total2 = 0;
        let hasAnyScore = false;

        for (const m of subs) {
          const p1 = m.entry1_points ?? 0;
          const p2 = m.entry2_points ?? 0;
          if (m.entry1_points != null || m.entry2_points != null) {
            hasAnyScore = true;
          }
          total1 += p1;
          total2 += p2;
        }

        // Skip fixtures with no scores at all
        if (!hasAnyScore) continue;

        if (!stats[t1]) {
          stats[t1] = {
            id: t1,
            name: entryNames[t1] || `Entry #${t1}`,
            wins: 0,
            played: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            diff: 0,
          };
        }
        if (!stats[t2]) {
          stats[t2] = {
            id: t2,
            name: entryNames[t2] || `Entry #${t2}`,
            wins: 0,
            played: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            diff: 0,
          };
        }

        // Update played & points
        stats[t1].played += 1;
        stats[t2].played += 1;
        stats[t1].pointsFor += total1;
        stats[t1].pointsAgainst += total2;
        stats[t2].pointsFor += total2;
        stats[t2].pointsAgainst += total1;
        stats[t1].diff = stats[t1].pointsFor - stats[t1].pointsAgainst;
        stats[t2].diff = stats[t2].pointsFor - stats[t2].pointsAgainst;

        // Result: increment wins based on team-level points in this fixture
        if (total1 > total2) {
          stats[t1].wins += 1;
        } else if (total2 > total1) {
          stats[t2].wins += 1;
        }
      }

      return Object.values(stats).sort(
        (a, b) =>
          b.wins - a.wins ||
          b.pointsFor - a.pointsFor ||
          b.diff - a.diff
      );
  }, [matches, fixtures, entryNames, isTeamFormat]);

  function labelEntry(id: number | null) {
    if (!id) return 'Bye';
    const name = entryNames[id];
    return name ? name : `Entry #${id}`;
  }

  function teamColorClass(id: number | null): string {
    if (!id) return "bg-gray-300";
    const idx = Math.abs(id) % TEAM_COLOR_CLASSES.length;
    return TEAM_COLOR_CLASSES[idx] || "bg-gray-300";
  }

  function statusBadge(s: string) {
    const cls =
      s === 'bye'
        ? 'bg-gray-100'
        : s === 'completed'
        ? 'bg-green-100'
        : s === 'in_progress'
        ? 'bg-blue-100'
        : s === 'scheduled'
        ? 'bg-yellow-100'
        : 'bg-gray-100';
    const txt =
      s === 'bye'
        ? 'Bye'
        : s === 'completed'
        ? 'Completed'
        : s === 'in_progress'
        ? 'Live'
        : s === 'scheduled'
        ? 'Scheduled'
        : 'Pending';
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
  
  function slotPairLabel(entryId: number | null, slot: string | null | undefined): string {
    if (!entryId || !slot) return "";
    const perEntry = rosterByEntry[entryId];
    if (!perEntry) return "";
    const names = perEntry[slot] || [];
    if (names.length === 0) return "";
    return names.join(" / ");
  }

  // Render Team Format Fixture
  function renderFixture(f: FixtureRow) {
      const subs = matchesByFixture[f.id] || [];
      const session1 = subs.filter(m => m.session_sequence === 1);
      const session2 = subs.filter(m => m.session_sequence === 2);
      
      return (
          <View key={f.id} className="bg-white rounded-xl shadow-sm border border-gray-100 mb-4 overflow-hidden">
              <View className="p-4 bg-gray-50 border-b border-gray-100 flex-row justify-between items-center">
                  <View className="flex-1 flex-row items-center">
                      <View className={`px-2 py-1 rounded-full ${teamColorClass(f.entry1_id)}`}>
                          <Text className="font-bold text-gray-900 text-xs">{labelEntry(f.entry1_id)}</Text>
                      </View>
                  </View>
                  <Text className="px-3 text-gray-500 font-semibold">VS</Text>
                  <View className="flex-1 flex-row items-center justify-end">
                      <View className={`px-2 py-1 rounded-full ${teamColorClass(f.entry2_id)}`}>
                          <Text className="font-bold text-gray-900 text-xs">{labelEntry(f.entry2_id)}</Text>
                      </View>
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
      const leftPair = slotPairLabel(
        fixtures.find((fx) => fx.id === m.fixture_id)?.entry1_id ?? null,
        m.sub_match_type
      );
      const rightPair = slotPairLabel(
        fixtures.find((fx) => fx.id === m.fixture_id)?.entry2_id ?? null,
        m.sub_match_type
      );
      const scheduledLabel = m.scheduled_at ? formatDateTimeLocal(m.scheduled_at) : "";
      const refName = m.referee_profile_id ? refereeNames[String(m.referee_profile_id)] : undefined;
      return (
          <TouchableOpacity 
            key={m.id} 
            className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-0"
            onPress={() => {
                if (
                  (organizerId && userId && userId === organizerId) ||
                  (m.referee_profile_id && userId && userId === m.referee_profile_id)
                ) {
                     router.push({ pathname: "/tournaments/[id]/matches/[matchId]", params: { id: String(tid), matchId: String(m.id) } } as any);
                }
            }}
          >
             <View className="w-1/3 pr-1">
                 <View className="flex-row items-center">
                     <View className="w-6 h-6 rounded bg-indigo-100 items-center justify-center mr-2">
                         <Text className="text-xs font-bold text-indigo-700">{m.sub_match_type}</Text>
                     </View>
                     {m.entry1_points !== null && (
                         <Text className="font-semibold text-gray-900 ml-1">{m.entry1_points}</Text>
                     )}
                 </View>
                 {leftPair ? (
                   <Text className="text-[10px] text-gray-600 mt-0.5" numberOfLines={1}>{leftPair}</Text>
                 ) : null}
             </View>
             
             <View className="w-1/3 items-center">
                 {statusBadge(m.status)}
                 {(scheduledLabel || m.court || refName) ? (
                   <Text className="text-[10px] text-gray-500 mt-1 text-center" numberOfLines={2}>
                     {scheduledLabel ? scheduledLabel : ""}
                     {scheduledLabel && m.court ? " · " : ""}
                     {m.court ? `Court ${m.court}` : ""}
                     {refName ? ((scheduledLabel || m.court) ? "\n" : "") : ""}
                     {refName ? `Ref: ${refName}` : ""}
                   </Text>
                 ) : null}
             </View>
             
             <View className="w-1/3 pl-1 items-end">
                 <View className="flex-row items-center justify-end">
                     {m.entry2_points !== null && (
                         <Text className="font-semibold text-gray-900 mr-1">{m.entry2_points}</Text>
                     )}
                  </View>
                 {rightPair ? (
                   <Text className="text-[10px] text-gray-600 mt-0.5" numberOfLines={1}>{rightPair}</Text>
                 ) : null}
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

  async function simulateKnockoutRound() {
    if (!organizerId || session?.user?.id !== organizerId) return;
    setLoading(true);
    try {
      const koFixtures = fixtures.filter((f) => f.stage === "knockout");
      if (koFixtures.length === 0) {
        alert("No knockout fixtures to simulate.");
        setLoading(false);
        return;
      }

      const roundNumbers = Array.from(new Set(koFixtures.map((f) => f.round_number))).sort(
        (a, b) => a - b
      );

      let currentRound: number | null = null;
      for (const rn of roundNumbers) {
        const roundFixtures = koFixtures.filter((f) => f.round_number === rn);
        const hasAnyEntry = roundFixtures.some(
          (f) => f.entry1_id != null && f.entry2_id != null
        );
        const hasPending = roundFixtures.some((f) => {
          const subs = matchesByFixture[f.id] || [];
          return subs.some(
            (m) =>
              m.status !== "completed" ||
              (m.entry1_points == null && m.entry2_points == null)
          );
        });
        if (hasAnyEntry && hasPending) {
          currentRound = rn;
          break;
        }
      }

      if (currentRound == null) {
        alert("All knockout rounds already have scores.");
        setLoading(false);
        return;
      }

      const fixturesThisRound = koFixtures.filter(
        (f) => f.round_number === currentRound
      );

      for (const f of fixturesThisRound) {
        if (f.entry1_id == null || f.entry2_id == null) continue;
        const subs = matchesByFixture[f.id] || [];
        for (const m of subs) {
          const base1 = 15 + Math.floor(Math.random() * 8);
          const base2 = 15 + Math.floor(Math.random() * 8);
          let p1 = base1;
          let p2 = base2;
          if (p1 === p2) {
            if (Math.random() < 0.5) p1++;
            else p2++;
          }
          let winner: number | null = null;
          if (p1 > p2 && m.entry1_id != null) winner = m.entry1_id;
          else if (p2 > p1 && m.entry2_id != null) winner = m.entry2_id;

          const { error } = await supabase
            .from("matches")
            .update({
              entry1_points: p1,
              entry2_points: p2,
              winner_entry_id: winner,
              status: "completed",
            })
            .eq("id", m.id);
          if (error) {
            console.warn("Error simulating KO match", m.id, error.message);
          }
        }
      }

      // Advance winners into the next knockout round (if any)
      const { data, error: advError } = await supabase.functions.invoke(
        "team-ko-advance",
        {
          body: { category_id: cid },
        }
      );
      if (advError) {
        const payload: any = data as any;
        const serverMsg =
          (payload && (payload.error || payload.message)) ||
          advError.message ||
          "Edge Function returned an error";
        alert("Error updating knockout: " + serverMsg);
      }

      await load();
    } catch (e: any) {
      alert("Error simulating knockout: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function updateKnockoutBracket() {
    if (!organizerId || session?.user?.id !== organizerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-ko-advance", {
        body: { category_id: cid },
      });

      if (error) {
        const payload: any = data as any;
        const serverMsg = (payload && (payload.error || payload.message)) || "Edge Function returned an error";
        alert("Error updating knockout: " + serverMsg);
        return;
      }

      const msg = ((data as any)?.message as string) || "Knockout bracket updated";
      alert(msg);
      await load();
    } catch (e: any) {
      alert("Error updating knockout: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function generateKnockout() {
    if (!organizerId || session?.user?.id !== organizerId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-knockout", {
        body: { category_id: cid },
      });

      if (error) {
        const payload: any = data as any;
        const serverMsg = (payload && (payload.error || payload.message)) || "Edge Function returned an error";
        alert("Error generating knockout: " + serverMsg);
        return;
      }

      const msg = ((data as any)?.message as string) || "Knockout stage generated";
      alert(msg);
      await load();
    } catch (e: any) {
      alert("Error generating knockout: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  async function simulateGroupStage() {
    if (!organizerId || session?.user?.id !== organizerId) return;
    setLoading(true);
    try {
      const groupFixtures = fixtures.filter((f) => !f.stage || f.stage === "group");
      const groupFixtureIds = new Set<number>(groupFixtures.map((f) => f.id));
      const matchesToUpdate = matches.filter(
        (m) => m.fixture_id != null && groupFixtureIds.has(m.fixture_id)
      );

      for (const m of matchesToUpdate) {
        const base1 = 15 + Math.floor(Math.random() * 8);
        const base2 = 15 + Math.floor(Math.random() * 8);
        let p1 = base1;
        let p2 = base2;
        if (p1 === p2) {
          if (Math.random() < 0.5) p1++; else p2++;
        }
        let winner: number | null = null;
        if (p1 > p2 && m.entry1_id != null) winner = m.entry1_id;
        else if (p2 > p1 && m.entry2_id != null) winner = m.entry2_id;

        const { error } = await supabase
          .from("matches")
          .update({
            entry1_points: p1,
            entry2_points: p2,
            winner_entry_id: winner,
            status: "completed",
          })
          .eq("id", m.id);
        if (error) {
          console.warn("Error simulating match", m.id, error.message);
        }
      }

      await load();
    } catch (e: any) {
      alert("Error simulating group stage: " + (e?.message || String(e)));
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
                    {!isTeamFormat && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                        <View className="flex-row">
                          {roundsSorted.map((r) => (
                            <TouchableOpacity
                              key={r.round_number}
                              className={`mr-2 px-3 py-2 rounded-lg border ${activeRound === r.round_number ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                              onPress={() => setActiveRound(r.round_number)}
                            >
                              <Text className={activeRound === r.round_number ? 'text-white text-sm' : 'text-gray-800 text-sm'}>
                                {r.name || `Round ${r.round_number}`}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}

                    {isTeamFormat && groupLabels.length > 0 && !hasKnockout && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
                        <View className="flex-row">
                          <TouchableOpacity
                            key="all-groups"
                            className={`mr-2 px-3 py-2 rounded-lg border ${
                              activeGroupIndex === null ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                            }`}
                            onPress={() => setActiveGroupIndex(null)}
                          >
                            <Text className={activeGroupIndex === null ? 'text-white text-sm' : 'text-gray-800 text-sm'}>
                              All Groups
                            </Text>
                          </TouchableOpacity>
                          {groupLabels.map((g) => (
                            <TouchableOpacity
                              key={g.index}
                              className={`mr-2 px-3 py-2 rounded-lg border ${
                                activeGroupIndex === g.index ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                              }`}
                              onPress={() => setActiveGroupIndex(g.index)}
                            >
                              <Text className={activeGroupIndex === g.index ? 'text-white text-sm' : 'text-gray-800 text-sm'}>
                                {g.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    )}

                    {isTeamFormat && hasKnockout && organizerId && session?.user?.id === organizerId && (
                      <View className="mb-3 items-end">
                        <TouchableOpacity
                          onPress={updateKnockoutBracket}
                          className="bg-blue-600 active:bg-blue-700 px-4 py-2 rounded-lg"
                        >
                          <Text className="text-white font-semibold text-sm">Update Knockout Bracket</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isTeamFormat && fixtures.length > 0 ? (
                        <View>
                          {hasKnockout && Object.keys(knockoutFixturesByRound).length > 0 && (
                            <View className="mt-4">
                              <Text className="text-xs font-semibold text-gray-500 mb-2">Knockout Stage</Text>
                              {Object.keys(knockoutFixturesByRound)
                                .map((k) => Number(k))
                                .sort((a, b) => b - a)
                                .map((roundNumber) => {
                                  const roundMeta = roundsSorted.find((r) => r.round_number === roundNumber);
                                  const title = roundMeta?.name || `Round ${roundNumber}`;
                                  return (
                                    <View key={roundNumber} className="mb-4">
                                      <Text className="text-sm font-semibold text-gray-700 mb-1">{title}</Text>
                                      {(knockoutFixturesByRound[roundNumber] || []).map((f) => renderFixture(f))}
                                    </View>
                                  );
                                })}
                            </View>
                          )}

                          {visibleGroups.length > 0 && (
                            <Text className="text-xs font-semibold text-gray-500 mb-2 mt-4">Group Stage</Text>
                          )}

                          {visibleGroups.map((g) => (
                            <View key={g.index} className="mb-4">
                              <Text className="text-xs font-semibold text-gray-500 mb-2">{g.label}</Text>
                              {(fixturesByGroup[g.index] || []).map((f) => renderFixture(f))}
                              {(fixturesByGroup[g.index] || []).length === 0 && (
                                <Text className="text-xs text-gray-400 italic">No fixtures for this group.</Text>
                              )}
                            </View>
                          ))}
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
                                {m.referee_profile_id && refereeNames[String(m.referee_profile_id)] ? (
                                  <Text className="mt-1 text-xs text-gray-500">
                                    Ref: {refereeNames[String(m.referee_profile_id)]}
                                  </Text>
                                ) : null}
                                {((organizerId && userId && userId === organizerId) ||
                                  (m.referee_profile_id && userId && userId === m.referee_profile_id)) ? (
                                  <View className="mt-3 self-end">
                                    <TouchableOpacity
                                      className="px-3 py-2 rounded-lg border border-gray-300"
                                      onPress={() =>
                                        router.push({
                                          pathname: "/tournaments/[id]/matches/[matchId]",
                                          params: { id: String(tid), matchId: String(m.id) },
                                        } as any)
                                      }
                                    >
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
                    {isTeamFormat && organizerId && session?.user?.id === organizerId && !hasKnockout && (
                      <View className="p-3 border-b border-gray-200 flex-row justify-between">
                        <TouchableOpacity
                          onPress={simulateGroupStage}
                          className="bg-gray-800 active:bg-gray-900 px-4 py-2 rounded-lg"
                        >
                          <Text className="text-white font-semibold text-sm">Simulate Group Stage Results</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={generateKnockout}
                          className="bg-blue-600 active:bg-blue-700 px-4 py-2 rounded-lg"
                        >
                          <Text className="text-white font-semibold text-sm">Generate Knockout Stage</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {isTeamFormat && organizerId && session?.user?.id === organizerId && hasKnockout && (
                      <View className="p-3 border-b border-gray-200 flex-row justify-end">
                        <TouchableOpacity
                          onPress={simulateKnockoutRound}
                          className="bg-gray-800 active:bg-gray-900 px-4 py-2 rounded-lg"
                        >
                          <Text className="text-white font-semibold text-sm">Simulate Knockout Round</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <View className="flex-row bg-gray-50 p-3 border-b border-gray-200">
                        <Text className="w-10 text-xs font-bold text-gray-500">#</Text>
                        <Text className="flex-1 text-xs font-bold text-gray-500">Team</Text>
                        <Text className="w-10 text-right text-xs font-bold text-gray-500">W</Text>
                        <Text className="w-16 text-right text-xs font-bold text-gray-500">Pts</Text>
                        <Text className="w-16 text-right text-xs font-bold text-gray-500">Diff</Text>
                    </View>
                    {leaderboard.map((team: any, idx: number) => (
                        <View key={team.id} className="flex-row p-4 border-b border-gray-100 items-center">
                             <Text className="w-10 font-bold text-gray-700">{idx + 1}</Text>
                             <View className="flex-1 flex-row items-center">
                               <View className={`px-2 py-1 rounded-full ${teamColorClass(team.id)}`}>
                                 <Text className="font-medium text-gray-900 text-xs">{team.name}</Text>
                               </View>
                             </View>
                             <Text className="w-10 text-right text-gray-600">{team.wins}</Text>
                             <Text className="w-16 text-right font-bold text-blue-600">{team.pointsFor}</Text>
                             <Text className="w-16 text-right text-gray-600">{team.diff > 0 ? '+' : ''}{team.diff}</Text>
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
