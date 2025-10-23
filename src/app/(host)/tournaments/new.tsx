import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal } from "react-native";
import { Stack, Link, router } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

export default function NewTournament() {
  const { session } = useSession();

  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [regStart, setRegStart] = useState("");
  const [regEnd, setRegEnd] = useState("");
  const [format, setFormat] = useState<"single_elimination" | "double_elimination" | "round_robin">("single_elimination");
  const [submitting, setSubmitting] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<"start" | "end" | "regStart" | "regEnd" | null>(null);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());

  function parseISODate(v: string): Date | null {
    if (!v) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(v);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return dt;
  }

  function fmtISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function openCalendar(target: "start" | "end" | "regStart" | "regEnd") {
    setCalendarTarget(target);
    const v =
      target === "start"
        ? startDate
        : target === "end"
        ? endDate
        : target === "regStart"
        ? regStart
        : regEnd;
    const dt = parseISODate(v) || new Date();
    setCalYear(dt.getFullYear());
    setCalMonth(dt.getMonth());
    setCalendarOpen(true);
  }

  function selectCalendarDay(day: number) {
    const dt = new Date(calYear, calMonth, day);
    const iso = fmtISO(dt);
    if (calendarTarget === "start") setStartDate(iso);
    if (calendarTarget === "end") setEndDate(iso);
    if (calendarTarget === "regStart") setRegStart(iso);
    if (calendarTarget === "regEnd") setRegEnd(iso);
    setCalendarOpen(false);
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

  async function createTournament() {
    try {
      if (!session?.user) return;
      if (!title || !startDate || !regStart || !regEnd) {
        Alert.alert("Missing info", "Title, registration dates and start date are required");
        return;
      }
      setSubmitting(true);
      const { error } = await supabase
        .from("tournaments")
        .insert({
          organizer_id: session.user.id,
          title,
          venue_name: venueName || null,
          start_date: startDate,
          end_date: endDate || null,
          registration_start_date: regStart,
          registration_end_date: regEnd,
          status: "draft",
          format,
        });
      if (error) throw error;
      router.replace("/tournaments");
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "New Tournament" }} />

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <Text className="text-lg font-semibold text-gray-900 mb-6">Details</Text>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Title</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={title}
              onChangeText={setTitle}
              placeholder="Tournament title"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Venue</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={venueName}
              onChangeText={setVenueName}
              placeholder="Venue name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Start Date</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => openCalendar("start")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">End Date (optional)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => openCalendar("end")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration Start</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regStart}
                onChangeText={setRegStart}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => openCalendar("regStart")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration End</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regEnd}
                onChangeText={setRegEnd}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => openCalendar("regEnd")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">Format</Text>
            <View className="flex-row space-x-2">
              <TouchableOpacity
                className={`px-3 py-2 rounded-lg border ${format === "single_elimination" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                onPress={() => setFormat("single_elimination")}
              >
                <Text className={`text-sm ${format === "single_elimination" ? "text-white" : "text-gray-700"}`}>Single</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-3 py-2 rounded-lg border ${format === "double_elimination" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                onPress={() => setFormat("double_elimination")}
              >
                <Text className={`text-sm ${format === "double_elimination" ? "text-white" : "text-gray-700"}`}>Double</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`px-3 py-2 rounded-lg border ${format === "round_robin" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                onPress={() => setFormat("round_robin")}
              >
                <Text className={`text-sm ${format === "round_robin" ? "text-white" : "text-gray-700"}`}>Round-robin</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            className={`rounded-lg py-4 px-6 ${submitting ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={createTournament}
            disabled={submitting}
          >
            <Text className={`text-center font-semibold ${submitting ? "text-gray-500" : "text-white"}`}>
              {submitting ? "Creating..." : "Create Tournament"}
            </Text>
          </TouchableOpacity>

          <Link href="/tournaments" asChild>
            <TouchableOpacity className="rounded-lg py-3 px-6 mt-3 border border-gray-300">
              <Text className="text-center text-gray-700">Cancel</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <View className="flex-1 bg-black/40 items-center justify-center px-4">
          <View className="w-full max-w-md bg-white rounded-xl p-4">
            <View className="flex-row items-center justify-between mb-3">
              <TouchableOpacity className="px-3 py-2" onPress={() => setCalMonth((m) => (m - 1 + 12) % 12 || (setCalYear((y) => (m - 1 < 0 ? y - 1 : y)), (m - 1 + 12) % 12))}>
                <Text className="text-lg">‹</Text>
              </TouchableOpacity>
              <Text className="text-lg font-semibold">
                {new Date(calYear, calMonth, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
              </Text>
              <TouchableOpacity className="px-3 py-2" onPress={() => setCalMonth((m) => (m + 1) % 12 || (setCalYear((y) => (m + 1 > 11 ? y + 1 : y)), (m + 1) % 12))}>
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
    </ScrollView>
  );
}
