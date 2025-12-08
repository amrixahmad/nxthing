import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, RefreshControl } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/src/components/Toast";

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
  const params = useLocalSearchParams<{ notice?: string }>();
  const [items, setItems] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<"success" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const toast = useToast();

  async function load() {
    try {
      if (!session?.user) return;
      // Don't set loading true if we are refreshing, to avoid full screen loading state
      if (!refreshing) setLoading(true);
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

  useEffect(() => {
    load();
  }, [session]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useEffect(() => {
    if (params.notice) {
      if (params.notice === "created") setNoticeText("Tournament created");
      else if (params.notice === "updated") setNoticeText("Changes saved");
      else setNoticeText("Saved");
      setNotice("success");
      setTimeout(() => setNotice(null), 2500);
      router.replace("/host" as any);
    }
  }, [params.notice]);

  return (
    <ScrollView 
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: "Host Dashboard" }} />

      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8">
          <Text className="text-2xl font-bold text-gray-900 mb-2">Your Tournaments</Text>
          <Text className="text-gray-600">Create and manage tournaments</Text>
        </View>
      </View>

      <View className="px-4 mt-6">
        {notice && (
          <View className="mb-3 p-4 rounded-lg bg-green-50 border border-green-200">
            <Text className="text-green-800">{noticeText}</Text>
          </View>
        )}
        <TouchableOpacity className="bg-blue-600 rounded-xl p-4 mb-4 active:bg-blue-700" onPress={() => router.push("/(host)/tournaments/new" as any)}>
          <Text className="text-white text-center font-semibold">＋ New Tournament</Text>
        </TouchableOpacity>

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
                  <View className={`px-2 py-1 rounded ${t.status === "registration_open" ? "bg-green-100" : "bg-gray-100"}`}>
                    <Text className={`text-xs ${t.status === "registration_open" ? "text-green-800" : "text-gray-800"}`}>
                      {t.status === "registration_open" ? "Registration Open" : (t.status || "draft")}
                    </Text>
                  </View>
                </View>
                <Text className="text-gray-600">Start: {fmt(t.start_date)}</Text>
                <View className="mt-3 flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-gray-300 active:bg-gray-50"
                    onPress={() => router.push({ pathname: "/(host)/tournaments/[id]/categories", params: { id: String(t.id) } } as any)}
                  >
                    <Text className="text-gray-800 text-sm">Categories</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-gray-300 active:bg-gray-50"
                    onPress={() => router.push({ pathname: "/(host)/tournaments/[id]/edit", params: { id: String(t.id) } } as any)}
                  >
                    <Text className="text-gray-800 text-sm">Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-gray-300 active:bg-gray-50"
                    onPress={() => router.push({ pathname: "/(host)/tournaments/[id]/referees", params: { id: String(t.id) } } as any)}
                  >
                    <Text className="text-gray-800 text-sm">Referees</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-red-300 bg-red-50 active:bg-red-100"
                    onPress={async () => {
                      const confirm = Platform.OS === "web" ? (typeof window !== "undefined" ? window.confirm("Delete this tournament? This cannot be undone.") : true) : undefined;
                      if (Platform.OS !== "web") {
                        let proceed = false;
                        await new Promise<void>((resolve) => {
                          Alert.alert("Delete Tournament", "Are you sure? This cannot be undone.", [
                            { text: "Cancel", style: "cancel", onPress: () => { proceed = false; resolve(); } },
                            { text: "Delete", style: "destructive", onPress: () => { proceed = true; resolve(); } },
                          ]);
                        });
                        if (!proceed) return;
                      } else if (!confirm) {
                        return;
                      }
                      try {
                        const { error } = await supabase.from("tournaments").delete().eq("id", t.id);
                        if (error) throw error;
                        setItems((prev) => prev.filter((x) => x.id !== t.id));
                        toast.show({ type: "success", message: "Tournament deleted" });
                      } catch (e) {
                        if (e instanceof Error) Alert.alert("Error", e.message);
                      }
                    }}
                  >
                    <Text className="text-red-700 text-sm">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
