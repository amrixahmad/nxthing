import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { toDMY, toHM12, combineDateTime } from "@/utils/datetime";

export default function EditTournament() {
  const { session } = useSession();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tid = Number(id);

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

  const [errStart, setErrStart] = useState<string | null>(null);
  const [errEnd, setErrEnd] = useState<string | null>(null);
  const [errRegStart, setErrRegStart] = useState<string | null>(null);
  const [errRegEnd, setErrRegEnd] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        if (!session?.user || !tid) return;
        const { data, error } = await supabase
          .from("tournaments")
          .select("title, venue_name, start_date, end_date, registration_start_date, registration_end_date, format")
          .eq("id", tid)
          .maybeSingle();
        if (error) throw error;
        if (!data) return;
        setTitle(data.title ?? "");
        setVenueName(data.venue_name ?? "");
        if (data.start_date) {
          const d = new Date(data.start_date);
          setStartDate(toDMY(d));
          setStartTime(toHM12(d));
        }
        if (data.end_date) {
          const d = new Date(data.end_date);
          setEndDate(toDMY(d));
          setEndTime(toHM12(d));
        }
        if (data.registration_start_date) {
          const d = new Date(data.registration_start_date);
          setRegStart(toDMY(d));
          setRegStartTime(toHM12(d));
        }
        if (data.registration_end_date) {
          const d = new Date(data.registration_end_date);
          setRegEnd(toDMY(d));
          setRegEndTime(toHM12(d));
        }
        setFormat((data.format as any) || "single_elimination");
      } catch (e) {
        if (e instanceof Error) Alert.alert("Error", e.message);
      }
    }
    load();
  }, [session?.user, tid]);

  async function saveTournament() {
    try {
      if (!session?.user) return;
      setErrStart(null); setErrEnd(null); setErrRegStart(null); setErrRegEnd(null);
      if (!title) { Alert.alert("Missing info", "Title is required"); return; }
      if (!startDate || !startTime) { setErrStart("Start date and time are required"); return; }
      if (!regStart || !regStartTime) { setErrRegStart("Registration start is required"); return; }
      if (!regEnd || !regEndTime) { setErrRegEnd("Registration end is required"); return; }

      const startDT = combineDateTime(startDate, startTime);
      const regStartDT = combineDateTime(regStart, regStartTime);
      const regEndDT = combineDateTime(regEnd, regEndTime);
      if (!startDT || !regStartDT || !regEndDT) {
        if (!startDT) setErrStart("Invalid start date/time");
        if (!regStartDT) setErrRegStart("Invalid registration start");
        if (!regEndDT) setErrRegEnd("Invalid registration end");
        return;
      }
      const now = new Date();
      if (startDT <= now) { setErrStart("Start must be in the future"); return; }

      let endDT: Date | null = null;
      if (endDate || endTime) {
        if (!endDate || !endTime) { setErrEnd("Provide both end date and time or leave both empty"); return; }
        endDT = combineDateTime(endDate, endTime);
        if (!endDT) { setErrEnd("Invalid end date/time"); return; }
        if (endDT <= startDT) { setErrEnd("End must be after the start time"); return; }
      }

      if (regStartDT >= regEndDT) { setErrRegStart("Must be before end"); setErrRegEnd("Must be after start"); return; }
      if (regStartDT <= now) { setErrRegStart("Must be in the future"); return; }
      if (regEndDT <= now) { setErrRegEnd("Must be in the future"); return; }
      if (regEndDT > startDT) { setErrRegEnd("Must be before tournament start"); return; }

      setSubmitting(true);
      const { error } = await supabase
        .from("tournaments")
        .update({
          title,
          venue_name: venueName || null,
          start_date: startDT.toISOString(),
          end_date: endDT ? endDT.toISOString() : null,
          registration_start_date: regStartDT.toISOString(),
          registration_end_date: regEndDT.toISOString(),
          format,
        })
        .eq("id", tid);
      if (error) throw error;
      toast.show({ type: "success", message: "Changes saved" });
      router.replace("/host" as any);
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Edit Tournament" }} />

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
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={startDate}
              onChangeText={(v) => { setStartDate(v); setErrStart(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Start time (h:mm AM/PM)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={startTime}
                onChangeText={(v) => { setStartTime(v); setErrStart(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>
            {errStart ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errStart}</Text>
              </View>
            ) : null}
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">End date (optional, dd/mm/yyyy)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={endDate}
              onChangeText={(v) => { setEndDate(v); setErrEnd(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">End time (optional, h:mm AM/PM)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={endTime}
                onChangeText={(v) => { setEndTime(v); setErrEnd(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>
            {errEnd ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errEnd}</Text>
              </View>
            ) : null}
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration start (dd/mm/yyyy)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={regStart}
              onChangeText={(v) => { setRegStart(v); setErrRegStart(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Registration start time (h:mm AM/PM)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regStartTime}
                onChangeText={(v) => { setRegStartTime(v); setErrRegStart(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>
            {errRegStart ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errRegStart}</Text>
              </View>
            ) : null}
          </View>

          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration end (dd/mm/yyyy)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={regEnd}
              onChangeText={(v) => { setRegEnd(v); setErrRegEnd(null); }}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
            <View className="mt-3">
              <Text className="text-base font-medium text-gray-700 mb-2">Registration end time (h:mm AM/PM)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                value={regEndTime}
                onChangeText={(v) => { setRegEndTime(v); setErrRegEnd(null); }}
                placeholder="h:mm AM/PM"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>
            {errRegEnd ? (
              <View className="mt-2 self-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <Text className="text-xs text-red-800">{errRegEnd}</Text>
              </View>
            ) : null}
          </View>

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

          <TouchableOpacity
            className={`rounded-lg py-4 px-6 mt-6 ${submitting ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={saveTournament}
            disabled={submitting}
          >
            <Text className={`text-center font-semibold ${submitting ? "text-gray-500" : "text-white"}`}>
              {submitting ? "Saving..." : "Save Changes"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="rounded-lg py-3 px-6 mt-3 border border-gray-300" onPress={() => router.push("/host" as any)}>
            <Text className="text-center text-gray-700">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
