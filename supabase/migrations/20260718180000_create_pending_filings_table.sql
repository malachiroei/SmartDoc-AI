-- Pending filings awaiting the 3-strike user confirmation (name + folder)
CREATE TABLE IF NOT EXISTS public.pending_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL DEFAULT 'gmail',
    gmail_message_id TEXT NULL,
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    drive_file_id TEXT NULL,
    drive_file_url TEXT NULL,
    classification JSONB NOT NULL,
    suggested_file_name TEXT NOT NULL,
    suggested_folder_name TEXT NOT NULL,
    vendor_key TEXT NOT NULL,
    confirmation_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'filed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_filings_status
  ON public.pending_filings(status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_filings_gmail_unique
  ON public.pending_filings(gmail_message_id, original_file_name)
  WHERE status = 'pending' AND gmail_message_id IS NOT NULL;
