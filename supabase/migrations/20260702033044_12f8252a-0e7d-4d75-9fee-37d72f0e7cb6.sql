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
  IF EXISTS (SELECT 1 FROM public.deal_checklist WHERE deal_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Prefer the deal creator's template (so per-user Settings > Checklist actually
  -- reflects on newly-created deals). Fall back to workspace owner when the deal
  -- was created without a user (e.g. webhook imports where user_id is NULL).
  v_owner := NEW.user_id;

  IF v_owner IS NOT NULL THEN
    SELECT default_checklist_items INTO v_items FROM public.profiles WHERE user_id = v_owner;
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
      -- creator has no template; fall through to workspace owner
      v_owner := NULL;
      v_items := NULL;
    END IF;
  END IF;

  IF v_owner IS NULL AND NEW.ghl_location_id IS NOT NULL THEN
    SELECT workspace_owner_user_id INTO v_owner
    FROM public.ghl_location_links
    WHERE ghl_location_id = NEW.ghl_location_id
    ORDER BY linked_at ASC
    LIMIT 1;
    IF v_owner IS NOT NULL THEN
      SELECT default_checklist_items INTO v_items FROM public.profiles WHERE user_id = v_owner;
    END IF;
  END IF;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- Legacy fallback if items still empty
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