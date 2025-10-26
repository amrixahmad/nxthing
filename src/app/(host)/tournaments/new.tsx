import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Platform } from "react-native";
import { Stack, Link, router } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { toDMY, toHM12, parseDMY, combineDateTime, parseTime12 } from "@/utils/datetime";

export default function NewTournament() {
  const { session } = useSession();

  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [regStart, setRegStart] = useState("");
  const [regStartTime, setRegStartTime] = useState("");
  const [regEnd, setRegEnd] = useState("");
  const [regEndTime, setRegEndTime] = useState("");
  const [format, setFormat] = useState<"single_elimination" | "double_elimination" | "round_robin">("single_elimination");
  const [submitting, setSubmitting] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<"start" | "end" | "regStart" | "regEnd" | null>(null);
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());

  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<"start" | "end" | "regStart" | "regEnd" | null>(null);
  const [pickerDate, setPickerDate] = useState<Date>(new Date());

  // Time picker state (native)
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<"start" | "end" | "regStart" | "regEnd" | null>(null);
  const [timePickerDate, setTimePickerDate] = useState<Date>(new Date());

  // Time picker state (web)
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeTarget, setTimeTarget] = useState<"start" | "end" | "regStart" | "regEnd" | null>(null);
  const [timeHour, setTimeHour] = useState<number>(9);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [timeAmPm, setTimeAmPm] = useState<"AM" | "PM">("AM");

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
    const dt = parseDMY(v) || parseISODate(v) || new Date();
    setCalYear(dt.getFullYear());
    setCalMonth(dt.getMonth());
    setCalendarOpen(true);
  }

  function selectCalendarDay(day: number) {
    const dt = new Date(calYear, calMonth, day);
    const dmy = toDMY(dt);
    if (calendarTarget === "start") setStartDate(dmy);
    if (calendarTarget === "end") setEndDate(dmy);
    if (calendarTarget === "regStart") setRegStart(dmy);
    if (calendarTarget === "regEnd") setRegEnd(dmy);
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

  function handlePick(target: "start" | "end" | "regStart" | "regEnd") {
    if (Platform.OS === "web") {
      openCalendar(target);
      return;
    }
    setPickerTarget(target);
    const v =
      target === "start"
        ? startDate
        : target === "end"
        ? endDate
        : target === "regStart"
        ? regStart
        : regEnd;
    const dt = parseDMY(v) || parseISODate(v) || new Date();
    setPickerDate(dt);
    setShowPicker(true);
  }

  function onNativeChange(event: DateTimePickerEvent, date?: Date) {
    if (event.type === "dismissed") {
      setShowPicker(false);
      return;
    }
    if (date && pickerTarget) {
      const dmy = toDMY(date);
      if (pickerTarget === "start") setStartDate(dmy);
      if (pickerTarget === "end") setEndDate(dmy);
      if (pickerTarget === "regStart") setRegStart(dmy);
      if (pickerTarget === "regEnd") setRegEnd(dmy);
    }
    setShowPicker(false);
  }

  function handleTimePick(target: "start" | "end" | "regStart" | "regEnd") {
    if (Platform.OS === "web") {
      // Open simple web time modal
      setTimeTarget(target);
      const v = target === "start" ? startTime : target === "end" ? endTime : target === "regStart" ? regStartTime : regEndTime;
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
    const v = target === "start" ? startTime : target === "end" ? endTime : target === "regStart" ? regStartTime : regEndTime;
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
      if (timePickerTarget === "start") setStartTime(val);
      if (timePickerTarget === "end") setEndTime(val);
      if (timePickerTarget === "regStart") setRegStartTime(val);
      if (timePickerTarget === "regEnd") setRegEndTime(val);
    }
    setShowTimePicker(false);
  }

  function confirmWebTime() {
    const hh = String(timeHour);
    const mm = String(timeMinute).padStart(2, "0");
    const val = `${hh}:${mm} ${timeAmPm}`;
    if (timeTarget === "start") setStartTime(val);
    if (timeTarget === "end") setEndTime(val);
    if (timeTarget === "regStart") setRegStartTime(val);
    if (timeTarget === "regEnd") setRegEndTime(val);
    setTimeOpen(false);
  }

  async function createTournament() {
    try {
      if (!session?.user) return;
      if (!title || !startDate || !startTime || !regStart || !regStartTime || !regEnd || !regEndTime) {
        Alert.alert("Missing info", "Title, start date/time and registration dates/times are required");
        return;
      }
      const startDT = combineDateTime(startDate, startTime);
      const regStartDT = combineDateTime(regStart, regStartTime);
      const regEndDT = combineDateTime(regEnd, regEndTime);
      if (!startDT || !regStartDT || !regEndDT) {
        Alert.alert("Invalid dates", "Please check date/time formats (dd/mm/yyyy and h:mm AM/PM)");
        return;
      }
      let endDT: Date | null = null;
      if (endDate || endTime) {
        if (!endDate || !endTime) {
          Alert.alert("Invalid end", "Please provide both end date and end time or leave both empty");
          return;
        }
        endDT = combineDateTime(endDate, endTime);
        if (!endDT) {
          Alert.alert("Invalid end", "Please check end date/time format");
          return;
        }
      }
      setSubmitting(true);
      const { error } = await supabase
        .from("tournaments")
        .insert({
          organizer_id: session.user.id,
          title,
          venue_name: venueName || null,
          start_date: startDT.toISOString(),
          end_date: endDT ? endDT.toISOString() : null,
          registration_start_date: regStartDT.toISOString(),
          registration_end_date: regEndDT.toISOString(),
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
            <Text className="text-base font-medium text-gray-700 mb-2">Start date (dd/mm/yyyy)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={startDate}
                onChangeText={setStartDate}
                placeholder="dd/mm/yyyy"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handlePick("start")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Start time (h:mm AM/PM)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="h:mm AM/PM"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("start")}>
                  <Text className="text-gray-800">Pick</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">End date (optional, dd/mm/yyyy)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={endDate}
                onChangeText={setEndDate}
                placeholder="dd/mm/yyyy"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handlePick("end")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">End time (optional, h:mm AM/PM)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  value={endTime}
                  onChangeText={setEndTime}
                  placeholder="h:mm AM/PM"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("end")}>
                  <Text className="text-gray-800">Pick</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration start (dd/mm/yyyy)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regStart}
                onChangeText={setRegStart}
                placeholder="dd/mm/yyyy"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handlePick("regStart")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Registration start time (h:mm AM/PM)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  value={regStartTime}
                  onChangeText={setRegStartTime}
                  placeholder="h:mm AM/PM"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("regStart")}>
                  <Text className="text-gray-800">Pick</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration end (dd/mm/yyyy)</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regEnd}
                onChangeText={setRegEnd}
                placeholder="dd/mm/yyyy"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handlePick("regEnd")}>
                <Text className="text-gray-800">Pick</Text>
              </TouchableOpacity>
            </View>
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Registration end time (h:mm AM/PM)</Text>
              <View className="flex-row items-center">
                <TextInput
                  className="flex-1 border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  value={regEndTime}
                  onChangeText={setRegEndTime}
                  placeholder="h:mm AM/PM"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
                <TouchableOpacity className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200" onPress={() => handleTimePick("regEnd")}>
                  <Text className="text-gray-800">Pick</Text>
                </TouchableOpacity>
              </View>
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

      {showPicker && Platform.OS !== "web" && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          onChange={onNativeChange}
        />
      )}

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
                  let h = now.getHours();
                  let h12 = h % 12; if (h12 === 0) h12 = 12;
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
    </ScrollView>
  );
}
