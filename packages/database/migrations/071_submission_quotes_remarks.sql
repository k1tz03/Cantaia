-- 071: Add supplier_remarks to submission_quotes and conditions_text to submission_price_requests
-- Stores per-item supplier annotations and offer-level conditions extracted from
-- PDF attachments and email bodies during AI price parsing.

ALTER TABLE submission_quotes
ADD COLUMN IF NOT EXISTS supplier_remarks TEXT;

ALTER TABLE submission_price_requests
ADD COLUMN IF NOT EXISTS conditions_text TEXT;

COMMENT ON COLUMN submission_quotes.supplier_remarks IS 'Per-item supplier remarks: variants, conditions, annotations extracted from their quote response';
COMMENT ON COLUMN submission_price_requests.conditions_text IS 'Offer-level conditions text extracted from supplier response (payment terms, validity, delivery, etc.)';
