import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image, Platform, RefreshControl } from "react-native";
import { Stack, useLocalSearchParams, Link, router } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { registerThenCheckout, startCheckout } from "@/utils/checkout";
import { formatDateTimeLocal } from "@/utils/datetime";

type Cat = {
  id: number;
  name?: string | null;
  participation_type?: string | null;
  registration_fee?: number | null;
  max_teams?: number | null;
  members_per_team_min?: number | null;
  members_per_team_max?: number | null;
};

type Tour = {
  id: number;
  title?: string | null;
  venue_name?: string | null;
  start_date?: string | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  status?: string | null;
  organizer_display_name?: string | null;
  categories: Cat[];
};

export default function TournamentDetails() {
  const { session } = useSession();
  const params = useLocalSearchParams<{ id: string }>();
  const tid = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tour, setTour] = useState<Tour | null>(null);
  const [entryByCategory, setEntryByCategory] = useState<
    Record<
      number,
      {
        id: number;
        payment_status: string;
        invite_code?: string | null;
        team_name?: string | null;
        team_slogan?: string | null;
        team_logo_url?: string | null;
      }
    >
  >({});
  const [teamSizeByEntry, setTeamSizeByEntry] = useState<Record<number, number>>({});
  const [acceptedCounts, setAcceptedCounts] = useState<Record<number, number>>({});
  const [statsByCategory, setStatsByCategory] = useState<Record<number, { completed: number; total: number; currentRoundNumber: number | null; currentRoundName: string | null }>>({});
  const [participantsByCategory, setParticipantsByCategory] = useState<Record<number, string[]>>({});
  const [showAllParticipants, setShowAllParticipants] = useState<Record<number, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<"error" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [editingFor, setEditingFor] = useState<number | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamSlogan, setTeamSlogan] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState("");
  const [createdCategoryId, setCreatedCategoryId] = useState<number | null>(null);
  const [createdEntryId, setCreatedEntryId] = useState<number | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const isOpen = (() => {
    if (!tour) return false;
    // Registration is open if status is 'registration_open' AND we're within the window
    const s = tour.registration_start_date ? new Date(tour.registration_start_date) : null;
    const e = tour.registration_end_date ? new Date(tour.registration_end_date) : null;
    const now = new Date();
    const inWindow = !!(s && e && now >= s && now <= e);
    return tour.status === "registration_open" && inWindow;
  })();

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  async function load() {
    setLoading(true);
    const { data: tdata } = await supabase
      .from("tournaments")
      .select(
        `id, title, venue_name, start_date, registration_start_date, registration_end_date, status, organizer_display_name,
         categories:tournament_categories ( id, name, participation_type, registration_fee, max_teams, members_per_team_min, members_per_team_max )`
      )
      .eq("id", tid)
      .maybeSingle();

    const t = tdata as any;
    const details: Tour | null = t
      ? {
          id: t.id,
          title: t.title ?? null,
          venue_name: t.venue_name ?? null,
          start_date: t.start_date ?? null,
          registration_start_date: t.registration_start_date ?? null,
          registration_end_date: t.registration_end_date ?? null,
          status: t.status ?? null,
          organizer_display_name: t.organizer_display_name ?? null,
          categories: Array.isArray(t.categories) ? t.categories : [],
        }
      : null;
    setTour(details);

    if (session?.user) {
      const { data: entries } = await supabase
        .from("entries")
        .select(
          "id, payment_status, invite_code, team_name, team_slogan, team_logo_url, category_id, category:category_id(tournament_id)"
        )
        .eq("created_by", session.user.id);

      const map: Record<
        number,
        {
          id: number;
          payment_status: string;
          invite_code?: string | null;
          team_name?: string | null;
          team_slogan?: string | null;
          team_logo_url?: string | null;
        }
      > = {};
      const sizeMap: Record<number, number> = {};
      const rows: any[] = (entries as any[]) || [];

      for (const r of rows) {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        if (cat?.tournament_id === tid) {
          map[r.category_id] = {
            id: r.id,
            payment_status: r.payment_status,
            invite_code: r.invite_code ?? null,
            team_name: r.team_name ?? null,
            team_slogan: r.team_slogan ?? null,
            team_logo_url: r.team_logo_url ?? null,
          };

          const { count } = await supabase
            .from("entry_members")
            .select("profile_id", { count: "exact", head: true })
            .eq("entry_id", r.id);
          if (typeof count === "number") sizeMap[r.id] = count;
        }
      }

      setEntryByCategory(map);
      setTeamSizeByEntry(sizeMap);
    }

    if (details) {
      const mapCounts: Record<number, number> = {};
      const mapStats: Record<number, { completed: number; total: number; currentRoundNumber: number | null; currentRoundName: string | null }> = {};
      const mapParticipants: Record<number, string[]> = {};

      for (const c of details.categories) {
        // Accepted counts
        const { count } = await supabase
          .from("entries")
          .select("id", { count: "exact", head: true })
          .eq("category_id", c.id)
          .eq("status", "accepted");
        if (typeof count === 'number') mapCounts[c.id] = count;

        // Stats: matches + rounds
        const [{ data: ms }, { data: rds }] = await Promise.all([
          supabase.from("matches").select("id, round_number, status").eq("category_id", c.id),
          supabase.from("rounds").select("round_number, name").eq("category_id", c.id),
        ]);
        const matches = (ms as any[]) || [];
        const rounds = (rds as any[]) || [];
        const total = matches.length;
        const completed = matches.filter((m: any) => String(m.status) === "completed").length;
        let currentRoundNumber: number | null = null;
        let currentRoundName: string | null = null;
        const byRound: Record<number, { total: number; completed: number }> = {};
        for (const m of matches) {
          const rn = Number(m.round_number || 0);
          if (!byRound[rn]) byRound[rn] = { total: 0, completed: 0 };
          byRound[rn].total += 1;
          if (String(m.status) === "completed") byRound[rn].completed += 1;
        }
        const sortedRounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
        for (const rn of sortedRounds) {
          const rec = byRound[rn];
          if (rec.completed < rec.total) {
            currentRoundNumber = rn;
            const rr = rounds.find((r: any) => Number(r.round_number) === rn);
            currentRoundName = (rr?.name as string) || `Round ${rn}`;
            break;
          }
        }
        if (!currentRoundNumber && sortedRounds.length > 0) {
          // All rounds complete
          const last = sortedRounds[sortedRounds.length - 1];
          currentRoundNumber = last;
          const rr = rounds.find((r: any) => Number(r.round_number) === last);
          currentRoundName = (rr?.name as string) || `Round ${last}`;
        }
        mapStats[c.id] = { completed, total, currentRoundNumber, currentRoundName };

        // Participants (only from accepted entries in this category)
        const { data: eRows } = await supabase
          .from("entries")
          .select("id")
          .eq("category_id", c.id)
          .eq("status", "accepted");
        const eids: number[] = ((eRows as any[]) || []).map((r: any) => Number(r.id)).filter(Boolean);
        if (eids.length === 0) {
          mapParticipants[c.id] = [];
        } else {
          const { data: mems } = await supabase
            .from("entry_members")
            .select("entry_id, display_name")
            .in("entry_id", eids);
          const byEntry: Record<number, string[]> = {};
          ((mems as any[]) || []).forEach((em: any) => {
            const eid = Number(em.entry_id);
            const dn = String(em.display_name || '').trim();
            if (!byEntry[eid]) byEntry[eid] = [];
            if (dn) byEntry[eid].push(dn);
          });
          const names = Object.keys(byEntry)
            .map((k) => byEntry[Number(k)].join(" / "))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));
          mapParticipants[c.id] = names;
        }
      }
      setAcceptedCounts(mapCounts);
      setStatsByCategory(mapStats);
      setParticipantsByCategory(mapParticipants);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (tid) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, session?.user?.id]);

  async function register(categoryId: number) {
    if (!session?.user) return;
    try {
      setBusyKey(`c-${categoryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      await registerThenCheckout(session.user.id, categoryId);
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Registration failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function payEntry(entryId: number) {
    try {
      setBusyKey(`e-${entryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      await startCheckout(entryId);
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Payment failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function onCreateTeam(categoryId: number) {
    if (!session?.user) return;
    try {
      setBusyKey(`ct-${categoryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      const name = teamName.trim();
      const slogan = teamSlogan.trim();
      const logo = teamLogoUrl.trim();
      if (!name) {
        setNotice("error");
        setNoticeText("Team name is required.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("team-create", {
        body: {
          category_id: categoryId,
          team_name: name,
          team_slogan: slogan || null,
          team_logo_url: logo || null,
        },
      });
      if (error) {
        // Extract error message from edge function response
        const errMsg = (data as any)?.error || error.message || "Could not create team";
        throw new Error(errMsg);
      }
      const eid = Number((data as any)?.entry_id || 0);
      const code = String((data as any)?.invite_code || "");
      const inviteUrl = String((data as any)?.invite_url || "");
      if (eid) {
        setEntryByCategory((m) => ({
          ...m,
          [categoryId]: {
            id: eid,
            payment_status: "unpaid",
            invite_code: code || null,
            team_name: name,
            team_slogan: slogan || null,
            team_logo_url: logo || null,
          },
        }));
        setCreatedCategoryId(categoryId);
        setCreatedEntryId(eid);
        setCreatedInviteCode(code || null);
        setCreatedInviteUrl(inviteUrl || null);
        setCreatingFor(null);
        setTeamName("");
        setTeamSlogan("");
        setTeamLogoUrl("");
      }
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Could not create team");
    } finally {
      setBusyKey(null);
    }
  }

  async function onUpdateTeam(entryId: number, categoryId: number) {
    if (!session?.user) return;
    try {
      setBusyKey(`ut-${entryId}`);
      setNotice(null);
      if (!isOpen) {
        setNotice("error");
        setNoticeText("Registration is closed for this tournament.");
        return;
      }
      const name = teamName.trim();
      const slogan = teamSlogan.trim();
      const logo = teamLogoUrl.trim();
      if (!name) {
        setNotice("error");
        setNoticeText("Team name is required.");
        return;
      }
      const { error } = await supabase
        .from("entries")
        .update({
          team_name: name,
          team_slogan: slogan || null,
          team_logo_url: logo || null,
        })
        .eq("id", entryId);
      if (error) throw error;
      setEntryByCategory((m) => {
        const existing = m[categoryId];
        if (!existing) return m;
        return {
          ...m,
          [categoryId]: {
            ...existing,
            team_name: name,
            team_slogan: slogan || null,
            team_logo_url: logo || null,
          },
        };
      });
      setEditingFor(null);
      setTeamName("");
      setTeamSlogan("");
      setTeamLogoUrl("");
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Could not update team");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView 
      className="flex-1 bg-gray-50"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Stack.Screen options={{ title: tour?.title || `Tournament #${tid}` }} />

      <View className="px-4 mt-6">
        {notice && (
          <View className="mb-3 p-4 rounded-lg bg-red-50 border border-red-200">
            <Text className="text-red-800">{noticeText}</Text>
          </View>
        )}
        {loading || !tour ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator />
          </View>
        ) : (
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
            <Text className="text-base font-semibold text-gray-900">{tour.title || `Tournament #${tid}`}</Text>
            {tour.organizer_display_name ? (
              <Text className="text-sm text-gray-700 mt-1">Host: {tour.organizer_display_name}</Text>
            ) : null}
            {tour.venue_name ? (
              <Text className="text-sm text-gray-700 mt-1">{tour.venue_name}</Text>
            ) : null}
            <Text className="text-xs text-gray-600 mt-1">
              {tour.start_date ? `Starts ${formatDateTimeLocal(tour.start_date)}` : ""}
            </Text>
            <View className="mt-3">
              <View className={`self-start px-2 py-1 rounded ${isOpen ? "bg-green-100" : "bg-gray-100"}`}>
                <Text className={`text-xs ${isOpen ? "text-green-800" : "text-gray-800"}`}>
                  {isOpen ? "Registration Open" : tour.status === "registration_open" ? "Registration Window Closed" : "Registration Closed"}
                </Text>
              </View>
              <Text className="text-xs text-gray-600 mt-1">
                {tour.registration_start_date && tour.registration_end_date
                  ? `Window: ${formatDateTimeLocal(tour.registration_start_date)} → ${formatDateTimeLocal(tour.registration_end_date)}`
                  : "Registration window not set"}
              </Text>
            </View>

            <Text className="text-sm font-medium text-gray-900 mt-4">Categories</Text>
            {tour.categories.length === 0 ? (
              <Text className="text-sm text-gray-600 mt-2">No categories available.</Text>
            ) : (
              tour.categories.map((c) => {
                const meta = entryByCategory[c.id];
                const isBusy = busyKey === `c-${c.id}` || (meta && busyKey === `e-${meta.id}`);
                const stats = statsByCategory[c.id];
                const participants = participantsByCategory[c.id] || [];
                const showingAll = !!showAllParticipants[c.id];
                const preview = showingAll ? participants : participants.slice(0, 4);
                const teamSize = meta ? teamSizeByEntry[meta.id] : undefined;

                let actionNode = null;
                if (meta) {
                  if (meta.payment_status === "unpaid") {
                    let inviteUrlToShow = "";
                    const inviteCode = (meta as any).invite_code as string | null | undefined;
                    if (inviteCode) {
                      if (Platform.OS === "web" && typeof window !== "undefined") {
                        inviteUrlToShow = `${window.location.origin}/tournaments/register?invite=${inviteCode}`;
                      } else {
                        inviteUrlToShow = `/tournaments/register?invite=${inviteCode}`;
                      }
                    }

                    if (createdCategoryId === c.id && createdInviteUrl && createdInviteCode) {
                      inviteUrlToShow = createdInviteUrl;
                    }

                    actionNode = (
                      <View>
                        <TouchableOpacity
                          className={`rounded-lg py-3 ${isBusy || !isOpen ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                          onPress={() => payEntry(meta.id)}
                          disabled={isBusy || !isOpen}
                        >
                          <Text className={`text-center font-semibold ${isBusy || !isOpen ? "text-gray-500" : "text-white"}`}>
                            {isOpen ? "Pay Registration Fee" : "Registration Closed"}
                          </Text>
                        </TouchableOpacity>
                        {inviteUrlToShow ? (
                          <View className="mt-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                            <Text className="text-sm font-medium text-blue-900 mb-2">Invite teammates</Text>
                            <Text className="text-xs text-blue-700 mb-2">Share this link with your teammates:</Text>
                            <View className="bg-white rounded-lg p-2 border border-blue-200">
                              <Text className="text-xs text-blue-900 break-all" selectable numberOfLines={2}>
                                {inviteUrlToShow}
                              </Text>
                            </View>
                            {Platform.OS === "web" ? (
                              <TouchableOpacity
                                className="mt-3 rounded-lg py-2 bg-blue-600 active:bg-blue-700"
                                onPress={async () => {
                                  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                    try {
                                      await navigator.clipboard.writeText(inviteUrlToShow);
                                    } catch {
                                      // ignore copy errors
                                    }
                                  }
                                }}
                              >
                                <Text className="text-center text-sm font-semibold text-white">Copy Invite Link</Text>
                              </TouchableOpacity>
                            ) : null}
                            {(typeof teamSize === "number" || c.members_per_team_max != null) && (
                              <View className="mt-3 pt-3 border-t border-blue-200">
                                <Text className="text-sm text-blue-900">
                                  Team members: <Text className="font-semibold">{typeof teamSize === "number" ? teamSize : "—"}{c.members_per_team_max ? ` / ${c.members_per_team_max}` : ""}</Text>
                                </Text>
                              </View>
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  } else {
                    actionNode = (
                      <View className="px-3 py-2 rounded-lg bg-green-100">
                        <Text className="text-green-800">Registered</Text>
                      </View>
                    );
                  }
                } else if (isOpen) {
                  const pType = (c as any).participation_type as string | null | undefined;
                  const showRegisterOnly = pType === "singles";
                  const showTeamOnly = pType === "team";

                  if (showRegisterOnly) {
                    actionNode = (
                      <TouchableOpacity
                        className={`rounded-lg py-3 ${isBusy ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                        onPress={() => register(c.id)}
                        disabled={isBusy}
                      >
                        <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>
                          Register Now
                        </Text>
                      </TouchableOpacity>
                    );
                  } else {
                    actionNode = (
                      <View>
                        <TouchableOpacity
                          className={`rounded-lg py-3 ${isBusy ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
                          onPress={() => {
                            setCreatingFor(c.id);
                            setEditingFor(null);
                            setTeamName("");
                            setTeamSlogan("");
                            setTeamLogoUrl("");
                          }}
                          disabled={isBusy}
                        >
                          <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>
                            Create Team
                          </Text>
                        </TouchableOpacity>
                        {!showTeamOnly ? (
                          <TouchableOpacity
                            className={`mt-2 rounded-lg py-3 border ${isBusy ? "border-gray-200 bg-gray-100" : "border-blue-300 bg-blue-50 active:bg-blue-100"}`}
                            onPress={() => register(c.id)}
                            disabled={isBusy}
                          >
                            <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-blue-700"}`}>
                              Register as Individual
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        {creatingFor === c.id ? (
                          <View className="mt-3 p-3 rounded-lg bg-white border border-gray-200">
                            <Text className="text-sm font-medium text-gray-900 mb-3">Create Your Team</Text>
                            <TextInput
                              className="border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                              value={teamName}
                              onChangeText={setTeamName}
                              placeholder="Team name"
                              placeholderTextColor="#9CA3AF"
                            />
                            <TextInput
                              className="mt-2 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                              value={teamSlogan}
                              onChangeText={setTeamSlogan}
                              placeholder="Team slogan (optional)"
                              placeholderTextColor="#9CA3AF"
                            />
                            <TextInput
                              className="mt-2 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                              value={teamLogoUrl}
                              onChangeText={setTeamLogoUrl}
                              placeholder="Logo URL (optional)"
                              placeholderTextColor="#9CA3AF"
                            />
                            <View className="flex-row mt-3">
                              <TouchableOpacity
                                className={`flex-1 mr-2 rounded-lg py-3 ${busyKey === ("ct-" + c.id) ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
                                onPress={() => onCreateTeam(c.id)}
                                disabled={busyKey === ("ct-" + c.id)}
                              >
                                <Text className={"text-center font-semibold " + (busyKey === ("ct-" + c.id) ? "text-gray-500" : "text-white")}>
                                  Create Team
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                className="flex-1 rounded-lg py-3 border border-gray-300"
                                onPress={() => {
                                  setCreatingFor(null);
                                  setTeamName("");
                                  setTeamSlogan("");
                                  setTeamLogoUrl("");
                                }}
                              >
                                <Text className="text-center text-gray-800">Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    );
                  }
                } else {
                  actionNode = (
                    <Link
                      href={{
                        pathname: "/tournaments/[id]/fixtures/[categoryId]",
                        params: { id: String(tid), categoryId: String(c.id) },
                      }}
                      asChild
                    >
                      <TouchableOpacity className="rounded-lg py-3 bg-gray-100 active:bg-gray-200 border border-gray-300">
                        <Text className="text-center font-semibold text-gray-800">View Fixtures & Bracket</Text>
                      </TouchableOpacity>
                    </Link>
                  );
                }

                return (
                  <View key={c.id} className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <View className="mb-3">
                      <Text className="text-base font-semibold text-gray-900">{c.name || `Category #${c.id}`}</Text>
                      <View className="flex-row items-center mt-1">
                        <Text className="text-sm text-gray-700">MYR {Number(c.registration_fee ?? 0).toFixed(2)}</Text>
                        <Text className="text-gray-400 mx-2">•</Text>
                        <Text className="text-sm text-gray-600">
                          {acceptedCounts[c.id] !== undefined
                            ? `${acceptedCounts[c.id]}${c.max_teams ? `/${c.max_teams}` : ''} registered`
                            : "— registered"}
                        </Text>
                      </View>
                      {stats ? (
                        <Text className="text-xs text-gray-600 mt-0.5">
                          {`Matches: ${stats.completed}/${stats.total}${stats.currentRoundName ? ` • Current: ${stats.currentRoundName}` : ''}`}
                        </Text>
                      ) : null}
                      {(acceptedCounts[c.id] ?? 0) > 0 && participants.length > 0 ? (
                        <View className="mt-3">
                          <Text className="text-xs font-medium text-gray-700 mb-2">Participants ({participants.length} teams)</Text>
                          <View className="space-y-2">
                            {preview.map((teamMembers, idx) => {
                              // Split team members and display nicely
                              const members = teamMembers.split(" / ").filter(Boolean);
                              return (
                                <View key={idx} className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                                  <View className="flex-row flex-wrap">
                                    {members.map((member, mIdx) => (
                                      <View key={mIdx} className="mr-2 mb-1">
                                        <Text className="text-xs text-gray-800">
                                          {member}{mIdx < members.length - 1 ? "," : ""}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                          {participants.length > 4 ? (
                            <TouchableOpacity
                              className="mt-2 self-start"
                              onPress={() => setShowAllParticipants((m) => ({ ...m, [c.id]: !showingAll }))}
                            >
                              <Text className="text-xs text-blue-600 font-medium">
                                {showingAll ? "Show less" : `Show all ${participants.length} teams`}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                      {meta ? (
                        <View className="mt-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                          <View className="flex-row items-center">
                            {meta.team_logo_url ? (
                              <Image
                                source={{ uri: meta.team_logo_url }}
                                className="w-12 h-12 rounded-full mr-3"
                              />
                            ) : (
                              <View className="w-12 h-12 rounded-full bg-indigo-200 mr-3 items-center justify-center">
                                <Text className="text-sm font-bold text-indigo-700">
                                  {((meta.team_name || c.name || "Team").toString().trim().slice(0, 2) || "TM").toUpperCase()}
                                </Text>
                              </View>
                            )}
                            <View className="flex-1">
                              <Text className="text-sm text-indigo-600">Your Team</Text>
                              <Text className="text-base font-semibold text-indigo-900">
                                {meta.team_name || "Unnamed Team"}
                              </Text>
                              {meta.team_slogan ? (
                                <Text className="text-xs text-indigo-700 mt-0.5 italic">
                                  "{meta.team_slogan}"
                                </Text>
                              ) : null}
                            </View>
                          </View>
                          <TouchableOpacity
                            className="mt-3 rounded-lg py-2 border border-indigo-300 bg-white"
                            onPress={() => {
                              setEditingFor(c.id);
                              setCreatingFor(null);
                              setTeamName(meta.team_name || "");
                              setTeamSlogan(meta.team_slogan || "");
                              setTeamLogoUrl(meta.team_logo_url || "");
                            }}
                          >
                            <Text className="text-center text-sm font-semibold text-indigo-700">Edit Team Details</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {meta && editingFor === c.id ? (
                        <View className="mt-3 p-3 rounded-lg bg-white border border-gray-200">
                          <Text className="text-sm font-medium text-gray-900 mb-3">Edit Team Details</Text>
                          <TextInput
                            className="border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                            value={teamName}
                            onChangeText={setTeamName}
                            placeholder="Team name"
                            placeholderTextColor="#9CA3AF"
                          />
                          <TextInput
                            className="mt-2 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                            value={teamSlogan}
                            onChangeText={setTeamSlogan}
                            placeholder="Team slogan (optional)"
                            placeholderTextColor="#9CA3AF"
                          />
                          <TextInput
                            className="mt-2 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 bg-gray-50"
                            value={teamLogoUrl}
                            onChangeText={setTeamLogoUrl}
                            placeholder="Logo URL (optional)"
                            placeholderTextColor="#9CA3AF"
                          />
                          <View className="flex-row mt-3">
                            <TouchableOpacity
                              className={`flex-1 mr-2 rounded-lg py-3 ${busyKey === ("ut-" + meta.id) ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
                              onPress={() => onUpdateTeam(meta.id, c.id)}
                              disabled={busyKey === ("ut-" + meta.id)}
                            >
                              <Text className={"text-center font-semibold " + (busyKey === ("ut-" + meta.id) ? "text-gray-500" : "text-white")}>
                                Save Changes
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              className="flex-1 rounded-lg py-3 border border-gray-300"
                              onPress={() => {
                                setEditingFor(null);
                                setTeamName("");
                                setTeamSlogan("");
                                setTeamLogoUrl("");
                              }}
                            >
                              <Text className="text-center text-gray-800">Cancel</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    {/* Action buttons at bottom */}
                    <View className="mt-3">
                      {actionNode}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
