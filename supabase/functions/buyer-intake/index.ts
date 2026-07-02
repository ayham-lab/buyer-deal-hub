// Public buyer intake endpoint.
// - GET  /buyer-intake?token=... -> returns { location_id, workspace_name, is_active }
// - POST /buyer-intake            -> body includes { token, ...buyer fields } (or ?token=)
//   Accepts flat fields OR GHL webhook contact payloads (with customData / customFields).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function asArray(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Flatten a possibly-GHL payload into a normalized buyer object.
function normalize(body: any) {
  const cf = { ...(body?.customData ?? {}), ...(body?.customFields ?? {}) };
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = body?.[k] ?? cf?.[k];
      if (v != null && v !== "") return v;
    }
    return null;
  };

  const first_name = pick("first_name", "firstName", "firstname");
  const last_name = pick("last_name", "lastName", "lastname");
  const full = pick("name", "full_name", "fullName") ||
    [first_name, last_name].filter(Boolean).join(" ").trim() ||
    pick("email") ||
    "Unnamed buyer";

  return {
    first_name: first_name ? String(first_name) : null,
    last_name: last_name ? String(last_name) : null,
    name: String(full),
    email: pick("email") ? String(pick("email")).trim().toLowerCase() : null,
    phone: pick("phone", "phone_number", "phoneNumber") ? String(pick("phone", "phone_number", "phoneNumber")).trim() : null,
    company_name: pick("company_name", "company", "companyName") ? String(pick("company_name", "company", "companyName")) : null,
    markets: asArray(pick("markets", "preferred_markets", "cities")),
    property_types: asArray(pick("property_types", "propertyTypes", "asset_types")),
    buyer_types: asArray(pick("buyer_types", "buyerTypes")),
    buyer_frequency: asArray(pick("buyer_frequency", "frequency")),
    price_min: toNum(pick("price_min", "min_price", "budget_min")),
    price_max: toNum(pick("price_max", "max_price", "budget_max")),
    criteria_notes: pick("criteria_notes", "notes", "criteria") ? String(pick("criteria_notes", "notes", "criteria")) : null,
    previous_deals: pick("previous_deals", "previousDeals") ? String(pick("previous_deals", "previousDeals")) : null,
    experience: pick("experience") ? String(pick("experience")) : null,
    source: pick("source") ? String(pick("source")) : null,
  };
}

async function resolveToken(token: string) {
  if (!token) return null;
  const { data } = await admin
    .from("buyer_intake_tokens")
    .select("ghl_location_id, workspace_owner_user_id, is_active")
    .eq("token", token)
    .maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") ?? "";

  try {
    if (req.method === "GET") {
      const t = await resolveToken(queryToken);
      if (!t || !t.is_active) return json({ error: "invalid_token" }, 404);
      const { data: prof } = await admin
        .from("profiles")
        .select("name, email")
        .eq("user_id", t.workspace_owner_user_id)
        .maybeSingle();
      return json({
        location_id: t.ghl_location_id,
        workspace_name: prof?.name || prof?.email || "Workspace",
        is_active: t.is_active,
      });
    }

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? queryToken ?? "").trim();
    const t = await resolveToken(token);
    if (!t || !t.is_active) return json({ error: "invalid_token" }, 401);

    const b = normalize(body);
    if (!b.email && !b.phone) {
      return json({ error: "missing_contact", message: "email or phone required" }, 400);
    }

    // Dedup within workspace by email OR phone.
    const orParts: string[] = [];
    if (b.email) orParts.push(`email.eq.${b.email}`);
    if (b.phone) orParts.push(`phone.eq.${b.phone}`);
    const { data: existing } = await admin
      .from("buyers")
      .select("id")
      .eq("ghl_location_id", t.ghl_location_id)
      .or(orParts.join(","))
      .limit(1)
      .maybeSingle();

    const payload = {
      ...b,
      user_id: t.workspace_owner_user_id,
      ghl_location_id: t.ghl_location_id,
      source: b.source ?? "intake_webhook",
    };

    let buyerId: string | null = null;
    if (existing?.id) {
      // Merge non-empty fields only.
      const update: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v == null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === "string" && v.trim() === "") continue;
        if (k === "user_id" || k === "ghl_location_id") continue;
        update[k] = v;
      }
      const { error } = await admin.from("buyers").update(update).eq("id", existing.id);
      if (error) throw error;
      buyerId = existing.id;
    } else {
      const { data, error } = await admin
        .from("buyers")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      buyerId = data.id;
    }

    return json({ success: true, buyer_id: buyerId, updated: !!existing });
  } catch (e) {
    console.error("buyer-intake error", e);
    return json({ error: "server_error", message: String((e as Error).message ?? e) }, 500);
  }
});
