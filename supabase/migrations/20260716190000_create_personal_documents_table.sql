CREATE TABLE public.personal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL,
    doc_type TEXT NOT NULL,
    title TEXT NOT NULL,
    document_number TEXT NULL,
    expiration_date DATE NULL,
    file_id TEXT NOT NULL,
    file_url TEXT NULL,
    summary TEXT NULL,
    tags TEXT[] NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_personal_docs_type ON public.personal_documents(doc_type);
CREATE INDEX idx_personal_docs_tags ON public.personal_documents USING GIN (tags);

ALTER TABLE public.personal_documents DISABLE ROW LEVEL SECURITY;
