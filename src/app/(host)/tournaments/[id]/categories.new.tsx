import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type Category = {
  id: number;
  name: string;
  participation_type: "singles" | "doubles" | "team";
  registration_fee: number | null;
  max_teams: number | null;
  members_per_team_min?: number;
  members_per_team_max?: number;
};

type Tournament = {
  id: number;
  title: string | null;
  status: string | null;
  start_date?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  organizer_id?: string | null;
};

export default function ManageCategories() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);
  const toast = useToast();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [ptype, setPtype] = useState<"singles" | "doubles" | "team">("singles");
  const [fee, setFee] = useState("1");
  const [maxTeams, setMaxTeams] = useState("16");
  const [teamMinFromTemplate, setTeamMinFromTemplate] = useState<number | null>(null);
  const [teamMaxFromTemplate, setTeamMaxFromTemplate] = useState<number | null>(null);

  const templates = useMemo(
    () => [
      { label: "Club Team Tie (6-10)", p: "team" as const, n: "Club Team Tie", teamMin: 6, teamMax: 10 },
      { label: "Team Doubles", p: "team" as const, n: "Team Doubles", teamMin: 2, teamMax: 2 },
      { label: "Men's Doubles", p: "doubles" as const, n: "Men's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Women's Doubles", p: "doubles" as const, n: "Women's Doubles", teamMin: 2, teamMax: 2 },
      { label: "Mixed Doubles", p: "doubles" as const, n: "Mixed Doubles", teamMin: 2, teamMax: 2 },
      { label: "Men's Singles", p: "singles" as const, n: "Men's Singles", teamMin: 1, teamMax: 1 },
      { label: "Women's Singles", p: "singles" as const, n: "Women's Singles", teamMin: 1, teamMax: 1 },
    ],
    []
  );

  async function load() {
    setLoading(true);
    const { data: t } = await supabase
      .from("tournaments")
      .select("id,title,status,start_date,registration_start_date,registration_end_date,organizer_id")
      .eq("id", tid)
      .maybeSingle();
    const tt = (t as Tournament) || null;
    setTournament(tt);
    if (tt?.organizer_id && session?.user?.id && tt.organizer_id !== session.user.id) {
      router.replace({ pathname: "/tournaments/[id]", params: { id: String(tid) } } as any);
      setLoading(false);
      return;
    }

    const { data: cats } = await supabase
      .from("tournament_categories")
      .select("id,name,participation_type,registration_fee,max_teams,members_per_team_min,members_per_team_max")
      .eq("tournament_id", tid)
      .order("id", { ascending: true });
    setItems((cats as Category[]) || []);
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
      if (regFee < 1) {
        Alert.alert("Minimum fee is RM 1");
        setSaving(false);
        return;
      }
      const max = Number(maxTeams) || null;
      const defaultMin = ptype === "doubles" ? 2 : 1;
      const defaultMax = ptype === "doubles" ? 2 : 1;
      const teamMin = opts?.teamMin ?? teamMinFromTemplate ?? defaultMin;
      const teamMax = opts?.teamMax ?? teamMaxFromTemplate ?? defaultMax;
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
      setFee("1");
      setMaxTeams("16");
      setTeamMinFromTemplate(null);
      setTeamMaxFromTemplate(null);
      await load();
      toast.show({ type: "success", message: "Category added" });
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
      toast.show({ type: "success", message: "Category removed" });
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function generateBracket(categoryId: number) {
    try {
      if (!tournament) return;
      if (!tournament.registration_end_date) {
        Alert.alert("Registration not closed", "Set and close the registration window first");
        return;
      }
      const ended = new Date(tournament.registration_end_date).getTime() <= Date.now();
      if (!ended) {
        Alert.alert("Registration still open", "You can generate brackets after registration closes");
        return;
      }
      setSaving(true);
      const { data, error } = await supabase.functions.invoke("generate-bracket", {
        body: { category_id: categoryId },
      });
      if (error) throw error as any;
      const msg = (data as any)?.message || "Bracket generated";
      toast.show({ type: "success", message: msg });
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
      if (open && (!tournament.registration_start_date || !tournament.registration_end_date)) {
        Alert.alert("Registration window not set", "Please edit the tournament to set the registration window first.");
        return;
      }
      setSaving(true);
      const { error } = await supabase
        .from("tournaments")
        .update({ status: open ? "registration_open" : "draft" })
        .eq("id", tid);
      if (error) throw error;
      await load();
      toast.show({ type: "success", message: open ? "Registration opened" : "Registration closed" });
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
        {/* Add Category Form */}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-3">Add Category</Text>

          {/* Quick Templates */}
          <View className="flex-row flex-wrap gap-2 mb-4">
            {templates.map((t) => (
              <TouchableOpacity
                key={t.label}
                className="px-3 py-2 rounded-lg border border-gray-300 bg-gray-50"
                onPress={() => {
                  setName(t.n);
                  setPtype(t.p);
                  setTeamMinFromTemplate(typeof t.teamMin === "number" ? t.teamMin : null);
                  setTeamMaxFromTemplate(typeof t.teamMax === "number" ? t.teamMax : null);
                }}
              >
                <Text className="text-gray-800 text-xs">{t.label}</Text>
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
            <View className="flex-row flex-wrap gap-2">
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

          <View className="flex-row gap-3 mb-4">
            <View className="flex-1">
              <Text className="text-sm text-gray-700 mb-1">Fee (MYR)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                keyboardType="numeric"
                value={fee}
                onChangeText={setFee}
              />
              <Text className="text-xs text-gray-500 mt-1">Min RM 1</Text>
            </View>
            <View className="flex-1">
              <Text className="text-sm text-gray-700 mb-1">Max entries</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                keyboardType="numeric"
                value={maxTeams}
                onChangeText={setMaxTeams}
              />
            </View>
          </View>

          <TouchableOpacity
            className={`rounded-lg py-3 px-4 ${saving ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
            onPress={() => addCategory()}
            disabled={saving}
          >
            <Text className={`text-center font-semibold ${saving ? "text-gray-500" : "text-white"}`}>Add Category</Text>
          </TouchableOpacity>
        </View>

        {/* Categories List */}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">Categories</Text>
          {loading ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : items.length === 0 ? (
            <Text className="text-gray-500 text-sm">No categories yet. Add one above.</Text>
          ) : (
            items.map((c) => (
              <View key={c.id} className="py-3 border-b border-gray-100 last:border-b-0">
                <View className="mb-2">
                  <Text className="text-base text-gray-900 font-medium">{c.name}</Text>
                  <Text className="text-xs text-gray-600">
                    {c.participation_type} • MYR {(c.registration_fee ?? 0).toFixed(2)} • Max {c.max_teams ?? "∞"}
                  </Text>
                  {c.participation_type === "team" && c.members_per_team_min != null && c.members_per_team_max != null && (
                    <Text className="text-xs text-gray-600">
                      Team size: {c.members_per_team_min === c.members_per_team_max
                        ? `${c.members_per_team_min} players`
                        : `${c.members_per_team_min}–${c.members_per_team_max} players`}
                    </Text>
                  )}
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <TouchableOpacity
                    className="px-3 py-2 rounded-lg border border-gray-300"
                    onPress={() => router.push({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(c.id) } } as any)}
                  >
                    <Text className="text-gray-800 text-sm">Fixtures</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className={`px-3 py-2 rounded-lg ${saving ? "bg-gray-200" : "bg-blue-50"} border border-blue-300`}
                    onPress={() => generateBracket(c.id)}
                    disabled={saving}
                  >
                    <Text className={`text-sm ${saving ? "text-gray-500" : "text-blue-700"}`}>Generate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    className="px-3 py-2 rounded-lg border border-red-300" 
                    onPress={() => removeCategory(c.id)}
                  >
                    <Text className="text-red-700 text-sm">Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Registration Status */}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-8">
          <Text className="text-base font-semibold text-gray-900 mb-2">Registration</Text>
          <Text className="text-sm text-gray-600 mb-1">Status: {tournament?.status || "draft"}</Text>
          {tournament?.registration_start_date && tournament?.registration_end_date ? (
            <Text className="text-xs text-gray-500 mb-3">
              Window: {new Date(tournament.registration_start_date).toLocaleDateString()} – {new Date(tournament.registration_end_date).toLocaleDateString()}
            </Text>
          ) : (
            <Text className="text-xs text-amber-700 mb-3">Registration window not set. Edit tournament to set dates.</Text>
          )}
          {items.length === 0 && (
            <Text className="text-xs text-amber-700 mb-3">Add at least one category to enable registration.</Text>
          )}
          <View className="flex-row flex-wrap gap-2">
            <TouchableOpacity
              className={`py-3 px-4 rounded-lg ${saving || items.length === 0 ? "bg-gray-300" : "bg-green-600 active:bg-green-700"}`}
              onPress={() => toggleRegistration(true)}
              disabled={saving || items.length === 0}
            >
              <Text className={`text-center font-semibold ${saving || items.length === 0 ? "text-gray-500" : "text-white"}`}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`py-3 px-4 rounded-lg ${saving ? "bg-gray-300" : "bg-gray-600 active:bg-gray-700"}`}
              onPress={() => toggleRegistration(false)}
              disabled={saving}
            >
              <Text className={`text-center font-semibold ${saving ? "text-gray-300" : "text-white"}`}>Close</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            className="mt-3 py-2"
            onPress={() => router.push({ pathname: "/host/tournaments/[id]/edit", params: { id: String(tid) } } as any)}
          >
            <Text className="text-blue-600 text-sm">Edit tournament details →</Text>
          </TouchableOpacity>
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
