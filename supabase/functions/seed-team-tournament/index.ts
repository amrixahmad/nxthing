import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  title?: string;
  venue?: string;
  organizer_id?: string;
  teams?: number; // Default 4
  seed_tag?: string;
  op?: "create" | "cleanup" | "cleanup_orphan_seed_users";
};

function makeSeedTag() {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${ts}-${rand}`;
}

function indexToLetters(idx: number): string {
  let n = idx;
  let label = "";
  while (n >= 0) {
    const rem = n % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
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
      return new Response(
        JSON.stringify({ error: "SERVICE_ROLE key missing. Set SUPABASE_SERVICE_ROLE_KEY in env." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabase = createClient(supabaseUrl, serviceKey);

    const rawBody = (await req.json().catch(() => ({}))) as Body;
    const op = (rawBody.op || "create") as
      | "create"
      | "cleanup"
      | "cleanup_orphan_seed_users";
    const rawSeed = (rawBody.seed_tag || "").trim();
    let seedTag = rawSeed;
    if (op === "create" && !seedTag) {
      seedTag = makeSeedTag();
    }

    if (op === "cleanup") {
      if (!seedTag) {
        return new Response(
          JSON.stringify({ error: "seed_tag required for cleanup" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: tours, error: tErr } = await supabase
        .from("tournaments")
        .select("id")
        .ilike("description", `%seed:${seedTag}%`);
      if (tErr) throw tErr;

      const tourIds = ((tours as any[]) || []).map((t) => t.id as number);

      if (tourIds.length > 0) {
        const { error: delErr } = await supabase.from("tournaments").delete().in("id", tourIds);
        if (delErr) throw delErr;
      }

      const prefix = `seed-${seedTag}-`;
      const orgPrefix = `seed-org-${seedTag}`;
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
          if (email.startsWith(prefix) || email.startsWith(`${orgPrefix}@`)) {
            const { error: duErr } = await (supabase as any).auth.admin.deleteUser(u.id);
            if (!duErr) deleted++;
          }
        }
        if (users.length < perPage) break;
        page++;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          op: "cleanup",
          seed_tag: seedTag,
          deleted_tournaments: tourIds.length,
          deleted_users: deleted,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (op === "cleanup_orphan_seed_users") {
      const { data: toursWithSeed, error: tErr2 } = await supabase
        .from("tournaments")
        .select("description")
        .ilike("description", "seed:%");
      if (tErr2) throw tErr2;

      const activeTags = new Set<string>();
      for (const t of (toursWithSeed as any[]) || []) {
        const desc = ((t as any).description as string) || "";
        const m = desc.match(/seed:([^ ]+)/);
        if (m && m[1]) {
          activeTags.add(m[1]);
        }
      }

      let scanned = 0;
      let deletedOrphans = 0;
      let kept = 0;
      let page = 1;
      const perPage = 1000;
      const orphanTags = new Set<string>();
      const keptTags = new Set<string>();

      while (true) {
        const { data, error } = await (supabase as any).auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const users: any[] = data?.users || [];
        if (users.length === 0) break;

        for (const u of users) {
          const email: string = u.email || "";
          let tag: string | null = null;

          if (email.startsWith("seed-org-")) {
            const rest = email.substring("seed-org-".length);
            const atIndex = rest.indexOf("@");
            tag = atIndex >= 0 ? rest.substring(0, atIndex) : rest;
          } else if (email.startsWith("seed-")) {
            const rest = email.substring("seed-".length);
            const atIndex = rest.indexOf("@");
            const localPart = atIndex >= 0 ? rest.substring(0, atIndex) : rest;
            const idx = localPart.indexOf("-t");
            tag = idx >= 0 ? localPart.substring(0, idx) : localPart;
          }

          if (!tag) continue;

          scanned++;

          if (activeTags.has(tag)) {
            kept++;
            keptTags.add(tag);
            continue;
          }

          const { error: duErr } = await (supabase as any).auth.admin.deleteUser(u.id);
          if (!duErr) {
            deletedOrphans++;
            orphanTags.add(tag);
          }
        }

        if (users.length < perPage) break;
        page++;
      }

      return new Response(
        JSON.stringify({
          ok: true,
          op: "cleanup_orphan_seed_users",
          scanned_seed_users: scanned,
          deleted_users: deletedOrphans,
          kept_users: kept,
          active_tags: Array.from(activeTags),
          orphan_tags: Array.from(orphanTags),
          kept_tags: Array.from(keptTags),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = rawBody;
    const requestedTeams = Number(body.teams || 4);
    const numTeams = Math.max(2, Math.min(requestedTeams, 32));
    const PLAYERS_PER_TEAM = 6;

    // 1. Get/Create Organizer
    let organizer_uuid: string | null = null;
    let organizer_email: string | null = null;
    let organizer_display_name: string | null = null;

    const organizerId = (body.organizer_id || "").trim();
    if (organizerId) {
      const { data: prof, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .eq("id", organizerId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (prof && (prof as any).id) {
        organizer_uuid = (prof as any).id as string;
        const fullName = (prof as any).full_name as string | null;
        const username = (prof as any).username as string | null;
        organizer_display_name = fullName || username || null;
      }
    }

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
      if (orgErr) throw orgErr;
      organizer_uuid = createOrg.user.id;
      organizer_email = email;
      organizer_display_name = orgUser;
      await supabase.from("profiles").upsert({ id: organizer_uuid, username: orgUser, full_name: orgUser, updated_at: new Date().toISOString() });
    }

    // 2. Create Tournament
    const baseTitle = body.title || "Team Championship";
    const title = seedTag ? `${baseTitle} [${seedTag}]` : baseTitle;
    const now = new Date();
    // For dev seeding, we want registration already closed so brackets can be generated immediately.
    // Tournament dates can be in the future, but registration_end_date must be in the past.
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 9 * 24 * 3600 * 1000);
    const regStart = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
    const regEnd = new Date(now.getTime() - 1 * 24 * 3600 * 1000);

    const { data: tIns, error: tErr } = await supabase.from("tournaments").insert({
      organizer_id: organizer_uuid,
      organizer_display_name: organizer_display_name || "Organizer",
      title,
      description: `seed:${seedTag} - Team Format Test`,
      venue_name: body.venue || "Dev Court 1",
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      registration_start_date: regStart.toISOString(),
      registration_end_date: regEnd.toISOString(),
      status: "registration_open",
      format: "round_robin",
    }).select("id").single();
    if (tErr) throw tErr;
    const tournamentId = tIns.id;

    // 3. Create Category (Team)
    const { data: cIns, error: cErr } = await supabase.from("tournament_categories").insert({
      tournament_id: tournamentId,
      name: "Premier League (Team)",
      participation_type: "team",
      registration_fee: 100,
      max_teams: 8,
      members_per_team_min: 6,
      members_per_team_max: 6,
    }).select("id").single();
    if (cErr) throw cErr;
    const categoryId = cIns.id;

    // 4. Create Users & Entries
    const createdEntries = [];
    
    for (let t = 0; t < numTeams; t++) {
        const teamName = `Team ${indexToLetters(t)}`;
        const teamPrefix = `seed-${seedTag}-t${t}`;
        
        // Create Captain (Entry Creator)
        const captainUsername = `${teamPrefix}-cap`;
        const { data: capRes, error: capErr } = await (supabase as any).auth.admin.createUser({
            email: `${captainUsername}@dev.local`,
            password: "Password!123",
            email_confirm: true,
            user_metadata: { username: captainUsername, full_name: `${teamName} Captain` },
        });
        if (capErr) throw capErr;
        const captainId = capRes.user.id;
        await supabase.from("profiles").upsert({ id: captainId, username: captainUsername, full_name: `${teamName} Captain`, updated_at: new Date().toISOString() });

        // Create Entry
        const { data: eIns, error: eErr } = await supabase.from("entries").insert({
            category_id: categoryId,
            created_by: captainId,
            team_name: teamName,
            payment_status: "paid",
            payment_amount: 100,
            status: "accepted",
            paid_at: new Date().toISOString(),
        }).select("id").single();
        if (eErr) throw eErr;
        const entryId = eIns.id;
        createdEntries.push(entryId);

        // Create 5 more players (total 6)
        const teamMemberIds = [captainId];
        for (let p = 1; p < PLAYERS_PER_TEAM; p++) {
             const pUsername = `${teamPrefix}-p${p}`;
             const { data: pRes, error: pErr } = await (supabase as any).auth.admin.createUser({
                email: `${pUsername}@dev.local`,
                password: "Password!123",
                email_confirm: true,
                user_metadata: { username: pUsername, full_name: `${teamName} Player ${p}` },
            });
            if (pErr) throw pErr;
            await supabase.from("profiles").upsert({ id: pRes.user.id, username: pUsername, full_name: `${teamName} Player ${p}`, updated_at: new Date().toISOString() });
            teamMemberIds.push(pRes.user.id);
        }

        // Insert Entry Members
        const memberRows = teamMemberIds.map((pid, idx) => ({
            entry_id: entryId,
            profile_id: pid,
            display_name: idx === 0 ? `${teamName} Captain` : `${teamName} Player ${idx}`
        }));
        await supabase.from("entry_members").insert(memberRows);

        // 5. Assign Roster Slots
        // P1 = index 0, P2 = index 1, etc.
        // MD: P1, P2
        // WD: P3, P4
        // XD: P5, P6
        // S (Singles): P1 (any team member can play singles)
        const slots = [
            { code: 'MD', pid: teamMemberIds[0] },
            { code: 'MD', pid: teamMemberIds[1] },
            { code: 'WD', pid: teamMemberIds[2] },
            { code: 'WD', pid: teamMemberIds[3] },
            { code: 'XD', pid: teamMemberIds[4] },
            { code: 'XD', pid: teamMemberIds[5] },
            { code: 'S', pid: teamMemberIds[0] }, // Singles - any team member
        ];

        for (const s of slots) {
            const { error: sErr } = await supabase.from("entry_roster_slots").insert({
                entry_id: entryId,
                profile_id: s.pid,
                slot_code: s.code
            });
            if (sErr) console.error(`Error seeding slot ${s.code} for entry ${entryId}:`, sErr.message);
        }
    }

    return new Response(JSON.stringify({
        ok: true,
        tournament_id: tournamentId,
        category_id: categoryId,
        tournament_title: title,
        seed_tag: seedTag,
        organizer_email: organizer_email,
        organizer_password: organizer_email ? "Password!123" : null,
        used_existing_organizer: organizer_email === null,
        requested_teams: requestedTeams,
        actual_teams: numTeams,
        max_teams_cap: 32,
        entries_created: createdEntries.length,
        message: "Tournament seeded with teams and full rosters. Ready to generate bracket."
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
