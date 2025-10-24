import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Cat = { id: number; name?: string | null; registration_fee?: number | null };

type Tour = {
  id: number;
  title?: string | null;
  venue_name?: string | null;
  start_date?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  status?: string | null;
  categories: Cat[];
};

export default function TournamentDetails() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [tour, setTour] = useState<Tour | null>(null);
  const [entryByCategory, setEntryByCategory] = useState<Record<number, { id: number; payment_status: string }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    // Load tournament and its categories
    const { data: tdata } = await supabase
      .from("tournaments")
      .select(
        `id, title, venue_name, start_date, registration_start_date, registration_end_date, status,
         categories:tournament_categories ( id, name, registration_fee )`
      )
      .eq("id", tid)
      .maybeSingle();

    const t = tdata as any;
    const details: Tour | null = t
      ? {
          id: t.id,
          title: t.title ?? null,
          venue_name: t.venue_name ?? null,
          start_date: t.start_date ?? null,
          registration_start_date: t.registration_start_date ?? null,
          registration_end_date: t.registration_end_date ?? null,
          status: t.status ?? null,
          categories: Array.isArray(t.categories) ? t.categories : [],
        }
      : null;
    setTour(details);

    // Load user's entries for this tournament
    if (session?.user) {
      const { data: entries } = await supabase
        .from("entries")
        .select("id, payment_status, category_id, category:category_id(tournament_id)")
        .eq("created_by", session.user.id);
      const map: Record<number, { id: number; payment_status: string }> = {};
      (entries as any[])?.forEach((r: any) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        if (cat?.tournament_id === tid) {
          map[r.category_id] = { id: r.id, payment_status: r.payment_status };
        }
      });
      setEntryByCategory(map);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (tid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, session?.user?.id]);

  async function ensureEntry(userId: string, categoryId: number) {
    const { data: existing } = await supabase
      .from("entries")
      .select("id, payment_status")
      .eq("category_id", categoryId)
      .eq("created_by", userId)
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id as number;
    // try insert; if unique violation happens due to race, read back
    const { data: ins, error: insErr } = await supabase
      .from("entries")
      .insert({ category_id: categoryId, created_by: userId, payment_currency: "usd", status: "pending" })
      .select("id")
      .single();
    if (insErr) {
      // re-read
      const { data: after } = await supabase
        .from("entries")
        .select("id")
        .eq("category_id", categoryId)
        .eq("created_by", userId)
        .limit(1)
        .maybeSingle();
      if (after?.id) return after.id as number;
      throw insErr;
    }
    const entryId = (ins as any).id as number;
    await supabase.from("entry_members").insert({ entry_id: entryId, profile_id: userId });
    return entryId;
  }

  async function register(categoryId: number) {
    if (!session?.user) return;
    try {
      setBusyKey(`c-${categoryId}`);
      const entryId = await ensureEntry(session.user.id, categoryId);
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: entryId },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("No checkout URL returned");
      if (Platform.OS === "web") window.location.href = url;
      else await WebBrowser.openBrowserAsync(url);
    } finally {
      setBusyKey(null);
    }
  }

  async function payEntry(entryId: number) {
    try {
      setBusyKey(`e-${entryId}`);
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: entryId },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("No checkout URL returned");
      if (Platform.OS === "web") window.location.href = url;
      else await WebBrowser.openBrowserAsync(url);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: tour?.title || `Tournament #${tid}` }} />

      <View className="px-4 mt-6">
        {loading || !tour ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator />
          </View>
        ) : (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <Text className="text-base font-semibold text-gray-900">{tour.title || `Tournament #${tid}`}</Text>
            {tour.venue_name ? (
              <Text className="text-sm text-gray-700 mt-1">{tour.venue_name}</Text>
            ) : null}
            <Text className="text-xs text-gray-600 mt-1">
              {tour.start_date ? `Starts ${tour.start_date}` : ""}
            </Text>

            <Text className="text-sm font-medium text-gray-900 mt-4">Categories</Text>
            {tour.categories.length === 0 ? (
              <Text className="text-sm text-gray-600 mt-2">No categories available.</Text>
            ) : (
              tour.categories.map((c) => {
                const meta = entryByCategory[c.id];
                const isBusy = busyKey === `c-${c.id}` || (meta && busyKey === `e-${meta.id}`);
                return (
                  <View key={c.id} className="flex-row items-center justify-between mt-3">
                    <View>
                      <Text className="text-sm text-gray-800">{c.name || `Category #${c.id}`}</Text>
                      <Text className="text-xs text-gray-600">USD {(c.registration_fee ?? 0).toFixed(2)}</Text>
                    </View>
                    {meta ? (
                      meta.payment_status === "unpaid" ? (
                        <TouchableOpacity
                          className={`rounded-lg py-2 px-4 ${isBusy ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                          onPress={() => payEntry(meta.id)}
                          disabled={isBusy}
                        >
                          <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>Pay</Text>
                        </TouchableOpacity>
                      ) : (
                        <View className="px-3 py-2 rounded-lg bg-green-100">
                          <Text className="text-green-800">Registered</Text>
                        </View>
                      )
                    ) : (
                      <TouchableOpacity
                        className={`rounded-lg py-2 px-4 ${isBusy ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                        onPress={() => register(c.id)}
                        disabled={isBusy}
                      >
                        <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>Register</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
