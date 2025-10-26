import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { registerThenCheckout, startCheckout } from "@/utils/checkout";
import { formatDateTimeLocal } from "@/utils/datetime";

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
  const [notice, setNotice] = useState<"error" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const isOpen = (() => {
    if (!tour) return false;
    if (tour.status !== "registration_open") return false;
    if (!tour.registration_start_date || !tour.registration_end_date) return false;
    const now = new Date();
    const s = new Date(tour.registration_start_date);
    const e = new Date(tour.registration_end_date);
    return now >= s && now <= e;
  })();

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

  async function register(categoryId: number) {
    if (!session?.user) return;
    try {
      setBusyKey(`c-${categoryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      await registerThenCheckout(session.user.id, categoryId);
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Registration failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function payEntry(entryId: number) {
    try {
      setBusyKey(`e-${entryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      await startCheckout(entryId);
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Payment failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: tour?.title || `Tournament #${tid}` }} />

      <View className="px-4 mt-6">
        {notice && (
          <View className="mb-3 p-4 rounded-lg bg-red-50 border border-red-200">
            <Text className="text-red-800">{noticeText}</Text>
          </View>
        )}
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
              {tour.start_date ? `Starts ${formatDateTimeLocal(tour.start_date)}` : ""}
            </Text>
            <View className="mt-3">
              <View className={`self-start px-2 py-1 rounded ${isOpen ? "bg-green-100" : "bg-gray-100"}`}>
                <Text className={`text-xs ${isOpen ? "text-green-800" : "text-gray-800"}`}>
                  {isOpen ? "Registration Open" : tour.status === "registration_open" ? "Registration Window Closed" : "Registration Closed"}
                </Text>
              </View>
              <Text className="text-xs text-gray-600 mt-1">
                {tour.registration_start_date && tour.registration_end_date
                  ? `Window: ${formatDateTimeLocal(tour.registration_start_date)} → ${formatDateTimeLocal(tour.registration_end_date)}`
                  : "Registration window not set"}
              </Text>
            </View>

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
                      <Text className="text-xs text-gray-600">USD {Number(c.registration_fee ?? 0).toFixed(2)}</Text>
                    </View>
                    {meta ? (
                      meta.payment_status === "unpaid" ? (
                        <TouchableOpacity
                          className={`rounded-lg py-2 px-4 ${isBusy || !isOpen ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                          onPress={() => payEntry(meta.id)}
                          disabled={isBusy || !isOpen}
                        >
                          <Text className={`text-center font-semibold ${isBusy || !isOpen ? "text-gray-500" : "text-white"}`}>{isOpen ? "Pay" : "Closed"}</Text>
                        </TouchableOpacity>
                      ) : (
                        <View className="px-3 py-2 rounded-lg bg-green-100">
                          <Text className="text-green-800">Registered</Text>
                        </View>
                      )
                    ) : (
                      <TouchableOpacity
                        className={`rounded-lg py-2 px-4 ${isBusy || !isOpen ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                        onPress={() => register(c.id)}
                        disabled={isBusy || !isOpen}
                      >
                        <Text className={`text-center font-semibold ${isBusy || !isOpen ? "text-gray-500" : "text-white"}`}>{isOpen ? "Register" : "Closed"}</Text>
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
