import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { startCheckout } from "@/utils/checkout";
import { formatDateTimeLocal } from "@/utils/datetime";

type EntryRow = {
  id: number;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_currency: string | null;
  category: {
    id: number;
    name?: string | null;
    tournament?: {
      id: number;
      title?: string | null;
      status?: string | null;
      registration_start_date?: string | null;
      registration_end_date?: string | null;
    } | null;
  } | null;
};

export default function MyEntries() {
  const { session } = useSession();
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [invoking, setInvoking] = useState<number | null>(null);
  const [notice, setNotice] = useState<"success" | "warning" | "error" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);

  async function load() {
    if (!session?.user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("entries")
      .select(
        `id, status, payment_status, payment_amount, payment_currency,
         category:category_id ( id, name, tournament:tournament_id ( id, title, status, registration_start_date, registration_end_date ) )`
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
                tournament: tour
                  ? {
                      id: tour.id,
                      title: tour.title ?? null,
                      status: tour.status ?? null,
                      registration_start_date: tour.registration_start_date ?? null,
                      registration_end_date: tour.registration_end_date ?? null,
                    }
                  : null,
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

  // After returning from Stripe, poll for paid status and refresh list
  useEffect(() => {
    async function run() {
      const pay = params.payment as string | undefined;
      const eid = Number(params.entry_id ?? 0);
      if (pay === "success" && eid) {
        setNotice(null);
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase
            .from("entries")
            .select("payment_status,status")
            .eq("id", eid)
            .maybeSingle();
          if (data?.payment_status === "paid") {
            setNotice("success");
            setNoticeText("Payment confirmed. Entry accepted.");
            setHighlightId(eid);
            await load();
            return;
          }
          await new Promise((r) => setTimeout(r, 750));
        }
        setNotice("warning");
        setNoticeText("Payment processing delayed. Please refresh in a moment.");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.payment, params.entry_id]);

  async function pay(entryId: number) {
    try {
      setInvoking(entryId);
      setNotice(null);
      await startCheckout(entryId);
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Payment failed");
    } finally {
      setInvoking(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "My Entries" }} />

      <View className="px-4 mt-6">
        {notice && (
          <View
            className={
              notice === "success"
                ? "mb-3 p-4 rounded-lg bg-green-50 border border-green-200"
                : notice === "warning"
                ? "mb-3 p-4 rounded-lg bg-yellow-50 border border-yellow-200"
                : "mb-3 p-4 rounded-lg bg-red-50 border border-red-200"
            }
          >
            <Text className={
              notice === "success" ? "text-green-800" : notice === "warning" ? "text-yellow-800" : "text-red-800"
            }>
              {noticeText}
            </Text>
          </View>
        )}

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
            const isHighlight = highlightId === e.id;
            const t = e.category?.tournament;
            const isOpen = (() => {
              if (!t) return false;
              if (t.status !== "registration_open") return false;
              if (!t.registration_start_date || !t.registration_end_date) return false;
              const now = new Date();
              const s = new Date(t.registration_start_date);
              const nd = new Date(t.registration_end_date);
              return now >= s && now <= nd;
            })();
            return (
              <View
                key={e.id}
                className={`bg-white rounded-xl shadow-sm p-5 mb-3 ${isHighlight ? "border border-green-300" : "border border-gray-100"}`}
              >
                <Text className="text-base font-medium text-gray-900">{title}</Text>
                <Text className="text-sm text-gray-700 mt-1">{cat}</Text>
                <View className="mt-2 flex-row items-center">
                  <View className={`px-2 py-1 rounded ${isOpen ? "bg-green-100" : "bg-gray-100"}`}>
                    <Text className={`text-xs ${isOpen ? "text-green-800" : "text-gray-800"}`}>{isOpen ? "Registration Open" : "Registration Closed"}</Text>
                  </View>
                  {t?.registration_start_date && t?.registration_end_date ? (
                    <Text className="text-xs text-gray-600 ml-2">{formatDateTimeLocal(t.registration_start_date)} → {formatDateTimeLocal(t.registration_end_date)}</Text>
                  ) : null}
                </View>
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
                      className={`rounded-lg py-2 px-4 ${(invoking === e.id || !isOpen) ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                      onPress={() => pay(e.id)}
                      disabled={invoking === e.id || !isOpen}
                    >
                      <Text className={`text-center font-semibold ${(invoking === e.id || !isOpen) ? "text-gray-500" : "text-white"}`}>
                        {invoking === e.id ? "Opening..." : isOpen ? "Pay" : "Closed"}
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
