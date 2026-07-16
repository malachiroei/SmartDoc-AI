"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Folder, HardDrive, Loader2 } from "lucide-react";
import type { DriveFolder } from "@/lib/types";
import {
  getLastDriveFolder,
  setLastDriveFolder,
} from "@/lib/storage/preferences";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { he } from "@/lib/i18n/he";

type Props = {
  onSelect: (folder: DriveFolder) => void;
  selectedId?: string;
};

export function DriveFolderPicker({ onSelect, selectedId }: Props) {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const last = useMemo(() => getLastDriveFolder(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/drive/folders");
        const data = await res.json();
        if (!cancelled) {
          setFolders(data.folders ?? []);
          const preferred =
            data.folders?.find((f: DriveFolder) => f.id === last?.id) ??
            data.folders?.[0];
          if (preferred && !selectedId) onSelect(preferred);
        }
      } catch {
        if (!cancelled) setError(he.drive.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)] py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> {he.drive.loading}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-300 py-4 text-center">{error}</p>;
  }

  return (
    <div className="space-y-2 max-h-56 overflow-y-auto" dir="rtl">
      {folders.map((folder) => {
        const active = selectedId === folder.id;
        const isLast = last?.id === folder.id;
        const displayName =
          folder.id === "root" ? he.drive.root : folder.name;
        return (
          <button
            key={folder.id}
            type="button"
            onClick={() => {
              setLastDriveFolder(folder);
              onSelect(folder);
            }}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-start transition-colors",
              active
                ? "border-teal-400 bg-teal-400/10"
                : "border-[var(--border)] hover:bg-[var(--surface-2)]"
            )}
          >
            <div className="h-9 w-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-teal-300">
              {folder.id === "root" ? (
                <HardDrive className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{displayName}</div>
              <div className="text-xs text-[var(--fg-muted)] truncate">
                {folder.path}
                {isLast ? ` · ${he.drive.lastUsed}` : ""}
              </div>
            </div>
            {active ? (
              <Check className="h-4 w-4 text-teal-300 shrink-0" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-[var(--fg-muted)] shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

type UploadProps = {
  folder: DriveFolder | null;
  fileName: string;
  uploading: boolean;
  onUpload: () => void;
};

export function DriveUploadBar({
  folder,
  fileName,
  uploading,
  onUpload,
}: UploadProps) {
  return (
    <div className="space-y-3" dir="rtl">
      <label className="block text-xs tracking-wider text-[var(--fg-muted)]">
        {he.drive.filename}
      </label>
      <input
        readOnly
        value={fileName}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-sm"
        dir="ltr"
      />
      <Button
        className="w-full"
        onClick={onUpload}
        disabled={!folder || uploading}
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {he.drive.uploading}
          </>
        ) : (
          <>
            <HardDrive className="h-4 w-4" />{" "}
            {he.drive.saveTo(folder?.name ?? "Google Drive")}
          </>
        )}
      </Button>
    </div>
  );
}
