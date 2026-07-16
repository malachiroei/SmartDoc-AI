CREATE TABLE public.ai_feedback_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    -- Original AI prediction (nullable if unknown)
    original_doc_type TEXT NULL,
    original_vendor TEXT NULL,
    original_folder TEXT NULL,
    -- User-corrected ground truth
    corrected_doc_type TEXT NOT NULL,
    corrected_vendor TEXT NOT NULL,
    corrected_folder TEXT NULL,
    corrected_summary TEXT NULL,
    is_personal_doc BOOLEAN DEFAULT false,
    -- Match hints for future retrieval
    match_vendor TEXT NULL,
    notes TEXT NULL,
    priority INT DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_feedback_vendor ON public.ai_feedback_ledger(corrected_vendor);
CREATE INDEX idx_ai_feedback_match ON public.ai_feedback_ledger(match_vendor);
CREATE INDEX idx_ai_feedback_created ON public.ai_feedback_ledger(created_at DESC);

ALTER TABLE public.ai_feedback_ledger DISABLE ROW LEVEL SECURITY;
