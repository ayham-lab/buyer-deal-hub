// Fetch a GHL contact and format their address.
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export interface ContactAddressResult {
  formatted: string | null;
  source: "ok" | "no_address" | "fetch_failed";
  detail?: string;
  contact?: any;
}

export function formatContactAddress(contact: any): string | null {
  if (!contact || typeof contact !== "object") return null;
  const a1 = (contact.address1 ?? contact.address ?? "").toString().trim();
  const city = (contact.city ?? "").toString().trim();
  const state = (contact.state ?? "").toString().trim();
  const postal = (contact.postalCode ?? contact.postal_code ?? contact.zip ?? "").toString().trim();
  const stateZip = [state, postal].filter(Boolean).join(" ");
  const parts = [a1, city, stateZip].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

export async function fetchContactAddress(
  contactId: string,
  pitToken: string,
): Promise<ContactAddressResult> {
  const url = `${GHL_BASE}/contacts/${encodeURIComponent(contactId)}`;
  const headers = {
    Authorization: `Bearer ${pitToken}`,
    Accept: "application/json",
    Version: GHL_API_VERSION,
  };
  const backoffs = [1500, 3000, 4500, 6000, 7500];
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      const text = await resp.text();
      if (resp.status === 429) {
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
        continue;
      }
      if (!resp.ok) {
        return { formatted: null, source: "fetch_failed", detail: `${resp.status}: ${text.slice(0, 200)}` };
      }
      let j: any;
      try { j = JSON.parse(text); } catch { return { formatted: null, source: "fetch_failed", detail: "bad_json" }; }
      const c = j.contact ?? j;
      const formatted = formatContactAddress(c);
      return formatted ? { formatted, source: "ok", contact: c } : { formatted: null, source: "no_address", contact: c };
    } catch (e: any) {
      return { formatted: null, source: "fetch_failed", detail: e?.message ?? "err" };
    }
  }
  return { formatted: null, source: "fetch_failed", detail: "429_after_retries" };
}

export async function fetchOpportunity(
  opportunityId: string,
  bearer: string,
): Promise<{ ok: true; opportunity: any } | { ok: false; detail: string }> {
  const url = `${GHL_BASE}/opportunities/${encodeURIComponent(opportunityId)}`;
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json",
        Version: GHL_API_VERSION,
      },
    });
    const text = await resp.text();
    if (!resp.ok) return { ok: false, detail: `${resp.status}: ${text.slice(0, 200)}` };
    const j = JSON.parse(text);
    return { ok: true, opportunity: j.opportunity ?? j };
  } catch (e: any) {
    return { ok: false, detail: e?.message ?? "err" };
  }
}
