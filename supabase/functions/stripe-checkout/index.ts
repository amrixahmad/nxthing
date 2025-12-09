/// <reference lib="deno.window" />

import Stripe from "npm:stripe@^12.16.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreateCheckoutRequest = {
  entry_id: number;
  success_url?: string;
  cancel_url?: string;
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

    const body: CreateCheckoutRequest = await req.json();
    if (!body?.entry_id) {
      return new Response(JSON.stringify({ error: "entry_id is required" }), {
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
      global: {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      },
    });

    const userRes = await supabase.auth.getUser(token);
    const user = userRes.data.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load entry + category + tournament
    const { data: entryRows, error: entryErr } = await supabase
      .from("entries")
      .select(
        `id, status, payment_status, payment_amount, payment_currency, created_by,
         category:category_id (
           id, name, registration_fee, max_teams, tournament:tournament_id (
             id, title, organizer_id, status, registration_start_date, registration_end_date
           )
         )`
      )
      .eq("id", body.entry_id)
      .limit(1);

    if (entryErr || !entryRows || entryRows.length === 0) {
      return new Response(JSON.stringify({ error: "Entry not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const entry = entryRows[0] as any;
    let category = entry.category as any;
    if (Array.isArray(category)) category = category[0];
    let tournament = category?.tournament as any;
    if (Array.isArray(tournament)) tournament = tournament[0];

    if (!category || !tournament) {
      return new Response(JSON.stringify({ error: "Entry not linked to category/tournament" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorization: player who created, a member of the entry, or organizer
    const isCreator = entry.created_by === user.id;
    const isOrganizer = tournament.organizer_id === user.id;
    // For team members (including creator), fetch their payment status
    let isMember = false;
    let memberPaymentStatus: string | null = null;
    {
      const { data: mem } = await supabase
        .from("entry_members")
        .select("profile_id, payment_status")
        .eq("entry_id", body.entry_id)
        .eq("profile_id", user.id)
        .maybeSingle();
      isMember = !!mem;
      memberPaymentStatus = (mem as any)?.payment_status ?? null;
    }
    if (!isCreator && !isOrganizer && !isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Registration window & tournament status
    const now = new Date();
    const start = new Date(tournament.registration_start_date);
    const end = new Date(tournament.registration_end_date);
    if (tournament.status !== "registration_open" || !(now >= start && now <= end)) {
      return new Response(JSON.stringify({ error: "Registration is closed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For team members (including creator), check member-level payment status
    // For organizers (non-members), check entry-level payment status
    if (isMember) {
      // Team member (or creator who is also a member): check if THIS member has already paid
      if (memberPaymentStatus && memberPaymentStatus !== "unpaid") {
        return new Response(JSON.stringify({ error: "You have already paid for this entry" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (isOrganizer) {
      // Organizer (not a member): check entry-level payment status
      if (entry.payment_status && entry.payment_status !== "unpaid") {
        return new Response(JSON.stringify({ error: "Entry already paid/refunded" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const fee: number = Number((category?.registration_fee ?? 0) as number);
    if (isNaN(fee) || fee < 0) {
      return new Response(JSON.stringify({ error: "Invalid registration fee" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const currency = (entry.payment_currency || "myr").toLowerCase();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const service = createClient(supabaseUrl, serviceKey);

    // Handle FREE tournaments (fee = 0): skip Stripe, mark as paid immediately
    if (fee === 0) {
      // Mark member as paid (waived)
      if (isMember) {
        await service
          .from("entry_members")
          .update({
            payment_status: "waived",
            payment_amount: 0,
            payment_currency: currency,
            paid_at: new Date().toISOString(),
          })
          .eq("entry_id", entry.id)
          .eq("profile_id", user.id);
      }

      // Check if team has minimum required paid/waived members -> accept entry
      const { data: cat } = await service
        .from("tournament_categories")
        .select("members_per_team_min")
        .eq("id", category.id)
        .maybeSingle();
      const minMembers = Number(cat?.members_per_team_min || 1);

      const { count: paidCount } = await service
        .from("entry_members")
        .select("profile_id", { count: "exact", head: true })
        .eq("entry_id", entry.id)
        .in("payment_status", ["paid", "waived"]);

      if (typeof paidCount === "number" && paidCount >= minMembers) {
        await service
          .from("entries")
          .update({ payment_status: "waived", status: "accepted", paid_at: new Date().toISOString() })
          .eq("id", entry.id);
      }

      // Return success without Stripe redirect
      const defaultBase = Deno.env.get("CHECKOUT_BASE_URL") || req.headers.get("Origin") || "http://localhost:8082";
      const successUrl = `${defaultBase}/tournaments/my?payment=success&entry_id=${entry.id}`;
      return new Response(JSON.stringify({ url: successUrl, free: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For paid tournaments, enforce minimum fee
    if (fee < 1) {
      return new Response(JSON.stringify({ error: "Minimum registration fee is RM 1" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Capacity check (MVP: first-come-first-served; no waitlist)
    const maxTeams = Number(category.max_teams ?? 0);
    if (maxTeams && maxTeams > 0) {
      const { data: acceptedRows, error: accErr } = await supabase
        .from("entries")
        .select("id")
        .eq("category_id", category.id)
        .eq("status", "accepted");
      if (!accErr) {
        const acceptedCount = (acceptedRows || []).length;
        if (acceptedCount >= maxTeams) {
          return new Response(JSON.stringify({ error: "Category is full" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      return new Response(JSON.stringify({ error: "Missing STRIPE_SECRET_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

    const defaultBase = Deno.env.get("CHECKOUT_BASE_URL") || req.headers.get("Origin") || "http://localhost:8082";
    const successBase = body.success_url || `${defaultBase}/tournaments/my?payment=success`;
    const cancelUrl = body.cancel_url || `${defaultBase}/tournaments/my?payment=cancel`;
    const successUrl = `${successBase}${successBase.includes("?") ? "&" : "?"}entry_id=${entry.id}&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(fee * 100),
            product_data: {
              name: `${tournament.title} - ${category.name}`,
            },
          },
        },
      ],
      metadata: {
        entry_id: String(entry.id),
        category_id: String(category.id),
        tournament_id: String(tournament.id),
        user_id: user.id,
        profile_id: user.id,
      },
      allow_promotion_codes: false,
    });

    // store reference immediately
    await supabase
      .from("entries")
      .update({ payment_reference: session.id, payment_amount: fee, payment_currency: currency })
      .eq("id", entry.id);

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
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
