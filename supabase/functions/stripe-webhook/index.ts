import Stripe from "npm:stripe@^12.16.0";
import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeSecret || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Missing Stripe secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2022-11-15" });

    const bodyText = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(bodyText, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed", err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const entryId = Number(session.metadata?.entry_id || 0);
      const profileId = String(session.metadata?.profile_id || "");
      if (!entryId) {
        console.warn("No entry_id in session metadata", session.id);
      } else {
        // Retrieve full session to ensure totals are present
        const full = await stripe.checkout.sessions.retrieve(session.id);
        const paid = full.payment_status === "paid";
        const totalCents = full.amount_total ?? null;
        const sessCurrency = (full.currency || "myr").toLowerCase();

        const { data: entry } = await supabase
          .from("entries")
          .select("id, category_id, payment_amount, payment_currency, payment_status")
          .eq("id", entryId)
          .maybeSingle();

        if (!entry) {
          console.warn("Webhook: entry not found", entryId);
        } else if (entry.payment_status === "paid") {
          // Already handled
        } else if (!paid || totalCents === null) {
          console.warn("Webhook: session not paid or missing amount_total", session.id);
          // Store reference only; do not mark paid
          await supabase
            .from("entries")
            .update({ payment_reference: session.id })
            .eq("id", entryId);
        } else {
          const expectedCents = Math.round(Number(entry.payment_amount ?? 0) * 100);
          const expectedCurrency = String(entry.payment_currency || "myr").toLowerCase();
          
          // Log for debugging
          console.log("Webhook: processing payment", {
            entryId,
            expectedCents,
            totalCents,
            expectedCurrency,
            sessCurrency,
            entryPaymentAmount: entry.payment_amount,
            entryPaymentCurrency: entry.payment_currency,
          });

          // For beta: allow currency mismatch if amount matches (handles legacy USD entries)
          // Also allow if entry has no payment_amount set yet (edge case)
          const amountMatches = expectedCents === 0 || totalCents === expectedCents;
          const currencyOk = sessCurrency === "myr"; // Accept MYR payments regardless of entry currency
          
          if (!amountMatches && expectedCents > 0) {
            console.warn("Webhook: amount mismatch - not marking as paid", {
              entryId,
              expectedCents,
              totalCents,
            });
            // Record the reference; do not mark as paid
            await supabase
              .from("entries")
              .update({ payment_reference: session.id })
              .eq("id", entryId);
          } else if (!currencyOk) {
            console.warn("Webhook: unexpected currency (not MYR)", { entryId, sessCurrency });
            await supabase
              .from("entries")
              .update({ payment_reference: session.id })
              .eq("id", entryId);
          } else {
            // Member-level paid update (idempotent)
            if (profileId) {
              console.log("Webhook: updating entry_members for", { entryId, profileId });
              const { error: memUpdateErr } = await supabase
                .from("entry_members")
                .update({
                  payment_status: "paid",
                  payment_reference: session.id,
                  payment_amount: totalCents / 100.0,
                  payment_currency: sessCurrency, // Use actual currency from Stripe
                  paid_at: new Date().toISOString(),
                })
                .eq("entry_id", entryId)
                .eq("profile_id", profileId)
                .in("payment_status", ["unpaid", "waived"]);
              
              if (memUpdateErr) {
                console.error("Webhook: failed to update entry_members", memUpdateErr);
              } else {
                console.log("Webhook: entry_members updated successfully");
              }

              // Check if team has minimum required paid members -> accept entry and mark entry as paid
              const { data: cat } = await supabase
                .from("tournament_categories")
                .select("members_per_team_min, members_per_team_max")
                .eq("id", entry.category_id)
                .maybeSingle();
              // Use minimum required members (default to 1 if not set)
              const minMembers = Number(cat?.members_per_team_min || 1);

              const { count: paidCount } = await supabase
                .from("entry_members")
                .select("profile_id", { count: "exact", head: true })
                .eq("entry_id", entryId)
                .eq("payment_status", "paid");

              console.log("Webhook: checking team completion", { entryId, minMembers, paidCount });

              if (minMembers && typeof paidCount === "number" && paidCount >= minMembers) {
                console.log("Webhook: team fully paid, marking entry as paid and accepted");
                const { error: entryPaidErr } = await supabase
                  .from("entries")
                  .update({ payment_status: "paid", paid_at: new Date().toISOString(), payment_reference: session.id })
                  .eq("id", entryId)
                  .in("payment_status", ["unpaid", "waived"]);
                if (entryPaidErr) console.error("Webhook: failed to mark entry paid", entryPaidErr);
                
                const { error: entryAcceptErr } = await supabase
                  .from("entries")
                  .update({ status: "accepted" })
                  .eq("id", entryId)
                  .eq("status", "pending");
                if (entryAcceptErr) console.error("Webhook: failed to accept entry", entryAcceptErr);
              } else {
                // Always store the latest reference
                console.log("Webhook: team not fully paid yet, storing reference");
                await supabase
                  .from("entries")
                  .update({ payment_reference: session.id })
                  .eq("id", entryId);
              }
            } else {
              // Fallback to entry-level update if no profile_id (legacy behavior)
              console.log("Webhook: no profile_id, using legacy entry-level update");
              const { error: legacyErr } = await supabase
                .from("entries")
                .update({ payment_status: "paid", paid_at: new Date().toISOString(), payment_reference: session.id })
                .eq("id", entryId)
                .in("payment_status", ["unpaid", "waived"]);
              if (legacyErr) console.error("Webhook: legacy update failed", legacyErr);
              
              await supabase
                .from("entries")
                .update({ status: "accepted" })
                .eq("id", entryId)
                .eq("status", "pending");
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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
