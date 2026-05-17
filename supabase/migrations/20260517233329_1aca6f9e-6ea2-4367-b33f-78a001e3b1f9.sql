
CREATE OR REPLACE FUNCTION public.list_title_company_archive()
RETURNS TABLE (
  id uuid,
  source text,
  name text,
  contact_name text,
  email text,
  phone text,
  address text,
  service_states text[],
  service_cities text[],
  charges_file_fee boolean,
  file_fee_amount numeric,
  deal_types text[],
  notes text,
  usage_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH combined AS (
    SELECT
      a.id,
      'archive'::text AS source,
      a.name, a.contact_name, a.email, a.phone, a.address,
      a.service_states, a.service_cities,
      a.charges_file_fee, a.file_fee_amount,
      a.deal_types, a.notes,
      1::bigint AS weight,
      a.updated_at AS sort_at
    FROM public.archive_title_companies a
    WHERE a.is_active = true
    UNION ALL
    SELECT
      t.id,
      'user'::text AS source,
      t.name, t.contact_name, t.email, t.phone, t.address,
      t.service_states, t.service_cities,
      t.charges_file_fee, t.file_fee_amount,
      t.deal_types, t.notes,
      1::bigint AS weight,
      t.updated_at AS sort_at
    FROM public.title_companies t
  ),
  ranked AS (
    SELECT
      c.*,
      lower(trim(c.name)) || '|' || coalesce(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), '') AS dedup_key,
      SUM(c.weight) OVER (PARTITION BY lower(trim(c.name)) || '|' || coalesce(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), '')) AS total_usage,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(c.name)) || '|' || coalesce(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), '')
        ORDER BY CASE WHEN c.source = 'archive' THEN 0 ELSE 1 END, c.sort_at DESC
      ) AS rn
    FROM combined c
  )
  SELECT
    r.id, r.source, r.name, r.contact_name, r.email, r.phone, r.address,
    r.service_states, r.service_cities, r.charges_file_fee, r.file_fee_amount,
    r.deal_types, r.notes, r.total_usage AS usage_count
  FROM ranked r
  WHERE r.rn = 1
  ORDER BY r.total_usage DESC, r.name ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.list_title_company_archive() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_title_company_archive() TO authenticated;
