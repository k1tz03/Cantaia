-- Migration 039: Aggregation functions for the CRON pipeline
-- These functions perform full batch recomputation of C2 benchmarks

-- ============================================================
-- 1. Market Benchmarks (price aggregation by CFC/region/quarter)
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_market_benchmarks()
RETURNS VOID AS $$
DECLARE
  v_quarter TEXT;
BEGIN
  v_quarter := EXTRACT(YEAR FROM NOW()) || '-Q' || EXTRACT(QUARTER FROM NOW());

  -- Full recompute for current quarter (not incremental)
  DELETE FROM market_benchmarks WHERE quarter = v_quarter;

  INSERT INTO market_benchmarks (
    cfc_code, description_normalized, unit, region, quarter,
    price_median, price_p25, price_p75, std_dev, trend_pct,
    contributor_count, sample_size, updated_at
  )
  SELECT
    COALESCE(oli.cfc_subcode, 'UNKNOWN') AS cfc_code,
    COALESCE(oli.normalized_description, oli.supplier_description, 'Non classifié') AS description_normalized,
    COALESCE(oli.unit_normalized, oli.supplier_unit, 'fft') AS unit,
    COALESCE(p.region, p.city, 'Suisse') AS region,
    v_quarter,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY oli.unit_price) AS price_median,
    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY oli.unit_price) AS price_p25,
    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY oli.unit_price) AS price_p75,
    STDDEV(oli.unit_price) AS std_dev,
    NULL, -- trend calculated separately
    COUNT(DISTINCT so.organization_id) AS contributor_count,
    COUNT(*) AS sample_size,
    NOW()
  FROM offer_line_items oli
  JOIN supplier_offers so ON oli.offer_id = so.id
  LEFT JOIN projects p ON oli.project_id = p.id
  -- Only opted-in organizations
  WHERE is_org_opted_in(so.organization_id, 'prix')
    AND oli.unit_price > 0
    AND oli.created_at >= DATE_TRUNC('quarter', NOW())
  GROUP BY
    COALESCE(oli.cfc_subcode, 'UNKNOWN'),
    COALESCE(oli.normalized_description, oli.supplier_description, 'Non classifié'),
    COALESCE(oli.unit_normalized, oli.supplier_unit, 'fft'),
    COALESCE(p.region, p.city, 'Suisse')
  -- Minimum 3 distinct contributors
  HAVING COUNT(DISTINCT so.organization_id) >= 3;

  -- Apply differential noise on p25/p75 (±2%)
  UPDATE market_benchmarks
  SET
    price_p25 = price_p25 * (1 + (RANDOM() * 0.04 - 0.02)),
    price_p75 = price_p75 * (1 + (RANDOM() * 0.04 - 0.02))
  WHERE quarter = v_quarter;

  -- Calculate trend vs previous quarter
  UPDATE market_benchmarks mb
  SET trend_pct = (
    (mb.price_median - prev.price_median) / NULLIF(prev.price_median, 0) * 100
  )
  FROM market_benchmarks prev
  WHERE mb.cfc_code = prev.cfc_code
    AND mb.region = prev.region
    AND mb.unit = prev.unit
    AND mb.quarter = v_quarter
    AND prev.quarter = (
      CASE
        WHEN RIGHT(v_quarter, 2) = 'Q1' THEN (EXTRACT(YEAR FROM NOW()) - 1) || '-Q4'
        ELSE EXTRACT(YEAR FROM NOW()) || '-Q' || (EXTRACT(QUARTER FROM NOW()) - 1)
      END
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Supplier Market Scores (anonymous cross-tenant scoring)
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_supplier_scores()
RETURNS VOID AS $$
BEGIN
  -- Full recompute
  DELETE FROM supplier_market_scores;

  INSERT INTO supplier_market_scores (
    supplier_company_hash, specialty, region,
    avg_score, avg_response_rate, avg_response_days,
    competitiveness_quartile, contributor_count, sample_offers, updated_at
  )
  SELECT
    ENCODE(DIGEST(s.company_name || 'cantaia_salt_2026', 'sha256'), 'hex') AS supplier_hash,
    s.specialty AS specialty,
    COALESCE(s.region, s.city, 'Suisse') AS region,
    AVG(COALESCE(s.overall_score, 50)) AS avg_score,
    -- Response rate = offers / price_requests for this supplier
    CASE
      WHEN COUNT(DISTINCT so.id) > 0 THEN COUNT(DISTINCT so.id)::NUMERIC / GREATEST(COUNT(DISTINCT so.id), 1)
      ELSE 0
    END AS avg_response_rate,
    AVG(
      EXTRACT(EPOCH FROM (so.created_at - s.created_at)) / 86400
    ) AS avg_response_days,
    1 AS competitiveness_quartile, -- computed via window function after insert
    COUNT(DISTINCT s.organization_id) AS contributor_count,
    COUNT(DISTINCT so.id) AS sample_offers,
    NOW()
  FROM suppliers s
  LEFT JOIN supplier_offers so ON so.supplier_id = s.id
  WHERE is_org_opted_in(s.organization_id, 'fournisseurs')
  GROUP BY supplier_hash, s.specialty, COALESCE(s.region, s.city, 'Suisse')
  HAVING COUNT(DISTINCT s.organization_id) >= 3;

  -- Update competitiveness quartile via window function
  WITH ranked AS (
    SELECT id,
      NTILE(4) OVER (
        PARTITION BY specialty, region
        ORDER BY avg_score DESC
      ) AS quartile
    FROM supplier_market_scores
  )
  UPDATE supplier_market_scores sms
  SET competitiveness_quartile = r.quartile
  FROM ranked r
  WHERE sms.id = r.id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Email Benchmarks
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_email_benchmarks()
RETURNS VOID AS $$
BEGIN
  DELETE FROM email_benchmarks;

  INSERT INTO email_benchmarks (
    project_type, l1_success_rate, avg_correction_rate,
    avg_volume_per_phase, contributor_count, updated_at
  )
  SELECT
    COALESCE(p.project_type, 'general') AS project_type,
    -- L1 success = emails with confidence > 0.8 / total
    AVG(CASE WHEN er.classification_confidence > 0.8 THEN 1.0 ELSE 0.0 END) AS l1_success_rate,
    -- Correction rate from feedback table
    COUNT(DISTINCT ecf.id)::NUMERIC / NULLIF(COUNT(DISTINCT er.id), 0) AS avg_correction_rate,
    '{}' AS avg_volume_per_phase,
    COUNT(DISTINCT u.organization_id) AS contributor_count,
    NOW()
  FROM email_records er
  JOIN users u ON er.user_id = u.id
  LEFT JOIN projects p ON er.project_id = p.id
  LEFT JOIN email_classification_feedback ecf ON ecf.email_id = er.id
  WHERE is_org_opted_in(u.organization_id, 'mail')
  GROUP BY COALESCE(p.project_type, 'general')
  HAVING COUNT(DISTINCT u.organization_id) >= 3;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Task Benchmarks
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_task_benchmarks()
RETURNS VOID AS $$
BEGIN
  DELETE FROM task_benchmarks;

  INSERT INTO task_benchmarks (
    task_category, avg_completion_days, overdue_rate,
    ai_suggestion_acceptance_rate, source_distribution,
    contributor_count, updated_at
  )
  SELECT
    COALESCE(t.category, 'general') AS task_category,
    AVG(
      CASE WHEN t.status = 'completed' AND t.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (t.completed_at - t.created_at)) / 86400
        ELSE NULL
      END
    ) AS avg_completion_days,
    AVG(
      CASE WHEN t.due_date IS NOT NULL AND t.due_date < NOW() AND t.status != 'completed'
        THEN 1.0 ELSE 0.0
      END
    ) AS overdue_rate,
    0 AS ai_suggestion_acceptance_rate, -- computed separately
    JSONB_BUILD_OBJECT(
      'email', AVG(CASE WHEN t.source = 'email' THEN 1.0 ELSE 0.0 END),
      'pv', AVG(CASE WHEN t.source = 'meeting_pv' THEN 1.0 ELSE 0.0 END),
      'manual', AVG(CASE WHEN t.source = 'manual' THEN 1.0 ELSE 0.0 END),
      'ai', AVG(CASE WHEN t.source = 'ai_suggestion' THEN 1.0 ELSE 0.0 END)
    ) AS source_distribution,
    COUNT(DISTINCT p.organization_id) AS contributor_count,
    NOW()
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  WHERE is_org_opted_in(p.organization_id, 'taches')
  GROUP BY COALESCE(t.category, 'general')
  HAVING COUNT(DISTINCT p.organization_id) >= 3;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Chat Analytics
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_chat_analytics()
RETURNS VOID AS $$
BEGIN
  DELETE FROM chat_analytics;

  INSERT INTO chat_analytics (
    topic_category, frequency, satisfaction_rate,
    top_sia_norms, contributor_count, updated_at
  )
  SELECT
    COALESCE(cc.category, 'general') AS topic_category,
    COUNT(*) AS frequency,
    AVG(CASE WHEN cf.rating = 'up' THEN 1.0 WHEN cf.rating = 'down' THEN 0.0 ELSE NULL END) AS satisfaction_rate,
    '{}' AS top_sia_norms,
    COUNT(DISTINCT cc.organization_id) AS contributor_count,
    NOW()
  FROM chat_conversations cc
  LEFT JOIN chat_feedback cf ON cf.conversation_id = cc.id
  WHERE is_org_opted_in(cc.organization_id, 'chat')
  GROUP BY COALESCE(cc.category, 'general')
  HAVING COUNT(DISTINCT cc.organization_id) >= 3;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Project Benchmarks
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_project_benchmarks()
RETURNS VOID AS $$
BEGIN
  DELETE FROM project_benchmarks;

  INSERT INTO project_benchmarks (
    project_type, region, avg_duration_days, budget_overrun_pct,
    avg_emails_per_phase, avg_tasks_per_phase,
    contributor_count, updated_at
  )
  SELECT
    COALESCE(p.project_type, 'general') AS project_type,
    COALESCE(p.region, p.city, 'Suisse') AS region,
    AVG(
      CASE WHEN p.status = 'completed' AND p.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (p.completed_at - p.created_at)) / 86400
        ELSE NULL
      END
    ) AS avg_duration_days,
    AVG(
      CASE WHEN p.budget > 0 AND p.actual_cost > 0
        THEN ((p.actual_cost - p.budget) / p.budget * 100)
        ELSE NULL
      END
    ) AS budget_overrun_pct,
    '{}' AS avg_emails_per_phase,
    '{}' AS avg_tasks_per_phase,
    COUNT(DISTINCT p.organization_id) AS contributor_count,
    NOW()
  FROM projects p
  WHERE is_org_opted_in(p.organization_id, 'prix')
    AND p.status != 'archived'
  GROUP BY COALESCE(p.project_type, 'general'), COALESCE(p.region, p.city, 'Suisse')
  HAVING COUNT(DISTINCT p.organization_id) >= 3;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. Regional Price Index (basket of common items)
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_regional_price_index()
RETURNS VOID AS $$
DECLARE
  v_quarter TEXT;
BEGIN
  v_quarter := EXTRACT(YEAR FROM NOW()) || '-Q' || EXTRACT(QUARTER FROM NOW());

  DELETE FROM regional_price_index WHERE quarter = v_quarter;

  INSERT INTO regional_price_index (
    region, quarter, index_value, basket_items_count,
    contributor_count, updated_at
  )
  SELECT
    region,
    quarter,
    -- Index = average of medians for top-50 CFC items, normalized to 100
    AVG(price_median) AS index_value,
    COUNT(*) AS basket_items_count,
    MIN(contributor_count) AS contributor_count,
    NOW()
  FROM market_benchmarks
  WHERE quarter = v_quarter
    AND contributor_count >= 3
  GROUP BY region, quarter
  HAVING COUNT(*) >= 5; -- at least 5 CFC items for a meaningful index

  -- Calculate change vs previous quarter
  UPDATE regional_price_index rpi
  SET
    previous_index = prev.index_value,
    change_pct = (
      (rpi.index_value - prev.index_value) / NULLIF(prev.index_value, 0) * 100
    )
  FROM regional_price_index prev
  WHERE rpi.region = prev.region
    AND rpi.quarter = v_quarter
    AND prev.quarter = (
      CASE
        WHEN RIGHT(v_quarter, 2) = 'Q1' THEN (EXTRACT(YEAR FROM NOW()) - 1) || '-Q4'
        ELSE EXTRACT(YEAR FROM NOW()) || '-Q' || (EXTRACT(QUARTER FROM NOW()) - 1)
      END
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. PV Quality Benchmarks (stub — requires meetings table)
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_pv_benchmarks()
RETURNS VOID AS $$
BEGIN
  -- Will be populated when PV module is active
  -- For now, just ensure the function exists for the CRON to call
  RAISE NOTICE 'PV benchmarks: module not yet active, skipping';
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 9. Visit Benchmarks (stub — requires client_visits with data)
-- ============================================================
CREATE OR REPLACE FUNCTION aggregate_visit_benchmarks()
RETURNS VOID AS $$
BEGIN
  -- Will be populated when Visit module is active
  RAISE NOTICE 'Visit benchmarks: module not yet active, skipping';
END;
$$ LANGUAGE plpgsql;
