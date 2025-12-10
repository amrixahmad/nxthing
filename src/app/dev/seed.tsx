import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/context/SessionProvider";

export default function SeederScreen() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [teams, setTeams] = useState("4");
  const [seedTag, setSeedTag] = useState("");
  const [cleanupSeedTag, setCleanupSeedTag] = useState("");
  const { session } = useSession();

  function log(msg: string) {
    setLogs((p) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);
  }

  async function runSeeder() {
    setLoading(true);
    log("Starting seeder...");
    try {
      const { data, error } = await supabase.functions.invoke("seed-team-tournament", {
        body: {
          teams: Number(teams),
          title: "Auto-Gen Team Cup",
          venue: "Netlify/Supabase Cloud",
          organizer_id: session?.user?.id,
          seed_tag: seedTag.trim() || undefined,
          op: "create",
        },
      });

      if (error) {
        throw error;
      }

      log("Success!");
      log(JSON.stringify(data, null, 2));

      const anyData = data as any;
      if (anyData?.tournament_title) {
        log(`Tournament: ${anyData.tournament_title}`);
      }

      if (typeof anyData?.requested_teams === "number" && typeof anyData?.actual_teams === "number") {
        const cap = typeof anyData?.max_teams_cap === "number" ? anyData.max_teams_cap : 8;
        log(`Teams requested: ${anyData.requested_teams}, actually created: ${anyData.actual_teams} (max ${cap} for this dev seeder).`);
      }

      if (anyData?.organizer_email) {
        log(`Dummy organizer created: ${anyData.organizer_email} / ${anyData.organizer_password}`);
      } else {
        log("Using current session user as organizer; no dummy organizer account created.");
      }

      if ((data as any)?.category_id) {
        log("Generating bracket for seeded category...");
        const { data: gbData, error: gbError } = await supabase.functions.invoke("generate-bracket", {
          body: { category_id: (data as any).category_id },
        });
        if (gbError) {
          log(`Bracket error: ${gbError.message || JSON.stringify(gbError)}`);
        } else {
          log(`Bracket generated: ${JSON.stringify(gbData)}`);
        }
      }
    } catch (e: any) {
      log(`Error: ${e.message || JSON.stringify(e)}`);
      try {
        // Try to read body if it's a fetch error
        if (e instanceof Response) {
             const txt = await e.text();
             log("Response text: " + txt);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  async function runCleanupOrphans() {
    setLoading(true);
    log("Starting cleanup for orphan seed users (no matching tournaments)...");
    try {
      const { data, error } = await supabase.functions.invoke("seed-team-tournament", {
        body: {
          op: "cleanup_orphan_seed_users",
        },
      });
      if (error) {
        let serverMsg = "Edge Function returned an error";
        try {
          const ctx = (error as any)?.context;
          if (ctx?.body) {
            const parsed = await new Response(ctx.body).json();
            serverMsg = parsed?.error || parsed?.message || serverMsg;
          } else {
            serverMsg = (error as any)?.message || serverMsg;
          }
        } catch {
          serverMsg = (error as any)?.message || serverMsg;
        }
        log(`Orphan cleanup error: ${serverMsg}`);
        return;
      }
      log("Orphan seed user cleanup completed.");
      log(JSON.stringify(data, null, 2));
    } catch (e: any) {
      log(`Orphan cleanup error: ${e.message || JSON.stringify(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function runCleanup() {
    const tag = cleanupSeedTag.trim();
    if (!tag) {
      Alert.alert("Seed Tag Required", "Enter the seed tag used when creating dummy data.");
      return;
    }
    setLoading(true);
    log(`Starting cleanup for seed_tag='${tag}'...`);
    try {
      const { data, error } = await supabase.functions.invoke("seed-team-tournament", {
        body: {
          op: "cleanup",
          seed_tag: tag,
        },
      });
      if (error) {
        let serverMsg = "Edge Function returned an error";
        try {
          const ctx = (error as any)?.context;
          if (ctx?.body) {
            const parsed = await new Response(ctx.body).json();
            serverMsg = parsed?.error || parsed?.message || serverMsg;
          } else {
            serverMsg = (error as any)?.message || serverMsg;
          }
        } catch {
          serverMsg = (error as any)?.message || serverMsg;
        }
        log(`Cleanup error: ${serverMsg}`);
        return;
      }
      log("Cleanup completed.");
      log(JSON.stringify(data, null, 2));
    } catch (e: any) {
      log(`Cleanup error: ${e.message || JSON.stringify(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50 p-4">
      <Stack.Screen options={{ title: "Dev Tools: Seeder" }} />
      
      <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
        <Text className="font-bold text-lg mb-2">Team Tournament Seeder</Text>
        <Text className="text-sm text-gray-600 mb-4">
          Creates a tournament, organizer, teams, and full rosters (MD, WD, XD, RD) automatically.
        </Text>

        <Text className="text-xs font-semibold text-gray-500 mb-1">Number of Teams</Text>
        <TextInput 
          value={teams}
          onChangeText={setTeams}
          keyboardType="numeric"
          className="border border-gray-300 rounded-lg p-2 mb-3 bg-gray-50"
        />

        <Text className="text-xs font-semibold text-gray-500 mb-1">Optional Seed Tag</Text>
        <Text className="text-[11px] text-gray-400 mb-1">Use this to label dummy data for easy cleanup later (e.g. client-demo-01). If left blank, a random tag is used.</Text>
        <TextInput
          value={seedTag}
          onChangeText={setSeedTag}
          className="border border-gray-300 rounded-lg p-2 mb-3 bg-gray-50"
          placeholder="e.g. client-demo-01"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />
        
        <Text className="text-xs font-semibold text-gray-500 mb-1">Security Check</Text>
        <Text className="text-xs text-gray-400 mb-2">Ensure ALLOW_DEV_SEED="true" is set in your Edge Function secrets.</Text>

        <TouchableOpacity 
          onPress={runSeeder}
          disabled={loading}
          className={`p-3 rounded-lg items-center ${loading ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
        >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Run Seeder</Text>}
        </TouchableOpacity>
      </View>

      <View className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4">
        <Text className="font-bold text-lg mb-2">Cleanup Dummy Data</Text>
        <Text className="text-sm text-gray-600 mb-4">
          Remove seeded tournaments, entries, fixtures, matches, rosters, and seeded users created with a specific seed tag.
        </Text>

        <Text className="text-xs font-semibold text-gray-500 mb-1">Seed Tag</Text>
        <TextInput
          value={cleanupSeedTag}
          onChangeText={setCleanupSeedTag}
          className="border border-gray-300 rounded-lg p-2 mb-3 bg-gray-50"
          placeholder="Enter the seed tag to clean up"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="none"
        />

        <TouchableOpacity
          onPress={runCleanup}
          disabled={loading}
          className={`p-3 rounded-lg items-center ${loading ? "bg-gray-300" : "bg-red-600 active:bg-red-700"}`}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Run Cleanup</Text>}
        </TouchableOpacity>

        <View className="mt-4 border-t border-gray-200 pt-3">
          <Text className="text-xs font-semibold text-gray-500 mb-1">Orphan Seed Users</Text>
          <Text className="text-[11px] text-gray-400 mb-2">
            Deletes seed-* and seed-org-* users whose seed tag is not used by any tournament. Use after manually deleting tournaments.
          </Text>
          <TouchableOpacity
            onPress={runCleanupOrphans}
            disabled={loading}
            className={`p-3 rounded-lg items-center ${loading ? "bg-gray-300" : "bg-red-500 active:bg-red-600"}`}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Clean Orphan Seed Users</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View className="bg-gray-900 p-4 rounded-xl min-h-[200px]">
        <Text className="text-gray-400 text-xs font-mono mb-2">Logs</Text>
        {logs.map((l, i) => (
            <Text key={i} className="text-green-400 font-mono text-xs mb-1">{l}</Text>
        ))}
      </View>
    </ScrollView>
  );
}
