"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { Button } from "@/components/ui/button";
import type { UploadResult } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const PROGRESS_FILL = "#2fae74";
const SURFACE_BG = "#1b4433";
const SURFACE_FG = "#8fe3ba";
const WARN = "#fbbf24";
const PROGRESS_SEGMENTS = 10;

const UPLOAD_FILL_MS = 1900;
const UPLOAD_SNAP_MS = 320;
const HOLD_BEFORE_MATCH_MS = 550;

export type ImportStage =
  | "idle"
  | "uploading"
  | "uploaded"
  | "matching"
  | "done"
  | "error";

type Stage = ImportStage;

const ENTER = { duration: 0.28, ease: [0.22, 0.8, 0.36, 1] } as const;

const TIP_LABEL: Record<UploadResult["tip"], string> = {
  MusteriListesi: "MusteriListesi",
  RutTanimListesi: "RutTanimListesi",
  SevkiyatRaporuKup: "SevkiyatRaporuKup",
};

interface DataImportFlowProps {
  onClose: () => void;
  onComplete?: () => void;
  onStageChange?: (stage: ImportStage) => void;
  /** Başarılı yükleme sonucu — asistan analizi için. */
  onResult?: (result: UploadResult) => void;
}

export function DataImportFlow({
  onClose,
  onComplete,
  onStageChange,
  onResult,
}: DataImportFlowProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showAllUnmatched, setShowAllUnmatched] = useState(false);

  const progress = useMotionValue(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileBlobRef = useRef<File | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const gateRef = useRef({ readDone: false, animDone: false });
  const abortRef = useRef<AbortController | null>(null);

  const clearTimers = useCallback(() => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimers();
      onStageChange?.("idle");
    },
    [clearTimers, onStageChange]
  );

  useEffect(() => {
    onStageChange?.(stage);
  }, [stage, onStageChange]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    clearTimers();
    gateRef.current = { readDone: false, animDone: false };
    progress.stop();
    progress.set(0);
    fileBlobRef.current = null;
    setFile(null);
    setError(null);
    setResult(null);
    setShowAllUnmatched(false);
    setStage("idle");
  }, [clearTimers, progress]);

  const runUpload = useCallback(async () => {
    const blob = fileBlobRef.current;
    if (!blob) {
      setError("Dosya kayboldu — tekrar seçin.");
      setStage("error");
      return;
    }

    setStage("matching");
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body = new FormData();
      body.append("file", blob, blob.name);

      const res = await fetch("/api/upload", {
        method: "POST",
        body,
        signal: controller.signal,
      });

      const data = (await res.json()) as UploadResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Yükleme başarısız.");
        setStage("error");
        return;
      }

      setResult(data);
      setStage("done");
      onResult?.(data);
      onComplete?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Ağ hatası — tekrar deneyin."
      );
      setStage("error");
    }
  }, [onComplete, onResult]);

  const finishUpload = useCallback(() => {
    animate(progress, 1, {
      duration: UPLOAD_SNAP_MS / 1000,
      ease: "easeOut",
    }).then(() => {
      setStage("uploaded");
      schedule(() => {
        void runUpload();
      }, HOLD_BEFORE_MATCH_MS);
    });
  }, [progress, schedule, runUpload]);

  const maybeFinish = useCallback(() => {
    if (gateRef.current.readDone && gateRef.current.animDone) finishUpload();
  }, [finishUpload]);

  const handleFile = useCallback(
    (picked: File) => {
      const lower = picked.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
        setError("Yalnızca .xlsx / .xls dosyaları kabul edilir.");
        setStage("error");
        setFile({ name: picked.name, size: picked.size });
        return;
      }

      fileBlobRef.current = picked;
      setFile({ name: picked.name, size: picked.size });
      setError(null);
      setResult(null);
      setStage("uploading");
      gateRef.current = { readDone: true, animDone: false };
      progress.set(0);

      animate(progress, 0.92, {
        duration: UPLOAD_FILL_MS / 1000,
        ease: "linear",
      }).then(() => {
        gateRef.current.animDone = true;
        maybeFinish();
      });
    },
    [maybeFinish, progress]
  );

  const uploadedVisible =
    stage === "uploaded" ||
    stage === "matching" ||
    stage === "done" ||
    stage === "error";

  const stripVisible = stage === "matching" || stage === "done";
  const showProgress =
    stage === "uploading" || stage === "uploaded" || stage === "matching" || stage === "done";
  const isComplete = stage === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-auto flex w-full max-w-[min(100%,18.5rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain max-h-[min(62dvh,calc(100dvh-6rem-env(safe-area-inset-bottom)))] sm:max-h-[calc(100dvh-6.5rem)]"
    >
      {/* Workflow surface: upload + status strip */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] backdrop-blur-sm">
        <div className={cn("px-3", isComplete ? "pt-2.5 pb-2" : "py-2.5")}>
          <div className="flex items-center gap-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[12px] font-medium">
              Müşteri verisi yükle
            </h2>
            <AnimatePresence>
              {(stage === "uploaded" ||
                stage === "matching" ||
                stage === "done") && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={ENTER}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full"
                  style={{ color: SURFACE_FG, backgroundColor: SURFACE_BG }}
                  title={stage === "done" ? "Tamam" : "Yüklendi"}
                >
                  <CheckIcon className="size-3" />
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={onClose}
              aria-label="Paneli kapat"
              className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          <div
            className={cn(
              "mt-2 rounded-lg transition-colors",
              stage === "idle"
                ? "cursor-pointer border border-dashed border-border/80 px-2 py-2.5 hover:bg-muted/30"
                : "bg-muted/20 px-2 py-1.5",
              dragOver && "bg-muted/45"
            )}
            onClick={
              stage === "idle" ? () => inputRef.current?.click() : undefined
            }
            onDragOver={(e) => {
              e.preventDefault();
              if (stage === "idle") setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (stage !== "idle") return;
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFile(dropped);
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {stage === "idle" ? (
                <motion.div
                  key="empty"
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="flex flex-col items-center justify-center gap-0.5 py-1 text-muted-foreground"
                >
                  <UploadIcon className="size-3.5" />
                  <p className="text-[11px]">Dosya seç veya sürükle</p>
                  <p className="font-mono text-[9px] tracking-widest uppercase opacity-65">
                    XLSX · XLS
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ENTER}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border/70 bg-popover text-muted-foreground">
                      <FileIcon name={file?.name} />
                    </span>
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {file?.name}
                    </p>
                    {!isComplete && (
                      <p className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                        {formatFileSize(file?.size ?? 0)}
                      </p>
                    )}
                  </div>
                  {showProgress && (
                    <ProgressSegments
                      progress={progress}
                      filled={stage === "matching" || stage === "done"}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
                e.target.value = "";
              }}
            />
          </div>

          {error && (
            <div
              className="mt-2 flex items-start gap-1.5 rounded-md px-2 py-1"
              style={{ backgroundColor: `${WARN}14`, color: WARN }}
            >
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
              <span className="font-mono text-[10px] leading-snug">{error}</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {stripVisible && (
            <motion.div
              key="strip"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={ENTER}
              className="overflow-hidden border-t border-black/20"
            >
              <div
                className="flex items-center gap-2 px-3 py-1.5"
                style={{ backgroundColor: SURFACE_BG }}
              >
                {stage === "matching" ? (
                  <motion.span
                    className="inline-flex shrink-0"
                    style={{ color: SURFACE_FG }}
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                  >
                    <RefreshCwIcon className="size-3" />
                  </motion.span>
                ) : (
                  <CheckIcon
                    className="size-3 shrink-0"
                    style={{ color: SURFACE_FG }}
                  />
                )}
                <span
                  className="font-mono text-[10px] tracking-wide uppercase"
                  style={{ color: SURFACE_FG }}
                >
                  {stage === "matching"
                    ? "Satırlar işleniyor..."
                    : "İşlem tamamlandı"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Result layer — same workflow, next stage */}
      <AnimatePresence>
        {stage === "done" && result && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={ENTER}
            className="rounded-xl border border-border/80 bg-popover/95 p-2.5 text-popover-foreground shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)] backdrop-blur-sm"
          >
            <dl className="flex flex-col gap-1 text-[11px]">
              <DetailRow label="Kaynak" value={file?.name ?? "—"} />
              <DetailRow label="Tip" value={TIP_LABEL[result.tip]} />
              {result.yuklenmeZamani && (
                <DetailRow
                  label="Zaman"
                  value={new Date(result.yuklenmeZamani).toLocaleString("tr-TR")}
                />
              )}
              <DetailRow
                label="İşlenen"
                value={`${formatNumber(result.islenenSatir)} satır`}
              />
              <DetailRow
                label="Yeni"
                value={`${formatNumber(result.yeniMusteri)} müşteri`}
              />
              <DetailRow
                label="Güncellenen"
                value={`${formatNumber(result.guncellenenMusteri)} müşteri`}
              />
              {result.tip === "MusteriListesi" && (
                <DetailRow
                  label="Geocode yok"
                  value={`${formatNumber(result.geocodeBasarisiz)}`}
                />
              )}
              {result.eslesmeyenMusteriKodlari.length > 0 && (
                <DetailRow
                  label="Eşleşmeyen"
                  value={`${formatNumber(result.eslesmeyenMusteriKodlari.length)} kod`}
                />
              )}
            </dl>

            {(result.yeniMusteri > 0 || result.guncellenenMusteri > 0) && (
              <p className="mt-2 rounded-md bg-muted/30 px-2 py-1.5 font-mono text-[10px] leading-snug text-foreground/75">
                {result.yeniMusteri > 0 && (
                  <span>
                    +{formatNumber(result.yeniMusteri)} yeni
                    {result.guncellenenMusteri > 0 ? " · " : ""}
                  </span>
                )}
                {result.guncellenenMusteri > 0 && (
                  <span>
                    {formatNumber(result.guncellenenMusteri)} güncellendi
                  </span>
                )}
              </p>
            )}

            {(result.dedupUyari ||
              (result.uyarilar && result.uyarilar.length > 0) ||
              result.geocodeBasarisiz > 0) && (
              <div
                className="mt-2 flex items-start gap-1.5 rounded-md px-2 py-1"
                style={{ backgroundColor: `${WARN}14`, color: WARN }}
              >
                <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
                <span className="font-mono text-[10px] leading-snug">
                  {result.uyarilar?.[0] ??
                    (result.geocodeBasarisiz > 0
                      ? `${result.geocodeBasarisiz} satırda konum çözülemedi`
                      : "Dedup varsayımı bozuldu — kontrol edin")}
                </span>
              </div>
            )}

            {result.eslesmeyenMusteriKodlari.length > 0 && (
              <UnmatchedCodesList
                codes={result.eslesmeyenMusteriKodlari}
                expanded={showAllUnmatched}
                onExpand={() => setShowAllUnmatched(true)}
              />
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="mt-2 h-7 w-full rounded-full text-[11px]"
            >
              Yeni dosya yükle
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {stage === "error" && uploadedVisible && (
          <motion.div
            key="retry"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={ENTER}
            className="rounded-xl border border-border/80 bg-popover/95 p-2 text-popover-foreground shadow-[0_10px_28px_-14px_rgba(0,0,0,0.55)]"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="h-7 w-full rounded-full text-[11px]"
            >
              Tekrar dene
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProgressSegments({
  progress,
  filled,
}: {
  progress: MotionValue<number>;
  filled?: boolean;
}) {
  return (
    <div className="mt-1.5 flex gap-[2px]">
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) =>
        filled ? (
          <span
            key={i}
            className="h-1 min-w-0 flex-1 rounded-[1px]"
            style={{ backgroundColor: PROGRESS_FILL }}
          />
        ) : (
          <ProgressSegment key={i} index={i} progress={progress} />
        )
      )}
    </div>
  );
}

function ProgressSegment({
  index,
  progress,
}: {
  index: number;
  progress: MotionValue<number>;
}) {
  const scaleX = useTransform(progress, (p) =>
    Math.min(Math.max(p * PROGRESS_SEGMENTS - index, 0), 1)
  );
  return (
    <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-[1px] bg-secondary">
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ scaleX, backgroundColor: PROGRESS_FILL }}
      />
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono text-[10.5px] tabular-nums">
        {value}
      </dd>
    </div>
  );
}

const UNMATCHED_PREVIEW = 24;

function UnmatchedCodesList({
  codes,
  expanded,
  onExpand,
}: {
  codes: string[];
  expanded: boolean;
  onExpand: () => void;
}) {
  const hidden = Math.max(0, codes.length - UNMATCHED_PREVIEW);
  const visible = expanded ? codes : codes.slice(0, UNMATCHED_PREVIEW);

  return (
    <div className="mt-2 max-h-20 overflow-y-auto overscroll-contain rounded-md bg-muted/25 px-2 py-1">
      <p className="mb-0.5 font-mono text-[9px] tracking-wide text-muted-foreground uppercase">
        Eşleşmeyen kayıtlar
      </p>
      <ul className="flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-foreground/80">
        {visible.map((kod) => (
          <li key={kod}>{kod}</li>
        ))}
      </ul>
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className={cn(
            "mt-0.5 inline border-0 bg-transparent p-0 font-mono text-[10px] tabular-nums text-muted-foreground",
            "cursor-pointer transition-[color,text-shadow] duration-200",
            "hover:text-foreground hover:text-shadow-[0_0_12px_rgba(143,227,186,0.55)]",
            "focus-visible:outline-none focus-visible:text-foreground focus-visible:text-shadow-[0_0_12px_rgba(143,227,186,0.55)]"
          )}
        >
          … +{formatNumber(hidden)} daha
        </button>
      )}
    </div>
  );
}

function FileIcon({ name }: { name?: string }) {
  const ext = name?.split(".").pop()?.toLowerCase();
  const Icon =
    ext === "xlsx" || ext === "xls" ? FileSpreadsheetIcon : FileTextIcon;
  return <Icon className="size-3.5" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("tr-TR");
}
