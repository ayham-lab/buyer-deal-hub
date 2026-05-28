-- Enum for buyer type
DO $$ BEGIN
  CREATE TYPE public.skiptrace_buyer_type AS ENUM ('individual_investor', 'company_investor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enum for per-phone working status
DO $$ BEGIN
  CREATE TYPE public.skiptrace_phone_status AS ENUM ('untried', 'works', 'wrong_number');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Upload batches (audit trail of who uploaded what)
CREATE TABLE public.skiptrace_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user uuid,
  uploaded_by_location text,
  filename text,
  row_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skiptrace_upload_batches TO authenticated;
GRANT ALL ON public.skiptrace_upload_batches TO service_role;

ALTER TABLE public.skiptrace_upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skiptrace_batches_admin_all"
  ON public.skiptrace_upload_batches
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "skiptrace_batches_authenticated_read"
  ON public.skiptrace_upload_batches
  FOR SELECT
  TO authenticated
  USING (true);

-- Main skiptrace buyers table (global pool, dedup on normalized property address)
CREATE TABLE public.skiptrace_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner1_first text,
  owner1_last text,
  property_address text NOT NULL,
  property_city text,
  property_state text,
  property_zip text,
  mailing_address text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  email1 text,
  email2 text,
  buyer_type public.skiptrace_buyer_type,
  -- Normalized key for dedup: lowercase, trimmed, single-spaced address
  property_address_key text GENERATED ALWAYS AS (
    lower(regexp_replace(trim(coalesce(property_address,'')), '\s+', ' ', 'g'))
  ) STORED,
  first_uploaded_at timestamptz NOT NULL DEFAULT now(),
  source_batch_id uuid REFERENCES public.skiptrace_upload_batches(id) ON DELETE SET NULL,
  source_location_id text,
  last_source_batch_id uuid REFERENCES public.skiptrace_upload_batches(id) ON DELETE SET NULL,
  last_source_location_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX skiptrace_buyers_address_key_uniq
  ON public.skiptrace_buyers(property_address_key);
CREATE INDEX skiptrace_buyers_owner_idx
  ON public.skiptrace_buyers(lower(owner1_last), lower(owner1_first));
CREATE INDEX skiptrace_buyers_state_city_idx
  ON public.skiptrace_buyers(property_state, property_city);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skiptrace_buyers TO authenticated;
GRANT ALL ON public.skiptrace_buyers TO service_role;

ALTER TABLE public.skiptrace_buyers ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (powers buyer-match across locations)
CREATE POLICY "skiptrace_buyers_read_authenticated"
  ON public.skiptrace_buyers
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write
CREATE POLICY "skiptrace_buyers_admin_write"
  ON public.skiptrace_buyers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "skiptrace_buyers_admin_update"
  ON public.skiptrace_buyers
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "skiptrace_buyers_admin_delete"
  ON public.skiptrace_buyers
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER skiptrace_buyers_updated_at
  BEFORE UPDATE ON public.skiptrace_buyers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-phone tracking (up to 5+ phones per buyer, each marked works/wrong/untried)
CREATE TABLE public.skiptrace_buyer_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.skiptrace_buyers(id) ON DELETE CASCADE,
  phone text NOT NULL,
  phone_digits text GENERATED ALWAYS AS (regexp_replace(coalesce(phone,''), '\D', '', 'g')) STORED,
  position smallint,
  status public.skiptrace_phone_status NOT NULL DEFAULT 'untried',
  notes text,
  last_marked_by uuid,
  last_marked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX skiptrace_phones_buyer_digits_uniq
  ON public.skiptrace_buyer_phones(buyer_id, phone_digits)
  WHERE phone_digits <> '';
CREATE INDEX skiptrace_phones_buyer_idx
  ON public.skiptrace_buyer_phones(buyer_id);
CREATE INDEX skiptrace_phones_digits_idx
  ON public.skiptrace_buyer_phones(phone_digits);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.skiptrace_buyer_phones TO authenticated;
GRANT ALL ON public.skiptrace_buyer_phones TO service_role;

ALTER TABLE public.skiptrace_buyer_phones ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read phones (for buyer matching)
CREATE POLICY "skiptrace_phones_read_authenticated"
  ON public.skiptrace_buyer_phones
  FOR SELECT
  TO authenticated
  USING (true);

-- Admins can insert/delete phones
CREATE POLICY "skiptrace_phones_admin_insert"
  ON public.skiptrace_buyer_phones
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "skiptrace_phones_admin_delete"
  ON public.skiptrace_buyer_phones
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

-- Any authenticated user with location access can mark a phone as works/wrong (operator feedback loop)
CREATE POLICY "skiptrace_phones_authenticated_update_status"
  ON public.skiptrace_buyer_phones
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER skiptrace_phones_updated_at
  BEFORE UPDATE ON public.skiptrace_buyer_phones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
