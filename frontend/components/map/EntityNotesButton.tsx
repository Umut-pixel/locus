"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StickyNoteIcon, Trash2Icon, XIcon } from "lucide-react";

import { formatDateTimeShort } from "@/lib/format";
import type { EntityNot, EntityNotKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_LEN = 2000;

type Target =
  | { entityKind: "musteri"; musteriKodu: string }
  | { entityKind: "potansiyel"; potansiyelId: string };

type Props = Target & {
  className?: string;
};

export function EntityNotesButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<EntityNot[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queryKey =
    props.entityKind === "musteri"
      ? `musteri:${props.musteriKodu}`
      : `potansiyel:${props.potansiyelId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        entity_kind: props.entityKind,
      });
      if (props.entityKind === "musteri") {
        params.set("musteri_kodu", props.musteriKodu);
      } else {
        params.set("potansiyel_id", props.potansiyelId);
      }
      const res = await fetch(`/api/notlar?${params.toString()}`);
      const json = (await res.json()) as {
        items?: EntityNot[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Notlar okunamadı");
      }
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notlar okunamadı");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [props]);

  useEffect(() => {
    setOpen(false);
    setDraft("");
    setItems([]);
    setError(null);

    const kind = props.entityKind;
    const musteriKodu =
      props.entityKind === "musteri" ? props.musteriKodu : "";
    const potansiyelId =
      props.entityKind === "potansiyel" ? props.potansiyelId : "";

    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({ entity_kind: kind });
        if (kind === "musteri") params.set("musteri_kodu", musteriKodu);
        else params.set("potansiyel_id", potansiyelId);
        const res = await fetch(`/api/notlar?${params.toString()}`);
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { items?: EntityNot[] };
        if (!cancelled && Array.isArray(json.items)) setItems(json.items);
      } catch {
        /* ignore prefetch errors */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryKey, props.entityKind]);

  useEffect(() => {
    if (!open) return;
    void load();
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: PointerEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSave() {
    const metin = draft.trim().slice(0, MAX_LEN);
    if (!metin || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        action: "create",
        entity_kind: props.entityKind as EntityNotKind,
        metin,
      };
      if (props.entityKind === "musteri") {
        body.musteri_kodu = props.musteriKodu;
      } else {
        body.potansiyel_id = props.potansiyelId;
      }
      const res = await fetch("/api/notlar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        item?: EntityNot;
        error?: string;
      };
      if (!res.ok || !json.item) {
        throw new Error(json.error || "Kayıt başarısız");
      }
      setItems((prev) => [json.item!, ...prev]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayıt başarısız");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch("/api/notlar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Silinemedi");
      }
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi");
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", props.className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-pressed={open}
        aria-label="Notlar"
        className={cn(
          "relative flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors sm:size-8",
          open || items.length > 0
            ? "text-sky-300 hover:bg-sky-400/10"
            : "text-muted-foreground hover:bg-white/10 hover:text-sky-200"
        )}
      >
        <StickyNoteIcon className="size-4" />
        {items.length > 0 ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-sky-400 sm:top-0.5 sm:right-0.5" />
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Not ekle"
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute top-full right-0 z-50 mt-1.5 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-border/80 bg-background/95 p-2.5 shadow-xl backdrop-blur-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              Notlar
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LEN))}
            rows={3}
            maxLength={MAX_LEN}
            placeholder="Kısa not yaz…"
            className="w-full resize-none rounded-md border border-border/70 bg-muted/30 px-2.5 py-1.5 text-[11px] leading-snug outline-none placeholder:text-muted-foreground/60 focus:border-sky-500/50"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
              {draft.trim().length}/{MAX_LEN}
            </span>
            <button
              type="button"
              disabled={saving || !draft.trim()}
              onClick={() => void handleSave()}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[10px] tracking-wide uppercase transition-colors",
                draft.trim()
                  ? "bg-sky-500/20 text-sky-200 hover:bg-sky-500/30"
                  : "cursor-not-allowed text-muted-foreground/50"
              )}
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>

          {error ? (
            <p className="mt-2 text-[10px] text-red-300/90">{error}</p>
          ) : null}

          <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto overscroll-contain border-t border-border/50 pt-2">
            {loading ? (
              <p className="text-[10px] text-muted-foreground">Yükleniyor…</p>
            ) : items.length === 0 ? (
              <p className="text-[10px] text-muted-foreground">
                Henüz not yok.
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className="group rounded-md border border-border/40 bg-muted/20 px-2 py-1.5"
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="min-w-0 flex-1 text-[11px] leading-snug whitespace-pre-wrap">
                      {n.metin}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleDelete(n.id)}
                      aria-label="Notu sil"
                      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-60 hover:bg-white/10 hover:text-red-300 hover:opacity-100"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </div>
                  <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                    {formatDateTimeShort(n.olusturulma)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
