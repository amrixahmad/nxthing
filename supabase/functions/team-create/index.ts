/// <reference lib="deno.window" />

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreateTeamRequest = {
  category_id: number;
  team_name: string;
  team_slogan?: string | null;
  team_logo_url?: string | null;
};

type CreateTeamResponse = {
  entry_id: number;
  invite_code: string;
  invite_url: string;
};

function slugify(str: string): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

function makeInviteCode(teamName: string, tournamentTitle: string): string {
  const teamSlug = slugify(teamName) || "TEAM";
  const tourneySlug = slugify(tournamentTitle).slice(0, 12) || "TOURNEY";
  const num = Math.floor(100 + Math.random() * 900);
  return `${teamSlug}-${tourneySlug}-${num}`;
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

    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: CreateTeamRequest = await req.json();
    if (!body?.category_id || !body?.team_name) {
      return new Response(JSON.stringify({ error: "category_id and team_name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ||
      Deno.env.get("EXPO_PUBLIC_SUPABASE_URL") ||
      "http://127.0.0.1:54321";
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("EXPO_PUBLIC_SUPABASE_ANON_KEY") ||
      "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: token ? `Bearer ${token}` : "" } },
    });

    const userRes = await supabase.auth.getUser(token);
    const user = userRes.data.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate registration window
    const { data: catRows, error: catErr } = await supabase
      .from("tournament_categories")
      .select(
        `id, name, registration_fee, members_per_team_max, tournament:tournament_id (id, title, status, registration_start_date, registration_end_date)`
      )
      .eq("id", body.category_id)
      .limit(1);
    if (catErr || !catRows || catRows.length === 0) {
      return new Response(JSON.stringify({ error: "Category not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let category: any = catRows[0];
    if (Array.isArray(category.tournament)) category.tournament = category.tournament[0];

    const now = new Date();
    const start = category.tournament.registration_start_date ? new Date(category.tournament.registration_start_date) : null;
    const end = category.tournament.registration_end_date ? new Date(category.tournament.registration_end_date) : null;
    const inWindow = !!(start && end && now >= start && now <= end);
    // Registration is open if status is 'registration_open' OR we're within the window
    const isOpen = category.tournament.status === "registration_open" || inWindow;
    if (!isOpen) {
      return new Response(JSON.stringify({ error: "Registration is closed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create entry (team) with unique invite_code
    const tournamentTitle = category.tournament?.title || "Tournament";
    let invite = "";
    let entryId: number | null = null;
    for (let i = 0; i < 5; i++) {
      invite = makeInviteCode(body.team_name, tournamentTitle);
      const { data: ins, error: insErr } = await supabase
        .from("entries")
        .insert({
          category_id: body.category_id,
          created_by: user.id,
          team_name: body.team_name,
          team_slogan: body.team_slogan ?? null,
          team_logo_url: body.team_logo_url ?? null,
          payment_currency: "myr",
          status: "pending",
          invite_code: invite,
        })
        .select("id")
        .single();
      if (!insErr && ins?.id) {
        entryId = ins.id as number;
        break;
      }
    }
    if (!entryId) {
      return new Response(JSON.stringify({ error: "Failed to create team" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add leader as first member
    const { error: memErr } = await supabase
      .from("entry_members")
      .insert({ entry_id: entryId, profile_id: user.id });
    if (memErr) {
      // Best-effort cleanup not performed; organizer or leader can remove entry
    }

    const defaultBase = Deno.env.get("CHECKOUT_BASE_URL") || req.headers.get("Origin") || "http://localhost:8082";
    const inviteUrl = `${defaultBase}/tournaments/register?invite=${encodeURIComponent(invite)}`;

    const response: CreateTeamResponse = { entry_id: entryId, invite_code: invite, invite_url: inviteUrl };
    return new Response(JSON.stringify(response), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
