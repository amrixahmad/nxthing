import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from "react-native";
import { Stack } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

export default function RegisterAndPay() {
  const { session } = useSession();
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Register & Pay" }} />

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
              {submitting ? "Processing..." : "Register & Pay"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
