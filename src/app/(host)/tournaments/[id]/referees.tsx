import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { useToast } from "@/src/components/Toast";
import { supabase } from "@/lib/supabase";

type Tournament = {
  id: number;
  title: string | null;
  organizer_id: string | null;
};

type RefRow = {
  id: number;
  profile_id: string;
  profile?: {
    display_name: string | null;
    email: string | null;
  } | null;
};

export default function ManageReferees() {
  const { session } = useSession();
  const toast = useToast();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refs, setRefs] = useState<RefRow[]>([]);
  const [emailInput, setEmailInput] = useState("");

  async function load() {
    if (!tid || !session?.user) return;
    setLoading(true);
    try {
      const { data: t, error: tErr } = await supabase
        .from("tournaments")
        .select("id,title,organizer_id")
        .eq("id", tid)
        .maybeSingle();
      if (tErr) throw tErr;
      const tt = (t as any) as Tournament | null;
      setTournament(tt);
      if (!tt || !tt.organizer_id || tt.organizer_id !== session.user.id) {
        router.replace({ pathname: "/tournaments/[id]", params: { id: String(tid) } } as any);
        setLoading(false);
        return;
      }

      const { data: rows, error: rErr } = await supabase
        .from("tournament_referees")
        .select("id, profile_id, profile:profile_id(id, display_name, email)")
        .eq("tournament_id", tid)
        .order("created_at", { ascending: true });
      if (rErr) throw rErr;
      setRefs(((rows as any[]) || []) as RefRow[]);
    } catch (e: any) {
      if (e?.message) Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tid && session?.user) load();
  }, [tid, session?.user?.id]);

  async function addReferee() {
    const raw = emailInput.trim();
    if (!raw) {
      Alert.alert("Email required", "Enter the referee's account email.");
      return;
    }
    setSaving(true);
    try {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .ilike("email", raw);
      if (pErr) throw pErr;
      const prof = (profs || [])[0] as { id: string; display_name: string | null; email: string | null } | undefined;
      if (!prof) {
        Alert.alert("Not found", "No user found with that email.");
        return;
      }

      const { error: iErr } = await supabase
        .from("tournament_referees")
        .insert({ tournament_id: tid, profile_id: prof.id });
      if (iErr) {
        const msg = String((iErr as any)?.message || "");
        if (msg.includes("duplicate key value")) {
          toast.show({ type: "info", message: "This user is already a referee for this tournament." });
          return;
        }
        throw iErr;
      }

      setEmailInput("");
      await load();
      toast.show({ type: "success", message: "Referee added" });
    } catch (e: any) {
      if (e?.message) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeReferee(id: number) {
    setSaving(true);
    try {
      const { error } = await supabase.from("tournament_referees").delete().eq("id", id);
      if (error) throw error;
      setRefs((prev) => prev.filter((r) => r.id !== id));
      toast.show({ type: "success", message: "Referee removed" });
    } catch (e: any) {
      if (e?.message) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  function displayNameFor(r: RefRow) {
    const p = r.profile;
    return p?.display_name || p?.email || "Unknown user";
  }

  function emailFor(r: RefRow) {
    const p = r.profile;
    return p?.email || null;
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: tournament?.title ? `${tournament.title} - Referees` : "Referees" }} />

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-1">Referees</Text>
          <Text className="text-sm text-gray-600 mb-4">
            Assign non-playing staff who can record scores and mark matches as completed for this tournament.
          </Text>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">Add referee by email</Text>
            <View className="flex-row items-center">
              <TextInput
                className="flex-1 border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                value={emailInput}
                onChangeText={setEmailInput}
                placeholder="referee@example.com"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TouchableOpacity
                className={`ml-2 px-4 py-3 rounded-lg ${saving ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={addReferee}
                disabled={saving}
              >
                <Text className={`text-sm font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mt-2">
            {loading ? (
              <View className="py-4 items-center justify-center">
                <ActivityIndicator />
              </View>
            ) : refs.length === 0 ? (
              <Text className="text-sm text-gray-600">No referees added yet.</Text>
            ) : (
              refs.map((r) => {
                const name = displayNameFor(r);
                const email = emailFor(r);
                return (
                  <View key={r.id} className="flex-row items-center justify-between py-3 border-b border-gray-100">
                    <View className="flex-1 mr-2">
                      <Text className="text-base text-gray-900">{name}</Text>
                      {email ? <Text className="text-xs text-gray-500">{email}</Text> : null}
                    </View>
                    <TouchableOpacity
                      className="px-3 py-2 rounded-lg border border-red-300"
                      onPress={() => removeReferee(r.id)}
                      disabled={saving}
                    >
                      <Text className="text-sm text-red-700">Remove</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <TouchableOpacity
          className="rounded-lg py-3 px-6 border border-gray-300 mb-8"
          onPress={() => router.push("/host" as any)}
        >
          <Text className="text-center text-gray-700">Back to Host Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
