// Guarantees an installed GHL location never ends up with ZERO
// location_memberships rows ("orphan" locations).
//
// ROOT CAUSE this fixes: both install paths (oauth-marketplace-callback and
// sync-ghl-sub-accounts) asked GHL for the account-level admin of the
// sub-account. For agency templates / agency-managed sub-accounts GHL returns
// no `roles.type === 'account' && role === 'admin'` user, so the code queued a
// manual review row and returned WITHOUT creating any membership. The location
// then existed in ghl_location_tokens but was invisible to every user in the
// app (including super_admins) because all listing paths filter by
// location_memberships. 26 locations accumulated this way.
//
// Fix: when GHL ownership can't be resolved, we still assign a *custodian*
// membership to the agency fallback owner, and keep the manual review row so a
// human can reassign later.
//
// Custodian selection (deterministic):
//   1. super_admin with the most existing memberships for locations of the
//      same ghl_company_id.
//   2. else: any super_admin with the most memberships overall.
//   3. else: null (nothing we can do — manual review only).

export async function resolveCustodianUserId(
  admin: any,
  companyId: string | null,
): Promise<string | null> {
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "super_admin");
  const supers: string[] = [...new Set((roleRows ?? []).map((r: any) => r.user_id))];
  if (supers.length === 0) return null;
  if (supers.length === 1) return supers[0];

  let companyLocations: string[] = [];
  if (companyId) {
    const { data: toks } = await admin
      .from("ghl_location_tokens")
      .select("ghl_location_id")
      .eq("ghl_company_id", companyId);
    companyLocations = (toks ?? []).map((t: any) => t.ghl_location_id).filter(Boolean);
  }

  const score = async (scopeToCompany: boolean) => {
    let q = admin.from("location_memberships").select("user_id, location_id").in("user_id", supers);
    if (scopeToCompany && companyLocations.length > 0) q = q.in("location_id", companyLocations);
    const { data } = await q;
    const counts = new Map<string, number>();
    (data ?? []).forEach((m: any) => counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1));
    let best: string | null = null;
    for (const u of supers) {
      const c = counts.get(u) ?? 0;
      if (c > 0 && (best === null || c > (counts.get(best) ?? 0))) best = u;
    }
    return best;
  };

  return (await score(true)) ?? (await score(false)) ?? supers[0];
}

/** Create a custodian owner membership so the location is never orphaned. */
export async function assignCustodianMembership(
  admin: any,
  locationId: string,
  companyId: string | null,
  executedBy: string,
  reason: string,
): Promise<string | null> {
  const custodian = await resolveCustodianUserId(admin, companyId);
  if (!custodian) return null;
  const { error } = await admin.from("location_memberships").upsert(
    { location_id: locationId, user_id: custodian, role: "owner", is_owner: true },
    { onConflict: "location_id,user_id" },
  );
  if (error) {
    console.error("assignCustodianMembership failed", { locationId, error: error.message });
    return null;
  }
  await admin.from("ownership_audit_log").insert({
    location_id: locationId,
    action: "insert",
    new_owner_user_id: custodian,
    executed_by: executedBy,
    detail: { source: "agency_fallback_super_admin", reason },
  });
  return custodian;
}
