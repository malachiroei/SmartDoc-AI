CREATE TABLE public.bill_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    vendor TEXT NOT NULL,
    amount DECIMAL(10, 2) NULL,
    due_date DATE NULL,
    status TEXT DEFAULT 'PENDING_PAYMENT',
    original_bill_file_id TEXT NOT NULL,
    original_bill_url TEXT NULL,
    receipt_file_id TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bill_alerts_status ON public.bill_alerts(status);

ALTER TABLE public.bill_alerts DISABLE ROW LEVEL SECURITY;
