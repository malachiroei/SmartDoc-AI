-- Dedupe Drive Inbox pulls by file id (CamScanner → SmartDoc_Inbox)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_filings_drive_file_unique
  ON public.pending_filings(drive_file_id)
  WHERE status IN ('pending', 'filed') AND drive_file_id IS NOT NULL;
