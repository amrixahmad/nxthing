import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Cat = { id: number; name?: string | null; registration_fee?: number | null };
type Tour = { id: number; title?: string | null; tcs?: Cat[] };

export default function BrowseTournaments() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tour[]>([]);
  const [invoking, setInvoking] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("tournaments")
      .select("id, title, tcs:tournament_categories(id, name, registration_fee)")
      .eq("status", "registration_open")
      .order("registration_start_date", { ascending: true });
    const normalized: Tour[] = ((data as any[]) || []).map((r: any) => ({
      id: r.id,
      title: r.title ?? null,
      tcs: Array.isArray(r.tcs) ? r.tcs : [],
    }));
    setTournaments(normalized);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function ensureEntry(userId: string, categoryId: number) {
    const { data: existing } = await supabase
      .from("entries")
      .select("id, payment_status")
      .eq("category_id", categoryId)
      .eq("created_by", userId)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id as number;
    const { data: ins } = await supabase
      .from("entries")
      .insert({ category_id: categoryId, created_by: userId, payment_currency: "usd", status: "pending" })
      .select("id")
      .single();
    const entryId = (ins as any).id as number;
    await supabase.from("entry_members").insert({ entry_id: entryId, profile_id: userId });
    return entryId;
  }

  async function register(categoryId: number) {
    if (!session?.user) return;
    try {
      setInvoking(categoryId);
      const entryId = await ensureEntry(session.user.id, categoryId);
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: entryId },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("No checkout URL returned");
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } finally {
      setInvoking(null);
    }
  }

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
              {(t.tcs || []).length === 0 ? (
                <Text className="text-sm text-gray-600 mt-2">No categories available.</Text>
              ) : (
                (t.tcs || []).map((c) => (
                  <View key={c.id} className="flex-row items-center justify-between mt-3">
                    <View>
                      <Text className="text-sm text-gray-800">{c.name || `Category #${c.id}`}</Text>
                      <Text className="text-xs text-gray-600">USD {(c.registration_fee ?? 0).toFixed(2)}</Text>
                    </View>
                    <TouchableOpacity
                      className={`rounded-lg py-2 px-4 ${invoking === c.id ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                      onPress={() => register(c.id)}
                      disabled={invoking === c.id}
                    >
                      <Text className={`text-center font-semibold ${invoking === c.id ? "text-gray-500" : "text-white"}`}>
                        {invoking === c.id ? "Opening..." : "Register"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
