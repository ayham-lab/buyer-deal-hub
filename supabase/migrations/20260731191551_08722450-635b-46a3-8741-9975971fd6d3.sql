CREATE OR REPLACE FUNCTION public.sync_team_member_link_from_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_name text;
  v_match_count int;
  v_match_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT email, name INTO v_email, v_name
      FROM public.profiles WHERE user_id = NEW.user_id;

    IF EXISTS (
      SELECT 1 FROM public.team_members
      WHERE ghl_location_id = NEW.location_id AND linked_user_id = NEW.user_id
    ) THEN
      RETURN NEW;
    END IF;

    IF v_email IS NOT NULL THEN
      -- NOTE: min(uuid) does not exist in Postgres; order + limit instead.
      SELECT count(*) INTO v_match_count
        FROM public.team_members
        WHERE ghl_location_id = NEW.location_id
          AND linked_user_id IS NULL
          AND lower(email) = lower(v_email);

      SELECT id INTO v_match_id
        FROM public.team_members
        WHERE ghl_location_id = NEW.location_id
          AND linked_user_id IS NULL
          AND lower(email) = lower(v_email)
        ORDER BY created_at ASC, id ASC
        LIMIT 1;

      IF v_match_count = 1 THEN
        UPDATE public.team_members SET linked_user_id = NEW.user_id WHERE id = v_match_id;
        RETURN NEW;
      ELSIF v_match_count > 1 THEN
        INSERT INTO public.merge_audit_log (phase, summary, status)
          VALUES (1, jsonb_build_object(
            'event','auto_link_collision',
            'location_id', NEW.location_id,
            'user_id', NEW.user_id,
            'email', v_email,
            'candidate_count', v_match_count
          ), 'warning');
        RETURN NEW;
      END IF;
    END IF;

    INSERT INTO public.team_members
      (user_id, ghl_location_id, linked_user_id, name, email, role, is_active)
    VALUES (
      NEW.user_id, NEW.location_id, NEW.user_id,
      COALESCE(v_name, v_email, NEW.user_id::text),
      v_email,
      CASE WHEN NEW.is_owner THEN 'dispo_manager' ELSE 'other' END,
      true
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.team_members
       SET linked_user_id = NULL, is_active = false
     WHERE ghl_location_id = OLD.location_id AND linked_user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;