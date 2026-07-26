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

type Stage = "idle" | "uploading" | "uploaded" | "matching" | "done" | "error";

const ENTER = { duration: 0.3, ease: [0.22, 0.8, 0.36, 1] } as const;

const TIP_LABEL: Record<UploadResult["tip"], string> = {
  MusteriListesi: "MusteriListesi",
  RutTanimListesi: "RutTanimListesi",
  SevkiyatRaporuKup: "SevkiyatRaporuKup",
};

interface DataImportFlowProps {
  onClose: () => void;
  onComplete?: () => void;
}

export function DataImportFlow({ onClose, onComplete }: DataImportFlowProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const progress = useMotionValue(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<FileReader | null>(null);
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
      readerRef.current?.abort();
      abortRef.current?.abort();
      clearTimers();
    },
    [clearTimers]
  );

  const schedule = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const reset = useCallback(() => {
    readerRef.current?.abort();
    abortRef.current?.abort();
    clearTimers();
    gateRef.current = { readDone: false, animDone: false };
    progress.stop();
    progress.set(0);
    fileBlobRef.current = null;
    setFile(null);
    setError(null);
    setResult(null);
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
      onComplete?.();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Ağ hatası — tekrar deneyin."
      );
      setStage("error");
    }
  }, [onComplete]);

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
      gateRef.current = { readDone: false, animDone: false };
      progress.set(0);

      const reader = new FileReader();
      readerRef.current = reader;
      reader.onload = () => {
        gateRef.current.readDone = true;
        maybeFinish();
      };
      reader.onerror = () => {
        setError("Dosya okunamadı — tekrar deneyin.");
        fileBlobRef.current = null;
        setFile(null);
        progress.set(0);
        setStage("idle");
      };
      reader.readAsArrayBuffer(picked);

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

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="pointer-events-auto flex max-h-[calc(100dvh-7rem)] w-[380px] max-w-full flex-col gap-2 overflow-y-auto"
    >
      <div className="overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]">
        <div className="p-3.5">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
              Müşteri verisi yükle
            </h2>
            <AnimatePresence>
              {(stage === "uploaded" ||
                stage === "matching" ||
                stage === "done") && (
                <motion.span
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ENTER}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase"
                  style={{ color: SURFACE_FG, backgroundColor: SURFACE_BG }}
                >
                  <CheckIcon className="size-3" />
                  {stage === "done" ? "Tamam" : "Yüklendi"}
                </motion.span>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={onClose}
              aria-label="Paneli kapat"
              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          <div
            className={cn(
              "mt-2.5 rounded-lg p-2.5 transition-colors",
              stage === "idle"
                ? "cursor-pointer border border-dashed hover:bg-muted/35"
                : "bg-muted/25",
              dragOver && "bg-muted/50"
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
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center justify-center gap-1 py-3 text-muted-foreground"
                >
                  <UploadIcon className="size-4" />
                  <p className="text-xs">Dosya seç veya buraya sürükle</p>
                  <p className="font-mono text-[10px] tracking-widest uppercase opacity-70">
                    XLSX · XLS
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="file"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ENTER}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-popover text-muted-foreground">
                      <FileIcon name={file?.name} />
                    </span>
                    <p className="min-w-0 flex-1 truncate font-mono text-xs">
                      {file?.name}
                    </p>
                    <p className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatFileSize(file?.size ?? 0)}
                    </p>
                  </div>
                  {(stage === "uploading" || stage === "uploaded") && (
                    <ProgressSegments progress={progress} />
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
              className="mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-1.5"
              style={{ backgroundColor: `${WARN}14`, color: WARN }}
            >
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              <span className="font-mono text-[11px] leading-snug">{error}</span>
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
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: 14 }}
                animate={{ y: 0 }}
                transition={ENTER}
                className="flex items-center gap-2.5 px-3.5 py-2.5"
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
                    <RefreshCwIcon className="size-3.5" />
                  </motion.span>
                ) : (
                  <CheckIcon
                    className="size-3.5 shrink-0"
                    style={{ color: SURFACE_FG }}
                  />
                )}
                <span
                  className="font-mono text-[11px] tracking-wide uppercase"
                  style={{ color: SURFACE_FG }}
                >
                  {stage === "matching"
                    ? "Satırlar işleniyor..."
                    : "İşlem tamamlandı"}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {stage === "done" && result && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={ENTER}
            className="rounded-2xl border bg-popover p-3 text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
          >
            <dl className="flex flex-col gap-1.5 text-xs">
              <DetailRow label="Kaynak" value={file?.name ?? "—"} />
              <DetailRow label="Tip" value={TIP_LABEL[result.tip]} />
              <DetailRow
                label="İşlenen"
                value={`${formatNumber(result.islenenSatir)} satır`}
              />
              {result.yeniMusteri > 0 && (
                <DetailRow
                  label="Yeni"
                  value={`${formatNumber(result.yeniMusteri)} müşteri`}
                />
              )}
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

            {(result.dedupUyari ||
              (result.uyarilar && result.uyarilar.length > 0) ||
              result.geocodeBasarisiz > 0) && (
              <div
                className="mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-1.5"
                style={{ backgroundColor: `${WARN}14`, color: WARN }}
              >
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                <span className="font-mono text-[11px] leading-snug">
                  {result.uyarilar?.[0] ??
                    (result.geocodeBasarisiz > 0
                      ? `${result.geocodeBasarisiz} satırda konum çözülemedi`
                      : "Dedup varsayımı bozuldu — kontrol edin")}
                </span>
              </div>
            )}

            {result.eslesmeyenMusteriKodlari.length > 0 && (
              <div className="mt-2.5 max-h-28 overflow-y-auto rounded-lg bg-muted/30 px-2.5 py-1.5">
                <p className="mb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                  Eşleşmeyen musteri_kodu
                </p>
                <ul className="flex flex-col gap-0.5 font-mono text-[11px] tabular-nums">
                  {result.eslesmeyenMusteriKodlari.slice(0, 40).map((kod) => (
                    <li key={kod}>{kod}</li>
                  ))}
                  {result.eslesmeyenMusteriKodlari.length > 40 && (
                    <li className="text-muted-foreground">
                      … +{result.eslesmeyenMusteriKodlari.length - 40} daha
                    </li>
                  )}
                </ul>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="mt-2.5 w-full rounded-full text-xs"
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
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={ENTER}
            className="rounded-2xl border bg-popover p-3 text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              className="w-full rounded-full text-xs"
            >
              Tekrar dene
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ProgressSegments({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="mt-2 flex gap-[3px]">
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <ProgressSegment key={i} index={i} progress={progress} />
      ))}
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
    <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-[1px] bg-secondary">
      <motion.span
        className="absolute inset-0 origin-left"
        style={{ scaleX, backgroundColor: PROGRESS_FILL }}
      />
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function FileIcon({ name }: { name?: string }) {
  const ext = name?.split(".").pop()?.toLowerCase();
  const Icon =
    ext === "xlsx" || ext === "xls" ? FileSpreadsheetIcon : FileTextIcon;
  return <Icon className="size-4" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("tr-TR");
}
