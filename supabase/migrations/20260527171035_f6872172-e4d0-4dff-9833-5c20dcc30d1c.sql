
-- 1) Fix deals null user_id bypass: tighten SELECT/UPDATE/DELETE to require location context
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select"
ON public.deals FOR SELECT TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR is_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (
    deleted_at IS NULL
    OR auth.uid() = user_id
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Deals: scoped update" ON public.deals;
CREATE POLICY "Deals: scoped update"
ON public.deals FOR UPDATE TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
)
WITH CHECK (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);

DROP POLICY IF EXISTS "Deals: scoped delete" ON public.deals;
CREATE POLICY "Deals: scoped delete"
ON public.deals FOR DELETE TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);

-- 2) Align deal_activity with deals access (location members can read/insert)
DROP POLICY IF EXISTS "DealActivity: owner select" ON public.deal_activity;
CREATE POLICY "DealActivity: owner select"
ON public.deal_activity FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_activity.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
        OR is_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "DealActivity: owner insert" ON public.deal_activity;
CREATE POLICY "DealActivity: owner insert"
ON public.deal_activity FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_activity.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
        OR is_admin(auth.uid())
      )
  )
);

-- 3) Align deal_checklist with deals access
DROP POLICY IF EXISTS "Checklist: owner select" ON public.deal_checklist;
CREATE POLICY "Checklist: owner select"
ON public.deal_checklist FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_checklist.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
        OR is_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "Checklist: owner write" ON public.deal_checklist;
CREATE POLICY "Checklist: member write"
ON public.deal_checklist FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_checklist.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_checklist.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
      )
  )
);

-- 4) Align deal_assignees with deals access
DROP POLICY IF EXISTS "DealAssignees: owner select" ON public.deal_assignees;
CREATE POLICY "DealAssignees: owner select"
ON public.deal_assignees FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_assignees.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
        OR is_admin(auth.uid())
      )
  )
);

DROP POLICY IF EXISTS "DealAssignees: owner write" ON public.deal_assignees;
CREATE POLICY "DealAssignees: member write"
ON public.deal_assignees FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_assignees.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_assignees.deal_id
      AND (
        d.user_id = auth.uid()
        OR (d.ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), d.ghl_location_id))
      )
  )
);

-- 5) Pending invites: explicit INSERT policy for location owners / admins
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pending_invites') THEN
    EXECUTE 'DROP POLICY IF EXISTS "pending_invites: owner insert" ON public.pending_invites';
    EXECUTE $p$
      CREATE POLICY "pending_invites: owner insert"
      ON public.pending_invites FOR INSERT TO authenticated
      WITH CHECK (
        is_admin(auth.uid())
        OR is_super_admin(auth.uid())
        OR (location_id IS NOT NULL AND is_location_owner(auth.uid(), location_id))
      )
    $p$;
  END IF;
END $$;

-- 6) Re-revoke raw token column reads (defense in depth)
REVOKE SELECT (access_token, refresh_token) ON public.ghl_location_tokens FROM anon, authenticated;

-- 7) Realtime channel authorization for notifications
-- Restrict realtime.messages so users only receive notifications for their own user_id topic
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "realtime: user owns topic" ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY "realtime: user owns topic"
      ON realtime.messages FOR SELECT TO authenticated
      USING (
        (realtime.topic() = ('user:' || auth.uid()::text))
        OR (realtime.topic() LIKE 'postgres_changes:%')
      )
    $p$;
    EXECUTE $p$
      DROP POLICY IF EXISTS "realtime: deny write" ON realtime.messages
    $p$;
    EXECUTE $p$
      CREATE POLICY "realtime: deny write"
      ON realtime.messages FOR INSERT TO authenticated
      WITH CHECK (false)
    $p$;
  END IF;
END $$;
