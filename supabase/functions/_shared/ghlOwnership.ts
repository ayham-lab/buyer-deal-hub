// Shared helper: resolve the GHL "true" admin for a sub-account using the
// agency Private Integration Token (GHL_AGENCY_PIT_TOKEN). Encapsulates the
// same tiebreak rule used by the audit:
//   1. roles.type === 'account' && roles.role === 'admin'
//   2. oldest by dateAdded/createdAt
//   3. fallback: dedicated to only this location
// Also provides `provisionAuthUserByEmail` for lazy-creating auth.users +
// profile rows for off-platform admins.

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export type GhlAdminVerdict =
  | { verdict: "admin"; user: GhlUser }
  | { verdict: "no_admin" }
  | { verdict: "unresolved"; admins: GhlUser[] }
  | { verdict: "fetch_failed"; detail: string };

export interface GhlUser {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  roles?: { type?: string; role?: string; locationIds?: string[] };
  type?: string;
  role?: string;
  locationIds?: string[];
  dateAdded?: string;
  createdAt?: string;
  created_at?: string;
}

export async function resolveGhlAdminForLocation(
  companyId: string,
  locationId: string,
): Promise<GhlAdminVerdict> {
  const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN");
  if (!pit) return { verdict: "fetch_failed", detail: "missing_pit_token" };
  try {
    const r = await fetch(
      `${GHL_BASE}/users/search?companyId=${encodeURIComponent(companyId)}&locationId=${encodeURIComponent(locationId)}`,
      {
        headers: { Authorization: `Bearer ${pit}`, Version: GHL_VERSION, Accept: "application/json" },
      },
    );
    const txt = await r.text();
    if (!r.ok) return { verdict: "fetch_failed", detail: `${r.status}: ${txt.slice(0, 200)}` };
    const j = JSON.parse(txt);
    const users: GhlUser[] = j?.users ?? j?.data ?? [];
    const admins = users.filter((u) => {
      const t = u?.roles?.type ?? u?.type;
      const role = u?.roles?.role ?? u?.role;
      return t === "account" && role === "admin";
    });
    if (admins.length === 0) return { verdict: "no_admin" };
    if (admins.length === 1) return { verdict: "admin", user: admins[0] };
    const ts = (u: GhlUser) => {
      const v = u?.dateAdded ?? u?.createdAt ?? u?.created_at ?? null;
      return v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...admins].sort((a, b) => ts(a) - ts(b));
    if (ts(sorted[0]) < ts(sorted[1])) return { verdict: "admin", user: sorted[0] };
    const dedicated = admins.filter((u) => {
      const list = u?.roles?.locationIds ?? u?.locationIds ?? [];
      return Array.isArray(list) && list.length === 1 && list[0] === locationId;
    });
    if (dedicated.length === 1) return { verdict: "admin", user: dedicated[0] };
    return { verdict: "unresolved", admins };
  } catch (e: any) {
    return { verdict: "fetch_failed", detail: `threw: ${e?.message ?? "err"}` };
  }
}

export function ghlUserDisplayName(u: GhlUser): string | null {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || null;
}

// Find or create an auth.users row by email and ensure a profile exists.
// Returns null if no email provided or auth create fails.
export async function provisionAuthUserByEmail(
  admin: any,
  email: string | null | undefined,
  name?: string | null,
  ghlUserId?: string | null,
): Promise<string | null> {
  if (!email) return null;
  const lower = email.toLowerCase();
  // 1) Match an existing profile by email.
  const { data: existingProf } = await admin
    .from("profiles")
    .select("user_id")
    .ilike("email", lower)
    .maybeSingle();
  if (existingProf?.user_id) return existingProf.user_id as string;

  // 2) Match an existing auth user (paginate up to 5 pages).
  let userId: string | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = list?.users?.find((u: any) => u.email?.toLowerCase() === lower);
    if (found) { userId = found.id; break; }
    if (!list?.users?.length || list.users.length < 200) break;
  }
  // 3) Create the auth user if still missing.
  if (!userId) {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: lower,
      email_confirm: true,
      user_metadata: { name: name ?? lower, source: "ghl_ownership_autoprov" },
    });
    if (createErr || !created?.user) return null;
    userId = created.user.id;
  }
  // 4) Ensure profile row.
  await admin.from("profiles").upsert(
    { user_id: userId, email: lower, name: name ?? lower, ghl_user_id: ghlUserId ?? null },
    { onConflict: "user_id" },
  );
  return userId;
}
