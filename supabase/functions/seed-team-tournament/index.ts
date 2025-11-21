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
    const seedTag = body.seed_tag || makeSeedTag();
    const numTeams = Math.max(2, Math.min(Number(body.teams || 4), 8));
    const PLAYERS_PER_TEAM = 6;

    // 1. Get/Create Organizer
    let organizer_uuid: string | null = body.organizer_id || null;
    let organizer_email: string | null = null;
    let organizer_username: string | null = null;

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
      organizer_username = orgUser;
      await supabase.from("profiles").upsert({ id: organizer_uuid, username: orgUser, full_name: orgUser, updated_at: new Date().toISOString() });
    }

    // 2. Create Tournament
    const title = body.title || `Team Championship ${seedTag}`;
    const now = new Date();
    // For dev seeding, we want registration already closed so brackets can be generated immediately.
    // Tournament dates can be in the future, but registration_end_date must be in the past.
    const start = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const end = new Date(now.getTime() + 9 * 24 * 3600 * 1000);
    const regStart = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
    const regEnd = new Date(now.getTime() - 1 * 24 * 3600 * 1000);

    const { data: tIns, error: tErr } = await supabase.from("tournaments").insert({
      organizer_id: organizer_uuid,
      organizer_display_name: organizer_username || "Organizer",
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
        const teamName = `Team ${String.fromCharCode(65 + t)}`; // Team A, B, C...
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
        // RD: P1, P3 (One from MD, One from WD)
        const slots = [
            { code: 'MD', pid: teamMemberIds[0] },
            { code: 'MD', pid: teamMemberIds[1] },
            { code: 'WD', pid: teamMemberIds[2] },
            { code: 'WD', pid: teamMemberIds[3] },
            { code: 'XD', pid: teamMemberIds[4] },
            { code: 'XD', pid: teamMemberIds[5] },
            { code: 'RD', pid: teamMemberIds[0] }, // from MD
            { code: 'RD', pid: teamMemberIds[2] }, // from WD
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
        seed_tag: seedTag,
        organizer_email: organizer_email,
        organizer_password: "Password!123",
        entries_created: createdEntries.length,
        message: "Tournament seeded with teams and full rosters. Ready to generate bracket."
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
