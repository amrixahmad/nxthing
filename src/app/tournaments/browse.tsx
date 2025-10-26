import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, Link } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Cat = { id: number; name?: string | null; registration_fee?: number | null };
type Tour = {
  id: number;
  title?: string | null;
  status?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  tcs?: Cat[];
};
type EntryMeta = { id: number; category_id: number; payment_status: string };

export default function BrowseTournaments() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tour[]>([]);
  const [entryByCategory, setEntryByCategory] = useState<Record<number, EntryMeta>>({});

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tournaments")
      .select("id, title, status, registration_start_date, registration_end_date, tcs:tournament_categories(id, name, registration_fee)")
      .eq("status", "registration_open")
      .order("registration_start_date", { ascending: true });
    const normalized: Tour[] = ((data as any[]) || []).map((r: any) => ({
      id: r.id,
      title: r.title ?? null,
      status: r.status ?? null,
      registration_start_date: r.registration_start_date ?? null,
      registration_end_date: r.registration_end_date ?? null,
      tcs: Array.isArray(r.tcs) ? r.tcs : [],
    }));
    setTournaments(normalized);
    setLoading(false);
  }

  useEffect(() => {
    load();
    (async () => {
      if (!session?.user) return;
      const { data } = await supabase
        .from("entries")
        .select("id, category_id, payment_status")
        .eq("created_by", session.user.id);
      const map: Record<number, EntryMeta> = {};
      (data as any[])?.forEach((r: any) => {
        map[r.category_id] = { id: r.id, category_id: r.category_id, payment_status: r.payment_status };
      });
      setEntryByCategory(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // No direct Register/Pay actions here. This page only links to tournament details.

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Browse Tournaments" }} />

      <View className="px-4 mt-6">
        {loading ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator />
          </View>
        ) : tournaments.length === 0 ? (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Text className="text-gray-700">No tournaments open for registration.</Text>
          </View>
        ) : (
          tournaments.map((t) => (
            <View key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <Text className="text-base font-semibold text-gray-900">{t.title || `Tournament #${t.id}`}</Text>
              <View className="mt-2">
                <View className={`self-start px-2 py-1 rounded ${(t.status === 'registration_open') ? 'bg-green-100' : 'bg-gray-100'}`}>
                  <Text className={`text-xs ${(t.status === 'registration_open') ? 'text-green-800' : 'text-gray-800'}`}>
                    {t.status === 'registration_open' ? 'Registration Open' : 'Registration Closed'}
                  </Text>
                </View>
                <Text className="text-xs text-gray-600 mt-1">
                  {t.registration_start_date && t.registration_end_date
                    ? `Window: ${t.registration_start_date} → ${t.registration_end_date}`
                    : 'Registration window not set'}
                </Text>
              </View>
              {(t.tcs || []).length === 0 ? (
                <Text className="text-sm text-gray-600 mt-2">No categories available.</Text>
              ) : (
                (t.tcs || []).map((c) => (
                  <View key={c.id} className="flex-row items-center justify-between mt-3">
                    <View>
                      <Text className="text-sm text-gray-800">{c.name || `Category #${c.id}`}</Text>
                      <Text className="text-xs text-gray-600">USD {Number(c.registration_fee ?? 0).toFixed(2)}</Text>
                    </View>
                  </View>
                ))
              )}
              <Link href={{ pathname: "/tournaments/[id]", params: { id: String(t.id) } }} asChild>
                <TouchableOpacity className="mt-4 rounded-lg py-2 px-4 border border-gray-300 active:bg-gray-50">
                  <Text className="text-center text-gray-800">View Tournament</Text>
                </TouchableOpacity>
              </Link>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
