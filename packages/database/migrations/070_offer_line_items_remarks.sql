-- 070: Add supplier_remarks column to offer_line_items
-- Stores supplier annotations, conditions, variants, delays, and other notes
-- extracted from PDF/email responses during AI price parsing.

ALTER TABLE offer_line_items
ADD COLUMN IF NOT EXISTS supplier_remarks TEXT;

COMMENT ON COLUMN offer_line_items.supplier_remarks IS 'Supplier-provided remarks: variants, conditions, delivery terms, annotations extracted from their quote response';
