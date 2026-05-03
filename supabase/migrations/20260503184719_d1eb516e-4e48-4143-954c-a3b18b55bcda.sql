
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.deal_status AS ENUM ('lead', 'active', 'under_contract', 'closed', 'dead');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'cancelled', 'past_due');

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  ghl_location_id TEXT,
  ghl_user_id TEXT,
  subscription_status public.subscription_status NOT NULL DEFAULT 'trialing',
  last_active_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
$$;

-- BUYERS
CREATE TABLE public.buyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  markets TEXT[] DEFAULT '{}',
  property_types TEXT[] DEFAULT '{}',
  price_min NUMERIC,
  price_max NUMERIC,
  criteria_notes TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  last_contact_at TIMESTAMPTZ,
  deal_count INT NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_buyers_updated BEFORE UPDATE ON public.buyers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_buyers_user ON public.buyers(user_id);

-- BUYER ARCHIVE (shared)
CREATE TABLE public.buyer_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  markets TEXT[] DEFAULT '{}',
  property_types TEXT[] DEFAULT '{}',
  price_min NUMERIC,
  price_max NUMERIC,
  source TEXT,
  added_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.buyer_archive ENABLE ROW LEVEL SECURITY;

-- JV PARTNERS
CREATE TABLE public.jv_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  deal_count INT NOT NULL DEFAULT 0,
  total_assigned_fees NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.jv_partners ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_jv_updated BEFORE UPDATE ON public.jv_partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DEALS
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_address TEXT NOT NULL,
  city TEXT,
  state TEXT,
  status public.deal_status NOT NULL DEFAULT 'lead',
  ip_expiry_date DATE,
  closing_date DATE,
  emd_received BOOLEAN NOT NULL DEFAULT false,
  emd_amount NUMERIC,
  assignment_fee NUMERIC,
  arv NUMERIC,
  asking_price NUMERIC,
  lead_source TEXT,
  jv_partner_id UUID REFERENCES public.jv_partners(id) ON DELETE SET NULL,
  buyer_id UUID REFERENCES public.buyers(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_deals_updated BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_deals_user_status ON public.deals(user_id, status);

-- DEAL CHECKLIST
CREATE TABLE public.deal_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  item_text TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  due_date DATE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.deal_checklist ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_checklist_deal ON public.deal_checklist(deal_id);

-- TASKS
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- KPI SNAPSHOTS
CREATE TABLE public.kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  revenue_created NUMERIC NOT NULL DEFAULT 0,
  revenue_closed NUMERIC NOT NULL DEFAULT 0,
  deals_opened INT NOT NULL DEFAULT 0,
  deals_closed INT NOT NULL DEFAULT 0,
  contract_conversion_rate NUMERIC NOT NULL DEFAULT 0,
  avg_assignment_fee NUMERIC NOT NULL DEFAULT 0,
  top_lead_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, month, year)
);
ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

-- =================== RLS POLICIES ===================

-- profiles
CREATE POLICY "Profiles: own select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Profiles: own insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Profiles: own update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- user_roles
CREATE POLICY "Roles: own select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Roles: admin manage" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- buyers
CREATE POLICY "Buyers: owner select" ON public.buyers FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Buyers: owner insert" ON public.buyers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Buyers: owner update" ON public.buyers FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Buyers: owner delete" ON public.buyers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- buyer_archive (shared)
CREATE POLICY "Archive: all read" ON public.buyer_archive FOR SELECT TO authenticated USING (true);
CREATE POLICY "Archive: all insert" ON public.buyer_archive FOR INSERT TO authenticated WITH CHECK (auth.uid() = added_by_user_id);
CREATE POLICY "Archive: admin update" ON public.buyer_archive FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Archive: admin delete" ON public.buyer_archive FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- jv_partners
CREATE POLICY "JV: owner all" ON public.jv_partners FOR ALL TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = user_id);

-- deals
CREATE POLICY "Deals: owner select" ON public.deals FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Deals: owner insert" ON public.deals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Deals: owner update" ON public.deals FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Deals: owner delete" ON public.deals FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- deal_checklist (via deal ownership)
CREATE POLICY "Checklist: owner select" ON public.deal_checklist FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.deals d WHERE d.id = deal_id AND (d.user_id = auth.uid() OR public.is_admin(auth.uid())))
);
CREATE POLICY "Checklist: owner write" ON public.deal_checklist FOR ALL TO authenticated USING (
  EXISTS(SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid())
);

-- tasks
CREATE POLICY "Tasks: owner all" ON public.tasks FOR ALL TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = user_id);

-- kpi_snapshots
CREATE POLICY "KPI: owner all" ON public.kpi_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid())) WITH CHECK (auth.uid() = user_id);

-- =================== AUTH SIGNUP TRIGGER ===================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
