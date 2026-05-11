// Creates a Stripe Checkout Session for purchasing a credit pack.
// Input: { pack_id: string, ghl_location_id: string }
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
    const { pack_id, ghl_location_id } = await req.json();
    if (!pack_id || !ghl_location_id) {
      return json({ error: "pack_id and ghl_location_id required" }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: pack, error: pErr } = await supa
      .from("credit_packs")
      .select("*")
      .eq("id", pack_id)
      .eq("is_active", true)
      .maybeSingle();

    if (pErr || !pack) return json({ error: "Pack not found" }, 404);
    if (!pack.stripe_price_id) {
      return json(
        { error: "Pack not configured for purchase yet — admin must set Stripe price ID" },
        400,
      );
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const origin = req.headers.get("origin") || "https://dispo.acquiredcrm.com";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: pack.stripe_price_id, quantity: 1 }],
      metadata: {
        ghl_location_id,
        pack_id: pack.id,
        credits: String(pack.credits),
        pack_name: pack.name,
      },
      success_url: `${origin}/?credits_purchased=1`,
      cancel_url: `${origin}/?credits_cancelled=1`,
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error("create-credit-checkout error", e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
