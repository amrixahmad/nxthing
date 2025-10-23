import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert } from "react-native";
import { Stack, Link } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Tournament = {
  id: number;
  title: string;
  status: string | null;
  start_date: string | null;
  created_at?: string | null;
};

function fmt(d?: string | null) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function HostTournaments() {
  const { session } = useSession();
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        if (!session?.user) return;
        setLoading(true);
        const { data, error } = await supabase
          .from("tournaments")
          .select("id,title,status,start_date,created_at")
          .eq("organizer_id", session.user.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setItems(data || []);
      } catch (e) {
        if (e instanceof Error) Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [session]);

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Host Dashboard" }} />

      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8">
          <Text className="text-2xl font-bold text-gray-900 mb-2">Your Tournaments</Text>
          <Text className="text-gray-600">Create and manage tournaments</Text>
        </View>
      </View>

      <View className="px-4 mt-6">
        <Link href="/tournaments/new" asChild>
          <TouchableOpacity className="bg-blue-600 rounded-xl p-4 mb-4 active:bg-blue-700">
            <Text className="text-white text-center font-semibold">＋ New Tournament</Text>
          </TouchableOpacity>
        </Link>

        {loading ? (
          <View className="bg-white rounded-xl border border-gray-100 p-6">
            <Text className="text-gray-600">Loading...</Text>
          </View>
        ) : items.length === 0 ? (
          <View className="bg-white rounded-xl border border-gray-100 p-6">
            <Text className="text-gray-600">No tournaments yet.</Text>
          </View>
        ) : (
          <View className="space-y-3">
            {items.map((t) => (
              <View
                key={t.id}
                className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm"
              >
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-lg font-semibold text-gray-900">{t.title}</Text>
                  <Text className="text-xs text-gray-500">{t.status || "draft"}</Text>
                </View>
                <Text className="text-gray-600">Start: {fmt(t.start_date)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
