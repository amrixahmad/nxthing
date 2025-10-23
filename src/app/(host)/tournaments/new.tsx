import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
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
            <Text className="text-base font-medium text-gray-700 mb-2">Start Date (YYYY-MM-DD)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={startDate}
              onChangeText={setStartDate}
              placeholder="2025-01-15"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">End Date (optional)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={endDate}
              onChangeText={setEndDate}
              placeholder="2025-01-16"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration Start (YYYY-MM-DD)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={regStart}
              onChangeText={setRegStart}
              placeholder="2024-12-01"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">Registration End (YYYY-MM-DD)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={regEnd}
              onChangeText={setRegEnd}
              placeholder="2024-12-20"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
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
    </ScrollView>
  );
}
