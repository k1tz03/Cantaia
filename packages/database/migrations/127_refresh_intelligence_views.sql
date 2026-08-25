-- Migration 127: RPC de rafraîchissement sûr des vues matérialisées d'intelligence
--
-- AUDIT 08/2026 — le cron /api/cron/refresh-intelligence était intégralement
-- no-op :
--   * il appelait `refresh_materialized_view_concurrently` puis `exec_sql` —
--     DEUX RPC qui n'existaient dans AUCUNE migration ;
--   * il listait `mv_correction_trends` et `mv_price_calibration_accuracy` —
--     DEUX vues jamais définies nulle part.
-- Résultat : les 5 vues (dont mv_reference_prices, base du price-resolver tier 2)
-- n'étaient jamais rafraîchies malgré des logs « Refreshed … ».
--
-- Cette migration fournit UNE RPC réelle, whitelistée, qui tente un refresh
-- CONCURRENTLY (non bloquant) et retombe sur un refresh simple si la vue n'a
-- pas d'index unique (cas de mv_labor_productivity) ou si un lock concurrent
-- empêche le CONCURRENTLY. Le cron est réécrit pour l'appeler et ne référence
-- plus que les vues réellement définies (043/045/064).
--
-- Idempotent : CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION refresh_materialized_view_safe(p_view text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Whitelist stricte : bloque l'injection via un nom de vue arbitraire et
  -- garantit qu'on ne rafraîchit que des vues qui existent bel et bien.
  IF p_view NOT IN (
    'mv_reference_prices',        -- 045
    'mv_supplier_daily_metrics',  -- 064 (index unique → CONCURRENTLY OK)
    'mv_labor_productivity',      -- 064 (pas d'index unique → refresh simple)
    'mv_calibration_coefficients',-- 043
    'mv_qty_calibration'          -- 043
  ) THEN
    RAISE EXCEPTION 'refresh_materialized_view_safe: view % not allowed', p_view;
  END IF;

  BEGIN
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY %I', p_view);
  EXCEPTION WHEN OTHERS THEN
    -- CONCURRENTLY exige un index unique et un accès non bloqué ; sinon on
    -- retombe sur un refresh bloquant simple (acceptable pour un cron nocturne).
    EXECUTE format('REFRESH MATERIALIZED VIEW %I', p_view);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_materialized_view_safe(text) TO service_role;
