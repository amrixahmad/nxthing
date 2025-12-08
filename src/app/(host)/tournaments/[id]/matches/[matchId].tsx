import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useToast } from "@/src/components/Toast";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/context/SessionProvider";
import { toDMY, toHM12, combineDateTime, parseTime12, parseDMY } from "@/src/utils/datetime";

type Match = {
  id: number;
  tournament_id: number;
  category_id: number;
  round_number: number;
  entry1_id: number | null;
  entry2_id: number | null;
  winner_entry_id: number | null;
  status: string;
  scheduled_at: string | null;
  court: string | null;
  score_json: any | null;
  next_match_id: number | null;
  next_match_slot: 1 | 2 | null;
  fixture_id: number | null;
  sub_match_type: string | null;
  session_sequence: number | null;
};

type TeamMember = {
  profile_id: string;
  display_name: string;
};

type RefOption = {
  id: string;
  name: string;
  email: string | null;
 };

export default function HostMatchDetail() {
  const params = useLocalSearchParams<{ id: string; matchId: string }>();
  const tid = Number(params.id);
  const mid = Number(params.matchId);
  const { session } = useSession();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<Match | null>(null);
  const [team1Name, setTeam1Name] = useState("-");
  const [team2Name, setTeam2Name] = useState("-");
  const [team1Members, setTeam1Members] = useState<TeamMember[]>([]);
  const [team2Members, setTeam2Members] = useState<TeamMember[]>([]);
  const [team1Players, setTeam1Players] = useState<string[]>([]);
  const [team2Players, setTeam2Players] = useState<string[]>([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState<{ team: 1 | 2; position: number } | null>(null);

  // editable fields
  const [status, setStatus] = useState<string>("pending");
  const [court, setCourt] = useState<string>("");
  const [timeStr, setTimeStr] = useState<string>("");
  const [winner, setWinner] = useState<0 | 1 | 2 | null>(null); // 0 none, 1 p1, 2 p2
  const [games, setGames] = useState<Array<{ p1: string; p2: string }>>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tournamentDate, setTournamentDate] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeHour, setTimeHour] = useState<number>(9);
  const [timeMinute, setTimeMinute] = useState<number>(0);
  const [timeAmPm, setTimeAmPm] = useState<"AM" | "PM">("AM");
  const [refOptions, setRefOptions] = useState<RefOption[]>([]);
  const [refereeId, setRefereeId] = useState<string | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [isReferee, setIsReferee] = useState(false);

  function shortName(s: string) {
    const str = String(s || "").trim();
    return str.length > 28 ? str.slice(0, 28) + "…" : str || "-";
  }

  function openWebTimePicker() {
    const v = timeStr;
    const parsed = parseTime12(v || "");
    if (parsed) {
      let h12 = parsed.hours24 % 12;
      if (h12 === 0) h12 = 12;
      setTimeHour(h12);
      setTimeAmPm(parsed.hours24 < 12 ? "AM" : "PM");
      setTimeMinute(parsed.minutes);
    } else {
      const now = new Date();
      let h = now.getHours();
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      setTimeHour(h12);
      setTimeAmPm(h < 12 ? "AM" : "PM");
      setTimeMinute(now.getMinutes() - (now.getMinutes() % 5));
    }
    setTimeOpen(true);
  }

  function confirmWebTime() {
    const hh = String(timeHour);
    const mm = String(timeMinute).padStart(2, "0");
    const val = `${hh}:${mm} ${timeAmPm}`;
    setTimeStr(val);
    setTimeOpen(false);
  }

  async function load() {
    try {
      setLoading(true);
      const { data: m } = await supabase
        .from("matches")
        .select(
          "id,tournament_id,category_id,round_number,entry1_id,entry2_id,winner_entry_id,status,scheduled_at,court,score_json,next_match_id,next_match_slot,fixture_id,sub_match_type,session_sequence,referee_profile_id"
        )
        .eq("id", mid)
        .maybeSingle();
      const mmRaw = (m as any) as Match | null;
      if (!mmRaw) throw new Error("Match not found");

      // Resolve participants via fixture for team sub-matches where entry ids are not set on the match row
      let effectiveEntry1Id = mmRaw.entry1_id;
      let effectiveEntry2Id = mmRaw.entry2_id;

      if (mmRaw.fixture_id) {
        const { data: fx } = await supabase
          .from("fixtures")
          .select("entry1_id,entry2_id")
          .eq("id", mmRaw.fixture_id)
          .maybeSingle();
        if (fx) {
          const fr = fx as any;
          if (!effectiveEntry1Id && fr.entry1_id) effectiveEntry1Id = fr.entry1_id as number;
          if (!effectiveEntry2Id && fr.entry2_id) effectiveEntry2Id = fr.entry2_id as number;
        }
      }

      const mm: Match = {
        ...mmRaw,
        entry1_id: effectiveEntry1Id,
        entry2_id: effectiveEntry2Id,
      };
      // Access guard: allow tournament organizer or assigned referee
      const { data: tOrg } = await supabase
        .from("tournaments")
        .select("id, organizer_id, start_date")
        .eq("id", mm.tournament_id)
        .maybeSingle();
      const orgId = (tOrg as any)?.organizer_id as string | null | undefined;
      const tournamentStartDate = (tOrg as any)?.start_date as string | null | undefined;
      setTournamentDate(tournamentStartDate || null);
      const uid = session?.user?.id || null;
      const refId = (mmRaw as any)?.referee_profile_id as string | null | undefined;
      const isOrg = !!uid && !!orgId && uid === orgId;
      const isRef = !!uid && !!refId && uid === refId;
      if (!isOrg && !isRef) {
        router.replace({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(mm.category_id) } } as any);
        setLoading(false);
        return;
      }
      setIsOrganizer(isOrg);
      setIsReferee(isRef);
      const { data: refRows } = await supabase
        .from("tournament_referees")
        .select("profile_id, profile:profile_id(id, full_name, username)")
        .eq("tournament_id", mm.tournament_id)
        .order("created_at", { ascending: true });
      const opts: RefOption[] = ((refRows as any[]) || []).map((row: any) => {
        const prof = row.profile as any;
        const nameRaw = prof?.full_name || prof?.username || "Unknown user";
        const name = String(nameRaw || "").trim() || "Unknown user";
        const email = null;
        return {
          id: String(row.profile_id),
          name,
          email,
        };
      });
      setRefOptions(opts);
      setMatch(mm);
      setStatus(mm.status);
      setCourt(mm.court || "");
      setRefereeId((mmRaw as any)?.referee_profile_id || null);
      if (mm.scheduled_at) {
        const dt = new Date(mm.scheduled_at);
        setTimeStr(toHM12(dt));
      } else {
        setTimeStr("");
      }
      if (mm.winner_entry_id && mm.entry1_id && mm.winner_entry_id === mm.entry1_id) setWinner(1);
      else if (mm.winner_entry_id && mm.entry2_id && mm.winner_entry_id === mm.entry2_id) setWinner(2);
      else setWinner(0);
      try {
        const sj = Array.isArray(mm.score_json) ? mm.score_json : (mm.score_json ? JSON.parse(mm.score_json as any) : []);
        if (Array.isArray(sj)) setGames(sj.map((g: any) => ({ p1: String(Number(g?.p1 || 0)), p2: String(Number(g?.p2 || 0)) })));
        else setGames([]);
      } catch {
        setGames([]);
      }

      // Load team names and members
      const ids: number[] = [mm.entry1_id || 0, mm.entry2_id || 0].filter(Boolean) as number[];
      if (ids.length > 0) {
        // Get team names from entries
        const { data: entries } = await supabase
          .from("entries")
          .select("id, team_name")
          .in("id", ids);
        const entryMap: Record<number, string> = {};
        for (const e of (entries as any[]) || []) {
          entryMap[e.id] = e.team_name || `Team #${e.id}`;
        }
        if (mm.entry1_id) setTeam1Name(entryMap[mm.entry1_id] || `Team #${mm.entry1_id}`);
        if (mm.entry2_id) setTeam2Name(entryMap[mm.entry2_id] || `Team #${mm.entry2_id}`);

        // Get team members
        const { data: mems } = await supabase
          .from("entry_members")
          .select("entry_id, profile_id, display_name, profile:profile_id(id, username, full_name)")
          .in("entry_id", ids);
        const members1: TeamMember[] = [];
        const members2: TeamMember[] = [];
        for (const r of (mems as any[]) || []) {
          const entryId = r.entry_id as number;
          const prof = r.profile as any;
          const fallback = prof?.id ? `Player ${String(prof.id).slice(0, 6)}` : "Player";
          const nameRaw = r.display_name || prof?.full_name || prof?.username || fallback;
          const member: TeamMember = {
            profile_id: r.profile_id,
            display_name: String(nameRaw).trim(),
          };
          if (entryId === mm.entry1_id) members1.push(member);
          if (entryId === mm.entry2_id) members2.push(member);
        }
        setTeam1Members(members1);
        setTeam2Members(members2);

        // Load existing player assignments for this match
        const { data: assignments } = await supabase
          .from("match_player_assignments")
          .select("entry_id, position, profile_id")
          .eq("match_id", mm.id);
        const t1Players: string[] = [];
        const t2Players: string[] = [];
        for (const a of (assignments as any[]) || []) {
          if (a.entry_id === mm.entry1_id) {
            t1Players[a.position - 1] = a.profile_id;
          } else if (a.entry_id === mm.entry2_id) {
            t2Players[a.position - 1] = a.profile_id;
          }
        }
        setTeam1Players(t1Players);
        setTeam2Players(t2Players);
      }
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mid) load();
  }, [mid]);

  function setNow() {
    const now = new Date();
    setDateStr(toDMY(now));
    setTimeStr(toHM12(now));
  }

  async function save() {
    try {
      if (!match) return;
      if (!isOrganizer && !isReferee) return;

      // Start from existing schedule; only organizers can modify date/time & court
      let scheduledAt: string | null = match.scheduled_at;
      if (isOrganizer) {
        if (dateStr && timeStr) {
          const dt = combineDateTime(dateStr, timeStr);
          if (!dt) {
            Alert.alert("Invalid date/time", "Please use dd/mm/yyyy and h:mm AM/PM");
            return;
          }
          scheduledAt = dt.toISOString();
        } else if (dateStr || timeStr) {
          Alert.alert("Both date and time required", "Set both date and time or clear both");
          return;
        }
      }

      const winnerId = winner === 1 ? match.entry1_id : winner === 2 ? match.entry2_id : null;

      const scorePayload = games.map((g) => ({ p1: Number(g.p1 || 0), p2: Number(g.p2 || 0) }));
      const totals = scorePayload.reduce(
        (acc, g) => {
          acc.p1 += Number(g.p1 || 0);
          acc.p2 += Number(g.p2 || 0);
          return acc;
        },
        { p1: 0, p2: 0 }
      );

      // If a schedule has been set for a previously pending match, auto-mark it as scheduled (organizer only)
      let effectiveStatus = status;
      if (isOrganizer && scheduledAt && status === "pending") {
        effectiveStatus = "scheduled";
      }

      const updates: any = {};

      // Status, winner and score can be changed by organizer or assigned referee
      if (isOrganizer || isReferee) {
        updates.status = effectiveStatus;
        updates.winner_entry_id = winnerId;
        updates.score_json = scorePayload;
        updates.entry1_points = totals.p1;
        updates.entry2_points = totals.p2;
      }

      // Schedule, court and referee assignment are organizer-only
      if (isOrganizer) {
        updates.court = court || null;
        updates.scheduled_at = scheduledAt;
        updates.referee_profile_id = refereeId;
      }

      const { error: uErr } = await supabase
        .from("matches")
        .update(updates)
        .eq("id", match.id);
      if (uErr) {
        const rawMsg = String((uErr as any)?.message || "");
        if (rawMsg.includes("Session 2 match cannot start before Session 1 matches")) {
          toast.show({
            type: "error",
            message: "XD / Singles (Session 2) must be scheduled at or after the MD / WD (Session 1) matches for this fixture.",
          });
          return;
        }
        if (rawMsg.includes("Scheduling conflict: this team is already in another match at the same time")) {
          toast.show({
            type: "error",
            message: "Scheduling conflict: this team is already in another match at the same time.",
          });
          return;
        }
        if (rawMsg.includes("Scheduling conflict: one or more players are already in another match at the same time")) {
          toast.show({
            type: "error",
            message: "Scheduling conflict: one or more players are already in another match at the same time.",
          });
          return;
        }
        toast.show({ type: "error", message: rawMsg || "Unable to save match" });
        return;
      }

      // propagate to next match if winner selected and linkage exists
      if (winnerId && match.next_match_id && match.next_match_slot) {
        const updates: any = match.next_match_slot === 1 ? { entry1_id: winnerId } : { entry2_id: winnerId };
        await supabase.from("matches").update(updates).eq("id", match.next_match_id);
      }

      // Save player assignments
      if (canEditScore) {
        // Delete existing assignments for this match
        await supabase.from("match_player_assignments").delete().eq("match_id", match.id);
        
        // Insert new assignments
        const assignments: Array<{ match_id: number; entry_id: number; profile_id: string; position: number }> = [];
        
        if (match.entry1_id) {
          team1Players.forEach((profileId, idx) => {
            if (profileId) {
              assignments.push({
                match_id: match.id,
                entry_id: match.entry1_id!,
                profile_id: profileId,
                position: idx + 1,
              });
            }
          });
        }
        
        if (match.entry2_id) {
          team2Players.forEach((profileId, idx) => {
            if (profileId) {
              assignments.push({
                match_id: match.id,
                entry_id: match.entry2_id!,
                profile_id: profileId,
                position: idx + 1,
              });
            }
          });
        }
        
        if (assignments.length > 0) {
          const { error: assignErr } = await supabase.from("match_player_assignments").insert(assignments);
          if (assignErr) {
            console.error("Failed to save player assignments:", assignErr);
            // Don't fail the whole save, just log the error
          }
        }
      }

      toast.show({ type: "success", message: "Match saved" });
      const roundParam = match.round_number;
      router.replace({ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(match.category_id), initialRound: String(roundParam) } } as any);
    } catch (e) {
      if (e instanceof Error) {
        toast.show({ type: "error", message: e.message || "Unable to save match" });
      }
    }
  }

  const statuses = useMemo(() => ["pending","scheduled","in_progress","completed","walkover","bye","cancelled"], []);

  const canEditScore = isOrganizer || isReferee;
  const canEditSchedule = isOrganizer;
  const canEditReferee = isOrganizer;
  const canEditStatus = isOrganizer || isReferee;
  const canSave = canEditScore || canEditSchedule || canEditReferee;

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: `Match #${mid}` }} />
      <View className="px-4 mt-6">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {loading || !match ? (
            <Text className="text-gray-600">Loading...</Text>
          ) : (
            <View>
              {/* Match Type Badge */}
              {match.sub_match_type && (
                <View className="mb-4">
                  <View className={`self-start px-3 py-1 rounded-full ${
                    match.sub_match_type === 'MD' ? 'bg-blue-100' :
                    match.sub_match_type === 'WD' ? 'bg-pink-100' :
                    match.sub_match_type === 'XD' ? 'bg-purple-100' : 'bg-gray-100'
                  }`}>
                    <Text className={`text-sm font-medium ${
                      match.sub_match_type === 'MD' ? 'text-blue-800' :
                      match.sub_match_type === 'WD' ? 'text-pink-800' :
                      match.sub_match_type === 'XD' ? 'text-purple-800' : 'text-gray-800'
                    }`}>
                      {match.sub_match_type === 'MD' ? "Men's Doubles" :
                       match.sub_match_type === 'WD' ? "Women's Doubles" :
                       match.sub_match_type === 'XD' ? "Mixed Doubles" :
                       match.sub_match_type === 'S' ? "Singles" : match.sub_match_type}
                    </Text>
                  </View>
                </View>
              )}

              {/* Teams vs Teams - Mobile Friendly */}
              <View className="mb-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 items-center">
                    <View className="w-12 h-12 rounded-full bg-blue-600 items-center justify-center mb-2">
                      <Text className="text-white font-bold text-lg">
                        {(team1Name || "T1").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900 text-center" numberOfLines={2}>
                      {team1Name}
                    </Text>
                  </View>
                  <View className="px-4">
                    <Text className="text-2xl font-bold text-gray-400">VS</Text>
                  </View>
                  <View className="flex-1 items-center">
                    <View className="w-12 h-12 rounded-full bg-indigo-600 items-center justify-center mb-2">
                      <Text className="text-white font-bold text-lg">
                        {(team2Name || "T2").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900 text-center" numberOfLines={2}>
                      {team2Name}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Player Selection for this Match */}
              <Text className="text-base font-semibold text-gray-900 mb-2">Players for this Match</Text>
              <Text className="text-xs text-gray-500 mb-3">
                {match.sub_match_type === 'S' ? 'Select 1 player from each team' : 'Select 2 players from each team for doubles'}
              </Text>
              
              <View className="flex-row mb-4">
                {/* Team 1 Players */}
                <View className="flex-1 mr-2">
                  <Text className="text-xs font-medium text-blue-700 mb-2">{shortName(team1Name)}</Text>
                  {[0, ...(match.sub_match_type !== 'S' ? [1] : [])].map((pos) => {
                    const selectedId = team1Players[pos];
                    const selectedMember = team1Members.find(m => m.profile_id === selectedId);
                    return (
                      <TouchableOpacity
                        key={pos}
                        className={`mb-2 p-3 rounded-lg border ${selectedMember ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 border-dashed'}`}
                        onPress={() => setShowPlayerPicker({ team: 1, position: pos })}
                        disabled={!canEditScore}
                      >
                        <Text className={`text-sm ${selectedMember ? 'text-blue-900 font-medium' : 'text-gray-400'}`}>
                          {selectedMember?.display_name || `Select Player ${pos + 1}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                
                {/* Team 2 Players */}
                <View className="flex-1 ml-2">
                  <Text className="text-xs font-medium text-indigo-700 mb-2">{shortName(team2Name)}</Text>
                  {[0, ...(match.sub_match_type !== 'S' ? [1] : [])].map((pos) => {
                    const selectedId = team2Players[pos];
                    const selectedMember = team2Members.find(m => m.profile_id === selectedId);
                    return (
                      <TouchableOpacity
                        key={pos}
                        className={`mb-2 p-3 rounded-lg border ${selectedMember ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 border-gray-200 border-dashed'}`}
                        onPress={() => setShowPlayerPicker({ team: 2, position: pos })}
                        disabled={!canEditScore}
                      >
                        <Text className={`text-sm ${selectedMember ? 'text-indigo-900 font-medium' : 'text-gray-400'}`}>
                          {selectedMember?.display_name || `Select Player ${pos + 1}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Status */}
              <Text className="text-base font-semibold text-gray-900 mb-2">Status</Text>
              <View className="flex-row flex-wrap mb-4">
                {statuses.map((s) => (
                  <TouchableOpacity 
                    key={s} 
                    className={`mr-2 mb-2 px-3 py-2 rounded-lg border ${status === s ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} 
                    onPress={() => setStatus(s)}
                    disabled={!canEditStatus}
                  >
                    <Text className={`text-sm ${status === s ? 'text-white' : 'text-gray-800'}`}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Score - Simplified to 1 game */}
              <Text className="text-base font-semibold text-gray-900 mb-2">Score</Text>
              <View className="flex-row items-center mb-4">
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1 text-center">{shortName(team1Name)}</Text>
                  <TextInput
                    className="border border-gray-300 rounded-lg p-4 text-2xl text-center text-gray-900 bg-white font-bold"
                    keyboardType="numeric"
                    value={games[0]?.p1 || ""}
                    editable={canEditScore}
                    onChangeText={(t) => {
                      const v = t.replace(/[^0-9]/g, "");
                      setGames((arr) => {
                        if (arr.length === 0) return [{ p1: v, p2: "" }];
                        return arr.map((it, i) => i === 0 ? { ...it, p1: v } : it);
                      });
                    }}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <Text className="mx-4 text-2xl font-bold text-gray-400">-</Text>
                <View className="flex-1">
                  <Text className="text-xs text-gray-500 mb-1 text-center">{shortName(team2Name)}</Text>
                  <TextInput
                    className="border border-gray-300 rounded-lg p-4 text-2xl text-center text-gray-900 bg-white font-bold"
                    keyboardType="numeric"
                    value={games[0]?.p2 || ""}
                    editable={canEditScore}
                    onChangeText={(t) => {
                      const v = t.replace(/[^0-9]/g, "");
                      setGames((arr) => {
                        if (arr.length === 0) return [{ p1: "", p2: v }];
                        return arr.map((it, i) => i === 0 ? { ...it, p2: v } : it);
                      });
                    }}
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              {/* Winner */}
              <Text className="text-base font-semibold text-gray-900 mb-2">Winner</Text>
              <View className="flex-row mb-4">
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-l-lg border ${winner === 1 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                  disabled={!canEditScore}
                  onPress={canEditScore ? () => setWinner(1) : undefined}
                >
                  <Text className={`text-center font-medium ${winner === 1 ? 'text-white' : 'text-gray-800'}`} numberOfLines={1}>
                    {shortName(team1Name)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`px-4 py-3 border-t border-b ${winner === 0 ? 'bg-gray-600 border-gray-600' : 'border-gray-300'}`}
                  disabled={!canEditScore}
                  onPress={canEditScore ? () => setWinner(0) : undefined}
                >
                  <Text className={`text-center ${winner === 0 ? 'text-white' : 'text-gray-500'}`}>Draw</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className={`flex-1 py-3 rounded-r-lg border ${winner === 2 ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}
                  disabled={!canEditScore}
                  onPress={canEditScore ? () => setWinner(2) : undefined}
                >
                  <Text className={`text-center font-medium ${winner === 2 ? 'text-white' : 'text-gray-800'}`} numberOfLines={1}>
                    {shortName(team2Name)}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text className="text-base font-semibold text-gray-900 mb-2">Schedule</Text>
              <View className="mb-3">
                <Text className="text-sm text-gray-700 mb-1">Time</Text>
                <View className="flex-row items-center">
                  <TouchableOpacity
                    className="flex-1 border border-gray-300 rounded-lg p-3 bg-white"
                    disabled={!canEditSchedule}
                    onPress={() => {
                      if (!canEditSchedule) return;
                      if (Platform.OS === "web") openWebTimePicker();
                      else setShowTimePicker(true);
                    }}
                  >
                    <Text className={timeStr ? "text-gray-900" : "text-gray-400"}>{timeStr || "Pick time"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="ml-2 px-3 py-3 rounded-lg bg-gray-100 active:bg-gray-200"
                    disabled={!canEditSchedule}
                    onPress={canEditSchedule ? setNow : undefined}
                  >
                    <Text className="text-gray-800">Now</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showTimePicker && Platform.OS !== "web" && (
                <DateTimePicker
                  mode="time"
                  display="default"
                  value={(() => {
                    const base = new Date();
                    const parsedTime = parseTime12(timeStr || "");
                    if (parsedTime) {
                      base.setHours(parsedTime.hours24, parsedTime.minutes, 0, 0);
                    }
                    return base;
                  })()}
                  onChange={(_, selectedDate) => {
                    setShowTimePicker(false);
                    if (!selectedDate) return;
                    setTimeStr(toHM12(selectedDate));
                  }}
                />
              )}

              <View className="mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-2">Court</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg p-3 text-base text-gray-900 bg-white"
                  value={court}
                  onChangeText={setCourt}
                  placeholder="e.g., 1"
                  placeholderTextColor="#9CA3AF"
                  editable={canEditSchedule}
                />
              </View>

              <View className="mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-2">Referee</Text>
                {refOptions.length === 0 ? (
                  <Text className="text-sm text-gray-600">
                    No referees added yet. Add referees from the Host Dashboard.
                  </Text>
                ) : (
                  <>
                    <View className="flex-row flex-wrap -m-1 mb-1">
                      <TouchableOpacity
                        className={`m-1 px-3 py-2 rounded-lg border ${!refereeId ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                        disabled={!canEditReferee}
                        onPress={canEditReferee ? () => setRefereeId(null) : undefined}
                      >
                        <Text className={!refereeId ? 'text-white' : 'text-gray-800'}>None</Text>
                      </TouchableOpacity>
                      {refOptions.map((r) => {
                        const selected = refereeId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            className={`m-1 px-3 py-2 rounded-lg border ${selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                            disabled={!canEditReferee}
                            onPress={canEditReferee ? () => setRefereeId(r.id) : undefined}
                          >
                            <Text className={selected ? 'text-white' : 'text-gray-800'} numberOfLines={1}>{r.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text className="text-xs text-gray-500">Only one referee can be assigned per match.</Text>
                  </>
                )}
              </View>

              <View className="flex-row">
                <TouchableOpacity
                  className="px-4 py-3 rounded-lg bg-blue-600 active:bg-blue-700"
                  disabled={!canSave}
                  onPress={canSave ? save : undefined}
                >
                  <Text className="text-white font-semibold">Save</Text>
                </TouchableOpacity>
                <TouchableOpacity className="ml-2 px-4 py-3 rounded-lg border border-gray-300" onPress={() => router.back()}>
                  <Text className="text-gray-800">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      {calendarOpen && Platform.OS === "web" && (
        <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-4">
            <View className="w-full max-w-md bg-white rounded-xl p-4">
              <View className="flex-row items-center justify-between mb-3">
                <TouchableOpacity
                  className="px-3 py-2"
                  onPress={() => {
                    setCalMonth((m) => {
                      const nm = m - 1;
                      if (nm < 0) {
                        setCalYear((y) => y - 1);
                        return 11;
                      }
                      return nm;
                    });
                  }}
                >
                  <Text className="text-lg">‹</Text>
                </TouchableOpacity>
                <Text className="text-lg font-semibold">
                  {new Date(calYear, calMonth, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}
                </Text>
                <TouchableOpacity
                  className="px-3 py-2"
                  onPress={() => {
                    setCalMonth((m) => {
                      const nm = m + 1;
                      if (nm > 11) {
                        setCalYear((y) => y + 1);
                        return 0;
                      }
                      return nm;
                    });
                  }}
                >
                  <Text className="text-lg">›</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row justify-between px-2 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((w) => (
                  <Text key={w} className="w-10 text-center text-xs text-gray-500">{w}</Text>
                ))}
              </View>

              {monthMatrix(calYear, calMonth).map((row, i) => (
                <View key={i} className="flex-row justify-between px-2 mb-1">
                  {row.map((d, j) => (
                    <TouchableOpacity
                      key={j}
                      disabled={!d}
                      onPress={() => d && selectCalendarDay(d)}
                      className={`w-10 h-10 items-center justify-center rounded-lg ${d ? "bg-gray-100 active:bg-gray-200" : ""}`}
                    >
                      <Text className={`text-sm ${d ? "text-gray-800" : "text-transparent"}`}>{d ?? 0}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              <TouchableOpacity className="mt-3 py-3 rounded-lg border border-gray-300" onPress={() => setCalendarOpen(false)}>
                <Text className="text-center text-gray-700">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {timeOpen && Platform.OS === "web" && (
        <Modal visible={timeOpen} transparent animationType="fade" onRequestClose={() => setTimeOpen(false)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-4">
            <View className="w-full max-w-sm bg-white rounded-xl p-4">
              <Text className="text-lg font-semibold mb-3">Pick time</Text>
              <View className="flex-row items-center justify-between mb-3">
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">Hours</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeHour((h) => (h % 12) + 1)}>
                      <Text>＋</Text>
                    </TouchableOpacity>
                    <Text className="mx-3 text-base">{String(timeHour).padStart(2, "0")}</Text>
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeHour((h) => (h - 2 + 12) % 12 + 1)}>
                      <Text>－</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">Minutes</Text>
                  <View className="flex-row items-center">
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeMinute((m) => (m + 5) % 60)}>
                      <Text>＋</Text>
                    </TouchableOpacity>
                    <Text className="mx-3 text-base">{String(timeMinute).padStart(2, "0")}</Text>
                    <TouchableOpacity className="px-2 py-1 rounded bg-gray-100" onPress={() => setTimeMinute((m) => (m - 5 + 60) % 60)}>
                      <Text>－</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="items-center">
                  <Text className="text-xs text-gray-500 mb-1">AM/PM</Text>
                  <View className="flex-row">
                    <TouchableOpacity
                      className={`px-3 py-2 rounded-l-lg border ${timeAmPm === "AM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                      onPress={() => setTimeAmPm("AM")}
                    >
                      <Text className={timeAmPm === "AM" ? "text-white" : "text-gray-700"}>AM</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className={`px-3 py-2 rounded-r-lg border ${timeAmPm === "PM" ? "bg-blue-600 border-blue-600" : "border-gray-300"}`}
                      onPress={() => setTimeAmPm("PM")}
                    >
                      <Text className={timeAmPm === "PM" ? "text-white" : "text-gray-700"}>PM</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
              <View className="flex-row justify-between">
                <TouchableOpacity
                  className="px-4 py-3 rounded-lg border border-gray-300"
                  onPress={() => {
                    const now = new Date();
                    let h = now.getHours();
                    let h12 = h % 12;
                    if (h12 === 0) h12 = 12;
                    setTimeHour(h12);
                    setTimeAmPm(h < 12 ? "AM" : "PM");
                    setTimeMinute(now.getMinutes() - (now.getMinutes() % 5));
                  }}
                >
                  <Text className="text-gray-700">Now</Text>
                </TouchableOpacity>
                <View className="flex-row">
                  <TouchableOpacity className="mr-2 px-4 py-3 rounded-lg border border-gray-300" onPress={() => setTimeOpen(false)}>
                    <Text className="text-gray-700">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="px-4 py-3 rounded-lg bg-blue-600" onPress={confirmWebTime}>
                    <Text className="text-white font-semibold">Set Time</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Player Picker Modal */}
      {showPlayerPicker && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setShowPlayerPicker(null)}>
          <View className="flex-1 bg-black/40 items-center justify-center px-4">
            <View className="w-full max-w-sm bg-white rounded-xl p-4">
              <Text className="text-lg font-semibold mb-3">
                Select Player {showPlayerPicker.position + 1} for {showPlayerPicker.team === 1 ? team1Name : team2Name}
              </Text>
              <ScrollView className="max-h-80">
                {(showPlayerPicker.team === 1 ? team1Members : team2Members).map((member) => {
                  const isSelected = showPlayerPicker.team === 1 
                    ? team1Players[showPlayerPicker.position] === member.profile_id
                    : team2Players[showPlayerPicker.position] === member.profile_id;
                  const isUsedElsewhere = showPlayerPicker.team === 1
                    ? team1Players.some((p, i) => p === member.profile_id && i !== showPlayerPicker.position)
                    : team2Players.some((p, i) => p === member.profile_id && i !== showPlayerPicker.position);
                  
                  return (
                    <TouchableOpacity
                      key={member.profile_id}
                      className={`p-3 rounded-lg mb-2 border ${
                        isSelected ? 'bg-blue-100 border-blue-400' : 
                        isUsedElsewhere ? 'bg-gray-100 border-gray-200' : 'border-gray-200'
                      }`}
                      disabled={isUsedElsewhere}
                      onPress={() => {
                        if (showPlayerPicker.team === 1) {
                          setTeam1Players((prev) => {
                            const next = [...prev];
                            next[showPlayerPicker.position] = member.profile_id;
                            return next;
                          });
                        } else {
                          setTeam2Players((prev) => {
                            const next = [...prev];
                            next[showPlayerPicker.position] = member.profile_id;
                            return next;
                          });
                        }
                        setShowPlayerPicker(null);
                      }}
                    >
                      <Text className={`text-sm ${isUsedElsewhere ? 'text-gray-400' : 'text-gray-900'}`}>
                        {member.display_name}
                        {isUsedElsewhere ? ' (already selected)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity 
                className="mt-3 py-3 rounded-lg border border-gray-300" 
                onPress={() => setShowPlayerPicker(null)}
              >
                <Text className="text-center text-gray-700">Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
