import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/context/SessionProvider";
import { toDMY, toHM12, combineDateTime, parseTime12 } from "@/src/utils/datetime";

 type Match = {
  id: number;
  tournament_id: number;
  category_id: number;
  round_number: number;
  entry1_id: number | null;
  entry2_id: number | null;
  winner_entry_id: number | null;
  status: string;
  scheduled_at: string | null;
  court: string | null;
  score_json: any | null;
  next_match_id: number | null;
  next_match_slot: 1 | 2 | null;
};

export default function HostMatchDetail() {
  const params = useLocalSearchParams<{ id: string; matchId: string }>();
  const tid = Number(params.id);
  const mid = Number(params.matchId);
  const { session } = useSession();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(null);
  const [p1Name, setP1Name] = useState("-");
  const [p2Name, setP2Name] = useState("-");

  // editable fields
  const [status, setStatus] = useState<string>("pending");
  const [court, setCourt] = useState<string>("");
  const [dateStr, setDateStr] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");
  const [winner, setWinner] = useState<0 | 1 | 2 | null>(null); // 0 none, 1 p1, 2 p2
  const [games, setGames] = useState<Array<{ p1: string; p2: string }>>([]);

  function shortName(s: string) {
    const str = String(s || "").trim();
    return str.length > 28 ? str.slice(0, 28) + "…" : str || "-";
  }

  async function load() {
    try {
      setLoading(true);
      const { data: m } = await supabase
        .from("matches")
        .select("id,tournament_id,category_id,round_number,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json,next_match_id,next_match_slot")
        .eq("id", mid)
        .maybeSingle();
      const mm = (m as any) as Match | null;
      if (!mm) throw new Error("Match not found");
      // Organizer guard
      const { data: tOrg } = await supabase
        .from("tournaments")
        .select("id, organizer_id")
        .eq("id", mm.tournament_id)
        .maybeSingle();
      const orgId = (tOrg as any)?.organizer_id as string | null | undefined;
      if (orgId && session?.user?.id && orgId !== session.user.id) {
        router.replace({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(mm.category_id) } } as any);
        setLoading(false);
        return;
      }
      setMatch(mm);
      setStatus(mm.status);
      setCourt(mm.court || "");
      if (mm.scheduled_at) {
        const dt = new Date(mm.scheduled_at);
        setDateStr(toDMY(dt));
        setTimeStr(toHM12(dt));
      } else {
        setDateStr("");
        setTimeStr("");
      }
      if (mm.winner_entry_id && mm.entry1_id && mm.winner_entry_id === mm.entry1_id) setWinner(1);
      else if (mm.winner_entry_id && mm.entry2_id && mm.winner_entry_id === mm.entry2_id) setWinner(2);
      else setWinner(0);
      try {
        const sj = Array.isArray(mm.score_json) ? mm.score_json : (mm.score_json ? JSON.parse(mm.score_json as any) : []);
        if (Array.isArray(sj)) setGames(sj.map((g: any) => ({ p1: String(Number(g?.p1 || 0)), p2: String(Number(g?.p2 || 0)) })));
        else setGames([]);
      } catch {
        setGames([]);
      }

      // Load names
      const ids: number[] = [mm.entry1_id || 0, mm.entry2_id || 0].filter(Boolean) as number[];
      if (ids.length > 0) {
        const { data: mems } = await supabase
          .from("entry_members")
          .select("entry_id, display_name, profile:profile_id(id, username, full_name)")
          .in("entry_id", ids);
        const map: Record<number, string[]> = {};
        for (const r of (mems as any[]) || []) {
          const entryId = r.entry_id as number;
          const prof = r.profile as any;
          const fallback = prof?.id ? `Player ${String(prof.id).slice(0, 6)}` : "Player";
          const nameRaw = r.display_name || prof?.full_name || prof?.username || fallback;
          const name = String(nameRaw).trim();
          if (!map[entryId]) map[entryId] = [];
          map[entryId].push(name);
        }
        if (mm.entry1_id) setP1Name((map[mm.entry1_id] || []).join(" / ") || `Entry #${mm.entry1_id}`);
        if (mm.entry2_id) setP2Name((map[mm.entry2_id] || []).join(" / ") || `Entry #${mm.entry2_id}`);
      }
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mid) load();
  }, [mid]);

  function setNow() {
    const now = new Date();
    setDateStr(toDMY(now));
    setTimeStr(toHM12(now));
  }

  async function save() {
    try {
      if (!match) return;
      let scheduledAt: string | null = null;
      if (dateStr && timeStr) {
        const dt = combineDateTime(dateStr, timeStr);
        if (!dt) {
          Alert.alert("Invalid date/time", "Please use dd/mm/yyyy and h:mm AM/PM");
          return;
        }
        scheduledAt = dt.toISOString();
      } else if (dateStr || timeStr) {
        Alert.alert("Both date and time required", "Set both date and time or clear both");
        return;
      }

      const winnerId = winner === 1 ? match.entry1_id : winner === 2 ? match.entry2_id : null;

      const scorePayload = games.map((g) => ({ p1: Number(g.p1 || 0), p2: Number(g.p2 || 0) }));

      const { error: uErr } = await supabase
        .from("matches")
        .update({ status, court: court || null, scheduled_at: scheduledAt, winner_entry_id: winnerId, score_json: scorePayload })
        .eq("id", match.id);
      if (uErr) throw uErr;

      // propagate to next match if winner selected and linkage exists
      if (winnerId && match.next_match_id && match.next_match_slot) {
        const updates: any = match.next_match_slot === 1 ? { entry1_id: winnerId } : { entry2_id: winnerId };
        await supabase.from("matches").update(updates).eq("id", match.next_match_id);
      }

      toast.show({ type: "success", message: "Match saved" });
      const roundParam = match.round_number;
      router.replace({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(match.category_id), initialRound: String(roundParam) } } as any);
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    }
  }

  const statuses = useMemo(() => ["pending","scheduled","in_progress","completed","walkover","bye","cancelled"], []);

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: `Match #${mid}` }} />
      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {loading || !match ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : (
            <View>
              <Text className="text-base font-semibold text-gray-900 mb-2">Participants</Text>
              <View className="mb-3">
                <Text className="text-gray-900">{p1Name}</Text>
                <Text className="text-gray-500">vs</Text>
                <Text className="text-gray-900">{p2Name}</Text>
              </View>

              <Text className="text-base font-semibold text-gray-900 mb-2">Status</Text>
              <View className="flex-row flex-wrap -m-1 mb-4">
                {statuses.map((s) => (
                  <TouchableOpacity key={s} className={`m-1 px-3 py-2 rounded-lg border ${status === s ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setStatus(s)}>
                    <Text className={status === s ? 'text-white' : 'text-gray-800'}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-base font-semibold text-gray-900 mb-2">Score</Text>
              {games.map((g, idx) => (
                <View key={idx} className="flex-row items-center mb-2">
                  <Text className="w-16 text-gray-700">Game {idx+1}</Text>
                  <TextInput
                    className="flex-1 border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white mr-2"
                    keyboardType="numeric"
                    value={g.p1}
                    onChangeText={(t) => {
                      const v = t.replace(/[^0-9]/g, "");
                      setGames((arr) => arr.map((it, i) => i === idx ? { ...it, p1: v } : it));
                    }}
                    placeholder={shortName(p1Name)}
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text className="mx-1">-</Text>
                  <TextInput
                    className="flex-1 border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white ml-2"
                    keyboardType="numeric"
                    value={g.p2}
                    onChangeText={(t) => {
                      const v = t.replace(/[^0-9]/g, "");
                      setGames((arr) => arr.map((it, i) => i === idx ? { ...it, p2: v } : it));
                    }}
                    placeholder={shortName(p2Name)}
                    placeholderTextColor="#9CA3AF"
                  />
                  <TouchableOpacity className="ml-2 px-3 py-2 rounded-lg border border-red-300" onPress={() => setGames((arr) => arr.filter((_, i) => i !== idx))}>
                    <Text className="text-red-700">Remove</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View className="mb-4">
                <TouchableOpacity className="px-3 py-2 rounded-lg border border-gray-300 self-start" onPress={() => setGames((arr) => [...arr, { p1: "", p2: "" }])}>
                  <Text className="text-gray-800">Add Game</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-base font-semibold text-gray-900 mb-2">Winner</Text>
              <View className="flex-row justify-between -mb-1">
                <Text className="text-xs text-gray-500">Left</Text>
                <Text className="text-xs text-gray-500">Right</Text>
              </View>
              <View className="flex-row mb-4 mt-1">
                <TouchableOpacity className={`px-3 py-2 rounded-l-lg border ${winner === 1 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setWinner(1)}>
                  <Text className={winner === 1 ? 'text-white' : 'text-gray-800'} numberOfLines={1}>{shortName(p1Name)}</Text>
                </TouchableOpacity>
                <TouchableOpacity className={`px-3 py-2 border ${winner === 0 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setWinner(0)}>
                  <Text className={winner === 0 ? 'text-white' : 'text-gray-800'}>None</Text>
                </TouchableOpacity>
                <TouchableOpacity className={`px-3 py-2 rounded-r-lg border ${winner === 2 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} onPress={() => setWinner(2)}>
                  <Text className={winner === 2 ? 'text-white' : 'text-gray-800'} numberOfLines={1}>{shortName(p2Name)}</Text>
                </TouchableOpacity>
              </View>

              <Text className="text-base font-semibold text-gray-900 mb-2">Schedule</Text>
              <View className="mb-3">
                <Text className="text-sm text-gray-700 mb-1">Date (dd/mm/yyyy)</Text>
                <TextInput className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white" value={dateStr} onChangeText={setDateStr} placeholder="dd/mm/yyyy" placeholderTextColor="#9CA3AF" />
              </View>
              <View className="mb-3">
                <Text className="text-sm text-gray-700 mb-1">Time (h:mm AM/PM)</Text>
                <View className="flex-row items-center">
                  <TextInput className="flex-1 border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white" value={timeStr} onChangeText={setTimeStr} placeholder="h:mm AM/PM" placeholderTextColor="#9CA3AF" />
                  <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={setNow}>
                    <Text className="text-gray-800">Now</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-2">Court</Text>
                <TextInput className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white" value={court} onChangeText={setCourt} placeholder="e.g., 1" placeholderTextColor="#9CA3AF" />
              </View>

              <View className="flex-row">
                <TouchableOpacity className="px-4 py-3 rounded-lg bg-blue-600 active:bg-blue-700" onPress={save}>
                  <Text className="text-white font-semibold">Save</Text>
                </TouchableOpacity>
                <TouchableOpacity className="ml-2 px-4 py-3 rounded-lg border border-gray-300" onPress={() => router.back()}>
                  <Text className="text-gray-800">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
