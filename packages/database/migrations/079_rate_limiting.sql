-- Migration 079: Distributed rate limiting (fixed-window counters)
-- Used by apps/web/src/lib/rate-limit.ts via RPC rate_limit_hit().
-- Called exclusively with the service role (RLS enabled, no policies).

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_window ON rate_limit_hits (window_start);

CREATE OR REPLACE FUNCTION rate_limit_hit(p_key TEXT, p_limit INTEGER, p_window_sec INTEGER)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_sec INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_sec) * p_window_sec);

  INSERT INTO rate_limit_hits AS r (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO v_count;

  -- Opportunistic cleanup of expired windows (cheap, bounded)
  DELETE FROM rate_limit_hits
  WHERE key = p_key AND window_start < now() - make_interval(secs => p_window_sec * 2);

  RETURN QUERY SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    CASE WHEN v_count <= p_limit THEN 0
         ELSE GREATEST(1, (extract(epoch FROM (v_window_start + make_interval(secs => p_window_sec) - now())))::INTEGER)
    END;
END;
$$;

REVOKE ALL ON FUNCTION rate_limit_hit(TEXT, INTEGER, INTEGER) FROM anon, authenticated;
