
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'other',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team: owner select" ON public.team_members FOR SELECT TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));
CREATE POLICY "Team: owner insert" ON public.team_members FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Team: owner update" ON public.team_members FOR UPDATE TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Team: owner delete" ON public.team_members FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.deals
  ADD COLUMN acquisitions_manager_id UUID,
  ADD COLUMN va_id UUID;

CREATE INDEX idx_deals_acquisitions_manager_id ON public.deals(acquisitions_manager_id);
CREATE INDEX idx_deals_va_id ON public.deals(va_id);
CREATE INDEX idx_team_members_user_id ON public.team_members(user_id);
