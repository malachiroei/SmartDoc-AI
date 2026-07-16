CREATE TABLE public.routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    vendor_or_doc_type TEXT NOT NULL,
    target_folder_id TEXT NOT NULL,
    target_folder_name TEXT NOT NULL,
    confirmation_count INT DEFAULT 1,
    is_autonomous BOOLEAN DEFAULT false,
    last_triggered_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    
    CONSTRAINT unique_vendor_rule UNIQUE (vendor_or_doc_type)
);

CREATE INDEX idx_routing_rules_lookup ON public.routing_rules(vendor_or_doc_type);