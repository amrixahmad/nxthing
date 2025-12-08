import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform, Image } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "@/context/SessionProvider";
import { supabase } from "@/lib/supabase";

type TeamMember = {
  profile_id: string;
  payment_status: string | null;
  profile?: {
    full_name?: string | null;
    username?: string | null;
  } | null;
};

type TournamentInfo = {
  id: number;
  title: string | null;
  venue_name?: string | null;
  start_date?: string | null;
};

type CategoryInfo = {
  id: number;
  name: string | null;
  registration_fee?: number | null;
  members_per_team_min?: number | null;
  members_per_team_max?: number | null;
};

export default function RegisterAndPay() {
  const { session } = useSession();
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const params = useLocalSearchParams<{ payment?: string; entry_id?: string; session_id?: string; invite?: string }>();
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState<"success" | "warning" | "error" | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinedEntryId, setJoinedEntryId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [teamSlogan, setTeamSlogan] = useState<string | null>(null);
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [category, setCategory] = useState<CategoryInfo | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  async function ensureEntry(userId: string, catId: number) {
    const { data: existing, error: selErr } = await supabase
      .from("entries")
      .select("id, payment_status")
      .eq("category_id", catId)
      .eq("created_by", userId)
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (existing) return existing.id as number;

    const { data: ins, error: insErr } = await supabase
      .from("entries")
      .insert({ category_id: catId, created_by: userId, payment_currency: "myr", status: "pending" })
      .select("id")
      .single();
    if (insErr) throw insErr;

    const entryId = ins.id as number;
    const { error: memErr } = await supabase
      .from("entry_members")
      .insert({ entry_id: entryId, profile_id: userId });
    if (memErr) throw memErr;

    return entryId;
  }

  // Handle invite: join team and cache entry id + team name for messaging
  useEffect(() => {
    async function joinIfInvited() {
      const invite = (params.invite as string | undefined)?.trim();
      if (!invite || !session?.user) return;
      try {
        setJoining(true);
        const { data, error } = await supabase.functions.invoke("team-join", {
          body: { invite_code: invite },
        });
        if (error) throw error;
        const entryId = Number((data as any)?.entry_id || 0);
        if (entryId) {
          setJoinedEntryId(entryId);
          // Load team profile, tournament, category, and members for display
          const { data: e } = await supabase
            .from("entries")
            .select(`
              team_name, team_slogan, team_logo_url, invite_code,
              category:category_id (
                id, name, registration_fee, members_per_team_min, members_per_team_max,
                tournament:tournament_id (
                  id, title, venue_name, start_date
                )
              )
            `)
            .eq("id", entryId)
            .maybeSingle();
          if (e) {
            if (e.team_name != null) setTeamName(String(e.team_name));
            if (e.team_slogan != null) setTeamSlogan(String(e.team_slogan));
            if (e.team_logo_url != null) setTeamLogoUrl(String(e.team_logo_url));
            
            // Extract category and tournament
            let cat = (e as any).category;
            if (Array.isArray(cat)) cat = cat[0];
            if (cat) {
              setCategory({
                id: cat.id,
                name: cat.name,
                registration_fee: cat.registration_fee,
                members_per_team_min: cat.members_per_team_min,
                members_per_team_max: cat.members_per_team_max,
              });
              let tour = cat.tournament;
              if (Array.isArray(tour)) tour = tour[0];
              if (tour) {
                setTournament({
                  id: tour.id,
                  title: tour.title,
                  venue_name: tour.venue_name,
                  start_date: tour.start_date,
                });
              }
            }
          }
          
          // Load team members
          const { data: members } = await supabase
            .from("entry_members")
            .select("profile_id, payment_status, profile:profile_id (full_name, username)")
            .eq("entry_id", entryId);
          if (members) {
            setTeamMembers(members.map((m: any) => ({
              profile_id: m.profile_id,
              payment_status: m.payment_status,
              profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
            })));
          }
        }
      } catch (err: any) {
        setNotice("error");
        setNoticeText(err?.message || "Could not join team");
        if (Platform.OS !== "web") Alert.alert("Invite Error", err?.message || "Could not join team");
      } finally {
        setJoining(false);
      }
    }
    joinIfInvited();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.invite, session?.user?.id]);

  useEffect(() => {
    async function run() {
      const pay = params.payment as string | undefined;
      const eid = Number(params.entry_id ?? 0);
      if (pay === "success" && eid) {
        setProcessing(true);
        setNotice(null);
        for (let i = 0; i < 20; i++) {
          const [{ data: entry }, { data: member }] = await Promise.all([
            supabase.from("entries").select("payment_status,status").eq("id", eid).maybeSingle(),
            session?.user
              ? supabase
                  .from("entry_members")
                  .select("payment_status")
                  .eq("entry_id", eid)
                  .eq("profile_id", session.user.id)
                  .maybeSingle()
              : Promise.resolve({ data: null } as any),
          ]);
          if (entry?.payment_status === "paid") {
            setNotice("success");
            setNoticeText("Payment confirmed. Entry accepted.");
            setProcessing(false);
            return;
          }
          if (member?.payment_status === "paid") {
            setNotice("success");
            setNoticeText("Your payment was received. Waiting for teammates to complete payment.");
            setProcessing(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 750));
        }
        setProcessing(false);
        setNotice("warning");
        setNoticeText("Payment processing delayed. Please refresh in a moment.");
      } else if (pay === "cancel") {
        setNotice("warning");
        setNoticeText("Payment canceled. You can try again anytime.");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.payment, params.entry_id]);

  async function onRegisterAndPay() {
    try {
      if (!session?.user) {
        Alert.alert("Sign in required");
        return;
      }
      const catId = Number(categoryId.trim());
      if (!catId || isNaN(catId)) {
        Alert.alert("Invalid Category ID");
        return;
      }
      setSubmitting(true);

      const entryId = await ensureEntry(session.user.id, catId);

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: entryId },
      });
      if (error) throw error;
      const url = (data as any)?.url as string | undefined;
      if (!url) throw new Error("No checkout URL returned");

      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e) {
      if (e instanceof Error) Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onJoinAndPay() {
    try {
      setNotice(null);
      if (!session?.user) {
        setNotice("error");
        setNoticeText("Please sign in to continue.");
        return;
      }
      if (!joinedEntryId) {
        setNotice("error");
        setNoticeText("Invite not validated yet. Please wait or refresh the page.");
        return;
      }
      setSubmitting(true);
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: { entry_id: joinedEntryId },
      });
      if (error) {
        // Try to extract error message from response
        const errMsg = (data as any)?.error || error.message || "Payment initialization failed";
        throw new Error(errMsg);
      }
      const url = (data as any)?.url as string | undefined;
      if (!url) {
        const errMsg = (data as any)?.error || "No checkout URL returned";
        throw new Error(errMsg);
      }
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e: any) {
      const msg = e?.message || "An error occurred";
      setNotice("error");
      setNoticeText(msg);
      if (Platform.OS !== "web") Alert.alert("Error", msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Register & Pay" }} />

      <View className="px-4 mt-6">
        {notice === "success" && (
          <View className="mb-4 p-4 rounded-lg bg-green-50 border border-green-200">
            <Text className="text-green-800 mb-2">{noticeText}</Text>
            <TouchableOpacity
              className="rounded-lg py-3 px-4 bg-green-600 active:bg-green-700"
              onPress={() => router.push("/tournaments/my" as any)}
            >
              <Text className="text-white text-center font-semibold">View My Entries</Text>
            </TouchableOpacity>
          </View>
        )}
        {notice === "warning" && (
          <View className="mb-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
            <Text className="text-yellow-800">{noticeText}</Text>
          </View>
        )}
        {notice === "error" && (
          <View className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
            <Text className="text-red-800">{noticeText}</Text>
          </View>
        )}
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          {params.invite ? (
            <>
              <Text className="text-lg font-semibold text-gray-900 mb-2">Join Team & Pay</Text>
              <Text className="text-sm text-gray-700 mb-4">
                {joining ? "Validating invite..." : teamName ? `You are registering to join ${teamName}.` : "Invite recognized. You can proceed to payment."}
              </Text>

              {/* Tournament & Category Info */}
              {tournament && (
                <View className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <Text className="text-sm font-semibold text-gray-900">{tournament.title}</Text>
                  {tournament.venue_name && (
                    <Text className="text-xs text-gray-600 mt-1">{tournament.venue_name}</Text>
                  )}
                  {tournament.start_date && (
                    <Text className="text-xs text-gray-500 mt-1">
                      Starts: {new Date(tournament.start_date).toLocaleDateString()}
                    </Text>
                  )}
                  {category && (
                    <View className="mt-2 pt-2 border-t border-gray-200">
                      <Text className="text-xs font-medium text-gray-700">Category: {category.name}</Text>
                      {category.registration_fee != null && category.registration_fee > 0 && (
                        <Text className="text-xs text-gray-600">Fee: RM {category.registration_fee}</Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Team Card */}
              {(teamName || teamSlogan || teamLogoUrl) && (
                <View className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 flex-row items-center">
                  {teamLogoUrl ? (
                    <Image
                      source={{ uri: teamLogoUrl }}
                      className="w-10 h-10 rounded-full mr-3"
                    />
                  ) : (
                    <View className="w-10 h-10 rounded-full bg-indigo-100 mr-3 items-center justify-center">
                      <Text className="text-xs font-semibold text-indigo-700">
                        {((teamName || "Team").toString().trim().slice(0, 2) || "TM").toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-indigo-900">
                      {teamName || "Invited team"}
                    </Text>
                    {teamSlogan ? (
                      <Text className="text-xs text-indigo-800 mt-0.5">
                        {teamSlogan}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Team Members */}
              {!joining && (
                <View className="mb-4">
                  <Text className="text-sm font-medium text-gray-700 mb-2">Team Members</Text>
                  {teamMembers.length === 0 ? (
                    <Text className="text-xs text-gray-500 italic">No members yet. You might be the first to join!</Text>
                  ) : teamMembers.length === 1 && teamMembers[0].profile_id === session?.user?.id ? (
                    <Text className="text-xs text-gray-500 italic">You're the first member! Share the invite link with your teammates.</Text>
                  ) : (
                    <View className="space-y-2">
                      {teamMembers.map((m) => (
                        <View key={m.profile_id} className="flex-row items-center justify-between py-1">
                          <Text className="text-sm text-gray-800">
                            {m.profile?.full_name || m.profile?.username || m.profile_id.slice(0, 8)}
                            {m.profile_id === session?.user?.id ? " (You)" : ""}
                          </Text>
                          <View className={`px-2 py-0.5 rounded ${m.payment_status === "paid" ? "bg-green-100" : "bg-yellow-100"}`}>
                            <Text className={`text-xs ${m.payment_status === "paid" ? "text-green-700" : "text-yellow-700"}`}>
                              {m.payment_status === "paid" ? "Paid" : "Unpaid"}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              <TouchableOpacity
                className={`rounded-lg py-4 px-6 ${submitting || joining ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={onJoinAndPay}
                disabled={submitting || joining}
              >
                <Text className={`text-center font-semibold ${submitting || joining ? "text-gray-500" : "text-white"}`}>
                  {submitting || processing ? "Processing..." : "Join Team & Pay"}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-lg font-semibold text-gray-900 mb-6">Register for a Category</Text>
              <View className="mb-4">
                <Text className="text-base font-medium text-gray-700 mb-2">Category ID</Text>
                <TextInput
                  className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                  keyboardType="numeric"
                  value={categoryId}
                  onChangeText={setCategoryId}
                  placeholder="Enter category id (from Studio)"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <TouchableOpacity
                className={`rounded-lg py-4 px-6 ${submitting ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
                onPress={onRegisterAndPay}
                disabled={submitting}
              >
                <Text className={`text-center font-semibold ${submitting ? "text-gray-500" : "text-white"}`}>
                  {submitting || processing ? "Processing..." : "Register & Pay"}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
