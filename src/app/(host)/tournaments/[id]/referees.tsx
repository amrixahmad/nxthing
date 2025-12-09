import { useEffect, useState, useRef, useCallback } from "react";
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
    full_name: string | null;
    username: string | null;
  } | null;
};

type SearchResult = {
  id: string;
  full_name: string | null;
  username: string | null;
  email?: string | null;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search function
  const searchProfiles = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      
      // Filter out users who are already referees
      const existingIds = refs.map(r => r.profile_id);
      const filtered = ((data as SearchResult[]) || []).filter(p => !existingIds.includes(p.id));
      
      setSearchResults(filtered);
      setShowDropdown(filtered.length > 0);
      setHasSearched(true);
    } catch (e) {
      console.error("Search error:", e);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [refs]);

  // Handle search input change with debounce
  function handleSearchChange(text: string) {
    setSearchQuery(text);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (text.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      setHasSearched(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchProfiles(text);
    }, 300);
  }

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
        .select("id, profile_id, profile:profile_id(id, full_name, username)")
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

  async function addRefereeFromSearch(profile: SearchResult) {
    setSaving(true);
    setShowDropdown(false);
    try {
      const { error: iErr } = await supabase
        .from("tournament_referees")
        .insert({ tournament_id: tid, profile_id: profile.id });
      if (iErr) {
        const msg = String((iErr as any)?.message || "");
        if (msg.includes("duplicate key value")) {
          toast.show({ type: "info", message: "This user is already a referee for this tournament." });
          return;
        }
        throw iErr;
      }

      setSearchQuery("");
      setSearchResults([]);
      setHasSearched(false);
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
    return p?.full_name || p?.username || "Unknown user";
  }

  function emailFor(r: RefRow) {
    return null;
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
            <Text className="text-sm text-gray-700 mb-1">Search by name or username</Text>
            <View className="relative">
              <TextInput
                className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                value={searchQuery}
                onChangeText={handleSearchChange}
                placeholder="Type name or username..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
              />
              {searching && (
                <View className="absolute right-3 top-3">
                  <ActivityIndicator size="small" />
                </View>
              )}
              
              {/* Search Results Dropdown */}
              {showDropdown && searchResults.length > 0 && (
                <View className="absolute top-14 left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-48">
                  {searchResults.map((profile) => (
                    <TouchableOpacity
                      key={profile.id}
                      className="px-4 py-3 border-b border-gray-100 active:bg-gray-50"
                      onPress={() => addRefereeFromSearch(profile)}
                      disabled={saving}
                    >
                      <Text className="text-base text-gray-900">
                        {profile.full_name || profile.username || "Unknown"}
                      </Text>
                      {profile.username && profile.full_name && (
                        <Text className="text-xs text-gray-500">@{profile.username}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              {/* No results message */}
              {hasSearched && searchResults.length === 0 && !searching && (
                <View className="absolute top-14 left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-10 p-4">
                  <Text className="text-sm text-gray-500 text-center">No users found</Text>
                </View>
              )}
            </View>
            <Text className="text-xs text-gray-500 mt-1">Type at least 2 characters to search</Text>
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
