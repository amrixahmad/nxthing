import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Platform } from "react-native";
import { toDMY, toHM12, combineDateTime, parseTime12 } from "@/src/utils/datetime";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Category = {
  id: number;
  name: string;
  participation_type: "singles" | "doubles" | "team";
  registration_fee: number | null;
  max_teams: number | null;
};

type Tournament = {
  id: number;
  title: string | null;
  status: string | null;
  start_date?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  organizer_id?: string | null;
};

export default function ManageCategories() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);
  const toast = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [ptype, setPtype] = useState<"singles" | "doubles" | "team">("singles");
  const [fee, setFee] = useState("20");
  const [maxTeams, setMaxTeams] = useState("16");
  const [teamMinFromTemplate, setTeamMinFromTemplate] = useState<number | null>(null);
  const [teamMaxFromTemplate, setTeamMaxFromTemplate] = useState<number | null>(null);

  const [regStart, setRegStart] = useState("");
  const [regStartTime, setRegStartTime] = useState("");
  const [regEnd, setRegEnd] = useState("");
  const [regEndTime, setRegEndTime] = useState("");
  const [errRegStart, setErrRegStart] = useState<string | null>(null);
  const [errRegEnd, setErrRegEnd] = useState<string | null>(null);

  // Time picker state (native)
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<"regStart" | "regEnd" | null>(null);
  const [timePickerDate, setTimePickerDate] = useState<Date>(new Date());

  // Time picker state (web)
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeTarget, setTimeTarget] = useState<"regStart" | "regEnd" | null>(null);
  const [timeHour, setTimeHour] = useState<number>(9);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [timeAmPm, setTimeAmPm] = useState<"AM" | "PM">("AM");

  function handleTimePick(target: "regStart" | "regEnd") {
    if (Platform.OS === "web") {
      setTimeTarget(target);
      const v = target === "regStart" ? regStartTime : regEndTime;
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
      return;
    }
    // Native
    setTimePickerTarget(target);
    const v = target === "regStart" ? regStartTime : regEndTime;
    const base = new Date();
    const parsed = parseTime12(v || "");
    if (parsed) base.setHours(parsed.hours24, parsed.minutes, 0, 0);
    setTimePickerDate(base);
    setShowTimePicker(true);
  }

  function onNativeTimeChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === "dismissed") {
      setShowTimePicker(false);
      return;
    }
    if (date && timePickerTarget) {
      const val = toHM12(date);
      if (timePickerTarget === "regStart") setRegStartTime(val);
      if (timePickerTarget === "regEnd") setRegEndTime(val);
    }
    setShowTimePicker(false);
  }

  function confirmWebTime() {
    const hh = String(timeHour);
    const mm = String(timeMinute).padStart(2, "0");
    const val = `${hh}:${mm} ${timeAmPm}`;
    if (timeTarget === "regStart") setRegStartTime(val);
    if (timeTarget === "regEnd") setRegEndTime(val);
    setTimeOpen(false);
  }

  const templates = useMemo(
    () => [
      { label: "Club Team Tie (6-10 players)", p: "team" as const, n: "Club Team Tie", teamMin: 6, teamMax: 10 },
      { label: "Team Doubles (2 players)", p: "team" as const, n: "Team Doubles", teamMin: 2, teamMax: 2 },
      { label: "Men's Doubles", p: "doubles" as const, n: "Men's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Women's Doubles", p: "doubles" as const, n: "Women's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Mixed Doubles", p: "doubles" as const, n: "Mixed Doubles", teamMin: 2, teamMax: 2 },
      { label: "Men's Singles", p: "singles" as const, n: "Men's Singles", teamMin: 1, teamMax: 1 },
      { label: "Women's Singles", p: "singles" as const, n: "Women's Singles", teamMin: 1, teamMax: 1 },
    ],
    []
  );

  async function load() {
    setLoading(true);
    const { data: t } = await supabase
      .from("tournaments")
      .select("id,title,status,start_date,registration_start_date,registration_end_date,organizer_id")
      .eq("id", tid)
      .maybeSingle();
    const tt = (t as any) || null;
    setTournament(tt);
    if (tt?.organizer_id && session?.user?.id && tt.organizer_id !== session.user.id) {
      router.replace({ pathname: "/tournaments/[id]", params: { id: String(tid) } } as any);
      setLoading(false);
      return;
    }
    if (tt?.registration_start_date) {
      const ds = new Date(tt.registration_start_date);
      setRegStart(toDMY(ds));
      setRegStartTime(toHM12(ds));
    } else {
      setRegStart("");
      setRegStartTime("");
    }
    if (tt?.registration_end_date) {
      const de = new Date(tt.registration_end_date);
      setRegEnd(toDMY(de));
      setRegEndTime(toHM12(de));
    } else {
      setRegEnd("");
      setRegEndTime("");
    }

    const { data: cats } = await supabase
      .from("tournament_categories")
      .select("id,name,participation_type,registration_fee,max_teams,members_per_team_min,members_per_team_max")
      .eq("tournament_id", tid)
      .order("id", { ascending: true });
    setItems((cats as any[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (tid) load();
  }, [tid]);

  async function addCategory(opts?: { teamMin?: number; teamMax?: number }) {
    try {
      if (!session?.user) return;
      if (!name.trim()) {
        Alert.alert("Name required");
        return;
      }
      setSaving(true);
      const regFee = Number(fee) || 0;
      if (regFee < 20) {
        Alert.alert("Minimum fee is RM 20");
        return;
      }
      const max = Number(maxTeams) || null;
      const defaultMin = ptype === "doubles" ? 2 : 1;
      const defaultMax = ptype === "doubles" ? 2 : 1;
      const teamMin = opts?.teamMin ?? teamMinFromTemplate ?? defaultMin;
      const teamMax = opts?.teamMax ?? teamMaxFromTemplate ?? defaultMax;
      const { error } = await supabase.from("tournament_categories").insert({
        tournament_id: tid,
        name: name.trim(),
        participation_type: ptype,
        registration_fee: regFee,
        max_teams: max,
        members_per_team_min: teamMin,
        members_per_team_max: teamMax,
      });
      if (error) throw error;
      setName("");
      setPtype("singles");
      setFee("20");
      setMaxTeams("16");
      setTeamMinFromTemplate(null);
      setTeamMaxFromTemplate(null);
      await load();
      toast.show({ type: "success", message: "Category added" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id: number) {
    try {
      setSaving(true);
      const { error } = await supabase.from("tournament_categories").delete().eq("id", id);
      if (error) throw error;
      await load();
      toast.show({ type: "success", message: "Category removed" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function generateBracket(categoryId: number) {
    try {
      if (!tournament) return;
      // Pre-check: registration_end_date must be present and in the past
      if (!tournament.registration_end_date) {
        Alert.alert("Registration not closed", "Set and close the registration window first");
        return;
      }
      const ended = new Date(tournament.registration_end_date).getTime() <= Date.now();
      if (!ended) {
        Alert.alert("Registration still open", "You can generate brackets after registration closes");
        return;
      }
      setSaving(true);
      const { data, error } = await supabase.functions.invoke("generate-bracket", {
        body: { category_id: categoryId },
      });
      if (error) throw error as any;
      const msg = (data as any)?.message || "Bracket generated";
      toast.show({ type: "success", message: msg });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRegistration(open: boolean) {
    try {
      if (!tournament) return;
      if (open && items.length === 0) {
        Alert.alert("Add at least one category before opening registration");
        return;
      }
      if (open) {
        setErrRegStart(null); setErrRegEnd(null);
        if (!regStart || !regEnd || !regStartTime || !regEndTime) {
          if (!regStart || !regStartTime) setErrRegStart("Registration start is required");
          if (!regEnd || !regEndTime) setErrRegEnd("Registration end is required");
          return;
        }
        const sdt = combineDateTime(regStart, regStartTime);
        const edt = combineDateTime(regEnd, regEndTime);
        const now = new Date();
        if (!sdt || !edt || sdt >= edt) { setErrRegStart("Must be before end"); setErrRegEnd("Must be after start"); return; }
        if (sdt <= now) { setErrRegStart("Must be in the future"); return; }
        if (edt <= now) { setErrRegEnd("Must be in the future"); return; }
        if (tournament?.start_date) {
          const ts = new Date(tournament.start_date);
          if (edt > ts) { setErrRegEnd("Must be before tournament start"); return; }
        }
      }
      setSaving(true);
      const { error } = await supabase
        .from("tournaments")
        .update({ status: open ? "registration_open" : "draft" })
        .eq("id", tid);
      if (error) throw error;
      await load();
      toast.show({ type: "success", message: open ? "Registration opened" : "Registration closed" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveWindow() {
    try {
      if (!tournament) return;
      setErrRegStart(null); setErrRegEnd(null);
      if (!regStart || !regEnd || !regStartTime || !regEndTime) {
        if (!regStart || !regStartTime) setErrRegStart("Registration start is required");
        if (!regEnd || !regEndTime) setErrRegEnd("Registration end is required");
        return;
      }
      const sdt = combineDateTime(regStart, regStartTime);
      const edt = combineDateTime(regEnd, regEndTime);
      const now = new Date();
      if (!sdt || !edt || sdt >= edt) { setErrRegStart("Must be before end"); setErrRegEnd("Must be after start"); return; }
      if (sdt <= now) { setErrRegStart("Must be in the future"); return; }
      if (edt <= now) { setErrRegEnd("Must be in the future"); return; }
      if (tournament?.start_date) {
        const ts = new Date(tournament.start_date);
        if (edt > ts) { setErrRegEnd("Must be before tournament start"); return; }
      }
      setSaving(true);
      const { error } = await supabase
        .from("tournaments")
        .update({ registration_start_date: sdt.toISOString(), registration_end_date: edt.toISOString() })
        .eq("id", tid);
      if (error) throw error;
      await load();
      toast.show({ type: "success", message: "Registration window saved" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function openNowUntilStart() {
    try {
      if (!tournament) return;
      if (items.length === 0) {
        Alert.alert("Add at least one category first");
        return;
      }
      const now = new Date();
      const endBaseline = tournament.start_date ? new Date(tournament.start_date) : now;
      setRegStart(toDMY(now));
      setRegStartTime(toHM12(now));
      setRegEnd(toDMY(endBaseline));
      setRegEndTime(toHM12(endBaseline));
      setSaving(true);
      const { error } = await supabase
        .from("tournaments")
        .update({
          registration_start_date: now.toISOString(),
          registration_end_date: endBaseline.toISOString(),
          status: "registration_open",
        })
        .eq("id", tid);
      if (error) throw error;
      await load();
      toast.show({ type: "success", message: "Registration opened" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: tournament?.title || `Tournament #${tid}` }} />

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">Categories</Text>

          <View className="flex-row flex-wrap -m-1 mb-4">
            {templates.map((t) => (
              <TouchableOpacity
                key={t.label}
                className="m-1 px-3 py-2 rounded-lg border border-gray-300"
                onPress={() => {
                  setName(t.n);
                  setPtype(t.p);
                  setTeamMinFromTemplate(typeof t.teamMin === "number" ? t.teamMin : null);
                  setTeamMaxFromTemplate(typeof t.teamMax === "number" ? t.teamMax : null);
                }}
              >
                <Text className="text-gray-800 text-sm">{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

        {showTimePicker && Platform.OS !== "web" && (
          <DateTimePicker
            value={timePickerDate}
            mode="time"
            display="default"
            onChange={onNativeTimeChange}
          />
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
                      <TouchableOpacity className={`px-3 py-2 rounded-l-lg border ${timeAmPm === "AM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`} onPress={() => setTimeAmPm("AM")}>
                        <Text className={timeAmPm === "AM" ? "text-white" : "text-gray-700"}>AM</Text>
                      </TouchableOpacity>
                      <TouchableOpacity className={`px-3 py-2 rounded-r-lg border ${timeAmPm === "PM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`} onPress={() => setTimeAmPm("PM")}>
                        <Text className={timeAmPm === "PM" ? "text-white" : "text-gray-700"}>PM</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View className="flex-row justify-between">
                  <TouchableOpacity className="px-4 py-3 rounded-lg border border-gray-300" onPress={() => {
                    const now = new Date();
                    let h = now.getHours(); let h12 = h % 12; if (h12 === 0) h12 = 12;
                    setTimeHour(h12); setTimeAmPm(h < 12 ? "AM" : "PM"); setTimeMinute(now.getMinutes() - (now.getMinutes()%5));
                  }}>
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

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Name</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Men's Singles 3.5–4.0"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Participation</Text>
            <View className="flex-row space-x-2">
              {(["singles", "doubles", "team"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  className={`px-3 py-2 rounded-lg border ${ptype === p ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                  onPress={() => setPtype(p)}
                >
                  <Text className={`text-sm ${ptype === p ? "text-white" : "text-gray-700"}`}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Registration fee (MYR)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              keyboardType="numeric"
              value={fee}
              onChangeText={setFee}
            />
            <Text className="text-xs text-gray-500 mt-1">Minimum fee is RM 20</Text>
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">Max teams/players</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              keyboardType="numeric"
              value={maxTeams}
              onChangeText={setMaxTeams}
            />
          </View>

          <TouchableOpacity
            className={`rounded-lg py-3 px-4 ${saving ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => addCategory()}
            disabled={saving}
          >
            <Text className={`text-center font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Add Category</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          {loading ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : items.length === 0 ? (
            <Text className="text-gray-700">No categories yet.</Text>
          ) : (
            items.map((c) => (
              <View key={c.id} className="flex-row items-center justify-between py-3 border-b border-gray-100">
                <View>
                  <Text className="text-base text-gray-900">{c.name}</Text>
                  <Text className="text-xs text-gray-600">
                    {c.participation_type} • MYR {(c.registration_fee ?? 0).toFixed(2)} • Max {c.max_teams ?? "-"}
                  </Text>
                  {c.participation_type === "team" ? (
                    <Text className="text-xs text-gray-600 mt-1">
                      Team size: {""}
                      {typeof (c as any).members_per_team_min === "number" && typeof (c as any).members_per_team_max === "number"
                        ? (c as any).members_per_team_min === (c as any).members_per_team_max
                          ? `${(c as any).members_per_team_min} players`
                          : `${(c as any).members_per_team_min}–${(c as any).members_per_team_max} players`
                        : "set in schema"}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-gray-300"
                    onPress={() => router.push({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(c.id) } } as any)}
                  >
                    <Text className="text-gray-800">View Fixtures</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`ml-2 px-3 py-2 rounded-lg ${saving ? "bg-gray-200" : "bg-blue-50"} border border-blue-300`}
                    onPress={() => generateBracket(c.id)}
                    disabled={saving}
                  >
                    <Text className={`${saving ? "text-gray-500" : "text-blue-700"}`}>Generate Bracket</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="ml-2 px-3 py-2 rounded-lg border border-red-300" onPress={() => removeCategory(c.id)}>
                    <Text className="text-red-700">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-2">Registration Window</Text>
          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Start date (dd/mm/yyyy)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              value={regStart}
              onChangeText={(v) => { setRegStart(v); setErrRegStart(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <Text className="text-sm text-gray-700 mb-1 mt-3">Start time (h:mm AM/PM)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                value={regStartTime}
                onChangeText={(v) => { setRegStartTime(v); setErrRegStart(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("regStart")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            {errRegStart ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errRegStart}</Text>
              </View>
            ) : null}
          </View>
          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">End date (dd/mm/yyyy)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              value={regEnd}
              onChangeText={(v) => { setRegEnd(v); setErrRegEnd(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <Text className="text-sm text-gray-700 mb-1 mt-3">End time (h:mm AM/PM)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white flex-1"
                value={regEndTime}
                onChangeText={(v) => { setRegEndTime(v); setErrRegEnd(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("regEnd")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            {errRegEnd ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errRegEnd}</Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row space-x-2 items-center">
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
              onPress={saveWindow}
              disabled={saving}
            >
              <Text className={`text-center font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Save Window</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving || items.length === 0 ? "bg-gray-300" : "bg-green-600 active:bg-green-700"}`}
              onPress={openNowUntilStart}
              disabled={saving || items.length === 0}
            >
              <Text className={`text-center font-semibold ${saving || items.length === 0 ? "text-gray-300" : "text-white"}`}>Open Now Until Start Date</Text>
            </TouchableOpacity>
            {items.length === 0 ? (
              <Text className="ml-2 text-xs text-gray-600">Add at least one category to enable opening registration.</Text>
            ) : null}
          </View>
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <Text className="text-base font-semibold text-gray-900 mb-2">Registration</Text>
          <Text className="text-sm text-gray-600 mb-3">Status: {tournament?.status || "draft"}</Text>
          <View className="flex-row space-x-2 items-center">
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving || items.length === 0 ? "bg-gray-300" : "bg-green-600 active:bg-green-700"}`}
              onPress={() => toggleRegistration(true)}
              disabled={saving || items.length === 0}
            >
              <Text className={`text-center font-semibold ${saving || items.length === 0 ? "text-gray-500" : "text-white"}`}>Open Registration</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving ? "bg-gray-300" : "bg-gray-600 active:bg-gray-700"}`}
              onPress={() => toggleRegistration(false)}
              disabled={saving}
            >
              <Text className={`text-center font-semibold ${saving ? "text-gray-300" : "text-white"}`}>Close Registration</Text>
            </TouchableOpacity>
            {items.length === 0 ? (
              <Text className="ml-2 text-xs text-gray-600">Add a category first to enable opening registration.</Text>
            ) : null}
          </View>
        </View>

        <TouchableOpacity className="rounded-lg py-3 px-6 border border-gray-300 mb-8" onPress={() => router.push("/host" as any)}>
          <Text className="text-center text-gray-700">Back to Host Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
