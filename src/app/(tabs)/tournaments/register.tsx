import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

export default function RegisterAndPay() {
  const { session } = useSession();
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const params = useLocalSearchParams<{ payment?: string; entry_id?: string; session_id?: string; invite?: string }>();
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<"success" | "warning" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinedEntryId, setJoinedEntryId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);

  async function ensureEntry(userId: string, catId: number) {
    const { data: existing, error: selErr } = await supabase
      .from("entries")
      .select("id, payment_status")
      .eq("category_id", catId)
      .eq("created_by", userId)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) return existing.id as number;

    const { data: ins, error: insErr } = await supabase
      .from("entries")
      .insert({ category_id: catId, created_by: userId, payment_currency: "usd", status: "pending" })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const entryId = ins.id as number;
    const { error: memErr } = await supabase
      .from("entry_members")
      .insert({ entry_id: entryId, profile_id: userId });
    if (memErr) throw memErr;

    return entryId;
  }

  // Handle invite: join team and cache entry id + team name for messaging
  useEffect(() => {
    async function joinIfInvited() {
      const invite = (params.invite as string | undefined)?.trim();
      if (!invite || !session?.user) return;
      try {
        setJoining(true);
        const { data, error } = await supabase.functions.invoke("team-join", {
          body: { invite_code: invite },
        });
        if (error) throw error;
        const entryId = Number((data as any)?.entry_id || 0);
        if (entryId) {
          setJoinedEntryId(entryId);
          // Load team name for display
          const { data: e } = await supabase
            .from("entries")
            .select("team_name, invite_code")
            .eq("id", entryId)
            .maybeSingle();
          if (e?.team_name) setTeamName(String(e.team_name));
        }
      } catch (err: any) {
        Alert.alert("Invite Error", err?.message || "Could not join team");
      } finally {
        setJoining(false);
      }
    }
    joinIfInvited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.invite, session?.user?.id]);

  useEffect(() => {
    async function run() {
      const pay = params.payment as string | undefined;
      const eid = Number(params.entry_id ?? 0);
      if (pay === "success" && eid) {
        setProcessing(true);
        setNotice(null);
        for (let i = 0; i < 20; i++) {
          const [{ data: entry }, { data: member }] = await Promise.all([
            supabase.from("entries").select("payment_status,status").eq("id", eid).maybeSingle(),
            session?.user
              ? supabase
                  .from("entry_members")
                  .select("payment_status")
                  .eq("entry_id", eid)
                  .eq("profile_id", session.user.id)
                  .maybeSingle()
              : Promise.resolve({ data: null } as any),
          ]);
          if (entry?.payment_status === "paid") {
            setNotice("success");
            setNoticeText("Payment confirmed. Entry accepted.");
            setProcessing(false);
            return;
          }
          if (member?.payment_status === "paid") {
            setNotice("success");
            setNoticeText("Your payment was received. Waiting for teammates to complete payment.");
            setProcessing(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 750));
        }
        setProcessing(false);
        setNotice("warning");
        setNoticeText("Payment processing delayed. Please refresh in a moment.");
      } else if (pay === "cancel") {
        setNotice("warning");
        setNoticeText("Payment canceled. You can try again anytime.");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.payment, params.entry_id]);

  async function onRegisterAndPay() {
    try {
      if (!session?.user) {
        Alert.alert("Sign in required");
        return;
      }
      const catId = Number(categoryId.trim());
      if (!catId || isNaN(catId)) {
        Alert.alert("Invalid Category ID");
        return;
      }
      setSubmitting(true);

      const entryId = await ensureEntry(session.user.id, catId);

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
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onJoinAndPay() {
    try {
      if (!session?.user) {
        Alert.alert("Sign in required");
        return;
      }
      if (!joinedEntryId) {
        Alert.alert("Invite", "Invite not validated yet. Please try again.");
        return;
      }
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: joinedEntryId },
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
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Register & Pay" }} />

      <View className="px-4 mt-6">
        {notice === "success" && (
          <View className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200">
            <Text className="text-green-800 mb-2">{noticeText}</Text>
            <TouchableOpacity
              className="rounded-lg py-3 px-4 bg-green-600 active:bg-green-700"
              onPress={() => router.push("/tournaments/my" as any)}
            >
              <Text className="text-white text-center font-semibold">View My Entries</Text>
            </TouchableOpacity>
          </View>
        )}
        {notice === "warning" && (
          <View className="mb-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
            <Text className="text-yellow-800">{noticeText}</Text>
          </View>
        )}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {params.invite ? (
            <>
              <Text className="text-lg font-semibold text-gray-900 mb-2">Join Team & Pay</Text>
              <Text className="text-sm text-gray-700 mb-4">
                {joining ? "Validating invite..." : teamName ? `You are registering to join ${teamName}.` : "Invite recognized. You can proceed to payment."}
              </Text>
              <TouchableOpacity
                className={`rounded-lg py-4 px-6 ${submitting || joining ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={onJoinAndPay}
                disabled={submitting || joining}
              >
                <Text className={`text-center font-semibold ${submitting || joining ? "text-gray-500" : "text-white"}`}>
                  {submitting || processing ? "Processing..." : "Join Team & Pay"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-lg font-semibold text-gray-900 mb-6">Register for a Category</Text>
              <View className="mb-4">
                <Text className="text-base font-medium text-gray-700 mb-2">Category ID</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  keyboardType="numeric"
                  value={categoryId}
                  onChangeText={setCategoryId}
                  placeholder="Enter category id (from Studio)"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <TouchableOpacity
                className={`rounded-lg py-4 px-6 ${submitting ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={onRegisterAndPay}
                disabled={submitting}
              >
                <Text className={`text-center font-semibold ${submitting ? "text-gray-500" : "text-white"}`}>
                  {submitting || processing ? "Processing..." : "Register & Pay"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
