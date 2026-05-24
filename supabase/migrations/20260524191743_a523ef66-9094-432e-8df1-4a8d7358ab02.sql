
-- 1) New jsonb column on profiles for richer template items
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_checklist_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) One-time backfill from legacy text[] column (only for rows that still have the empty default)
UPDATE public.profiles p
SET default_checklist_items = sub.items
FROM (
  SELECT user_id,
         COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('text', t, 'offset_minutes', NULL))
              FROM unnest(default_checklist) AS t),
           '[]'::jsonb
         ) AS items
  FROM public.profiles
  WHERE default_checklist IS NOT NULL
    AND array_length(default_checklist, 1) IS NOT NULL
) sub
WHERE p.user_id = sub.user_id
  AND (p.default_checklist_items IS NULL OR p.default_checklist_items = '[]'::jsonb);

-- 3) Updated seeder: reads jsonb template + applies offset_minutes to compute due_date
CREATE OR REPLACE FUNCTION public.seed_deal_checklist_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_items jsonb;
BEGIN
  -- Skip if checklist already populated
  IF EXISTS (SELECT 1 FROM public.deal_checklist WHERE deal_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Resolve workspace owner
  IF NEW.ghl_location_id IS NOT NULL THEN
    SELECT workspace_owner_user_id INTO v_owner
    FROM public.ghl_location_links
    WHERE ghl_location_id = NEW.ghl_location_id
    ORDER BY linked_at ASC
    LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    v_owner := NEW.user_id;
  END IF;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT default_checklist_items INTO v_items
  FROM public.profiles
  WHERE user_id = v_owner;

  -- Fallback: legacy text[] template
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    SELECT COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('text', t, 'offset_minutes', NULL))
         FROM unnest(default_checklist) AS t),
      '[]'::jsonb
    )
    INTO v_items
    FROM public.profiles
    WHERE user_id = v_owner;
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.deal_checklist (deal_id, item_text, sort_order, due_date)
  SELECT
    NEW.id,
    COALESCE(elem->>'text', ''),
    (ord - 1)::int,
    CASE
      WHEN (elem->>'offset_minutes') IS NOT NULL
        THEN ((COALESCE(NEW.created_at, now()) + ((elem->>'offset_minutes')::int * INTERVAL '1 minute'))::date)
      ELSE NULL
    END
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(elem, ord)
  WHERE COALESCE(elem->>'text', '') <> '';

  RETURN NEW;
END;
$function$;
