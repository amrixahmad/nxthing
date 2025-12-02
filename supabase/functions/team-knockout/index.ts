import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CategoryRow = {
  id: number;
  tournament_id: number;
  participation_type?: string | null;
};

type FixtureRow = {
  id: number;
  round_number: number;
  entry1_id: number | null;
  entry2_id: number | null;
  stage?: string | null;
};

type MatchRow = {
  id: number;
  fixture_id: number | null;
  entry1_points: number | null;
  entry2_points: number | null;
};

type TeamStats = {
  id: number;
  wins: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
};

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
    const categoryId = Number((body as any).category_id || 0);
    if (!categoryId) {
      return new Response(JSON.stringify({ error: "category_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const isTeamFormat = (cat as CategoryRow).participation_type === "team";
    if (!isTeamFormat) {
      return new Response(JSON.stringify({ error: "Knockout is only for team categories" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all fixtures for this category and split by stage
    const { data: allFixtures, error: fErr } = await supabase
      .from("fixtures")
      .select("id, round_number, entry1_id, entry2_id, stage")
      .eq("category_id", categoryId);
    if (fErr) throw fErr;

    const fixtures = (allFixtures as FixtureRow[]) || [];
    const hasKnockout = fixtures.some((f) => (f.stage || "group") === "knockout");
    if (hasKnockout) {
      return new Response(JSON.stringify({ ok: true, message: "Knockout already exists" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const groupFixtures = fixtures.filter((f) => (f.stage || "group") === "group");
    if (groupFixtures.length === 0) {
      return new Response(JSON.stringify({ error: "No group-stage fixtures found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build adjacency graph of teams from group fixtures
    const neighbors: Record<number, Set<number>> = {};
    const teamIdsSet = new Set<number>();

    for (const f of groupFixtures) {
      const e1 = f.entry1_id;
      const e2 = f.entry2_id;
      if (e1 != null) {
        teamIdsSet.add(e1);
        if (!neighbors[e1]) neighbors[e1] = new Set();
      }
      if (e2 != null) {
        teamIdsSet.add(e2);
        if (!neighbors[e2]) neighbors[e2] = new Set();
      }
      if (e1 != null && e2 != null) {
        neighbors[e1].add(e2);
        neighbors[e2].add(e1);
      }
    }

    if (teamIdsSet.size < 2) {
      return new Response(JSON.stringify({ error: "Not enough teams for knockout" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Connected components => groups
    const visited = new Set<number>();
    const groups: number[][] = [];

    for (const id of teamIdsSet) {
      if (visited.has(id)) continue;
      const queue: number[] = [id];
      visited.add(id);
      const group: number[] = [];
      while (queue.length > 0) {
        const cur = queue.shift() as number;
        group.push(cur);
        const neigh = neighbors[cur];
        if (neigh) {
          for (const n of neigh) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
      }
      groups.push(group);
    }

    if (groups.length === 0) {
      return new Response(JSON.stringify({ error: "Could not infer groups from fixtures" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load all matches for this category (to compute points per fixture)
    const { data: matchRows, error: mErr } = await supabase
      .from("matches")
      .select("id, fixture_id, entry1_points, entry2_points")
      .eq("category_id", categoryId);
    if (mErr) throw mErr;
    const matches = (matchRows as MatchRow[]) || [];

    const matchesByFixture: Record<number, MatchRow[]> = {};
    for (const m of matches) {
      if (!m.fixture_id) continue;
      if (!matchesByFixture[m.fixture_id]) matchesByFixture[m.fixture_id] = [];
      matchesByFixture[m.fixture_id].push(m);
    }

    const winners: number[] = [];
    const runners: number[] = [];

    // Helper to compute standings within a group
    function computeGroupStandings(teamIds: number[]): TeamStats[] {
      const teamSet = new Set(teamIds);
      const stats: Record<number, TeamStats> = {};

      for (const f of groupFixtures) {
        const t1 = f.entry1_id;
        const t2 = f.entry2_id;
        if (t1 == null || t2 == null) continue; // ignore byes
        if (!teamSet.has(t1) && !teamSet.has(t2)) continue; // not part of this group

        const subs = matchesByFixture[f.id] || [];
        if (subs.length === 0) continue;

        let total1 = 0;
        let total2 = 0;
        let hasAnyScore = false;

        for (const m of subs) {
          const p1 = m.entry1_points ?? 0;
          const p2 = m.entry2_points ?? 0;
          if (m.entry1_points != null || m.entry2_points != null) {
            hasAnyScore = true;
          }
          total1 += p1;
          total2 += p2;
        }

        if (!hasAnyScore) continue;

        if (!stats[t1]) {
          stats[t1] = { id: t1, wins: 0, played: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 };
        }
        if (!stats[t2]) {
          stats[t2] = { id: t2, wins: 0, played: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 };
        }

        stats[t1].played += 1;
        stats[t2].played += 1;
        stats[t1].pointsFor += total1;
        stats[t1].pointsAgainst += total2;
        stats[t2].pointsFor += total2;
        stats[t2].pointsAgainst += total1;
        stats[t1].diff = stats[t1].pointsFor - stats[t1].pointsAgainst;
        stats[t2].diff = stats[t2].pointsFor - stats[t2].pointsAgainst;

        if (total1 > total2) {
          stats[t1].wins += 1;
        } else if (total2 > total1) {
          stats[t2].wins += 1;
        }
      }

      return Object.values(stats).sort(
        (a, b) =>
          b.wins - a.wins ||
          b.pointsFor - a.pointsFor ||
          b.diff - a.diff
      );
    }

    for (const group of groups) {
      if (group.length < 2) {
        return new Response(JSON.stringify({ error: "Each group must have at least 2 teams for knockout" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const standings = computeGroupStandings(group);
      if (standings.length < 2) {
        return new Response(JSON.stringify({ error: "Not enough completed matches in one or more groups" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      winners.push(standings[0].id);
      runners.push(standings[1].id);
    }

    const qualifiers: number[] = [...winners, ...runners];
    if (qualifiers.length < 2) {
      return new Response(JSON.stringify({ error: "Need at least 2 qualified teams for knockout" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalQualifiers = qualifiers.length;
    const seeds: number[] = [...winners, ...runners];

    if (seeds.length % 2 !== 0) {
      return new Response(JSON.stringify({ error: "Qualified team count must be even" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pairs: Array<{ t1: number; t2: number }> = [];
    const n = seeds.length;
    for (let i = 0; i < n / 2; i++) {
      const t1 = seeds[i];
      const t2 = seeds[n - 1 - i];
      if (t1 === t2) {
        return new Response(JSON.stringify({ error: "Seeding produced duplicate pairing; please check groups" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      pairs.push({ t1, t2 });
    }

    const groupRoundNumbers = groupFixtures.map((f) => f.round_number);
    const maxGroupRound = groupRoundNumbers.length > 0 ? Math.max(...groupRoundNumbers) : 0;
    const knockoutRoundNumber = maxGroupRound + 1;

    let roundName = "Knockout";
    if (totalQualifiers === 2) roundName = "Final";
    else if (totalQualifiers === 4) roundName = "Semifinal";
    else if (totalQualifiers === 8) roundName = "Quarterfinal";
    else roundName = `Knockout Round of ${totalQualifiers}`;

    const roundRow = {
      tournament_id: (cat as CategoryRow).tournament_id,
      category_id: categoryId,
      round_number: knockoutRoundNumber,
      name: roundName,
    };

    const { error: rErr } = await supabase.from("rounds").insert(roundRow);
    if (rErr) throw rErr;

    const fixturesToInsert: any[] = [];
    for (const p of pairs) {
      fixturesToInsert.push({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: knockoutRoundNumber,
        entry1_id: p.t1,
        entry2_id: p.t2,
        status: "scheduled",
        stage: "knockout",
      });
    }

    const { data: insertedFixtures, error: fErr2 } = await supabase
      .from("fixtures")
      .insert(fixturesToInsert)
      .select("id, round_number, status");
    if (fErr2) throw fErr2;

    const subMatchesToInsert: any[] = [];
    let matchIndexCounter = 0;

    for (const fix of (insertedFixtures as any[]) || []) {
      if (fix.status !== "scheduled") continue;

      subMatchesToInsert.push({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: fix.round_number,
        index_in_round: ++matchIndexCounter,
        fixture_id: fix.id,
        sub_match_type: "MD",
        session_sequence: 1,
        status: "pending",
      });

      subMatchesToInsert.push({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: fix.round_number,
        index_in_round: ++matchIndexCounter,
        fixture_id: fix.id,
        sub_match_type: "WD",
        session_sequence: 1,
        status: "pending",
      });

      subMatchesToInsert.push({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: fix.round_number,
        index_in_round: ++matchIndexCounter,
        fixture_id: fix.id,
        sub_match_type: "XD",
        session_sequence: 2,
        status: "pending",
      });

      subMatchesToInsert.push({
        tournament_id: (cat as CategoryRow).tournament_id,
        category_id: categoryId,
        round_number: fix.round_number,
        index_in_round: ++matchIndexCounter,
        fixture_id: fix.id,
        sub_match_type: "RD",
        session_sequence: 2,
        status: "pending",
      });
    }

    if (subMatchesToInsert.length > 0) {
      const { error: smErr } = await supabase.from("matches").insert(subMatchesToInsert);
      if (smErr) throw smErr;
    }

    return new Response(JSON.stringify({ ok: true, message: "Knockout stage generated", qualifiers: totalQualifiers }), {
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
