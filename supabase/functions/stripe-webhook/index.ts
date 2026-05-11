// Stripe webhook handler. Credits the GHL location's balance when a checkout
// session for a credit pack completes. Verifies the Stripe signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  const whSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sk = Deno.env.get("STRIPE_SECRET_KEY");
  if (!sig || !whSecret || !sk) {
    return new Response("Missing config", { status: 500 });
  }

  const body = await req.text();
  const stripe = new Stripe(sk, { apiVersion: "2024-06-20" });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, whSecret);
  } catch (e: any) {
    console.error("Signature verification failed", e?.message);
    return new Response(`Webhook Error: ${e?.message}`, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const md = session.metadata || {};
  const ghl_location_id = md.ghl_location_id;
  const credits = Number(md.credits || 0);
  const pack_name = md.pack_name || "Credit pack";
  if (!ghl_location_id || !credits) {
    return new Response("Missing metadata", { status: 200 });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Idempotency: skip if we've already recorded this session.
  const { data: existing } = await supa
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return new Response("already processed", { status: 200 });

  // Upsert balance: load → update or insert.
  const { data: row } = await supa
    .from("credit_balances")
    .select("balance")
    .eq("ghl_location_id", ghl_location_id)
    .maybeSingle();

  if (row) {
    const { error } = await supa
      .from("credit_balances")
      .update({ balance: (row.balance || 0) + credits })
      .eq("ghl_location_id", ghl_location_id);
    if (error) {
      console.error("balance update failed", error);
      return new Response("db error", { status: 500 });
    }
  } else {
    const { error } = await supa
      .from("credit_balances")
      .insert({ ghl_location_id, balance: credits });
    if (error) {
      console.error("balance insert failed", error);
      return new Response("db error", { status: 500 });
    }
  }

  await supa.from("credit_transactions").insert({
    ghl_location_id,
    delta: credits,
    stripe_session_id: session.id,
    description: `Purchase: ${pack_name}`,
  });

  return new Response("ok", { status: 200 });
});
