import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, TextInput } from "react-native";
import { Stack, useLocalSearchParams, Link } from "expo-router";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";
import { registerThenCheckout, startCheckout } from "@/utils/checkout";
import { formatDateTimeLocal } from "@/src/utils/datetime";

type Cat = { id: number; name?: string | null; registration_fee?: number | null; max_teams?: number | null };

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
  const [tour, setTour] = useState<Tour | null>(null);
  const [entryByCategory, setEntryByCategory] = useState<Record<number, { id: number; payment_status: string }>>({});
  const [acceptedCounts, setAcceptedCounts] = useState<Record<number, number>>({});
  const [statsByCategory, setStatsByCategory] = useState<Record<number, { completed: number; total: number; currentRoundNumber: number | null; currentRoundName: string | null }>>({});
  const [participantsByCategory, setParticipantsByCategory] = useState<Record<number, string[]>>({});
  const [showAllParticipants, setShowAllParticipants] = useState<Record<number, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<"error" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [teamName, setTeamName] = useState("");
  const [createdCategoryId, setCreatedCategoryId] = useState<number | null>(null);
  const [createdEntryId, setCreatedEntryId] = useState<number | null>(null);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const isOpen = (() => {
    if (!tour) return false;
    if (tour.status !== "registration_open") return false;
    if (!tour.registration_start_date || !tour.registration_end_date) return false;
    const now = new Date();
    const s = new Date(tour.registration_start_date);
    const e = new Date(tour.registration_end_date);
    return now >= s && now <= e;
  })();

  async function load() {
    setLoading(true);
    const { data: tdata } = await supabase
      .from("tournaments")
      .select(
        `id, title, venue_name, start_date, registration_start_date, registration_end_date, status, organizer_display_name,
         categories:tournament_categories ( id, name, registration_fee, max_teams )`
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
        .select("id, payment_status, category_id, category:category_id(tournament_id)")
        .eq("created_by", session.user.id);
      const map: Record<number, { id: number; payment_status: string }> = {};
      (entries as any[])?.forEach((r: any) => {
        const cat = Array.isArray(r.category) ? r.category[0] : r.category;
        if (cat?.tournament_id === tid) {
          map[r.category_id] = { id: r.id, payment_status: r.payment_status };
        }
      });
      setEntryByCategory(map);
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
      if (!name) {
        setNotice("error");
        setNoticeText("Team name is required.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("team-create", {
        body: { category_id: categoryId, team_name: name },
      });
      if (error) throw error;
      const eid = Number((data as any)?.entry_id || 0);
      const code = String((data as any)?.invite_code || "");
      if (eid) {
        setEntryByCategory((m) => ({ ...m, [categoryId]: { id: eid, payment_status: "unpaid" } }));
        setCreatedCategoryId(categoryId);
        setCreatedEntryId(eid);
        setCreatedInviteCode(code || null);
        setCreatingFor(null);
        setTeamName("");
      }
    } catch (e: any) {
      setNotice("error");
      setNoticeText(e?.message || "Could not create team");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
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
                return (
                  <View key={c.id} className="flex-row items-center justify-between mt-3">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm text-gray-800">{c.name || `Category #${c.id}`}</Text>
                      <Text className="text-xs text-gray-600">USD {Number(c.registration_fee ?? 0).toFixed(2)}</Text>
                      <Text className="text-xs text-gray-600 mt-0.5">
                        {acceptedCounts[c.id] !== undefined ? `Accepted: ${acceptedCounts[c.id]}${c.max_teams ? ` / ${c.max_teams}` : ''}` : 'Accepted: —'}
                      </Text>
                      {stats ? (
                        <Text className="text-xs text-gray-600 mt-0.5">
                          {`Matches: ${stats.completed}/${stats.total}${stats.currentRoundName ? ` • Current: ${stats.currentRoundName}` : ''}`}
                        </Text>
                      ) : null}
                      {(acceptedCounts[c.id] ?? 0) > 0 && participants.length > 0 ? (
                        <View className="mt-2">
                          <Text className="text-xs text-gray-700 mb-1">Participants</Text>
                          <View className="flex-row flex-wrap -m-1">
                            {preview.map((name, idx) => (
                              <View key={idx} className="m-1 px-2 py-1 rounded bg-gray-100">
                                <Text className="text-xs text-gray-800">{name}</Text>
                              </View>
                            ))}
                          </View>
                          {participants.length > 4 ? (
                            <TouchableOpacity className="mt-2 self-start" onPress={() => setShowAllParticipants((m) => ({ ...m, [c.id]: !showingAll }))}>
                              <Text className="text-xs text-blue-600">{showingAll ? 'Hide players' : 'See all players'}</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    {meta ? (
                      meta.payment_status === "unpaid" ? (
                        <View>
                          <TouchableOpacity
                            className={`rounded-lg py-2 px-4 ${isBusy || !isOpen ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                            onPress={() => payEntry(meta.id)}
                            disabled={isBusy || !isOpen}
                          >
                            <Text className={`text-center font-semibold ${isBusy || !isOpen ? "text-gray-500" : "text-white"}`}>{isOpen ? "Pay" : "Closed"}</Text>
                          </TouchableOpacity>
                          {createdCategoryId === c.id && createdInviteCode ? (
                            <View className="mt-2 p-2 rounded bg-blue-50 border border-blue-200">
                              <Text className="text-xs text-blue-800">Invite Link:</Text>
                              <Text className="text-xs text-blue-900">{`/tournaments/register?invite=${createdInviteCode}`}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View className="px-3 py-2 rounded-lg bg-green-100">
                          <Text className="text-green-800">Registered</Text>
                        </View>
                      )
                    ) : (
                      isOpen ? (
                        <View>
                          <View className="flex-row">
                            <TouchableOpacity
                              className={`mr-2 rounded-lg py-2 px-4 ${isBusy ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                              onPress={() => register(c.id)}
                              disabled={isBusy}
                            >
                              <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>Register</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              className={`rounded-lg py-2 px-4 ${isBusy ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
                              onPress={() => setCreatingFor(c.id)}
                              disabled={isBusy}
                            >
                              <Text className={`text-center font-semibold ${isBusy ? "text-gray-500" : "text-white"}`}>Create Team</Text>
                            </TouchableOpacity>
                          </View>
                          {creatingFor === c.id ? (
                            <View className="mt-2">
                              <TextInput
                                className="border border-gray-300 rounded-lg p-2 text-sm text-gray-900 bg-white"
                                value={teamName}
                                onChangeText={setTeamName}
                                placeholder="Team name"
                                placeholderTextColor="#9CA3AF"
                              />
                              <View className="flex-row mt-2">
                                <TouchableOpacity
                                  className={`mr-2 rounded-lg py-2 px-4 ${busyKey === ("ct-" + c.id) ? "bg-gray-300" : "bg-indigo-600 active:bg-indigo-700"}`}
                                  onPress={() => onCreateTeam(c.id)}
                                  disabled={busyKey === ("ct-" + c.id)}
                                >
                                  <Text className={"text-center font-semibold " + (busyKey === ("ct-" + c.id) ? "text-gray-500" : "text-white")}>Create</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  className="rounded-lg py-2 px-4 border border-gray-300"
                                  onPress={() => {
                                    setCreatingFor(null);
                                    setTeamName("");
                                  }}
                                >
                                  <Text className="text-center text-gray-800">Cancel</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <Link href={{ pathname: "/tournaments/[id]/fixtures/[categoryId]", params: { id: String(tid), categoryId: String(c.id) } }} asChild>
                          <TouchableOpacity className="rounded-lg py-2 px-4 border border-gray-300">
                            <Text className="text-center text-gray-800">View Fixtures</Text>
                          </TouchableOpacity>
                        </Link>
                      )
                    )
                  }
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  );
}
