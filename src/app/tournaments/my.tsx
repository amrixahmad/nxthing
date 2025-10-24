import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type EntryRow = {
  id: number;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_currency: string | null;
  category: {
    id: number;
    name?: string | null;
    tournament?: { id: number; title?: string | null } | null;
  } | null;
};

export default function MyEntries() {
  const { session } = useSession();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [invoking, setInvoking] = useState<number | null>(null);

  async function load() {
    if (!session?.user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("entries")
      .select(
        `id, status, payment_status, payment_amount, payment_currency,
         category:category_id ( id, name, tournament:tournament_id ( id, title ) )`
      )
      .eq("created_by", session.user.id)
      .order("created_at", { ascending: false });
    if (!error) {
      const normalized: EntryRow[] = ((data as any[]) || []).map((r: any) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        const t = cat?.tournament;
        const tour = Array.isArray(t) ? t[0] : t;
        return {
          id: r.id,
          status: r.status,
          payment_status: r.payment_status,
          payment_amount: r.payment_amount ?? null,
          payment_currency: r.payment_currency ?? null,
          category: cat
            ? {
                id: cat.id,
                name: cat.name ?? null,
                tournament: tour ? { id: tour.id, title: tour.title ?? null } : null,
              }
            : null,
        } as EntryRow;
      });
      setEntries(normalized);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function pay(entryId: number) {
    try {
      setInvoking(entryId);
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
    } catch (e) {
      // Basic alert without adding a new dependency
      console.error(e);
    } finally {
      setInvoking(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "My Entries" }} />

      <View className="px-4 mt-6">
        <View className="mb-3 flex-row justify-between items-center">
          <Text className="text-lg font-semibold text-gray-900">Your Entries</Text>
          <TouchableOpacity className="px-3 py-2 rounded-lg border border-gray-300" onPress={load}>
            <Text className="text-gray-800">Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator />
          </View>
        ) : entries.length === 0 ? (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Text className="text-gray-700">No entries yet.</Text>
          </View>
        ) : (
          entries.map((e) => {
            const title = e.category?.tournament?.title || `Tournament #${e.category?.tournament?.id ?? "?"}`;
            const cat = e.category?.name || `Category #${e.category?.id ?? "?"}`;
            const canPay = e.payment_status === "unpaid";
            const amount = e.payment_amount ?? 0;
            const currency = (e.payment_currency || "usd").toUpperCase();
            return (
              <View key={e.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-3">
                <Text className="text-base font-medium text-gray-900">{title}</Text>
                <Text className="text-sm text-gray-700 mt-1">{cat}</Text>
                <View className="flex-row mt-3">
                  <View className="mr-4">
                    <Text className="text-xs text-gray-500">Entry</Text>
                    <Text className="text-sm text-gray-800">#{e.id}</Text>
                  </View>
                  <View className="mr-4">
                    <Text className="text-xs text-gray-500">Status</Text>
                    <Text className="text-sm text-gray-800">{e.status}</Text>
                  </View>
                  <View className="mr-4">
                    <Text className="text-xs text-gray-500">Payment</Text>
                    <Text className="text-sm text-gray-800">{e.payment_status}</Text>
                  </View>
                </View>
                <View className="flex-row items-center justify-between mt-4">
                  <Text className="text-gray-900 font-semibold">
                    {amount ? `${currency} ${amount.toFixed(2)}` : ""}
                  </Text>
                  {canPay ? (
                    <TouchableOpacity
                      className={`rounded-lg py-2 px-4 ${invoking === e.id ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                      onPress={() => pay(e.id)}
                      disabled={invoking === e.id}
                    >
                      <Text className={`text-center font-semibold ${invoking === e.id ? "text-gray-500" : "text-white"}`}>
                        {invoking === e.id ? "Opening..." : "Pay"}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View className="px-3 py-2 rounded-lg bg-green-100">
                      <Text className="text-green-800">Paid</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
