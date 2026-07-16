export type ScanFilter = "original" | "magic" | "grayscale" | "sharp";

export type Point = { x: number; y: number };

export type Quad = [Point, Point, Point, Point];

export type ScannedPage = {
  id: string;
  originalDataUrl: string;
  processedDataUrl: string;
  filter: ScanFilter;
  corners: Quad | null;
  createdAt: number;
  /** Original upload filename when available (used for demo personal-doc detection) */
  sourceFileName?: string;
};

export type ExportFormat = "pdf" | "jpg";

export type DriveFolder = {
  id: string;
  name: string;
  path: string;
};

export type Contact = {
  email: string;
  name?: string;
};

export type ScanSessionState = {
  pages: ScannedPage[];
  activePageId: string | null;
  filter: ScanFilter;
};

export type DocType =
  | "Invoice"
  | "Receipt"
  | "Bill"
  | "Contract"
  | "ID"
  | "ID_Card"
  | "Passport"
  | "Driver_License"
  | "Car_License"
  | "Insurance"
  | "Certificate"
  | "Other";

export type PersonalDocType =
  | "ID_Card"
  | "Passport"
  | "Driver_License"
  | "Car_License"
  | "Insurance"
  | "Certificate";

export type ClassificationResult = {
  doc_type: DocType;
  vendor: string;
  suggested_folder_name: string;
  summary: string;
  confidence: number;
  is_unpaid_bill?: boolean;
  amount?: number | null;
  due_date?: string | null;
  is_personal_doc?: boolean;
  document_number?: string | null;
  expiration_date?: string | null;
  tags?: string[];
};

export type PersonalDocument = {
  id: string;
  user_id: string | null;
  doc_type: string;
  title: string;
  document_number: string | null;
  expiration_date: string | null;
  file_id: string;
  file_url: string | null;
  summary: string | null;
  tags: string[] | null;
  created_at: string;
};

export type BillAlertStatus = "PENDING_PAYMENT" | "PAID_AND_ARCHIVED";

export type BillAlert = {
  id: string;
  user_id: string | null;
  vendor: string;
  amount: number | null;
  due_date: string | null;
  status: BillAlertStatus;
  original_bill_file_id: string;
  original_bill_url: string | null;
  receipt_file_id: string | null;
  created_at: string;
};

export type RoutingRule = {
  id: string;
  user_id: string | null;
  vendor_or_doc_type: string;
  target_folder_id: string;
  target_folder_name: string;
  confirmation_count: number;
  is_autonomous: boolean;
  last_triggered_at: string;
  created_at: string;
};

export type RulesUpsertResult = {
  rule: RoutingRule;
  learned: boolean;
  confirmation_count: number;
};

export type RetrieveDocumentCard = {
  id: string;
  title: string;
  doc_type: string;
  document_number: string | null;
  expiration_date: string | null;
  expired: boolean;
  expiring_soon: boolean;
  file_url: string | null;
  file_id: string;
  summary: string | null;
  source: "vault" | "bill";
};

export type RetrieveResult = {
  answer: string;
  documents: RetrieveDocumentCard[];
  demo?: boolean;
};
