import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type RoundRow = { round_number: number; name: string | null };

type MatchRow = {
  id: number;
  round_number: number;
  index_in_round: number;
  entry1_id: number | null;
  entry2_id: number | null;
  winner_entry_id: number | null;
  status: string;
  scheduled_at: string | null;
  court: string | null;
  score_json: any | null;
};

export default function FixturesByCategory() {
  const params = useLocalSearchParams<{ id: string; categoryId: string; initialRound?: string }>();
  const tid = Number(params.id);
  const cid = Number(params.categoryId);
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [entryNames, setEntryNames] = useState<Record<number, string>>({});
  const [organizerId, setOrganizerId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data: r } = await supabase
      .from("rounds")
      .select("round_number,name")
      .eq("category_id", cid)
      .order("round_number", { ascending: true });
    setRounds((r as any[]) || []);

    const { data: m } = await supabase
      .from("matches")
      .select("id,round_number,index_in_round,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json")
      .eq("category_id", cid)
      .order("round_number", { ascending: true })
      .order("index_in_round", { ascending: true });
    setMatches((m as any[]) || []);

    const idsSet = new Set<number>();
    ((m as any[]) || []).forEach((row: any) => {
      if (row.entry1_id) idsSet.add(row.entry1_id as number);
      if (row.entry2_id) idsSet.add(row.entry2_id as number);
    });
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
      Object.keys(map).forEach((k) => {
        const ek = Number(k);
        flat[ek] = map[ek].join(" / ");
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
    const channel = supabase
      .channel(`fixtures-cat-${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `category_id=eq.${cid}` },
        (payload) => {
          setMatches((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== (payload.old as any)?.id);
            }
            const row = (payload.new as any) as MatchRow;
            const exists = prev.findIndex((m) => m.id === row.id);
            if (exists >= 0) {
              const copy = prev.slice();
              copy[exists] = row;
              return copy;
            }
            return [...prev, row].sort((a,b) => a.round_number - b.round_number || a.index_in_round - b.index_in_round);
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid]);

  useFocusEffect(
    useCallback(() => {
      if (cid) load();
      return () => {};
    }, [cid])
  );

  const roundsSorted = useMemo(() => (rounds || []).slice().sort((a,b) => a.round_number - b.round_number), [rounds]);
  const matchesByRound = useMemo(() => {
    const map: Record<number, MatchRow[]> = {};
    for (const m of matches) {
      if (!map[m.round_number]) map[m.round_number] = [];
      map[m.round_number].push(m);
    }
    for (const k of Object.keys(map)) map[Number(k)].sort((a,b) => a.index_in_round - b.index_in_round);
    return map;
  }, [matches]);

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

  function gamesFromScore(score: any): Array<{ p1: number; p2: number }> {
    try {
      const parsed = Array.isArray(score) ? score : (score ? JSON.parse(score as any) : []);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((g: any) => ({ p1: Number(g?.p1 || 0), p2: Number(g?.p2 || 0) }));
    } catch {
      return [];
    }
  }

  function nameStyleFor(entryId: number | null, winnerId: number | null, status: string): string {
    if (status === 'completed' && winnerId && entryId && entryId === winnerId) return 'text-green-700 font-semibold';
    if (status === 'completed' && winnerId) return 'text-gray-500';
    return 'text-gray-900';
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          title: `Fixtures`,
          headerBackVisible: false,
          headerLeft: () => (
            <TouchableOpacity className="px-3 py-2" onPress={() => router.replace({ pathname: "/tournaments/[id]/categories", params: { id: String(tid) } } as any)}>
              <Text className="text-blue-600">Back</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <View className="px-4 mt-6">
        {loading ? (
          <View className="items-center justify-center py-10"><ActivityIndicator /></View>
        ) : roundsSorted.length === 0 ? (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Text className="text-gray-700">Bracket not generated yet.</Text>
          </View>
        ) : (
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <View className="flex-row">
                {roundsSorted.map((r) => (
                  <TouchableOpacity key={r.round_number} className={`mr-2 px-3 py-2 rounded-lg border ${activeRound === r.round_number ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setActiveRound(r.round_number)}>
                    <Text className={activeRound === r.round_number ? 'text-white text-sm' : 'text-gray-800 text-sm'}>{r.name || `Round ${r.round_number}`}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

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
                {m.scheduled_at || m.court ? (
                  <Text className="text-xs text-gray-600 mt-2">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : ''}{m.scheduled_at && m.court ? ' • ' : ''}{m.court ? `Court ${m.court}` : ''}</Text>
                ) : null}
                {(() => {
                  const games = gamesFromScore(m.score_json);
                  if (games.length === 0) return null;
                  return (
                    <View className="mt-2">
                      <View className="flex-row flex-wrap -m-1">
                        {games.map((g: { p1: number; p2: number }, idx: number) => {
                          const p1Win = g.p1 > g.p2;
                          const p2Win = g.p2 > g.p1;
                          return (
                            <View key={idx} className="m-1 px-2 py-1 rounded bg-gray-100">
                              <View className="flex-row items-center">
                                <Text className="text-[10px] text-gray-600 mr-1">{`G${idx + 1}`}</Text>
                                <Text className={`text-xs ${p1Win ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>{g.p1}</Text>
                                <Text className="text-xs text-gray-600 mx-1">-</Text>
                                <Text className={`text-xs ${p2Win ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>{g.p2}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
                {m.winner_entry_id ? (
                  <Text className="text-xs text-gray-700 mt-1">Winner: {labelEntry(m.winner_entry_id)}</Text>
                ) : null}
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
      </View>
    </ScrollView>
  );
}
