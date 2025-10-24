import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Stack, useLocalSearchParams, router, Link } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Category = {
  id: number;
  name: string;
  participation_type: "singles" | "doubles" | "team";
  registration_fee: number | null;
  max_teams: number | null;
};

type Tournament = {
  id: number;
  title: string | null;
  status: string | null;
};

export default function ManageCategories() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [ptype, setPtype] = useState<"singles" | "doubles" | "team">("singles");
  const [fee, setFee] = useState("0");
  const [maxTeams, setMaxTeams] = useState("16");

  const templates = useMemo(
    () => [
      { label: "Men's Singles", p: "singles" as const, n: "Men's Singles", teamMin: 1, teamMax: 1 },
      { label: "Women's Singles", p: "singles" as const, n: "Women's Singles", teamMin: 1, teamMax: 1 },
      { label: "Men's Doubles", p: "doubles" as const, n: "Men's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Women's Doubles", p: "doubles" as const, n: "Women's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Mixed Doubles", p: "doubles" as const, n: "Mixed Doubles", teamMin: 2, teamMax: 2 },
    ],
    []
  );

  async function load() {
    setLoading(true);
    const { data: t } = await supabase
      .from("tournaments")
      .select("id,title,status")
      .eq("id", tid)
      .maybeSingle();
    setTournament((t as any) || null);

    const { data: cats } = await supabase
      .from("tournament_categories")
      .select("id,name,participation_type,registration_fee,max_teams")
      .eq("tournament_id", tid)
      .order("id", { ascending: true });
    setItems((cats as any[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    if (tid) load();
  }, [tid]);

  async function addCategory(opts?: { teamMin?: number; teamMax?: number }) {
    try {
      if (!session?.user) return;
      if (!name.trim()) {
        Alert.alert("Name required");
        return;
      }
      setSaving(true);
      const regFee = Number(fee) || 0;
      const max = Number(maxTeams) || null;
      const teamMin = opts?.teamMin ?? (ptype === "doubles" ? 2 : 1);
      const teamMax = opts?.teamMax ?? (ptype === "doubles" ? 2 : 1);
      const { error } = await supabase.from("tournament_categories").insert({
        tournament_id: tid,
        name: name.trim(),
        participation_type: ptype,
        registration_fee: regFee,
        max_teams: max,
        members_per_team_min: teamMin,
        members_per_team_max: teamMax,
      });
      if (error) throw error;
      setName("");
      setPtype("singles");
      setFee("0");
      setMaxTeams("16");
      await load();
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(id: number) {
    try {
      setSaving(true);
      const { error } = await supabase.from("tournament_categories").delete().eq("id", id);
      if (error) throw error;
      await load();
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleRegistration(open: boolean) {
    try {
      if (!tournament) return;
      if (open && items.length === 0) {
        Alert.alert("Add at least one category before opening registration");
        return;
      }
      setSaving(true);
      const { error } = await supabase
        .from("tournaments")
        .update({ status: open ? "registration_open" : "draft" })
        .eq("id", tid);
      if (error) throw error;
      await load();
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: tournament?.title || `Tournament #${tid}` }} />

      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-2">Categories</Text>

          <View className="flex-row flex-wrap -m-1 mb-4">
            {templates.map((t) => (
              <TouchableOpacity
                key={t.label}
                className="m-1 px-3 py-2 rounded-lg border border-gray-300"
                onPress={() => {
                  setName(t.n);
                  setPtype(t.p);
                }}
              >
                <Text className="text-gray-800 text-sm">{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Name</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Men's Singles 3.5–4.0"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Participation</Text>
            <View className="flex-row space-x-2">
              {(["singles", "doubles", "team"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  className={`px-3 py-2 rounded-lg border ${ptype === p ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                  onPress={() => setPtype(p)}
                >
                  <Text className={`text-sm ${ptype === p ? "text-white" : "text-gray-700"}`}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View className="mb-3">
            <Text className="text-sm text-gray-700 mb-1">Registration fee (USD)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              keyboardType="numeric"
              value={fee}
              onChangeText={setFee}
            />
          </View>

          <View className="mb-4">
            <Text className="text-sm text-gray-700 mb-1">Max teams/players</Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
              keyboardType="numeric"
              value={maxTeams}
              onChangeText={setMaxTeams}
            />
          </View>

          <TouchableOpacity
            className={`rounded-lg py-3 px-4 ${saving ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => addCategory()}
            disabled={saving}
          >
            <Text className={`text-center font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Add Category</Text>
          </TouchableOpacity>
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-4">
          {loading ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : items.length === 0 ? (
            <Text className="text-gray-700">No categories yet.</Text>
          ) : (
            items.map((c) => (
              <View key={c.id} className="flex-row items-center justify-between py-3 border-b border-gray-100">
                <View>
                  <Text className="text-base text-gray-900">{c.name}</Text>
                  <Text className="text-xs text-gray-600">{c.participation_type} • USD {(c.registration_fee ?? 0).toFixed(2)} • Max {c.max_teams ?? "-"}</Text>
                </View>
                <TouchableOpacity className="px-3 py-2 rounded-lg border border-red-300" onPress={() => removeCategory(c.id)}>
                  <Text className="text-red-700">Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <Text className="text-base font-semibold text-gray-900 mb-2">Registration</Text>
          <Text className="text-sm text-gray-600 mb-3">Status: {tournament?.status || "draft"}</Text>
          <View className="flex-row space-x-2">
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving ? "bg-gray-300" : "bg-green-600 active:bg-green-700"}`}
              onPress={() => toggleRegistration(true)}
              disabled={saving}
            >
              <Text className={`text-center font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Open Registration</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-4 py-3 rounded-lg ${saving ? "bg-gray-300" : "bg-gray-600 active:bg-gray-700"}`}
              onPress={() => toggleRegistration(false)}
              disabled={saving}
            >
              <Text className={`text-center font-semibold ${saving ? "text-gray-300" : "text-white"}`}>Close Registration</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Link href="/tournaments" asChild>
          <TouchableOpacity className="rounded-lg py-3 px-6 border border-gray-300 mb-8">
            <Text className="text-center text-gray-700">Back to Host Dashboard</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
  );
}
