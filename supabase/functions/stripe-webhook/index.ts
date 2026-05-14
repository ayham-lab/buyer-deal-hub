// Stripe webhook handler. Handles credit pack purchases (checkout.session.completed)
// and subscription lifecycle events (created/updated/deleted) for the Unlimited plan.
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

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    switch (event.type) {
      case "checkout.session.completed":
        return await handleCheckoutCompleted(event, supa);
      case "customer.subscription.created":
      case "customer.subscription.updated":
        return await handleSubscriptionUpsert(event, supa);
      case "customer.subscription.deleted":
        return await handleSubscriptionDeleted(event, supa);
      default:
        return new Response("ignored", { status: 200 });
    }
  } catch (e: any) {
    console.error("webhook handler error", event.type, e);
    return new Response("handler error", { status: 500 });
  }
});

async function handleCheckoutCompleted(event: Stripe.Event, supa: any) {
  const session = event.data.object as Stripe.Checkout.Session;
  const md = session.metadata || {};
  const ghl_location_id = md.ghl_location_id;

  // Subscription checkout — subscription.created event will populate the row.
  if (session.mode === "subscription") {
    return new Response("ok (subscription checkout)", { status: 200 });
  }

  const credits = Number(md.credits || 0);
  const pack_name = md.pack_name || "Credit pack";
  if (!ghl_location_id || !credits) {
    return new Response("Missing metadata", { status: 200 });
  }

  // Idempotency
  const { data: existing } = await supa
    .from("credit_transactions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) return new Response("already processed", { status: 200 });

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
}

async function handleSubscriptionUpsert(event: Stripe.Event, supa: any) {
  const sub = event.data.object as Stripe.Subscription;
  const ghl_location_id = (sub.metadata || {}).ghl_location_id;
  const subscription_plan_id = (sub.metadata || {}).subscription_plan_id || null;
  if (!ghl_location_id) {
    console.error("subscription missing ghl_location_id metadata", sub.id);
    return new Response("missing metadata", { status: 200 });
  }

  const period_end = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const payload: any = {
    ghl_location_id,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    subscription_status: sub.status, // active, trialing, past_due, canceled, etc.
    current_period_end: period_end,
    updated_at: new Date().toISOString(),
  };
  if (subscription_plan_id) payload.subscription_plan_id = subscription_plan_id;

  const { error } = await supa
    .from("subscriptions")
    .upsert(payload, { onConflict: "ghl_location_id" });
  if (error) {
    console.error("subscription upsert failed", error);
    return new Response("db error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}

async function handleSubscriptionDeleted(event: Stripe.Event, supa: any) {
  const sub = event.data.object as Stripe.Subscription;
  const { error } = await supa
    .from("subscriptions")
    .update({
      subscription_status: "canceled",
      current_period_end: null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id);
  if (error) {
    console.error("subscription delete failed", error);
    return new Response("db error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
