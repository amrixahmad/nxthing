import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import { Stack } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SeederScreen() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [teams, setTeams] = useState("4");

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
          venue: "Netlify/Supabase Cloud"
        }
      });

      if (error) {
        throw error;
      }

      log("Success!");
      log(JSON.stringify(data, null, 2));
      if (data.organizer_email) {
        log(`Organizer: ${data.organizer_email} / ${data.organizer_password}`);
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

      <View className="bg-gray-900 p-4 rounded-xl min-h-[200px]">
        <Text className="text-gray-400 text-xs font-mono mb-2">Logs</Text>
        {logs.map((l, i) => (
            <Text key={i} className="text-green-400 font-mono text-xs mb-1">{l}</Text>
        ))}
      </View>
    </ScrollView>
  );
}
