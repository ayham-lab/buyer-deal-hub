# Make Admin Page Fully Working

## Problem

`admin@citiflip.com` has the admin role in the database, but:
1. The sidebar Admin link only appears after roles load — and `useAuth` never re-fetches on token refresh, so a session that pre-dated the role grant won't see it without signing out.
2. The Admin link is just a tiny entry mixed into the regular nav — easy to miss.
3. The Admin page itself is light: no tabs, no search, no per-user drill-in, no role management, no date filters.

## Plan

### 1. Make admin status reliable (`src/hooks/useAuth.tsx`)
- Re-run `loadProfile` (which fetches roles) on `TOKEN_REFRESHED` and `USER_UPDATED` events, not just `SIGNED_IN`.
- Also re-fetch when the tab regains focus, so a freshly granted role appears without sign-out.
- Expose a `refreshRoles()` method on the context for manual refresh from the Admin page after promote/demote actions.

### 2. Make Admin obvious in the UI
- **Sidebar (`src/components/layout/Sidebar.tsx`)**: render a divider + small "ADMIN" label above the Admin link, swap to a filled Shield icon, and add a subtle accent color so it stands out from regular nav.
- **Header (`src/components/layout/AppLayout.tsx`)**: when `isAdmin`, show a small "Admin" pill button in the top-right next to the user menu, visible from every page (works even when sidebar is collapsed).

### 3. Rebuild `src/pages/Admin.tsx` as a real admin console

Tabbed layout using existing shadcn `Tabs`:

```text
┌──────────────────────────────────────────────────────────┐
│ Admin Console                                            │
│ [Overview] [Users] [Deals] [Buyers] [Archive] [Roles]    │
├──────────────────────────────────────────────────────────┤
│  <date range>   <state filter>   <status filter>         │
│  ──────────────────────────────────────────────────────  │
│  ...tab content...                                       │
└──────────────────────────────────────────────────────────┘
```

**Overview tab**
- Stat tiles: Total Users, Active Subs, Total Deals, Closed Deals, Revenue Tracked, Archive Buyers.
- Mini-charts: deals per month (last 12), revenue per month, top 5 lead sources.
- Deals-by-state grid (kept from current page).

**Users tab**
- Search by name/email, filter by subscription status.
- Columns: Name, Email, GHL Location, Subscription, Deals, Buyers, Last Active, Actions.
- Row click → opens a side drawer with: full profile, subscription controls, that user's deals list, that user's buyers, KPI snapshot for current month.
- Bulk actions: set subscription Active / Cancelled / Trialing.

**Deals tab**
- Cross-tenant deals table with search (address), state filter, status filter, date range.
- Columns: Owner, Address, Status, Asking, Assignment Fee, Created, Closed.
- Click → opens read-only deal detail panel.

**Buyers tab**
- Cross-tenant buyers (using existing admin SELECT policy on `buyers`).
- Search by name/email/market, filter by buyer status.
- Counts per user.

**Archive tab**
- Full `buyer_archive` browser with search, market filter, source filter.
- Inline delete (admin-only, allowed by existing RLS).

**Roles tab**
- List all users with their roles.
- Promote to admin / demote to user buttons (insert/delete in `user_roles`).
- Confirmation dialog before demoting yourself (prevent lockout).
- After change, calls `refreshRoles()` so the change reflects immediately.

### 4. Verification
- Sign out and back in as `admin@citiflip.com`.
- Confirm the Admin pill appears in the header and the sidebar shows the Admin section.
- Open `/admin`, verify each tab loads data, search/filters work, and promoting a test user updates instantly.

## Technical notes

- All cross-tenant reads already work because existing RLS policies on `profiles`, `deals`, `buyers`, `buyer_archive`, `user_roles`, `tasks`, `kpi_snapshots`, `jv_partners` all include an `is_admin(auth.uid())` clause. **No migrations required.**
- Role mutations use `supabase.from('user_roles').insert/delete` — allowed by the existing "Roles: admin manage" policy.
- Self-demotion guard is client-side only (RLS allows it); we add a confirm dialog to avoid accidental lockout.
- Date-range filtering reuses the same custom range pattern from the KPI page.
- New components: `src/components/admin/UserDrawer.tsx`, `src/components/admin/RoleManager.tsx`. Page split into per-tab subcomponents inside `src/pages/Admin.tsx` to keep file readable.