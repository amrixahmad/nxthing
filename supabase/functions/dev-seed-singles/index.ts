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
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as Body;
    const op = body.op || "create";

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

    // Determine organizer: use provided or fall back to most recent profile user
    let organizer_uuid: string | null = organizerId || null;
    if (!organizer_uuid) {
      const { data: prof, error: pErr } = await supabase.from("profiles").select("id").order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      if (pErr) throw pErr;
      organizer_uuid = (prof as any[])?.[0]?.id || null;
    }
    if (!organizer_uuid) {
      return new Response(JSON.stringify({ error: "No organizer found; pass organizer_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const seedTag = makeSeedTag();

    // Create tournament (registration closed yesterday to allow bracket gen)
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 8 * 24 * 3600 * 1000);
    const regStart = new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    const regEnd = new Date(now.getTime() - 1 * 24 * 3600 * 1000);

    const { data: tIns, error: tErr } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: organizer_uuid,
        title,
        description: `seed:${seedTag}`,
        venue_name: venue,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        registration_start_date: regStart.toISOString(),
        registration_end_date: regEnd.toISOString(),
        status: "draft",
        format: "single_elimination",
      })
      .select("id")
      .single();
    if (tErr) throw tErr;
    const tournamentId = (tIns as any).id as number;

    // Create singles category
    const { data: cIns, error: cErr } = await supabase
      .from("tournament_categories")
      .insert({
        tournament_id: tournamentId,
        name: "Men's Singles",
        participation_type: "singles",
        registration_fee: 20,
        max_teams: 128,
        members_per_team_min: 1,
        members_per_team_max: 1,
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    const categoryId = (cIns as any).id as number;

    // Create N users and entries
    let createdUsers: string[] = [];
    for (let i = 0; i < entries; i++) {
      const email = `seed-${seedTag}-${String(i + 1).padStart(2, "0")}@dev.local`;
      const password = "Password!123";
      const { data: userRes, error: cuErr } = await (supabase as any).auth.admin.createUser({ email, password, email_confirm: true });
      if (cuErr) throw cuErr;
      const userId: string = userRes.user.id;
      createdUsers.push(userId);

      // Insert entry as paid+accepted
      const { data: eIns, error: eErr } = await supabase
        .from("entries")
        .insert({
          category_id: categoryId,
          created_by: userId,
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

      // Add member
      const { error: mErr } = await supabase.from("entry_members").insert({ entry_id: entryId, profile_id: userId });
      if (mErr) throw mErr;
    }

    return new Response(JSON.stringify({ ok: true, seed_tag: seedTag, tournament_id: tournamentId, category_id: categoryId, created_users: createdUsers.length }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
