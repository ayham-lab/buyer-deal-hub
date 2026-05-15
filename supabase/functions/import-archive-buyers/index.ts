// Bulk import archive buyers with email/phone dedup-merge.
// Super-admin only. Accepts up to 1000 normalized rows per call.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InRow {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_2?: string | null;
  city?: string | null;
  state?: string | null;
  preferred_markets?: string[];
  preferred_zips?: string[];
  property_types?: string[];
  price_min?: number | null;
  price_max?: number | null;
  budget_notes?: string | null;
  exit_strategy?: string | null;
  quality_tier?: string | null;
  last_outcome?: string | null;
  national?: boolean;
  completed_transaction?: boolean;
  notes?: string | null;
  source_tag?: string | null;
}

function uniq(a: string[]): string[] {
  return Array.from(new Set(a.filter(Boolean)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isSuper = (roles || []).some((r: any) => r.role === "super_admin");
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const rows: InRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ inserted: 0, merged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (rows.length > 1000) {
      return new Response(JSON.stringify({ error: "max 1000 rows per batch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-fetch existing matches for all emails+phones in this batch
    const emails = uniq(rows.map((r) => (r.email || "").toLowerCase()).filter(Boolean));
    const phones = uniq(rows.map((r) => (r.phone || "")).filter(Boolean));

    const existing: Array<{ id: string; email: string | null; phone: string | null; sources: any; preferred_markets: string[]; property_types: string[]; price_min: number | null; price_max: number | null }> = [];
    if (emails.length) {
      const { data } = await admin.from("archive_buyers")
        .select("id,email,phone,sources,preferred_markets,preferred_zips,property_types,price_min,price_max,notes,quality_tier,last_outcome,budget_notes,exit_strategy,national,completed_transaction")
        .in("email", emails);
      if (data) existing.push(...(data as any));
    }
    if (phones.length) {
      const { data } = await admin.from("archive_buyers")
        .select("id,email,phone,sources,preferred_markets,preferred_zips,property_types,price_min,price_max,notes,quality_tier,last_outcome,budget_notes,exit_strategy,national,completed_transaction")
        .in("phone", phones);
      if (data) {
        for (const row of data as any[]) {
          if (!existing.find((e) => e.id === row.id)) existing.push(row);
        }
      }
    }

    const byEmail = new Map<string, any>();
    const byPhone = new Map<string, any>();
    for (const e of existing) {
      if (e.email) byEmail.set(e.email.toLowerCase(), e);
      if (e.phone && (!e.email || e.email === "")) byPhone.set(e.phone, e);
      else if (e.phone && !byPhone.has(e.phone)) byPhone.set(e.phone, e);
    }

    let inserted = 0;
    let merged = 0;
    const toInsert: any[] = [];

    const batchEmail = new Map<string, number>();
    const batchPhone = new Map<string, number>();

    for (const r of rows) {
      const emailKey = (r.email || "").toLowerCase();
      const phoneKey = r.phone || "";
      const matchExisting = (emailKey && byEmail.get(emailKey)) || (phoneKey && byPhone.get(phoneKey)) || null;

      if (matchExisting) {
        const cur = matchExisting;
        const curSources: string[] = Array.isArray(cur.sources) ? cur.sources : [];
        const newSrc = r.source_tag ? [r.source_tag] : [];
        const sources = uniq([...curSources, ...newSrc]);
        const curZips: string[] = Array.isArray(cur.preferred_zips) ? cur.preferred_zips : [];
        const mergedNotes = [cur.notes, r.notes].filter(Boolean).join(" | ") || null;
        const update: any = {
          sources,
          preferred_markets: uniq([...(cur.preferred_markets || []), ...(r.preferred_markets || [])]),
          preferred_zips: uniq([...curZips, ...(r.preferred_zips || [])]),
          property_types: uniq([...(cur.property_types || []), ...(r.property_types || [])]),
          price_min: cur.price_min ?? r.price_min ?? null,
          price_max: cur.price_max ?? r.price_max ?? null,
          quality_tier: cur.quality_tier ?? r.quality_tier ?? null,
          last_outcome: r.last_outcome ?? cur.last_outcome ?? null,
          budget_notes: cur.budget_notes ?? r.budget_notes ?? null,
          exit_strategy: cur.exit_strategy ?? r.exit_strategy ?? null,
          national: cur.national || !!r.national,
          completed_transaction: cur.completed_transaction || !!r.completed_transaction,
          notes: mergedNotes,
          updated_at: new Date().toISOString(),
        };
        await admin.from("archive_buyers").update(update).eq("id", cur.id);
        merged += 1;
        continue;
      }

      if (emailKey && batchEmail.has(emailKey)) {
        const idx = batchEmail.get(emailKey)!;
        toInsert[idx].preferred_markets = uniq([...toInsert[idx].preferred_markets, ...(r.preferred_markets || [])]);
        toInsert[idx].preferred_zips = uniq([...toInsert[idx].preferred_zips, ...(r.preferred_zips || [])]);
        toInsert[idx].property_types = uniq([...toInsert[idx].property_types, ...(r.property_types || [])]);
        merged += 1;
        continue;
      }
      if (!emailKey && phoneKey && batchPhone.has(phoneKey)) {
        const idx = batchPhone.get(phoneKey)!;
        toInsert[idx].preferred_markets = uniq([...toInsert[idx].preferred_markets, ...(r.preferred_markets || [])]);
        toInsert[idx].preferred_zips = uniq([...toInsert[idx].preferred_zips, ...(r.preferred_zips || [])]);
        toInsert[idx].property_types = uniq([...toInsert[idx].property_types, ...(r.property_types || [])]);
        merged += 1;
        continue;
      }

      const newRow = {
        first_name: r.first_name || null,
        last_name: r.last_name || null,
        full_name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || null,
        email: r.email || null,
        phone: r.phone || null,
        phone_2: r.phone_2 || null,
        city: r.city || null,
        state: r.state || null,
        preferred_markets: r.preferred_markets || [],
        preferred_zips: r.preferred_zips || [],
        property_types: r.property_types || [],
        price_min: r.price_min ?? null,
        price_max: r.price_max ?? null,
        budget_notes: r.budget_notes || null,
        exit_strategy: r.exit_strategy || null,
        quality_tier: r.quality_tier || null,
        last_outcome: r.last_outcome || null,
        national: !!r.national,
        completed_transaction: !!r.completed_transaction,
        notes: r.notes || null,
        sources: r.source_tag ? [r.source_tag] : [],
        is_active: true,
      };
      const idx = toInsert.length;
      toInsert.push(newRow);
      if (emailKey) batchEmail.set(emailKey, idx);
      if (phoneKey) batchPhone.set(phoneKey, idx);
    }

    if (toInsert.length) {
      const { error } = await admin.from("archive_buyers").insert(toInsert);
      if (error) {
        return new Response(JSON.stringify({ error: error.message, inserted, merged }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      inserted = toInsert.length;
    }

    return new Response(JSON.stringify({ inserted, merged }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
