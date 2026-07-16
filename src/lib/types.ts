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
  | "Other";

export type ClassificationResult = {
  doc_type: DocType;
  vendor: string;
  suggested_folder_name: string;
  summary: string;
  confidence: number;
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
