import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Alert } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";

type Member = {
  profile_id: string;
  display_name: string | null;
  email?: string | null;
};

type RosterSlot = {
  id: number;
  profile_id: string;
  slot_code: "MD" | "WD" | "XD" | "RD";
  profile?: {
    display_name: string | null;
  };
};

export default function RosterManagement() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string; entryId: string }>();
  const tid = Number(params.id);
  const entryId = Number(params.entryId);

  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [selectingFor, setSelectingFor] = useState<"MD" | "WD" | "XD" | "RD" | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    if (!entryId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      // Fetch members
      const { data: mems, error: mErr } = await supabase
        .from("entry_members")
        .select("profile_id, display_name") // join profile if needed, but display_name is on entry_members now
        .eq("entry_id", entryId);

      if (mErr) throw mErr;
      
      // Also fetch profiles to get emails or names if display_name missing
      const pids = (mems || []).map(m => m.profile_id);
      if (pids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", pids);
          
        const combined = (mems || []).map(m => {
           const p = profiles?.find(px => px.id === m.profile_id);
           return {
             profile_id: m.profile_id,
             display_name: m.display_name || p?.display_name || p?.email || "Unknown Player",
             email: p?.email
           };
        });
        setMembers(combined);
      }

      // Fetch current slots
      const { data: slots, error: sErr } = await supabase
        .from("entry_roster_slots")
        .select(`
          id, profile_id, slot_code
        `)
        .eq("entry_id", entryId);

      if (sErr) throw sErr;
      
      // Hydrate slots with names locally
      const hydrated = (slots || []).map(s => ({
        ...s,
        profile: {
            display_name: "Loading..." // We will match with members list in render
        }
      }));
      
      setRoster(hydrated as RosterSlot[]);

    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [entryId]);

  async function assignPlayer(profileId: string) {
    if (!selectingFor || !entryId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("entry_roster_slots").insert({
        entry_id: entryId,
        profile_id: profileId,
        slot_code: selectingFor
      });

      if (error) throw error;
      
      setSelectingFor(null);
      await load();

    } catch (e: any) {
      // Postgres trigger errors come here
      setErrorMsg(e.message);
      Alert.alert("Assignment Failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(slotId: number) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("entry_roster_slots").delete().eq("id", slotId);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  function getMemberName(pid: string) {
    return members.find(m => m.profile_id === pid)?.display_name || "Unknown";
  }

  function renderSlotSection(code: "MD" | "WD" | "XD" | "RD", title: string, subtitle: string) {
    const assigned = roster.filter(r => r.slot_code === code);
    const isFull = assigned.length >= 2;

    return (
      <View className="bg-white p-4 rounded-xl border border-gray-200 mb-4">
        <View className="flex-row justify-between items-start mb-2">
            <View>
                <Text className="text-lg font-bold text-gray-900">{title}</Text>
                <Text className="text-xs text-gray-500">{subtitle}</Text>
            </View>
            <Text className={`text-xs font-semibold px-2 py-1 rounded ${isFull ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                {assigned.length}/2
            </Text>
        </View>

        <View className="space-y-2">
            {assigned.map(slot => (
                <View key={slot.id} className="flex-row items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <View className="flex-row items-center">
                        <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center mr-3">
                            <Text className="text-blue-700 font-semibold">
                                {getMemberName(slot.profile_id).substring(0, 2).toUpperCase()}
                            </Text>
                        </View>
                        <Text className="text-gray-800 font-medium">{getMemberName(slot.profile_id)}</Text>
                    </View>
                    <TouchableOpacity 
                        onPress={() => removePlayer(slot.id)}
                        className="p-2"
                    >
                        <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            ))}

            {!isFull && (
                <TouchableOpacity 
                    onPress={() => setSelectingFor(code)}
                    className="flex-row items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-lg active:bg-gray-50"
                >
                    <Ionicons name="add" size={20} color="#6B7280" />
                    <Text className="ml-2 text-gray-500 font-medium">Add Player</Text>
                </TouchableOpacity>
            )}
        </View>
      </View>
    );
  }

  // Filter eligible players for the modal
  const eligibleMembers = members.filter(m => {
      if (!selectingFor) return false;
      
      // Already in this slot?
      const inSlot = roster.some(r => r.slot_code === selectingFor && r.profile_id === m.profile_id);
      if (inSlot) return false;

      // Specific RD constraints handled by Backend, but we can filter for better UX
      if (selectingFor === 'RD') {
          // Must be in MD or WD
          const inMD = roster.some(r => r.slot_code === 'MD' && r.profile_id === m.profile_id);
          const inWD = roster.some(r => r.slot_code === 'WD' && r.profile_id === m.profile_id);
          if (!inMD && !inWD) return false;

          // Cannot be in XD (Strictly enforced by DB, but we can filter too)
          const inXD = roster.some(r => r.slot_code === 'XD' && r.profile_id === m.profile_id);
          if (inXD) return false;
      }
      
      // For MD/WD/XD, check if they are already in RD?
      if (['MD', 'WD'].includes(selectingFor)) {
          // No restriction on MD/WD players being in RD.
      }
      
      if (selectingFor === 'XD') {
          // Cannot be in RD
          const inRD = roster.some(r => r.slot_code === 'RD' && r.profile_id === m.profile_id);
          if (inRD) return false;
      }

      return true;
  });

  return (
    <View className="flex-1 bg-gray-100">
      <Stack.Screen options={{ title: "Manage Team Roster" }} />
      
      <ScrollView className="flex-1 px-4 pt-4">
        <Text className="text-sm text-gray-600 mb-4">
            Assign exactly 6 players to the positions below. 
            The Wildcard pair must be formed by one player from the Men's Doubles pair and one from the Women's Doubles pair.
        </Text>

        {errorMsg && (
            <View className="bg-red-50 p-3 rounded-lg border border-red-200 mb-4">
                <Text className="text-red-800 text-sm">{errorMsg}</Text>
            </View>
        )}

        {loading ? (
            <ActivityIndicator size="large" color="#4F46E5" />
        ) : (
            <>
                {renderSlotSection("MD", "Men's Doubles", "2 Players")}
                {renderSlotSection("WD", "Women's Doubles", "2 Players")}
                {renderSlotSection("XD", "Mixed Doubles", "2 Players")}
                {renderSlotSection("RD", "Wildcard (Reverse)", "1 MD + 1 WD Player")}
                
                <View className="h-10" />
            </>
        )}
      </ScrollView>

      {/* Player Selection Modal */}
      <Modal
        visible={!!selectingFor}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectingFor(null)}
      >
        <View className="flex-1 justify-end bg-black/50">
            <View className="bg-white rounded-t-3xl p-5 h-2/3">
                <View className="flex-row justify-between items-center mb-4">
                    <Text className="text-xl font-bold text-gray-900">
                        Select for {selectingFor}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectingFor(null)}>
                        <Ionicons name="close" size={24} color="#6B7280" />
                    </TouchableOpacity>
                </View>

                {eligibleMembers.length === 0 ? (
                    <View className="items-center justify-center flex-1">
                        <Text className="text-gray-500 text-center px-10">
                            No eligible players found for this slot.
                            {selectingFor === 'RD' && "\n\n(Remember: Wildcard players must first be assigned to MD or WD)"}
                        </Text>
                    </View>
                ) : (
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {eligibleMembers.map(member => (
                            <TouchableOpacity
                                key={member.profile_id}
                                onPress={() => assignPlayer(member.profile_id)}
                                className="flex-row items-center p-4 border-b border-gray-100 active:bg-gray-50"
                            >
                                <View className="w-10 h-10 bg-indigo-100 rounded-full items-center justify-center mr-3">
                                    <Text className="text-indigo-700 font-bold">
                                        {member.display_name?.substring(0, 2).toUpperCase()}
                                    </Text>
                                </View>
                                <Text className="text-lg text-gray-800">
                                    {member.display_name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>
        </View>
      </Modal>
    </View>
  );
}
