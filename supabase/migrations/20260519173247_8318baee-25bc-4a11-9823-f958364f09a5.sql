
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS exit_strategies text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.log_deal_exit_strategy_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_arr text[] := COALESCE(OLD.exit_strategies, '{}');
  new_arr text[] := COALESCE(NEW.exit_strategies, '{}');
BEGIN
  IF old_arr IS DISTINCT FROM new_arr THEN
    INSERT INTO public.deal_activity (deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (
      NEW.id,
      auth.uid(),
      'exit_strategy_changed',
      array_to_string(old_arr, ','),
      array_to_string(new_arr, ','),
      jsonb_build_object('from', old_arr, 'to', new_arr)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_deal_exit_strategy_changes ON public.deals;
CREATE TRIGGER trg_log_deal_exit_strategy_changes
AFTER UPDATE OF exit_strategies ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.log_deal_exit_strategy_changes();
