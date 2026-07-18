"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { nanoid } from "nanoid";
import {
  Check,
  Crop,
  FileImage,
  FileText,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type { ExportFormat, Quad, ScanFilter, ScannedPage } from "@/lib/types";
import {
  canvasToDataUrl,
  defaultQuad,
  detectCornersFromImage,
  fullFrameQuad,
  loadImage,
  warpPerspective,
} from "@/lib/image/perspective";
import { applyFilter } from "@/lib/image/filters";
import { isPdfFile, pdfFileToImageDataUrls } from "@/lib/image/pdf";
import { he } from "@/lib/i18n/he";
import { cn } from "@/lib/utils";
import { PerspectiveEditor } from "./PerspectiveEditor";
import { FilterSelector } from "./FilterSelector";
import { PageThumbnails } from "./PageThumbnails";
import { Button } from "@/components/ui/Button";

/** Camera uses navigator.mediaDevices — never SSR */
const CameraViewfinder = dynamic(
  () =>
    import("./CameraViewfinder").then((m) => m.CameraViewfinder),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center text-sm text-[var(--fg-muted)] animate-pulse">
        {he.camera.starting}
      </div>
    ),
  }
);

type Mode = "camera" | "review";

type Props = {
  onSave: (pages: ScannedPage[], format: ExportFormat) => void;
  onCancel?: () => void;
};

async function processPage(
  originalDataUrl: string,
  corners: Quad,
  filter: ScanFilter
): Promise<string> {
  const img = await loadImage(originalDataUrl);
  const warped = warpPerspective(img, corners);
  const filtered = applyFilter(warped, filter);
  return canvasToDataUrl(filtered, "image/jpeg", 0.92);
}

export function ScanWorkspace({
  onSave,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<Mode>("camera");
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftOriginal, setDraftOriginal] = useState<string | null>(null);
  const [draftCorners, setDraftCorners] = useState<Quad | null>(null);
  const [draftFileName, setDraftFileName] = useState<string | undefined>();
  const [filter, setFilter] = useState<ScanFilter>("original");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("pdf");

  const active = pages.find((p) => p.id === activeId) ?? null;

  const regeneratePreview = useCallback(
    async (src: string, corners: Quad, f: ScanFilter) => {
      setBusy(true);
      try {
        const url = await processPage(src, corners, f);
        setPreview(url);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    if (mode === "review" && draftOriginal && draftCorners) {
      regeneratePreview(draftOriginal, draftCorners, filter);
    }
  }, [mode, draftOriginal, draftCorners, filter, regeneratePreview]);

  const handleCapture = (dataUrl: string, corners: Quad) => {
    setDraftOriginal(dataUrl);
    setDraftCorners(corners);
    setDraftFileName(undefined);
    setMode("review");
  };

  const handleFileUpload = async (file: File) => {
    setBusy(true);
    try {
      if (isPdfFile(file)) {
        const pageUrls = await pdfFileToImageDataUrls(file);
        if (pageUrls.length === 0) {
          throw new Error(he.scanner.pdfEmpty);
        }

        const newPages: ScannedPage[] = [];
        for (const dataUrl of pageUrls) {
          const img = await loadImage(dataUrl);
          const detected = detectCornersFromImage(img, 0.32);
          const corners =
            detected.confidence >= 0.32
              ? detected.quad
              : defaultQuad(img.naturalWidth, img.naturalHeight, 0.02);
          const processed = await processPage(dataUrl, corners, filter);
          newPages.push({
            id: nanoid(),
            originalDataUrl: dataUrl,
            processedDataUrl: processed,
            filter,
            corners,
            createdAt: Date.now(),
            sourceFileName: file.name,
          });
        }

        setPages((prev) => [...prev, ...newPages]);
        setActiveId(newPages[0].id);
        setFormat("pdf");
        setMode("camera");
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error(he.scanner.openFailed));
        reader.readAsDataURL(file);
      });

      const img = await loadImage(dataUrl);
      const detected = detectCornersFromImage(img, 0.32);
      setDraftOriginal(dataUrl);
      setDraftCorners(
        detected.confidence >= 0.32
          ? detected.quad
          : defaultQuad(img.naturalWidth, img.naturalHeight, 0.06)
      );
      setDraftFileName(file.name);
      setMode("review");
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : he.scanner.openFailed);
    } finally {
      setBusy(false);
    }
  };

  const buildDraftPage = async (): Promise<ScannedPage | null> => {
    if (!draftOriginal || !draftCorners || !preview) return null;
    const processed = await processPage(draftOriginal, draftCorners, filter);
    return {
      id: nanoid(),
      originalDataUrl: draftOriginal,
      processedDataUrl: processed,
      filter,
      corners: draftCorners,
      createdAt: Date.now(),
      sourceFileName: draftFileName,
    };
  };

  const clearDraft = () => {
    setDraftOriginal(null);
    setDraftCorners(null);
    setDraftFileName(undefined);
    setPreview(null);
  };

  /** Add page to session, stay in camera for more pages */
  const confirmPage = async () => {
    setBusy(true);
    try {
      const page = await buildDraftPage();
      if (!page) return;
      setPages((prev) => [...prev, page]);
      setActiveId(page.id);
      clearDraft();
      setMode("camera");
    } finally {
      setBusy(false);
    }
  };

  /** Finish with current draft (+ any existing pages) and run classify */
  const finishAndScan = async () => {
    setBusy(true);
    try {
      let nextPages = [...pages];
      if (draftOriginal && draftCorners && preview) {
        const page = await buildDraftPage();
        if (page) nextPages = [...nextPages, page];
      }
      if (nextPages.length === 0) return;
      clearDraft();
      onSave(nextPages, format);
    } finally {
      setBusy(false);
    }
  };

  const reprocessActive = async (f: ScanFilter) => {
    if (!active) return;
    setFilter(f);
    setBusy(true);
    try {
      const corners =
        active.corners ??
        defaultQuad(
          (await loadImage(active.originalDataUrl)).naturalWidth,
          (await loadImage(active.originalDataUrl)).naturalHeight
        );
      const processed = await processPage(
        active.originalDataUrl,
        corners,
        f
      );
      setPages((prev) =>
        prev.map((p) =>
          p.id === active.id
            ? { ...p, filter: f, processedDataUrl: processed, corners }
            : p
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {mode === "camera" && (
        <>
          <CameraViewfinder onCapture={handleCapture} />

          {/* Always visible — even when camera permission fails */}
          <label
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border border-dashed border-teal-400/40 bg-teal-400/5 px-3 py-2.5 cursor-pointer transition-colors hover:border-teal-400/70",
              busy && "opacity-60 pointer-events-none"
            )}
          >
            <Upload className="h-4 w-4 text-teal-300" />
            <span className="text-xs font-medium text-teal-100">
              {busy ? he.scanner.processing : he.scanner.upload}
            </span>
            <input
              type="file"
              accept="image/*,application/pdf,.pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void handleFileUpload(f);
              }}
            />
          </label>

          {onCancel && (
            <div className="flex justify-start">
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X className="h-4 w-4" /> {he.scanner.cancel}
              </Button>
            </div>
          )}
        </>
      )}

      {mode === "review" && draftOriginal && draftCorners && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
              <Crop className="h-3.5 w-3.5 text-blue-400" />
              {he.scanner.dragCorners}
            </div>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="!py-1 !text-xs"
              onClick={() => {
                void loadImage(draftOriginal).then((img) => {
                  setDraftCorners(
                    fullFrameQuad(img.naturalWidth, img.naturalHeight)
                  );
                });
              }}
            >
              {he.scanner.fullPage}
            </Button>
          </div>

          <PerspectiveEditor
            imageSrc={draftOriginal}
            corners={draftCorners}
            onChange={setDraftCorners}
            className="[&_img]:max-h-[min(38dvh,280px)]"
          />

          <FilterSelector
            value={filter}
            onChange={setFilter}
            previewSrc={preview ?? draftOriginal}
            compact
          />

          <div className="sticky bottom-0 z-10 space-y-1.5 bg-gradient-to-t from-[var(--ink)] via-[var(--ink)] to-transparent pt-3 pb-safe shrink-0">
            <Button
              className="w-full"
              size="lg"
              onClick={() => void finishAndScan()}
              disabled={busy || !preview}
            >
              <Sparkles className="h-5 w-5" />
              {he.scanner.finishScan}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                size="sm"
                onClick={() => {
                  clearDraft();
                  setMode("camera");
                }}
              >
                {he.scanner.retake}
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                size="sm"
                onClick={() => void confirmPage()}
                disabled={busy || !preview}
              >
                <Check className="h-4 w-4" /> {he.scanner.addPage}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pages.length > 0 && mode === "camera" && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-[family-name:var(--font-display)] text-lg">
              {he.scanner.session} · {pages.length}{" "}
              {pages.length === 1 ? he.scanner.page : he.scanner.pages}
            </h3>
          </div>
          <PageThumbnails
            pages={pages}
            activeId={activeId}
            onSelect={setActiveId}
            onRemove={removePage}
            onAdd={() => setMode("camera")}
          />
          {active && (
            <FilterSelector
              value={active.filter}
              onChange={reprocessActive}
              previewSrc={active.processedDataUrl}
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat("pdf")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                format === "pdf"
                  ? "border-teal-400 bg-teal-400/10 text-teal-200"
                  : "border-[var(--border)] text-[var(--fg-muted)]"
              }`}
            >
              <FileText className="h-4 w-4" /> PDF
            </button>
            <button
              type="button"
              onClick={() => setFormat("jpg")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                format === "jpg"
                  ? "border-teal-400 bg-teal-400/10 text-teal-200"
                  : "border-[var(--border)] text-[var(--fg-muted)]"
              }`}
            >
              <FileImage className="h-4 w-4" /> JPG
            </button>
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={() => onSave(pages, format)}
            disabled={pages.length === 0}
          >
            <Sparkles className="h-5 w-5" />
            {he.scanner.finishScan}
          </Button>
        </div>
      )}
    </div>
  );
}
