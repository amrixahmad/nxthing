import { createClient } from "npm:@supabase/supabase-js@^2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Category = {
  id: number;
  tournament_id: number;
  registration_fee: number | null;
};

type Body = {
  category_id?: number | string;
  count?: number | string;
  created_by?: string | null;
  dev_secret?: string | null;
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

    const allow = Deno.env.get("ALLOW_DEV_SEED");
    if (allow !== "true") {
      return new Response(JSON.stringify({ error: "Seeding disabled" }), {
        status: 403,
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

    const body = (await req.json().catch(() => ({}))) as Body;
    const categoryId = Number(body.category_id || 0);
    let count = Number(body.count || 16);
    const createdBy = (body.created_by ?? null) as string | null;

    if (!categoryId) {
      return new Response(JSON.stringify({ error: "category_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Number.isFinite(count) || count < 2) count = 2;
    if (count > 128) count = 128;

    const { data: cat, error: catErr } = await supabase
      .from("tournament_categories")
      .select("id,tournament_id,registration_fee")
      .eq("id", categoryId)
      .maybeSingle();
    if (catErr || !cat) {
      return new Response(JSON.stringify({ error: "Category not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fee = (cat as Category).registration_fee ?? 0;

    const rows = Array.from({ length: count }, () => ({
      category_id: categoryId,
      created_by: createdBy ?? null,
      payment_currency: "myr",
      payment_amount: fee,
      payment_status: "paid",
      payment_reference: "dev_seed",
      paid_at: new Date().toISOString(),
      status: "accepted",
    }));

    const { error: insErr, count: inserted } = await supabase
      .from("entries")
      .insert(rows, { count: "exact" });
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message || "Insert failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, inserted: inserted || rows.length }), {
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
