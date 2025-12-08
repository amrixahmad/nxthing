import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { startCheckout } from "@/utils/checkout";
import { formatDateTimeLocal } from "@/src/utils/datetime";

type EntryRow = {
  id: number;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  payment_currency: string | null;
  team_name: string | null;
  role: "captain" | "player";
  created_at: string | null;
  // Individual member payment status (for the current user)
  myPaymentStatus?: string | null;
  category: {
    id: number;
    name?: string | null;
    participation_type?: string | null;
    members_per_team_min?: number | null;
    members_per_team_max?: number | null;
    tournament?: {
      id: number;
      title?: string | null;
      status?: string | null;
      registration_start_date?: string | null;
      registration_end_date?: string | null;
    } | null;
  } | null;
  // Team member stats
  paidMembersCount?: number;
  totalMembersCount?: number;
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
    const userId = session.user.id;

    const { data: createdRows, error: createdErr } = await supabase
      .from("entries")
      .select(
        `id, status, payment_status, payment_amount, payment_currency, team_name, created_at, created_by,
         category:category_id ( id, name, participation_type, members_per_team_min, members_per_team_max, tournament:tournament_id ( id, title, status, registration_start_date, registration_end_date ) )`
      )
      .eq("created_by", userId);

    const { data: memberRows, error: memberErr } = await supabase
      .from("entry_members")
      .select(
        `entry_id, payment_status,
         entry:entry_id (
           id, status, payment_status, payment_amount, payment_currency, team_name, created_at, created_by,
           category:category_id ( id, name, participation_type, members_per_team_min, members_per_team_max, tournament:tournament_id ( id, title, status, registration_start_date, registration_end_date ) )
         )`
      )
      .eq("profile_id", userId);

    if (!createdErr && !memberErr) {
      const byId: Record<number, EntryRow> = {};
      // Track user's individual payment status per entry
      const myPaymentByEntry: Record<number, string | null> = {};

      function upsert(raw: any, role: "captain" | "player", myPaymentStatus?: string | null) {
        if (!raw) return;
        const cat = Array.isArray(raw.category) ? raw.category[0] : raw.category;
        const t = cat?.tournament;
        const tour = Array.isArray(t) ? t[0] : t;
        const existing = byId[raw.id as number];
        const next: EntryRow = {
          id: raw.id as number,
          status: raw.status,
          payment_status: raw.payment_status,
          payment_amount: raw.payment_amount ?? null,
          payment_currency: raw.payment_currency ?? null,
          team_name: raw.team_name ?? null,
          created_at: raw.created_at ?? null,
          role,
          myPaymentStatus: myPaymentStatus ?? myPaymentByEntry[raw.id as number] ?? null,
          category: cat
            ? {
                id: cat.id,
                name: cat.name ?? null,
                participation_type: cat.participation_type ?? null,
                members_per_team_min: cat.members_per_team_min ?? null,
                members_per_team_max: cat.members_per_team_max ?? null,
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
        };

        if (!existing || (existing.role !== "captain" && role === "captain")) {
          byId[next.id] = next;
        }
        // Always update myPaymentStatus if provided
        if (myPaymentStatus && byId[next.id]) {
          byId[next.id].myPaymentStatus = myPaymentStatus;
        }
      }

      ((createdRows as any[]) || []).forEach((r) => {
        upsert(r, "captain");
      });

      ((memberRows as any[]) || []).forEach((m: any) => {
        let e = m.entry;
        if (Array.isArray(e)) e = e[0];
        if (!e) return;
        const isCreator = e.created_by === userId;
        const memberPaymentStatus = m.payment_status || null;
        myPaymentByEntry[e.id as number] = memberPaymentStatus;
        upsert(e, isCreator ? "captain" : "player", memberPaymentStatus);
      });

      // Fetch team member counts for each entry
      const entryIds = Object.keys(byId).map(Number);
      if (entryIds.length > 0) {
        const { data: allMembers } = await supabase
          .from("entry_members")
          .select("entry_id, payment_status")
          .in("entry_id", entryIds);
        
        if (allMembers) {
          const countsByEntry: Record<number, { total: number; paid: number }> = {};
          allMembers.forEach((m: any) => {
            const eid = m.entry_id as number;
            if (!countsByEntry[eid]) countsByEntry[eid] = { total: 0, paid: 0 };
            countsByEntry[eid].total++;
            if (m.payment_status === "paid") countsByEntry[eid].paid++;
          });
          
          Object.keys(byId).forEach((idStr) => {
            const id = Number(idStr);
            if (countsByEntry[id]) {
              byId[id].totalMembersCount = countsByEntry[id].total;
              byId[id].paidMembersCount = countsByEntry[id].paid;
            }
          });
        }
      }

      const merged = Object.values(byId).sort((a, b) => {
        const ad = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bd = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bd - ad;
      });

      setEntries(merged);
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
      <Stack.Screen options={{ title: "My Teams & Entries" }} />

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
          <Text className="text-lg font-semibold text-gray-900">Your Teams & Entries</Text>
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
            const pType = e.category?.participation_type || null;
            let roleLabel = "";
            if (pType === "singles") {
              roleLabel = "Singles";
            } else if (pType) {
              roleLabel = e.role === "captain" ? "Captain" : "Team member";
            }
            const canPay = e.payment_status === "unpaid";
            const amount = e.payment_amount ?? 0;
            const currency = (e.payment_currency || "myr").toUpperCase();
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
                {pType === "team" && e.team_name ? (
                  <Text className="text-xs text-gray-700 mt-0.5">Team: {e.team_name}</Text>
                ) : null}
                {roleLabel ? (
                  <Text className="text-xs text-gray-500 mt-0.5">Role: {roleLabel}</Text>
                ) : null}
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
                    <Text className="text-xs text-gray-500">Team Payment</Text>
                    <Text className="text-sm text-gray-800">{e.payment_status}</Text>
                  </View>
                </View>

                {/* Individual payment status for team entries */}
                {pType === "team" && (
                  <View className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-medium text-gray-700">Your Payment</Text>
                      <View className={`px-2 py-0.5 rounded ${e.myPaymentStatus === "paid" ? "bg-green-100" : "bg-yellow-100"}`}>
                        <Text className={`text-xs font-medium ${e.myPaymentStatus === "paid" ? "text-green-700" : "text-yellow-700"}`}>
                          {e.myPaymentStatus === "paid" ? "✓ You Paid" : "Unpaid"}
                        </Text>
                      </View>
                    </View>
                    {e.totalMembersCount != null && e.paidMembersCount != null && (
                      <View className="mt-2">
                        <Text className="text-xs text-gray-600">
                          Team Progress: {e.paidMembersCount}/{e.totalMembersCount} members paid
                          {e.category?.members_per_team_min && e.paidMembersCount < e.category.members_per_team_min && (
                            ` (need ${e.category.members_per_team_min} min)`
                          )}
                        </Text>
                        <View className="mt-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <View 
                            className="h-full bg-green-500 rounded-full" 
                            style={{ width: `${Math.min(100, (e.paidMembersCount / (e.category?.members_per_team_min || e.totalMembersCount)) * 100)}%` }}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                )}

                <View className="flex-row items-center justify-between mt-4">
                  <Text className="text-gray-900 font-semibold">
                    {amount ? `${currency} ${amount.toFixed(2)}` : ""}
                  </Text>
                  {e.myPaymentStatus === "paid" ? (
                    <View className="px-3 py-2 rounded-lg bg-green-100">
                      <Text className="text-green-800">✓ Paid</Text>
                    </View>
                  ) : canPay ? (
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
