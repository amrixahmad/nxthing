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
          if (totalCents !== expectedCents || sessCurrency !== expectedCurrency) {
            console.warn("Webhook: amount/currency mismatch", {
              entryId,
              expectedCents,
              totalCents,
              expectedCurrency,
              sessCurrency,
            });
            // Record the reference; do not mark as paid
            await supabase
              .from("entries")
              .update({ payment_reference: session.id })
              .eq("id", entryId);
          } else {
            // Member-level paid update (idempotent)
            if (profileId) {
              await supabase
                .from("entry_members")
                .update({
                  payment_status: "paid",
                  payment_reference: session.id,
                  payment_amount: expectedCents / 100.0,
                  payment_currency: expectedCurrency,
                  paid_at: new Date().toISOString(),
                })
                .eq("entry_id", entryId)
                .eq("profile_id", profileId)
                .in("payment_status", ["unpaid", "waived"]);

              // Check if team is fully paid -> accept entry and mark entry as paid
              const { data: cat } = await supabase
                .from("tournament_categories")
                .select("members_per_team_max")
                .eq("id", entry.category_id)
                .maybeSingle();
              const maxMembers = Number(cat?.members_per_team_max || 1);

              const { count: paidCount } = await supabase
                .from("entry_members")
                .select("profile_id", { count: "exact", head: true })
                .eq("entry_id", entryId)
                .eq("payment_status", "paid");

              if (maxMembers && typeof paidCount === "number" && paidCount >= maxMembers) {
                await supabase
                  .from("entries")
                  .update({ payment_status: "paid", paid_at: new Date().toISOString(), payment_reference: session.id })
                  .eq("id", entryId)
                  .in("payment_status", ["unpaid", "waived"]);
                await supabase
                  .from("entries")
                  .update({ status: "accepted" })
                  .eq("id", entryId)
                  .eq("status", "pending");
              } else {
                // Always store the latest reference
                await supabase
                  .from("entries")
                  .update({ payment_reference: session.id })
                  .eq("id", entryId);
              }
            } else {
              // Fallback to entry-level update if no profile_id (legacy behavior)
              await supabase
                .from("entries")
                .update({ payment_status: "paid", paid_at: new Date().toISOString(), payment_reference: session.id })
                .eq("id", entryId)
                .in("payment_status", ["unpaid", "waived"]);
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
