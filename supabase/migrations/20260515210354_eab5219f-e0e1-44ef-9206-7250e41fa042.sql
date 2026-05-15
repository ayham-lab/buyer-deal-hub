
-- Search index for archive_buyers (name + email)
CREATE INDEX IF NOT EXISTS archive_buyers_search_idx
  ON public.archive_buyers
  USING gin (to_tsvector('english',
    coalesce(first_name,'') || ' ' ||
    coalesce(last_name,'') || ' ' ||
    coalesce(full_name,'') || ' ' ||
    coalesce(email,'')
  ));

-- Trigram indexes for ilike fallback (fast partial matches)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS archive_buyers_full_name_trgm ON public.archive_buyers USING gin (lower(coalesce(full_name,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS archive_buyers_first_name_trgm ON public.archive_buyers USING gin (lower(coalesce(first_name,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS archive_buyers_last_name_trgm ON public.archive_buyers USING gin (lower(coalesce(last_name,'')) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS archive_buyers_email_lower_idx ON public.archive_buyers (lower(email));
CREATE INDEX IF NOT EXISTS archive_buyers_phone_idx ON public.archive_buyers (phone);
CREATE INDEX IF NOT EXISTS archive_buyers_phone2_idx ON public.archive_buyers (phone_2);
CREATE INDEX IF NOT EXISTS archive_buyers_state_idx ON public.archive_buyers (state);
CREATE INDEX IF NOT EXISTS archive_buyers_quality_tier_idx ON public.archive_buyers (quality_tier);
CREATE INDEX IF NOT EXISTS archive_buyers_created_at_idx ON public.archive_buyers (created_at desc);
CREATE INDEX IF NOT EXISTS archive_buyers_sources_gin ON public.archive_buyers USING gin (sources);

-- Distinct source tags helper (super_admin only)
CREATE OR REPLACE FUNCTION public.archive_buyer_distinct_sources()
RETURNS TABLE(source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT jsonb_array_elements_text(sources) AS source
    FROM public.archive_buyers
    WHERE jsonb_typeof(sources) = 'array'
    ORDER BY 1;
$$;
REVOKE ALL ON FUNCTION public.archive_buyer_distinct_sources() FROM public;
GRANT EXECUTE ON FUNCTION public.archive_buyer_distinct_sources() TO authenticated;
