import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/context/SessionProvider";
import { toDMY, toHM12, combineDateTime, parseTime12, parseDMY } from "@/src/utils/datetime";

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
  fixture_id: number | null;
  sub_match_type: string | null;
  session_sequence: number | null;
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeHour, setTimeHour] = useState<number>(9);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [timeAmPm, setTimeAmPm] = useState<"AM" | "PM">("AM");

  function shortName(s: string) {
    const str = String(s || "").trim();
    return str.length > 28 ? str.slice(0, 28) + "…" : str || "-";
  }

  function monthMatrix(y: number, m: number) {
    const first = new Date(y, m, 1);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }

  function openCalendarForSchedule() {
    const dt = parseDMY(dateStr || "") || new Date();
    setCalYear(dt.getFullYear());
    setCalMonth(dt.getMonth());
    setCalendarOpen(true);
  }

  function selectCalendarDay(day: number) {
    const dt = new Date(calYear, calMonth, day);
    const dmy = toDMY(dt);
    setDateStr(dmy);
    setCalendarOpen(false);
  }

  function openWebTimePicker() {
    const v = timeStr;
    const parsed = parseTime12(v || "");
    if (parsed) {
      let h12 = parsed.hours24 % 12;
      if (h12 === 0) h12 = 12;
      setTimeHour(h12);
      setTimeAmPm(parsed.hours24 < 12 ? "AM" : "PM");
      setTimeMinute(parsed.minutes);
    } else {
      const now = new Date();
      let h = now.getHours();
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      setTimeHour(h12);
      setTimeAmPm(h < 12 ? "AM" : "PM");
      setTimeMinute(now.getMinutes() - (now.getMinutes() % 5));
    }
    setTimeOpen(true);
  }

  function confirmWebTime() {
    const hh = String(timeHour);
    const mm = String(timeMinute).padStart(2, "0");
    const val = `${hh}:${mm} ${timeAmPm}`;
    setTimeStr(val);
    setTimeOpen(false);
  }

  async function load() {
    try {
      setLoading(true);
      const { data: m } = await supabase
        .from("matches")
        .select(
          "id,tournament_id,category_id,round_number,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json,next_match_id,next_match_slot,fixture_id,sub_match_type,session_sequence"
        )
        .eq("id", mid)
        .maybeSingle();
      const mmRaw = (m as any) as Match | null;
      if (!mmRaw) throw new Error("Match not found");

      // Resolve participants via fixture for team sub-matches where entry ids are not set on the match row
      let effectiveEntry1Id = mmRaw.entry1_id;
      let effectiveEntry2Id = mmRaw.entry2_id;

      if (mmRaw.fixture_id) {
        const { data: fx } = await supabase
          .from("fixtures")
          .select("entry1_id,entry2_id")
          .eq("id", mmRaw.fixture_id)
          .maybeSingle();
        if (fx) {
          const fr = fx as any;
          if (!effectiveEntry1Id && fr.entry1_id) effectiveEntry1Id = fr.entry1_id as number;
          if (!effectiveEntry2Id && fr.entry2_id) effectiveEntry2Id = fr.entry2_id as number;
        }
      }

      const mm: Match = {
        ...mmRaw,
        entry1_id: effectiveEntry1Id,
        entry2_id: effectiveEntry2Id,
      };
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
      const totals = scorePayload.reduce(
        (acc, g) => {
          acc.p1 += Number(g.p1 || 0);
          acc.p2 += Number(g.p2 || 0);
          return acc;
        },
        { p1: 0, p2: 0 }
      );

      // If a schedule has been set for a previously pending match, auto-mark it as scheduled
      let effectiveStatus = status;
      if (scheduledAt && status === "pending") {
        effectiveStatus = "scheduled";
      }

      const updates: any = {
        status: effectiveStatus,
        court: court || null,
        scheduled_at: scheduledAt,
        winner_entry_id: winnerId,
        score_json: scorePayload,
        entry1_points: totals.p1,
        entry2_points: totals.p2,
      };

      const { error: uErr } = await supabase
        .from("matches")
        .update(updates)
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
              <>
                <View className="mb-3">
                  <Text className="text-sm text-gray-700 mb-1">Date</Text>
                  <TouchableOpacity
                    className="border border-gray-300 rounded-lg p-3 bg-white"
                    onPress={() => {
                      if (Platform.OS === "web") openCalendarForSchedule();
                      else setShowDatePicker(true);
                    }}
                  >
                    <Text className={dateStr ? "text-gray-900" : "text-gray-400"}>{dateStr || "Pick date"}</Text>
                  </TouchableOpacity>
                </View>
                <View className="mb-3">
                  <Text className="text-sm text-gray-700 mb-1">Time</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity
                      className="flex-1 border border-gray-300 rounded-lg p-3 bg-white"
                      onPress={() => {
                        if (Platform.OS === "web") openWebTimePicker();
                        else setShowTimePicker(true);
                      }}
                    >
                      <Text className={timeStr ? "text-gray-900" : "text-gray-400"}>{timeStr || "Pick time"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={setNow}>
                      <Text className="text-gray-800">Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showDatePicker && Platform.OS !== "web" && (
                  <DateTimePicker
                    mode="date"
                    display="default"
                    value={parseDMY(dateStr || "") || new Date()}
                    onChange={(_, selectedDate) => {
                      setShowDatePicker(false);
                      if (!selectedDate) return;
                      setDateStr(toDMY(selectedDate));
                    }}
                  />
                )}

                {showTimePicker && Platform.OS !== "web" && (
                  <DateTimePicker
                    mode="time"
                    display="default"
                    value={(() => {
                      const base = parseDMY(dateStr || "") || new Date();
                      const parsedTime = parseTime12(timeStr || "");
                      if (parsedTime) {
                        base.setHours(parsedTime.hours24, parsedTime.minutes, 0, 0);
                      }
                      return base;
                    })()}
                    onChange={(_, selectedDate) => {
                      setShowTimePicker(false);
                      if (!selectedDate) return;
                      setTimeStr(toHM12(selectedDate));
                    }}
                  />
                )}
              </>

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

      {calendarOpen && Platform.OS === "web" && (
        <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-4">
            <View className="w-full max-w-md bg-white rounded-xl p-4">
              <View className="flex-row items-center justify-between mb-3">
                <TouchableOpacity
                  className="px-3 py-2"
                  onPress={() => {
                    setCalMonth((m) => {
                      const nm = m - 1;
                      if (nm < 0) {
                        setCalYear((y) => y - 1);
                        return 11;
                      }
                      return nm;
                    });
                  }}
                >
                  <Text className="text-lg">‹</Text>
                </TouchableOpacity>
                <Text className="text-lg font-semibold">
                  {new Date(calYear, calMonth, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
                </Text>
                <TouchableOpacity
                  className="px-3 py-2"
                  onPress={() => {
                    setCalMonth((m) => {
                      const nm = m + 1;
                      if (nm > 11) {
                        setCalYear((y) => y + 1);
                        return 0;
                      }
                      return nm;
                    });
                  }}
                >
                  <Text className="text-lg">›</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-between px-2 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w) => (
                  <Text key={w} className="w-10 text-center text-xs text-gray-500">{w}</Text>
                ))}
              </View>

              {monthMatrix(calYear, calMonth).map((row, i) => (
                <View key={i} className="flex-row justify-between px-2 mb-1">
                  {row.map((d, j) => (
                    <TouchableOpacity
                      key={j}
                      disabled={!d}
                      onPress={() => d && selectCalendarDay(d)}
                      className={`w-10 h-10 items-center justify-center rounded-lg ${d ? "bg-gray-100 active:bg-gray-200" : ""}`}
                    >
                      <Text className={`text-sm ${d ? "text-gray-800" : "text-transparent"}`}>{d ?? 0}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              <TouchableOpacity className="mt-3 py-3 rounded-lg border border-gray-300" onPress={() => setCalendarOpen(false)}>
                <Text className="text-center text-gray-700">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {timeOpen && Platform.OS === "web" && (
        <Modal visible={timeOpen} transparent animationType="fade" onRequestClose={() => setTimeOpen(false)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-4">
            <View className="w-full max-w-sm bg-white rounded-xl p-4">
              <Text className="text-lg font-semibold mb-3">Pick time</Text>
              <View className="flex-row items-center justify-between mb-3">
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">Hours</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeHour((h) => (h % 12) + 1)}>
                      <Text>＋</Text>
                    </TouchableOpacity>
                    <Text className="mx-3 text-base">{String(timeHour).padStart(2, "0")}</Text>
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeHour((h) => (h - 2 + 12) % 12 + 1)}>
                      <Text>－</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">Minutes</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeMinute((m) => (m + 5) % 60)}>
                      <Text>＋</Text>
                    </TouchableOpacity>
                    <Text className="mx-3 text-base">{String(timeMinute).padStart(2, "0")}</Text>
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeMinute((m) => (m - 5 + 60) % 60)}>
                      <Text>－</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">AM/PM</Text>
                  <View className="flex-row">
                    <TouchableOpacity
                      className={`px-3 py-2 rounded-l-lg border ${timeAmPm === "AM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                      onPress={() => setTimeAmPm("AM")}
                    >
                      <Text className={timeAmPm === "AM" ? "text-white" : "text-gray-700"}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`px-3 py-2 rounded-r-lg border ${timeAmPm === "PM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                      onPress={() => setTimeAmPm("PM")}
                    >
                      <Text className={timeAmPm === "PM" ? "text-white" : "text-gray-700"}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View className="flex-row justify-between">
                <TouchableOpacity
                  className="px-4 py-3 rounded-lg border border-gray-300"
                  onPress={() => {
                    const now = new Date();
                    let h = now.getHours();
                    let h12 = h % 12;
                    if (h12 === 0) h12 = 12;
                    setTimeHour(h12);
                    setTimeAmPm(h < 12 ? "AM" : "PM");
                    setTimeMinute(now.getMinutes() - (now.getMinutes() % 5));
                  }}
                >
                  <Text className="text-gray-700">Now</Text>
                </TouchableOpacity>
                <View className="flex-row">
                  <TouchableOpacity className="mr-2 px-4 py-3 rounded-lg border border-gray-300" onPress={() => setTimeOpen(false)}>
                    <Text className="text-gray-700">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="px-4 py-3 rounded-lg bg-blue-600" onPress={confirmWebTime}>
                    <Text className="text-white font-semibold">Set Time</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
