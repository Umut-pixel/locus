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
import { cn } from "@/lib/utils";

// Segment dolgusu için orta doygunlukta yeşil — koyu zeminde net ama neon değil.
const PROGRESS_FILL = "#2fae74";
// Rozet ve eşleştirme şeridi için sönük, koyu zümrüt yüzey + üzerinde okunur nane tonu.
const SURFACE_BG = "#1b4433";
const SURFACE_FG = "#8fe3ba";
const WARN = "#fbbf24";
const PROGRESS_SEGMENTS = 10;

// Aşamalar arasında bilinçli bekleme süreleri: her adımın gözle takip
// edilebilmesi için (referans görsellerdeki gibi "duran" bir akış).
const UPLOAD_FILL_MS = 1900;
const UPLOAD_SNAP_MS = 320;
const HOLD_BEFORE_MATCH_MS = 550;
const MATCHING_MS = 2300;

/**
 * idle → uploading → uploaded → matching → done
 * Her aşama bir öncekine zincirli; öğeler "yoktan" sırayla kurulur.
 */
type Stage = "idle" | "uploading" | "uploaded" | "matching" | "done";

const ENTER = { duration: 0.3, ease: [0.22, 0.8, 0.36, 1] } as const;

interface DataImportFlowProps {
  onClose: () => void;
}

export function DataImportFlow({ onClose }: DataImportFlowProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Progress MotionValue üzerinden akar: segment dolguları transform (scaleX)
  // ile güncellenir, React re-render tetiklenmez.
  const progress = useMotionValue(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const readerRef = useRef<FileReader | null>(null);
  /** Okunan içerik — Excel/CSV ayrıştırma eklendiğinde buradan parse edilecek. */
  const bufferRef = useRef<ArrayBuffer | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  // Yükleme bitişi iki koşula bağlı: dosya gerçekten okundu + bar animasyonu
  // hedefine ulaştı. Hangisi geç biterse son adımı o tamamlar.
  const gateRef = useRef({ readDone: false, animDone: false });

  const clearTimers = useCallback(() => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  }, []);

  useEffect(
    () => () => {
      readerRef.current?.abort();
      clearTimers();
    },
    [clearTimers]
  );

  const schedule = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(window.setTimeout(fn, ms));
  }, []);

  const reset = useCallback(() => {
    readerRef.current?.abort();
    clearTimers();
    gateRef.current = { readDone: false, animDone: false };
    progress.stop();
    progress.set(0);
    bufferRef.current = null;
    setFile(null);
    setError(null);
    setStage("idle");
  }, [clearTimers, progress]);

  const finishUpload = useCallback(() => {
    animate(progress, 1, { duration: UPLOAD_SNAP_MS / 1000, ease: "easeOut" }).then(
      () => {
        setStage("uploaded");
        schedule(() => setStage("matching"), HOLD_BEFORE_MATCH_MS);
        // Concept: eşleştirme süresi şimdilik sabit; Excel ayrıştırma
        // eklendiğinde "done" gerçek işlemin bitişine bağlanacak.
        schedule(() => setStage("done"), HOLD_BEFORE_MATCH_MS + MATCHING_MS);
      }
    );
  }, [progress, schedule]);

  const maybeFinish = useCallback(() => {
    if (gateRef.current.readDone && gateRef.current.animDone) finishUpload();
  }, [finishUpload]);

  const handleFile = useCallback(
    (picked: File) => {
      setFile({ name: picked.name, size: picked.size });
      setError(null);
      setStage("uploading");
      gateRef.current = { readDone: false, animDone: false };
      progress.set(0);

      const reader = new FileReader();
      readerRef.current = reader;
      reader.onload = () => {
        bufferRef.current = reader.result as ArrayBuffer;
        gateRef.current.readDone = true;
        maybeFinish();
      };
      reader.onerror = () => {
        setError("Dosya okunamadı — tekrar deneyin.");
        setFile(null);
        progress.set(0);
        setStage("idle");
      };
      reader.readAsArrayBuffer(picked);

      // Segmentlerin soldan sağa tek tek, sabit hızda dolduğu net bir ilerleme
      // hissi için doğrusal (linear) — ease-out ilk segmentleri sıkıştırırdı.
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
    stage === "uploaded" || stage === "matching" || stage === "done";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="pointer-events-auto flex max-h-[calc(100dvh-7rem)] w-[380px] max-w-full flex-col gap-2 overflow-y-auto"
    >
      {/* Yükleme kartı + eşleştirme şeridi: tek fiziksel yüzey (overflow-hidden
          sayesinde şerit karta "yapışık" görünür, ayrı bir kutu değil). */}
      <div className="overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]">
        <div className="p-3.5">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
              Müşteri verisi yükle
            </h2>
            <AnimatePresence>
              {uploadedVisible && (
                <motion.span
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={ENTER}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase"
                  style={{ color: SURFACE_FG, backgroundColor: SURFACE_BG }}
                >
                  <CheckIcon className="size-3" />
                  Yüklendi
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

          {/* Boş bırakma alanı ↔ dosya rafı: aynı yüzeyin içinde dönüşür */}
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
                    XLSX · CSV
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
                  <ProgressSegments progress={progress} />
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
                e.target.value = "";
              }}
            />
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        {/* Eşleştirme şeridi: alttan yükseklik kazanarak belirir, karta yapışık */}
        <AnimatePresence>
          {(stage === "matching" || stage === "done") && (
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
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
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
                    ? "Satırlar şemayla eşleştiriliyor..."
                    : "Şema eşleştirmesi tamamlandı"}
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sonuç paneli: bağlı yüzeyden ayrı, kendi kartında altta belirir */}
      <AnimatePresence>
        {stage === "done" && (
          <motion.div
            key="details"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={ENTER}
            className="rounded-2xl border bg-popover p-3 text-popover-foreground shadow-[0_16px_48px_-12px_rgba(0,0,0,0.6)]"
          >
            {/* Concept değerler — Excel ayrıştırma eklendiğinde bufferRef
                içeriğinden gelen gerçek parse sonuçları yazılacak. */}
            <dl className="flex flex-col gap-1.5 text-xs">
              <DetailRow label="Kaynak" value={file?.name ?? "—"} />
              <DetailRow label="Kayıt" value="1.248 satır" />
              <DetailRow label="Şema" value="Geçerli" />
              <DetailRow label="Dönem" value="Nisan 2026" />
            </dl>
            <div
              className="mt-2.5 flex items-center gap-2 rounded-lg px-2.5 py-1.5"
              style={{ backgroundColor: `${WARN}14`, color: WARN }}
            >
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              <span className="font-mono text-[11px]">
                3 satırda konum bilgisi eksik
              </span>
            </div>
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
    </motion.div>
  );
}

/** 10 ayrık segment; her segmentin dolgusu progress'ten türetilen scaleX. */
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
    ext === "xlsx" || ext === "xls" || ext === "csv"
      ? FileSpreadsheetIcon
      : FileTextIcon;
  return <Icon className="size-4" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
