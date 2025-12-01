import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Entry = { id: number };

type CategoryRow = {
  id: number;
  tournament_id: number;
};

type TournamentRow = {
  id: number;
  registration_end_date: string | null;
};

function seededShuffle<T>(arr: T[], seed: number) {
  // Mulberry32
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

function nextPow2(n: number) {
  let m = 1;
  while (m < n) m <<= 1;
  return m;
}

function roundName(totalSlots: number, round: number) {
  const teamsThisRound = totalSlots / Math.pow(2, round - 1);
  if (teamsThisRound === 2) return "Final";
  if (teamsThisRound === 4) return "Semifinal";
  if (teamsThisRound === 8) return "Quarterfinal";
  return `Round of ${teamsThisRound}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ||
      Deno.env.get("EXPO_PUBLIC_SUPABASE_URL") ||
      "http://127.0.0.1:54321";
    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SERVICE_ROLE_KEY") ||
      "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const categoryId = Number(body.category_id || 0);
    if (!categoryId) {
      return new Response(JSON.stringify({ error: "category_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load category and tournament to validate
    const { data: cat, error: catErr } = await supabase
      .from("tournament_categories")
      .select("id, tournament_id, participation_type")
      .eq("id", categoryId)
      .maybeSingle();
    if (catErr || !cat) {
      return new Response(JSON.stringify({ error: "Category not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tour, error: tErr } = await supabase
      .from("tournaments")
      .select("id, registration_end_date")
      .eq("id", (cat as CategoryRow).tournament_id)
      .maybeSingle();
    if (tErr || !tour) {
      return new Response(JSON.stringify({ error: "Tournament not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const regEndRaw = (tour as TournamentRow).registration_end_date;
    const regEnd = regEndRaw ? new Date(regEndRaw) : null;
    if (!regEnd || regEnd.getTime() > Date.now()) {
      return new Response(JSON.stringify({ error: "Registration not closed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent duplicate generation
    // Check fixtures for team format, matches for others
    const isTeamFormat = (cat as any).participation_type === 'team';
    
    if (isTeamFormat) {
        const { count: existingFixtures } = await supabase
            .from("fixtures")
            .select("id", { count: "exact", head: true })
            .eq("category_id", categoryId);
        if ((existingFixtures || 0) > 0) {
            return new Response(JSON.stringify({ ok: true, message: "Bracket already exists" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
    } else {
        const { count: existingCount } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("category_id", categoryId);
        if ((existingCount || 0) > 0) {
        return new Response(JSON.stringify({ ok: true, message: "Bracket already exists" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
        }
    }

    // Load eligible entries
    const { data: entries, error: eErr } = await supabase
      .from("entries")
      .select("id")
      .eq("category_id", categoryId)
      .eq("status", "accepted")
      .eq("payment_status", "paid");
    if (eErr) throw eErr;
    const ids = (entries as Entry[]).map((e) => e.id);

    if (ids.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least two entries to generate a bracket" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isTeamFormat) {
        const groupSize = 4;
        const shuffled = seededShuffle(ids, categoryId);
        const groups: number[][] = [];
        for (let i = 0; i < shuffled.length; i += groupSize) {
          groups.push(shuffled.slice(i, i + groupSize));
        }

        const groupRounds: { t1: number | null; t2: number | null }[][] = [];
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

          groupRounds[g] = roundsForGroup;
          if (roundsForGroup.length > maxRounds) {
            maxRounds = roundsForGroup.length;
          }
        }

        if (maxRounds === 0) {
          return new Response(JSON.stringify({ error: "Not enough teams to generate fixtures" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const roundRows = Array.from({ length: maxRounds }, (_, idx) => ({
          tournament_id: (cat as CategoryRow).tournament_id,
          category_id: categoryId,
          round_number: idx + 1,
          name: `Round ${idx + 1}`,
        }));

        const { error: rErr } = await supabase.from("rounds").insert(roundRows);
        if (rErr) throw rErr;

        const fixturesToInsert: any[] = [];

        for (let r = 0; r < maxRounds; r++) {
          for (let g = 0; g < groups.length; g++) {
            const roundsForGroup = groupRounds[g];
            if (!roundsForGroup || r >= roundsForGroup.length) continue;
            const pairings = roundsForGroup[r];

            for (const pairing of pairings) {
              const { t1, t2 } = pairing;

              if (t1 !== null && t2 !== null) {
                fixturesToInsert.push({
                  tournament_id: (cat as CategoryRow).tournament_id,
                  category_id: categoryId,
                  round_number: r + 1,
                  entry1_id: t1,
                  entry2_id: t2,
                  status: 'scheduled',
                });
              } else if (t1 !== null || t2 !== null) {
                const teamId = t1 || t2;
                fixturesToInsert.push({
                  tournament_id: (cat as CategoryRow).tournament_id,
                  category_id: categoryId,
                  round_number: r + 1,
                  entry1_id: teamId,
                  entry2_id: null,
                  status: 'bye',
                });
              }
            }
          }
        }

        const { data: insertedFixtures, error: fErr } = await supabase
          .from("fixtures")
          .insert(fixturesToInsert)
          .select("id, round_number, status");

        if (fErr) throw fErr;

        const subMatchesToInsert: any[] = [];
        let matchIndexCounter = 0;

        for (const fix of (insertedFixtures as any[])) {
          if (fix.status !== 'scheduled') continue;

          subMatchesToInsert.push({
            tournament_id: (cat as CategoryRow).tournament_id,
            category_id: categoryId,
            round_number: fix.round_number,
            index_in_round: ++matchIndexCounter,
            fixture_id: fix.id,
            sub_match_type: 'MD',
            session_sequence: 1,
            status: 'pending',
          });

          subMatchesToInsert.push({
            tournament_id: (cat as CategoryRow).tournament_id,
            category_id: categoryId,
            round_number: fix.round_number,
            index_in_round: ++matchIndexCounter,
            fixture_id: fix.id,
            sub_match_type: 'WD',
            session_sequence: 1,
            status: 'pending',
          });

          subMatchesToInsert.push({
            tournament_id: (cat as CategoryRow).tournament_id,
            category_id: categoryId,
            round_number: fix.round_number,
            index_in_round: ++matchIndexCounter,
            fixture_id: fix.id,
            sub_match_type: 'XD',
            session_sequence: 2,
            status: 'pending',
          });

          subMatchesToInsert.push({
            tournament_id: (cat as CategoryRow).tournament_id,
            category_id: categoryId,
            round_number: fix.round_number,
            index_in_round: ++matchIndexCounter,
            fixture_id: fix.id,
            sub_match_type: 'RD',
            session_sequence: 2,
            status: 'pending',
          });
        }

        if (subMatchesToInsert.length > 0) {
          const { error: smErr } = await supabase.from("matches").insert(subMatchesToInsert);
          if (smErr) throw smErr;
        }

    } else {
        // --- SINGLE ELIMINATION (Standard) ---
        const shuffled = seededShuffle(ids, categoryId);
    const totalSlots = nextPow2(shuffled.length);
    const roundsCount = Math.log2(totalSlots) | 0;

    // Precompute participants per round and bye winners
    const roundParticipants: Array<Array<number | null>> = [];
    const firstRoundSlots: Array<number | null> = new Array(totalSlots).fill(null);
    for (let i = 0; i < shuffled.length; i++) firstRoundSlots[i] = shuffled[i];
    roundParticipants.push(firstRoundSlots);

    // winners per round, used to auto-advance byes
    const roundWinners: Array<Array<number | null>> = [];
    let prev = firstRoundSlots;
    for (let r = 1; r <= roundsCount; r++) {
      const matchesThisRound = totalSlots / Math.pow(2, r);
      const winners: Array<number | null> = new Array(matchesThisRound).fill(null);
      for (let i = 0; i < matchesThisRound; i++) {
        const left = prev[2 * i];
        const right = prev[2 * i + 1];
        let w: number | null = null;
        if (left && !right) w = left;
        else if (!left && right) w = right;
        // if both present or both null, no automatic winner
        winners[i] = w;
      }
      roundWinners.push(winners);
      // Next round participants are the winners of prior round
      if (r < roundsCount) {
        const nextSlots: Array<number | null> = new Array(matchesThisRound).fill(null);
        for (let i = 0; i < matchesThisRound; i++) nextSlots[i] = winners[i];
        roundParticipants.push(nextSlots);
        prev = nextSlots;
      }
    }

    // Create rounds
    const roundRows = Array.from({ length: roundsCount }, (_, idx) => ({
      tournament_id: (cat as CategoryRow).tournament_id,
      category_id: categoryId,
      round_number: idx + 1,
      name: roundName(totalSlots, idx + 1),
    }));
    const { error: rErr } = await supabase.from("rounds").insert(roundRows);
    if (rErr) throw rErr;

    // Create matches per round
    const matchIdMap: Record<number, number[]> = {}; // round -> [ids]
    for (let r = 1; r <= roundsCount; r++) {
      const matchesThisRound = totalSlots / Math.pow(2, r);
      const rows = Array.from({ length: matchesThisRound }, (_, i) => ({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: r,
        index_in_round: i + 1,
        status: "pending",
      }));
      const { data: inserted, error: mErr } = await supabase
        .from("matches")
        .insert(rows)
        .select("id, round_number, index_in_round");
      if (mErr) throw mErr;
      const idsRound: number[] = [];
      for (const row of inserted as any[]) idsRound[row.index_in_round - 1] = row.id as number;
      matchIdMap[r] = idsRound;
    }

    // Set next_match references
    for (let r = 1; r < roundsCount; r++) {
      const current = matchIdMap[r];
      const next = matchIdMap[r + 1];
      for (let i = 0; i < current.length; i++) {
        const id = current[i];
        const nextIndex = Math.floor(i / 2);
        const slot = (i % 2) === 0 ? 1 : 2;
        const { error: uErr } = await supabase
          .from("matches")
          .update({ next_match_id: next[nextIndex], next_match_slot: slot })
          .eq("id", id);
        if (uErr) throw uErr;
      }
    }

    // Assign participants and auto-bye winners
    for (let r = 1; r <= roundsCount; r++) {
      const idsRound = matchIdMap[r];
      const slots = roundParticipants[r - 1];
      const winners = roundWinners[r - 1] || [];
      const matchesThisRound = idsRound.length;
      for (let i = 0; i < matchesThisRound; i++) {
        const mId = idsRound[i];
        const left = slots[2 * i] ?? null;
        const right = slots[2 * i + 1] ?? null;
        const isBye = (left && !right) || (!left && right);
        const winner = winners[i] ?? null;
        const status = isBye ? "bye" : "pending";
        const updates: any = {
          entry1_id: left,
          entry2_id: right,
          status,
        };
        if (isBye && winner) updates.winner_entry_id = winner;
        const { error: aErr } = await supabase.from("matches").update(updates).eq("id", mId);
        if (aErr) throw aErr;
      }
    }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
