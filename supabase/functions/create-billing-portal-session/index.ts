// Creates a Stripe Billing Portal session for the active GHL location's customer.
// Input: { ghl_location_id: string }
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
    const { ghl_location_id } = await req.json();
    if (!ghl_location_id) {
      return json({ error: "ghl_location_id required" }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: sub } = await supa
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("ghl_location_id", ghl_location_id)
      .maybeSingle();

    if (!sub?.stripe_customer_id) {
      return json({ error: "No subscription / customer found for this location" }, 404);
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-06-20",
    });

    const origin = req.headers.get("origin") || "https://dispo.acquiredcrm.com";
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/settings?tab=billing`,
    });

    return json({ url: session.url });
  } catch (e: any) {
    console.error("create-billing-portal-session error", e);
    return json({ error: e?.message ?? "unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
