// Creates a Stripe Checkout Session in subscription mode.
// Input: { plan_id: string, ghl_location_id: string }
// Output: { url } or { error }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { plan_id, ghl_location_id } = await req.json();
    if (!plan_id || !ghl_location_id) {
      return json({ error: "plan_id and ghl_location_id required" }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: plan, error: pErr } = await supa
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .maybeSingle();

    if (pErr || !plan) return json({ error: "Plan not found" }, 404);
    if (!plan.stripe_price_id) {
      return json(
        { error: "Plan not configured for purchase yet — admin must set Stripe price ID" },
        400,
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const origin = req.headers.get("origin") || "https://dispo.acquiredcrm.com";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      subscription_data: {
        metadata: {
          ghl_location_id,
          subscription_plan_id: plan.id,
          plan_name: plan.name,
        },
      },
      metadata: {
        ghl_location_id,
        subscription_plan_id: plan.id,
        plan_name: plan.name,
      },
      success_url: `${origin}/?subscription_purchased=1`,
      cancel_url: `${origin}/?subscription_cancelled=1`,
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error("create-subscription-checkout error", e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
