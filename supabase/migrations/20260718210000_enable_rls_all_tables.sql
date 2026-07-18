-- =============================================================================
-- SmartDoc AI — Row Level Security
-- Architecture note:
--   Browser clients use the anon key (public). All DB access must go through
--   Next.js API routes that use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
--   When Supabase Auth is added later, "own rows" policies apply via auth.uid().
-- =============================================================================

-- pending_filings: add user_id for future per-user ownership
ALTER TABLE public.pending_filings
  ADD COLUMN IF NOT EXISTS user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_pending_filings_user
  ON public.pending_filings(user_id);

-- ---------------------------------------------------------------------------
-- Helper: enable RLS + revoke direct table grants from anon (defense in depth)
-- Service role still has full access (bypasses RLS).
-- ---------------------------------------------------------------------------

-- routing_rules
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routing_rules_deny_anon" ON public.routing_rules;
DROP POLICY IF EXISTS "routing_rules_own" ON public.routing_rules;

CREATE POLICY "routing_rules_deny_anon"
  ON public.routing_rules
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "routing_rules_own"
  ON public.routing_rules
  FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- bill_alerts
ALTER TABLE public.bill_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_alerts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bill_alerts_deny_anon" ON public.bill_alerts;
DROP POLICY IF EXISTS "bill_alerts_own" ON public.bill_alerts;

CREATE POLICY "bill_alerts_deny_anon"
  ON public.bill_alerts
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "bill_alerts_own"
  ON public.bill_alerts
  FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- personal_documents
ALTER TABLE public.personal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_documents_deny_anon" ON public.personal_documents;
DROP POLICY IF EXISTS "personal_documents_own" ON public.personal_documents;

CREATE POLICY "personal_documents_deny_anon"
  ON public.personal_documents
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "personal_documents_own"
  ON public.personal_documents
  FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ai_feedback_ledger
ALTER TABLE public.ai_feedback_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_feedback_ledger_deny_anon" ON public.ai_feedback_ledger;
DROP POLICY IF EXISTS "ai_feedback_ledger_own" ON public.ai_feedback_ledger;

CREATE POLICY "ai_feedback_ledger_deny_anon"
  ON public.ai_feedback_ledger
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "ai_feedback_ledger_own"
  ON public.ai_feedback_ledger
  FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- pending_filings
ALTER TABLE public.pending_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_filings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_filings_deny_anon" ON public.pending_filings;
DROP POLICY IF EXISTS "pending_filings_own" ON public.pending_filings;

CREATE POLICY "pending_filings_deny_anon"
  ON public.pending_filings
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "pending_filings_own"
  ON public.pending_filings
  FOR ALL
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
