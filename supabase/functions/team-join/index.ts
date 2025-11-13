/// <reference lib="deno.window" />

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type JoinTeamRequest = {
  invite_code: string;
};

type JoinTeamResponse = {
  entry_id: number;
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

    const auth = req.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: JoinTeamRequest = await req.json();
    const code = (body?.invite_code || "").trim();
    if (!code) {
      return new Response(JSON.stringify({ error: "invite_code is required" }), {
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: token ? `Bearer ${token}` : "" } },
    });
    const service = createClient(supabaseUrl, serviceKey);

    const userRes = await supabase.auth.getUser(token);
    const user = userRes.data.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: entryRows } = await supabase
      .from("entries")
      .select(
        `id, created_by, invite_code, category:category_id (
          id, members_per_team_min, members_per_team_max, tournament:tournament_id (
            id, status, registration_start_date, registration_end_date
          )
        )`
      )
      .eq("invite_code", code)
      .limit(1);

    if (!entryRows || entryRows.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid or expired invite" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entry: any = entryRows[0];
    let category: any = entry.category;
    if (Array.isArray(category)) category = category[0];
    let tournament: any = category?.tournament;
    if (Array.isArray(tournament)) tournament = tournament[0];

    if (!category || !tournament) {
      return new Response(JSON.stringify({ error: "Invalid team entry" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const start = new Date(tournament.registration_start_date);
    const end = new Date(tournament.registration_end_date);
    if (tournament.status !== "registration_open" || !(now >= start && now <= end)) {
      return new Response(JSON.stringify({ error: "Registration is closed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already a member? idempotent success
    const { data: existing } = await supabase
      .from("entry_members")
      .select("profile_id")
      .eq("entry_id", entry.id)
      .eq("profile_id", user.id)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ entry_id: entry.id } as JoinTeamResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capacity: team size
    const { count: memberCount } = await supabase
      .from("entry_members")
      .select("profile_id", { count: "exact", head: true })
      .eq("entry_id", entry.id);

    const currentMembers = memberCount ?? 0;
    const maxMembers = Number(category.members_per_team_max || 1);
    if (maxMembers && currentMembers >= maxMembers) {
      return new Response(JSON.stringify({ error: "Team is full" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert membership with service role to bypass RLS constraints
    const { error: insErr } = await service.from("entry_members").insert({ entry_id: entry.id, profile_id: user.id });
    if (insErr) {
      return new Response(JSON.stringify({ error: "Could not join team" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ entry_id: entry.id } as JoinTeamResponse), {
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
