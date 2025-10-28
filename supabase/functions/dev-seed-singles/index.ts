import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  op?: "create" | "cleanup";
  entries?: number; // number of singles entries
  title?: string;
  venue?: string;
  organizer_id?: string; // optional organizer for tournament
  seed_tag?: string; // for cleanup
  participation_type?: "singles" | "doubles" | "team";
  members_per_team?: number;
  category_name?: string;
  max_teams?: number; // optional capacity override
  reg_window?: "open" | "closed"; // control registration badge via dates
};

function makeSeedTag() {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${ts}-${rand}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if ((Deno.env.get("ALLOW_DEV_SEED") || "").toLowerCase() !== "true") {
      return new Response(JSON.stringify({ error: "Seeding disabled" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("EXPO_PUBLIC_SUPABASE_URL") || "http://127.0.0.1:54321";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    if (!serviceKey) {
      return new Response(JSON.stringify({ error: "SERVICE_ROLE key missing. Set SUPABASE_SERVICE_ROLE_KEY in env." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as Body;
    const op = body.op || "create";
    const seedTag = makeSeedTag();

    if (op === "cleanup") {
      const seedTag = (body.seed_tag || "").trim();
      if (!seedTag) {
        return new Response(JSON.stringify({ error: "seed_tag required for cleanup" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Find tournaments tagged by seedTag in description
      const { data: tours, error: tErr } = await supabase
        .from("tournaments")
        .select("id")
        .ilike("description", `%seed:${seedTag}%`);
      if (tErr) throw tErr;

      const tourIds = (tours as any[] || []).map((t) => t.id as number);

      // Delete tournaments (CASCADE will remove categories, entries, matches, etc.)
      if (tourIds.length > 0) {
        const { error: delErr } = await supabase.from("tournaments").delete().in("id", tourIds);
        if (delErr) throw delErr;
      }

      // Delete users created for this seed (email pattern)
      // We cannot list auth.users with supabase-js; need Admin API
      // supabase.auth.admin.listUsers can list paginated. We'll filter by email prefix.
      const prefix = `seed-${seedTag}-`;
      let deleted = 0;
      let page = 1;
      const perPage = 1000;
      while (true) {
        const { data, error } = await (supabase as any).auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users: any[] = data?.users || [];
        if (users.length === 0) break;
        for (const u of users) {
          const email: string = u.email || "";
          if (email.startsWith(prefix)) {
            const { error: duErr } = await (supabase as any).auth.admin.deleteUser(u.id);
            if (!duErr) deleted++;
          }
        }
        if (users.length < perPage) break;
        page++;
      }

      return new Response(JSON.stringify({ ok: true, deleted_users: deleted, deleted_tournaments: tourIds.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // CREATE path
    const entries = Math.min(Math.max(Number(body.entries || 16), 2), 128);
    const title = body.title || "Uni Reunion Tourney";
    const venue = body.venue || "UM Pickelball court";
    const organizerId = (body.organizer_id || "").trim();
    let organizer_uuid: string | null = null;
    let organizer_email: string | null = null;
    let organizer_username: string | null = null;
    if (organizerId) {
      const { data: chk } = await supabase.from("profiles").select("id").eq("id", organizerId).maybeSingle();
      if ((chk as any)?.id) {
        organizer_uuid = organizerId;
      }
    }
    if (!organizer_uuid) {
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (pErr) throw pErr;
      organizer_uuid = (prof as any[])?.[0]?.id || null;
    }
    // Auto-create an organizer in dev if still not found
    if (!organizer_uuid) {
      const orgUser = `seed-org-${seedTag}`;
      const email = `${orgUser}@dev.local`;
      const password = "Password!123";
      const { data: createOrg, error: orgErr } = await (supabase as any).auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: orgUser, full_name: orgUser },
      });
      if (orgErr) {
        return new Response(JSON.stringify({ error: "Failed to create organizer user", details: orgErr?.message || orgErr }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      organizer_uuid = createOrg.user.id as string;
      organizer_email = email;
      organizer_username = orgUser;
      const { error: upOrg } = await supabase.from("profiles").upsert({ id: organizer_uuid, username: orgUser, full_name: orgUser, updated_at: new Date().toISOString() });
      if (upOrg) {
        // non-fatal
        console.warn("organizer profile upsert warning", upOrg.message);
      }
    }

    // Create tournament with configurable registration window
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
    const win = (String((body as any)?.reg_window || "closed").toLowerCase() as "open" | "closed");
    const regStart = win === "open" ? new Date(now.getTime() - 1 * 24 * 3600 * 1000) : new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const regEnd = win === "open" ? new Date(now.getTime() + 7 * 24 * 3600 * 1000) : new Date(now.getTime() - 1 * 24 * 3600 * 1000);

    // Organizer display name
    let organizerDisplay = (organizer_uuid || '').slice(0, 8);
    const { data: orgProf } = await supabase
      .from("profiles")
      .select("full_name, username")
      .eq("id", organizer_uuid)
      .maybeSingle();
    organizerDisplay = (orgProf as any)?.full_name || (orgProf as any)?.username || organizerDisplay;

    const { data: tIns, error: tErr } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: organizer_uuid,
        organizer_display_name: organizerDisplay,
        title,
        description: `seed:${seedTag}`,
        venue_name: venue,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        registration_start_date: regStart.toISOString(),
        registration_end_date: regEnd.toISOString(),
        status: "registration_open",
        format: "single_elimination",
      })
      .select("id")
      .single();
    if (tErr) throw tErr;
    const tournamentId = (tIns as any).id as number;

    // Create category
    const ptype = (body.participation_type as any) === "doubles" ? "doubles" : (body.participation_type as any) === "team" ? "team" : "singles";
    const teamSizeRaw = Number(body.members_per_team ?? (ptype === "doubles" ? 2 : 1));
    const teamSize = Math.max(1, Math.min(teamSizeRaw || 1, 10));
    const catName = (body.category_name || (ptype === "doubles" ? "Men's Doubles" : ptype === "team" ? "Team" : "Men's Singles"));
    // Derive max_teams: prefer explicit body.max_teams, else next power of two >= entries
    const requestedMax = Number((body as any)?.max_teams);
    const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));
    let maxTeams = Number.isFinite(requestedMax) && requestedMax > 0 ? Math.floor(requestedMax) : nextPow2(entries);
    if (!Number.isFinite(maxTeams) || maxTeams < entries) maxTeams = nextPow2(entries);
    maxTeams = Math.min(Math.max(2, maxTeams), 512);

    const { data: cIns, error: cErr } = await supabase
      .from("tournament_categories")
      .insert({
        tournament_id: tournamentId,
        name: catName,
        participation_type: ptype,
        registration_fee: 20,
        max_teams: maxTeams,
        members_per_team_min: teamSize,
        members_per_team_max: teamSize,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    const categoryId = (cIns as any).id as number;

    // Create users
    const totalUsers = entries * teamSize;
    let createdUsers: string[] = [];
    let createdUsernames: string[] = [];
    for (let i = 0; i < totalUsers; i++) {
      const username = `seed-${seedTag}-${String(i + 1).padStart(2, "0")}`;
      const email = `${username}@dev.local`;
      const password = "Password!123";
      const { data: userRes, error: cuErr } = await (supabase as any).auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: username },
      });
      if (cuErr) {
        console.error("createUser error", { email, message: (cuErr as any)?.message, status: (cuErr as any)?.status, name: (cuErr as any)?.name });
        return new Response(
          JSON.stringify({ error: "Database error creating new user", email, details: { message: (cuErr as any)?.message, status: (cuErr as any)?.status, name: (cuErr as any)?.name } }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const userId: string = userRes.user.id;
      createdUsers.push(userId);
      createdUsernames.push(username);

      const { error: upErr } = await supabase
        .from("profiles")
        .upsert({ id: userId, username, full_name: username, updated_at: new Date().toISOString() });
      if (upErr) {
        console.warn("profiles upsert warning", upErr.message);
      }
    }

    // Create entries and members
    for (let e = 0; e < entries; e++) {
      const base = e * teamSize;
      const createdBy = createdUsers[base];
      const { data: eIns, error: eErr } = await supabase
        .from("entries")
        .insert({
          category_id: categoryId,
          created_by: createdBy,
          payment_currency: "usd",
          payment_amount: 20.0,
          payment_status: "paid",
          payment_reference: `seed:${seedTag}`,
          paid_at: new Date().toISOString(),
          status: "accepted",
        })
        .select("id")
        .single();
      if (eErr) throw eErr;
      const entryId = (eIns as any).id as number;

      for (let j = 0; j < teamSize; j++) {
        const uid = createdUsers[base + j];
        const uname = createdUsernames[base + j];
        const { error: mErr } = await supabase.from("entry_members").insert({ entry_id: entryId, profile_id: uid, display_name: uname });
        if (mErr) throw mErr;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        seed_tag: seedTag,
        tournament_id: tournamentId,
        category_id: categoryId,
        created_users: createdUsers.length,
        organizer_id: organizer_uuid,
        organizer_email: organizer_email || null,
        organizer_username: organizer_username || null,
        organizer_password: organizer_email ? "Password!123" : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
