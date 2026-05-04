
# Build Plan: Protected Routes, Dashboard, Notifications, Activity Log, Tasks

## 1. Protected Routes

Wrap every authenticated page in `<AppLayout>` (which already enforces auth + admin). Currently `App.tsx` renders pages directly with no guard.

- Update `src/App.tsx`: wrap `Buyers`, `Finder`, `Pipeline`, `KPIs`, `Profile`, `TitleCompanies`, `Team` in `<AppLayout>`, and `Admin` in `<AppLayout requireAdmin>`.
- Audit each page file — if any currently renders its own `<AppLayout>` internally, remove the duplicate so layout isn't doubled.
- `/login` stays public. Add a new public `/reset-password` page (see #6).

## 2. Dashboard / Home at `/`

Replace the redirect with a real landing page.

- New `src/pages/Dashboard.tsx` with these widgets (data from existing `deals`, `buyers`, `tasks` tables):
  - **This week's closings** — deals where `closing_date` between today and +7d.
  - **EMD due / overdue** — deals with status `under_contract` and `emd_received = false`.
  - **IP expiring soon** — deals with `ip_expiry_date` within next 7 days.
  - **New leads (7d)** — count of deals created in last 7 days.
  - **Revenue MTD** — sum of `assignment_fee` where `closed_at` in current month.
  - **Open tasks** — count of `tasks` where `is_completed = false` and assigned to me.
  - Recent activity feed (top 10 events from new `deal_activity` table — see #4).
- Route `/` to `Dashboard` (remove the `Navigate` to `/buyers`).

## 3. Tasks / Reminders UI

Schema already exists (`tasks` table). Add full UI.

- New `src/pages/Tasks.tsx` listing tasks with filters: All / Mine / Today / Overdue / Completed.
- New `src/components/tasks/TaskModal.tsx` — create/edit (title, description, due_date, priority, assignee from `team_members`, optional `deal_id`).
- Inline checkbox to mark complete; reorder by due date + priority.
- Add **Tasks tab inside `DealDrawer`** showing tasks linked to that deal + quick-add.
- Add `/tasks` to sidebar nav and to `App.tsx`.
- Dashboard "Open tasks" widget links here.

## 4. Activity Log / Audit Trail per Deal

New table + automatic logging via DB trigger, surfaced in the deal drawer.

**Schema migration:**
```
create table public.deal_activity (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  user_id uuid,
  event_type text not null,   -- status_change, assignee_added, file_uploaded, note_added, emd_received, field_updated
  from_value text,
  to_value text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
alter table public.deal_activity enable row level security;
```
RLS: SELECT if the user owns the parent deal or is admin; INSERT for the deal owner (and via trigger as `security definer`).

**Trigger** on `deals` (AFTER UPDATE) writes rows for: `status` change, `emd_received` flip, `closing_date` change, `assignment_fee` change, `buyer_id` change, `title_company_id` change, role assignment changes (`owner_id`, `acquisitions_manager_id`, `va_id`).
Trigger on `deal_assignees` (INSERT/DELETE) and `deal_files` (INSERT) for those events.
Manual notes (event_type = `note_added`) inserted from the UI.

**UI:** new tab "Activity" inside `src/components/pipeline/DealDrawer.tsx` rendering a chronological timeline. Add a "Add note" input at the top.

## 5. Notifications

Replace the decorative bell in `TopBar` with a real dropdown backed by a new table.

**Schema migration:**
```
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,           -- ip_expiring, emd_overdue, task_due, deal_assigned, buyer_match
  title text not null,
  body text,
  link_url text,                -- e.g. /pipeline?deal=...
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
```
RLS: user can SELECT/UPDATE/DELETE their own.

**Generation strategy:**
- Edge function `generate-notifications` runs daily via `pg_cron`. For each user, scans their deals/tasks and inserts notifications for:
  - IP expiring in ≤3 days
  - EMD overdue (under_contract >7d, emd not received)
  - Tasks due today / overdue
- Realtime inserts (e.g. deal assignment, file upload by teammate) handled inline at the action site (`supabase.from('notifications').insert(...)`).

**UI:**
- New `src/components/notifications/NotificationBell.tsx` with unread count badge, popover list, "mark all read", click navigates to `link_url`.
- Subscribe to realtime channel `postgres_changes` on `notifications` filtered by `user_id`.
- Wire into existing bell in `TopBar.tsx`.

## 6. Password Reset (small bonus required for protected-route correctness)

- Add "Forgot password?" link on `Login` calling `resetPasswordForEmail({ redirectTo: origin + '/reset-password' })`.
- New public `src/pages/ResetPassword.tsx` that calls `supabase.auth.updateUser({ password })` when URL hash contains `type=recovery`.
- Add route in `App.tsx`.

## Technical Summary

**New files**
- `src/pages/Dashboard.tsx`, `src/pages/Tasks.tsx`, `src/pages/ResetPassword.tsx`
- `src/components/tasks/TaskModal.tsx`, `src/components/tasks/TaskList.tsx`
- `src/components/notifications/NotificationBell.tsx`
- `src/components/pipeline/DealActivity.tsx`
- `supabase/functions/generate-notifications/index.ts`

**Edited**
- `src/App.tsx` — add layout wrappers, new routes, dashboard at `/`
- `src/components/layout/TopBar.tsx` — mount `NotificationBell`
- `src/components/layout/Sidebar.tsx` — add Dashboard + Tasks nav items
- `src/components/pipeline/DealDrawer.tsx` — Activity + Tasks tabs
- `src/pages/Login.tsx` — forgot password link

**DB migrations**
- Create `deal_activity`, `notifications` tables + RLS
- Trigger functions for deal change logging
- `pg_cron` schedule for `generate-notifications`

**Order of implementation**
1. DB migrations (deal_activity, notifications, triggers)
2. Protected routes + reset password
3. Tasks page + modal + sidebar entry
4. Deal Activity tab in drawer
5. Notification bell + realtime
6. Dashboard page (depends on the above)
7. Edge function + cron schedule for notification generation
