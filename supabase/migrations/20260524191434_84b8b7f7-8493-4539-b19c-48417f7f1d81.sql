-- Deduplicate deal_checklist rows: keep earliest per (deal_id, item_text)
DELETE FROM public.deal_checklist a
USING public.deal_checklist b
WHERE a.deal_id = b.deal_id
  AND a.item_text = b.item_text
  AND a.ctid > b.ctid;