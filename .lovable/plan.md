# Plan: GHL Marketplace OAuth + Multi-Account Support + Production Hardening

## Context recap

- This app will be installed inside GHL as a marketplace app (iframe / external auth).
- One Dispo CRM workspace can be connected to **up to 10 GHL locations (sub-accounts)**. All users on a connected GHL location should be able to see the CRM data for that workspace.
- GHL is the OAuth **client**; this app is the OAuth **provider**. Lifetime: as long as user is logged into GHL they can access.
- After OAuth: also do Security Scan + RLS audit, Settings page, CSV export, Error boundaries.

---

## Part 1 — GHL OAuth Provider

### 1a. Database (migration)

Three new tables, all RLS-locked to service-role only (edge functions use service key):

- `oauth_clients` — pre-seeded with one row for GHL
  - `id` uuid pk, `client_id` text unique, `client_secret_hash` text, `name` text, `redirect_uris` text[], `scopes` text[], `created_at`
- `oauth_authorization_codes`
  - `code` text pk, `client_id` text, `user_id` uuid, `redirect_uri` text, `scope` text, `expires_at` timestamptz, `used` bool default false
- `oauth_access_tokens`
  - `access_token` text pk, `refresh_token` text unique, `client_id` text, `user_id` uuid, `scope` text, `expires_at`, `created_at`

Plus a **link table for multi-location**:
- `ghl_location_links`
  - `id` uuid pk, `workspace_owner_user_id` uuid (the CRM account that owns the data), `ghl_location_id` text unique, `linked_by_user_id` uuid, `linked_at`
  - Index on `ghl_location_id`. RLS: workspace owner + admin can read; insert via edge function.

The migration will also **generate the GHL client_id + a 48-char client_secret**, store the bcrypt/sha256 hash, and `RAISE NOTICE` the plaintext secret once so it appears in the migration output. (Plaintext is never stored.)

### 1b. Edge functions

Three new functions (all `verify_jwt = false`, validate in code):

1. **`oauth-authorize`** (GET)
   - Params: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`
   - Validates `client_id` + `redirect_uri` against `oauth_clients.redirect_uris`
   - Redirects browser to `/oauth/consent?client_id=…&redirect_uri=…&scope=…&state=…`

2. **`oauth-token`** (POST, form-encoded)
   - Grant types: `authorization_code` and `refresh_token`
   - Validates `client_id` + `client_secret` (compares hash)
   - For `authorization_code`: looks up code, checks not-used + not-expired, marks used, issues access_token (1h) + refresh_token (90d)
   - For `refresh_token`: rotates and issues new pair
   - Returns `{ access_token, token_type: "Bearer", expires_in, refresh_token, scope }`

3. **`oauth-userinfo`** (GET)
   - Bearer access_token → returns `{ sub, email, name, ghl_locations: [...] }`

### 1c. Frontend pages

- **`src/pages/OAuthConsent.tsx`** at `/oauth/consent`
  - If not logged in → redirect to `/login?next=<current-url>`
  - Shows: "GoHighLevel wants to access your Dispo CRM" + scopes
  - Approve → calls a small edge function `oauth-issue-code` (or inline endpoint) that creates an authorization code and redirects to GHL's `redirect_uri?code=…&state=…`
  - Deny → redirect with `?error=access_denied`

- **`src/pages/Login.tsx`** — honor `?next=` query param after successful login (instead of always going to `/buyers`).

### 1d. Multi-location linking flow

When a GHL user installs the app on a sub-account and goes through OAuth:
- The `oauth-userinfo` response (called by GHL) includes the `ghl_location_id` from the SSO payload
- An edge function `link-ghl-location` (called from the consent page on approve) creates a row in `ghl_location_links` mapping that `ghl_location_id` → the current logged-in user's workspace
- A user can link up to 10 locations. Settings page shows linked locations with "Disconnect" button.

### 1e. What you'll need to do in GHL after I deploy

1. I'll show you the generated **Client ID** and **Client Secret** (secret shown once — copy immediately).
2. In the GHL marketplace app form paste:
   - **Client ID**: `<generated>`
   - **Client Secret**: `<generated>`
   - **Authorization URL**: `https://ihvqhjrrahgyunmfvtrp.supabase.co/functions/v1/oauth-authorize`
   - **Token URL**: `https://ihvqhjrrahgyunmfvtrp.supabase.co/functions/v1/oauth-token`
   - **Scope**: `read write`
   - **Redirect URL**: already set to the GHL callback you provided
3. Save → install on a test sub-account → verify the consent screen appears → verify you land back in GHL.

---

## Part 2 — Security Scan + RLS Audit

- Run `security--run_security_scan` and `supabase--linter`
- Fix anything critical (likely items: enable HIBP password check, review profiles RLS for cross-location reads once multi-location is in)
- Update security memory with rationale for any ignored findings

---

## Part 3 — Settings Page

New `src/pages/Settings.tsx` at `/settings` with tabs:
- **Profile** — name, email (read-only), change password
- **GHL Connections** — list of linked `ghl_location_links` with Disconnect button; "Connect another GHL account" instructions
- **Notifications** — toggles for email/in-app notifications (stored in `profiles.notification_prefs` jsonb — added in migration)
- **Danger zone** — sign out everywhere, delete account (calls edge function)

Add Settings link to Sidebar + TopBar user menu.

---

## Part 4 — CSV Export

Add a reusable `exportToCsv(rows, filename)` util in `src/lib/csv.ts`. Add "Export CSV" buttons to:
- Buyers page (current filtered list)
- Pipeline page (List view)
- Tasks page

No new dependencies — write a small CSV serializer with proper quote escaping.

---

## Part 5 — Error Boundaries

- New `src/components/ErrorBoundary.tsx` (class component) with a friendly fallback UI ("Something went wrong" + Reload + Report)
- Wrap `<Routes>` in `App.tsx` with a top-level boundary
- Wrap each page route with a per-route boundary so one page crash doesn't blank the whole app

---

## Files

**Create:** `supabase/functions/oauth-authorize/index.ts`, `supabase/functions/oauth-token/index.ts`, `supabase/functions/oauth-userinfo/index.ts`, `supabase/functions/link-ghl-location/index.ts`, `src/pages/OAuthConsent.tsx`, `src/pages/Settings.tsx`, `src/components/ErrorBoundary.tsx`, `src/lib/csv.ts`, plus migration

**Edit:** `src/App.tsx` (routes + boundary), `src/pages/Login.tsx` (honor `?next=`), `src/components/layout/Sidebar.tsx` + `TopBar.tsx` (Settings link), `src/pages/Buyers.tsx`, `src/pages/Pipeline.tsx`, `src/pages/Tasks.tsx` (Export buttons)

## Order of execution

1. Migration (oauth tables + ghl_location_links + notification_prefs) — secret printed in output
2. Edge functions (authorize, token, userinfo, link-ghl-location)
3. OAuthConsent page + Login `?next=` support
4. ErrorBoundary + wrap routes
5. Settings page + sidebar link
6. CSV export util + buttons
7. Run security scan + linter, fix findings, update security memory
8. Hand you the Client ID + Client Secret + URLs to paste into GHL

Approve and I'll execute end-to-end.