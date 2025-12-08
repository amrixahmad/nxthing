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
      return new Response(JSON.stringify({ error: "Advance helper is only for team categories" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load knockout fixtures (stage = 'knockout')
    const { data: fxRows, error: fErr } = await supabase
      .from("fixtures")
      .select("id, round_number, entry1_id, entry2_id, stage")
      .eq("category_id", categoryId)
      .eq("stage", "knockout")
      .order("round_number", { ascending: true })
      .order("id", { ascending: true });
    if (fErr) throw fErr;

    const fixtures = (fxRows as FixtureRow[]) || [];
    if (fixtures.length === 0) {
      return new Response(JSON.stringify({ error: "No knockout fixtures found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roundNumbers = Array.from(new Set(fixtures.map((f) => f.round_number))).sort((a, b) => a - b);
    if (roundNumbers.length < 2) {
      return new Response(JSON.stringify({ ok: true, message: "Only one knockout round exists; nothing to advance" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load matches for these fixtures to compute winners by aggregate points
    const fixtureIds = fixtures.map((f) => f.id);
    const { data: mRows, error: mErr } = await supabase
      .from("matches")
      .select("id, fixture_id, entry1_points, entry2_points")
      .eq("category_id", categoryId)
      .in("fixture_id", fixtureIds);
    if (mErr) throw mErr;
    const matches = (mRows as MatchRow[]) || [];

    const matchesByFixture: Record<number, MatchRow[]> = {};
    for (const m of matches) {
      if (!m.fixture_id) continue;
      if (!matchesByFixture[m.fixture_id]) matchesByFixture[m.fixture_id] = [];
      matchesByFixture[m.fixture_id].push(m);
    }

    // Helper to compute winner team id for a fixture by aggregate points
    function fixtureWinner(f: FixtureRow): number | null {
      if (f.entry1_id == null || f.entry2_id == null) return null;
      const subs = matchesByFixture[f.id] || [];
      if (subs.length === 0) return null;
      let total1 = 0;
      let total2 = 0;
      let hasAnyScore = false;
      for (const m of subs) {
        const p1 = m.entry1_points ?? 0;
        const p2 = m.entry2_points ?? 0;
        if (m.entry1_points != null || m.entry2_points != null) hasAnyScore = true;
        total1 += p1;
        total2 += p2;
      }
      if (!hasAnyScore || total1 === total2) return null;
      return total1 > total2 ? f.entry1_id : f.entry2_id;
    }

    const updatesByFixture: Record<number, { entry1_id?: number | null; entry2_id?: number | null }> = {};
    let assignments = 0;

    // For each adjacent pair of rounds, push winners into next round slots based on bracket order
    for (let i = 0; i < roundNumbers.length - 1; i++) {
      const curRound = roundNumbers[i];
      const nextRound = roundNumbers[i + 1];
      const curFixtures = fixtures
        .filter((f) => f.round_number === curRound)
        .sort((a, b) => a.id - b.id);
      const nextFixtures = fixtures
        .filter((f) => f.round_number === nextRound)
        .sort((a, b) => a.id - b.id);

      if (nextFixtures.length === 0 || curFixtures.length === 0) continue;

      for (let j = 0; j < curFixtures.length; j++) {
        const f = curFixtures[j];
        const winner = fixtureWinner(f);
        if (!winner) continue; // skip unfinished or tied fixtures

        const nextIndex = Math.floor(j / 2);
        const slotIsFirst = j % 2 === 0;
        const target = nextFixtures[nextIndex];
        if (!target) continue;

        const fid = target.id;
        if (!updatesByFixture[fid]) updatesByFixture[fid] = {};
        if (slotIsFirst) {
          if (updatesByFixture[fid].entry1_id !== winner) {
            updatesByFixture[fid].entry1_id = winner;
            assignments++;
          }
        } else {
          if (updatesByFixture[fid].entry2_id !== winner) {
            updatesByFixture[fid].entry2_id = winner;
            assignments++;
          }
        }
      }
    }

    // Apply updates and create sub-matches for newly complete fixtures
    const fixtureIdsToUpdate = Object.keys(updatesByFixture).map((id) => Number(id));
    let subMatchesCreated = 0;

    for (const fid of fixtureIdsToUpdate) {
      const payload = updatesByFixture[fid];
      const { error: uErr } = await supabase
        .from("fixtures")
        .update({ ...payload, status: "scheduled" })
        .eq("id", fid);
      if (uErr) throw uErr;

      // Check if this fixture now has both teams assigned
      const targetFixture = fixtures.find((f) => f.id === fid);
      const newEntry1 = payload.entry1_id ?? targetFixture?.entry1_id;
      const newEntry2 = payload.entry2_id ?? targetFixture?.entry2_id;

      if (newEntry1 != null && newEntry2 != null) {
        // Check if sub-matches already exist for this fixture
        const existingSubs = matchesByFixture[fid] || [];
        if (existingSubs.length === 0) {
          // Create sub-matches for this fixture
          const subMatchTypes = [
            { type: "MD", session: 1 },
            { type: "WD", session: 1 },
            { type: "XD", session: 2 },
            { type: "S", session: 2 },
          ];

          const roundNum = targetFixture?.round_number || 0;
          const subMatchesToInsert = subMatchTypes.map((sm, idx) => ({
            tournament_id: (cat as CategoryRow).tournament_id,
            category_id: categoryId,
            round_number: roundNum,
            index_in_round: idx + 1,
            fixture_id: fid,
            sub_match_type: sm.type,
            session_sequence: sm.session,
            status: "pending",
            entry1_id: newEntry1,
            entry2_id: newEntry2,
          }));

          const { error: smErr } = await supabase.from("matches").insert(subMatchesToInsert);
          if (smErr) {
            console.error("Error creating sub-matches for fixture", fid, smErr.message);
          } else {
            subMatchesCreated += subMatchesToInsert.length;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: `Knockout bracket updated (${assignments} slots set, ${subMatchesCreated} sub-matches created)` 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
