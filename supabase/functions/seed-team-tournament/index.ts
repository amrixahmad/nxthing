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
  generate_bracket?: boolean; // Auto-generate bracket after seeding
  simulate_scores?: boolean; // Generate random scores for matches
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

// Seeded shuffle for deterministic randomization
function seededShuffleIds(arr: number[], seed: number): number[] {
  function mulberry32(a: number) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
    const numTeams = Math.max(2, Math.min(requestedTeams, 64)); // Increased max to 64 for larger tournaments
    const PLAYERS_PER_TEAM = 6;
    const generateBracket = body.generate_bracket !== false; // Default true
    const simulateScores = body.simulate_scores === true; // Default false

    // 1. Get/Create Organizer
    let organizer_uuid: string | null = null;
    let organizer_email: string | null = null;
    let organizer_display_name: string | null = null;

    const organizerId = (body.organizer_id || "").trim();
    if (organizerId) {
      // First check if this is a valid UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(organizerId)) {
        const { data: prof, error: pErr } = await supabase
          .from("profiles")
          .select("id, full_name, username")
          .eq("id", organizerId)
          .maybeSingle();
        if (pErr) {
          console.error("Error fetching organizer profile:", pErr.message);
        }
        if (prof && (prof as any).id) {
          organizer_uuid = (prof as any).id as string;
          const fullName = (prof as any).full_name as string | null;
          const username = (prof as any).username as string | null;
          organizer_display_name = fullName || username || null;
          console.log(`Using existing organizer: ${organizer_uuid}`);
        } else {
          console.log(`Organizer profile not found for ID: ${organizerId}`);
        }
      } else {
        console.log(`Invalid organizer_id format: ${organizerId}`);
      }
    }

    if (!organizer_uuid) {
      console.log("Creating new organizer user...");
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

    // 6. Auto-generate bracket if requested
    let bracketGenerated = false;
    let matchesCreated = 0;
    let scoresSimulated = 0;

    if (generateBracket) {
        console.log("Generating bracket...");
        
        // Call generate-bracket function logic inline
        const groupSize = 4;
        const shuffled = seededShuffleIds(createdEntries, categoryId);
        const groups: number[][] = [];
        for (let i = 0; i < shuffled.length; i += groupSize) {
            groups.push(shuffled.slice(i, i + groupSize));
        }

        const groupRounds: { t1: number | null; t2: number | null }[][][] = [];
        let maxRounds = 0;

        for (let g = 0; g < groups.length; g++) {
            const baseTeams = groups[g];
            if (baseTeams.length <= 1) {
                groupRounds[g] = [];
                continue;
            }

            const groupTeams: (number | null)[] = [...baseTeams];
            if (groupTeams.length % 2 !== 0) {
                groupTeams.push(null);
            }

            const n = groupTeams.length;
            const matchesPerRound = n / 2;
            const roundsForGroup: { t1: number | null; t2: number | null }[][] = [];
            let currentTeams = [...groupTeams];
            const totalGroupRounds = n - 1;

            for (let r = 0; r < totalGroupRounds; r++) {
                const roundPairings: { t1: number | null; t2: number | null }[] = [];
                for (let i = 0; i < matchesPerRound; i++) {
                    const t1 = currentTeams[i];
                    const t2 = currentTeams[n - 1 - i];
                    roundPairings.push({ t1, t2 });
                }

                roundsForGroup.push(roundPairings);

                const fixed = currentTeams[0];
                const rotating = currentTeams.slice(1);
                const last = rotating.pop();
                if (last !== undefined) rotating.unshift(last);
                currentTeams = [fixed, ...rotating];
            }

            groupRounds[g] = roundsForGroup as any;
            if (roundsForGroup.length > maxRounds) {
                maxRounds = roundsForGroup.length;
            }
        }

        if (maxRounds > 0) {
            // Insert rounds
            const roundRows = Array.from({ length: maxRounds }, (_, idx) => ({
                tournament_id: tournamentId,
                category_id: categoryId,
                round_number: idx + 1,
                name: `Round ${idx + 1}`,
            }));
            await supabase.from("rounds").insert(roundRows);

            // Insert fixtures
            const fixturesToInsert: any[] = [];
            for (let r = 0; r < maxRounds; r++) {
                for (let g = 0; g < groups.length; g++) {
                    const roundsForGroup = groupRounds[g] as { t1: number | null; t2: number | null }[][];
                    if (!roundsForGroup || r >= roundsForGroup.length) continue;
                    const pairings = roundsForGroup[r] || [];

                    for (const pairing of pairings) {
                        const { t1, t2 } = pairing;
                        if (t1 !== null && t2 !== null) {
                            fixturesToInsert.push({
                                tournament_id: tournamentId,
                                category_id: categoryId,
                                round_number: r + 1,
                                entry1_id: t1,
                                entry2_id: t2,
                                status: 'scheduled',
                                stage: 'group',
                            });
                        } else if (t1 !== null || t2 !== null) {
                            fixturesToInsert.push({
                                tournament_id: tournamentId,
                                category_id: categoryId,
                                round_number: r + 1,
                                entry1_id: t1 || t2,
                                entry2_id: null,
                                status: 'bye',
                                stage: 'group',
                            });
                        }
                    }
                }
            }

            const { data: insertedFixtures, error: fErr } = await supabase
                .from("fixtures")
                .insert(fixturesToInsert)
                .select("id, round_number, status, entry1_id, entry2_id");

            if (fErr) {
                console.error("Error inserting fixtures:", fErr.message);
            } else {
                // Insert sub-matches for each fixture
                const subMatchesToInsert: any[] = [];
                let matchIndexCounter = 0;

                for (const fix of (insertedFixtures as any[])) {
                    if (fix.status !== 'scheduled') continue;

                    const subMatchTypes = [
                        { type: 'MD', session: 1 },
                        { type: 'WD', session: 1 },
                        { type: 'XD', session: 2 },
                        { type: 'S', session: 2 },
                    ];

                    for (const sm of subMatchTypes) {
                        subMatchesToInsert.push({
                            tournament_id: tournamentId,
                            category_id: categoryId,
                            round_number: fix.round_number,
                            index_in_round: ++matchIndexCounter,
                            fixture_id: fix.id,
                            sub_match_type: sm.type,
                            session_sequence: sm.session,
                            status: 'pending',
                            entry1_id: fix.entry1_id,
                            entry2_id: fix.entry2_id,
                        });
                    }
                }

                if (subMatchesToInsert.length > 0) {
                    const { error: smErr } = await supabase.from("matches").insert(subMatchesToInsert);
                    if (smErr) {
                        console.error("Error inserting sub-matches:", smErr.message);
                    } else {
                        matchesCreated = subMatchesToInsert.length;
                        bracketGenerated = true;
                    }
                }

                // 7. Simulate scores if requested
                if (simulateScores && bracketGenerated) {
                    console.log("Simulating scores...");
                    const { data: allMatches } = await supabase
                        .from("matches")
                        .select("id, sub_match_type, entry1_id, entry2_id")
                        .eq("category_id", categoryId);

                    for (const m of (allMatches as any[]) || []) {
                        // Generate random scores (15-21 range typical for pickleball)
                        const p1Score = Math.floor(Math.random() * 10) + 15;
                        const p2Score = Math.floor(Math.random() * 10) + 15;
                        const winnerEntryId = p1Score > p2Score ? m.entry1_id : m.entry2_id;

                        const { error: updateErr } = await supabase.from("matches").update({
                            entry1_points: p1Score,
                            entry2_points: p2Score,
                            winner_entry_id: winnerEntryId,
                            status: 'completed',
                        }).eq("id", m.id);
                        
                        if (!updateErr) scoresSimulated++;
                    }
                }
            }
        }
    }

    return new Response(JSON.stringify({
        ok: true,
        tournament_id: tournamentId,
        category_id: categoryId,
        tournament_title: title,
        seed_tag: seedTag,
        organizer_id: organizer_uuid,
        organizer_email: organizer_email,
        organizer_password: organizer_email ? "Password!123" : null,
        used_existing_organizer: organizer_email === null,
        requested_teams: requestedTeams,
        actual_teams: numTeams,
        max_teams_cap: 64,
        entries_created: createdEntries.length,
        bracket_generated: bracketGenerated,
        matches_created: matchesCreated,
        scores_simulated: scoresSimulated,
        message: bracketGenerated 
            ? `Tournament seeded with ${numTeams} teams. Bracket generated with ${matchesCreated} matches.${simulateScores ? ` ${scoresSimulated} scores simulated.` : ''}`
            : "Tournament seeded with teams and full rosters. Ready to generate bracket."
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err as any)?.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
