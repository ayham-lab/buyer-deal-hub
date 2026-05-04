CREATE TABLE public.deal_assignees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id uuid NOT NULL,
  team_member_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'other',
  commission_split numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (deal_id, team_member_id, role)
);

CREATE INDEX idx_deal_assignees_deal_id ON public.deal_assignees(deal_id);
CREATE INDEX idx_deal_assignees_team_member_id ON public.deal_assignees(team_member_id);

ALTER TABLE public.deal_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DealAssignees: owner select" ON public.deal_assignees
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_assignees.deal_id AND (d.user_id = auth.uid() OR is_admin(auth.uid()))));

CREATE POLICY "DealAssignees: owner write" ON public.deal_assignees
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_assignees.deal_id AND d.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_assignees.deal_id AND d.user_id = auth.uid()));