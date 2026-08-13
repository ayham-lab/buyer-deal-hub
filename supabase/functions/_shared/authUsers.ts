// Shared auth.users lookup by email.
//
// Paginates properly: a single listUsers({ page: 1, perPage: 200 }) silently
// stops at 200 accounts, after which an existing user is never found — callers
// then either create a duplicate or 500 on GoTrue's unique-email constraint.

export async function findAuthUserIdByEmail(
  admin: any,
  email: string,
  maxPages = 20,
): Promise<string | null> {
  const lower = email.toLowerCase();
  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u: any) => u.email?.toLowerCase() === lower);
    if (hit) return hit.id;
    if (users.length < 200) return null; // last page
  }
  return null;
}
