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
