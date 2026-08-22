"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";

import { AgentMarkdown } from "@/components/agent/AgentMarkdown";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { Button } from "@/components/ui/button";
import { TOOL_THOUGHTS, streamAgent } from "@/lib/agent-stream";

type Rol = "user" | "assistant" | "error";

interface Mesaj {
  id: string;
  rol: Rol;
  metin: string;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ORNEK_SORULAR = [
  "Toplam kaç müşteri var?",
  "İzmir'de riskli müşteri sayısı nedir?",
  "Bu dönem en yüksek cirolu 5 müşteri kim?",
  "Son kullanma tarihi yaklaşan ürünler neler?",
];

/**
 * Agent sohbeti — tam genişlik test yüzeyi.
 *
 * ⚠️  SIDEBAR'DA BİLEREK LİNK YOK. Sayfa yalnız `/home` adresi elle
 *     yazılarak açılır. Agent henüz geliştirme aşamasında; production'da
 *     kullanıcıyı buraya yönlendiren bir yol istemiyoruz. Hazır olunca
 *     `lib/app-sidebar-nav.ts` içindeki "komuta" bölümüne girdi eklemek
 *     yeterli — route ve bileşen çalışır durumda.
 *
 *
 * Sidebar'daki dar asistan panelinin aksine burada agent'ın ne yaptığı
 * görünür olmalı: hangi aracı çağırdı, hata ne dedi. Test ederken asıl
 * ihtiyaç bu.
 *
 * İki hal var: boşken giriş ortada (Claude Code'un açılışı gibi), ilk
 * mesajdan sonra sohbet moduna geçer ve giriş alta sabitlenir.
 */
export default function HomePage() {
  const [mesajlar, setMesajlar] = useState<Mesaj[]>([]);
  const [taslak, setTaslak] = useState("");
  const [mesgul, setMesgul] = useState(false);
  const [arac, setArac] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sonRef = useRef<HTMLDivElement | null>(null);
  const girisRef = useRef<HTMLTextAreaElement | null>(null);

  const sohbetModu = mesajlar.length > 0;

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    sonRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mesajlar, arac]);

  const ekle = useCallback((id: string, delta: string) => {
    setMesajlar((prev) =>
      prev.map((m) => (m.id === id ? { ...m, metin: m.metin + delta } : m))
    );
  }, []);

  const durdur = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMesgul(false);
    setArac(null);
  }, []);

  const gonder = useCallback(
    (soru: string) => {
      const q = soru.trim();
      if (!q || mesgul) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setTaslak("");
      setMesgul(true);
      setArac(null);
      setMesajlar((prev) => [...prev, { id: uid(), rol: "user", metin: q }]);

      let yanitId: string | null = null;
      let hataVar = false;

      void streamAgent({
        message: q,
        signal: controller.signal,
        onEvent: (event) => {
          if (controller.signal.aborted) return;
          switch (event.kind) {
            case "tool":
              setArac(TOOL_THOUGHTS[event.name] ?? `${event.name} çalışıyor…`);
              break;
            case "text": {
              let id = yanitId;
              if (id === null) {
                // const'a bağla: setMesajlar closure'ı `let`i tekrar
                // `string | null`a genişletiyor.
                const yeni = uid();
                yanitId = yeni;
                id = yeni;
                setArac(null);
                setMesajlar((prev) => [
                  ...prev,
                  { id: yeni, rol: "assistant", metin: "" },
                ]);
              }
              ekle(id, event.delta);
              break;
            }
            case "error":
              hataVar = true;
              setArac(null);
              setMesajlar((prev) => [
                ...prev,
                { id: uid(), rol: "error", metin: event.message },
              ]);
              break;
            case "debug":
              console.debug("[agent] tanınmayan SSE karesi:", event.raw);
              break;
          }
        },
      }).then(() => {
        if (controller.signal.aborted) return;
        if (!hataVar && yanitId === null) {
          setMesajlar((prev) => [
            ...prev,
            {
              id: uid(),
              rol: "error",
              metin:
                "Agent yanıt döndürmedi. `mda dev` çalışıyor mu ve " +
                "LANGSMITH_AGENT_URL doğru mu kontrol et.",
            },
          ]);
        }
        setMesgul(false);
        setArac(null);
        abortRef.current = null;
      });
    },
    [ekle, mesgul]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    gonder(taslak);
  };

  /** Enter gönderir, Shift+Enter satır atlar — sohbet arayüzü beklentisi. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      gonder(taslak);
    }
  };

  const giris = (
    <form onSubmit={onSubmit} className="w-full">
      <div className="focus-within:border-ring/60 relative flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-colors">
        <textarea
          ref={girisRef}
          value={taslak}
          onChange={(e) => setTaslak(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Veriye bir şey sor…"
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Agent sorusu"
        />
        {mesgul ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={durdur}
            className="size-9 shrink-0 rounded-xl"
            aria-label="Durdur"
          >
            <SquareIcon className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!taslak.trim()}
            className="size-9 shrink-0 rounded-xl"
            aria-label="Gönder"
          >
            <ArrowUpIcon className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Agent salt-okunur SQL yazar. Rakamları kritik kararlarda doğrulayın.
      </p>
    </form>
  );

  return (
    <main className="flex h-dvh min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <AppSidebarMobileTrigger />
        <h1 className="text-sm font-semibold text-foreground">Asistan</h1>
        <span className="ml-auto font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          locus-analyst
        </span>
      </header>

      {!sohbetModu ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <h2 className="mb-1 text-center text-xl font-semibold text-foreground">
              Veriye ne sormak istersin?
            </h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Ciro, risk, sevkiyat ve stok sorularını yanıtlar.
            </p>
            {giris}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {ORNEK_SORULAR.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => gonder(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-5">
              {mesajlar.map((m) => (
                <Balon key={m.id} mesaj={m} />
              ))}
              {arac && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-current" />
                  {arac}
                </p>
              )}
              {mesgul && !arac && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="size-1.5 animate-pulse rounded-full bg-current" />
                  Düşünüyor…
                </p>
              )}
              <div ref={sonRef} />
            </div>
          </div>
          <div className="shrink-0 border-t border-border px-4 py-3">
            <div className="mx-auto max-w-2xl">{giris}</div>
          </div>
        </>
      )}
    </main>
  );
}

function Balon({ mesaj }: { mesaj: Mesaj }) {
  if (mesaj.rol === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm whitespace-pre-wrap text-accent-foreground">
          {mesaj.metin}
        </p>
      </div>
    );
  }

  if (mesaj.rol === "error") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3.5 py-2.5">
        <p className="mb-0.5 font-mono text-[10px] tracking-[0.14em] text-destructive uppercase">
          Hata
        </p>
        <p className="text-sm text-foreground">{mesaj.metin}</p>
      </div>
    );
  }

  if (!mesaj.metin) {
    // İlk token gelene kadar boş balon yerine bekleme işareti
    return <p className="text-sm text-muted-foreground">…</p>;
  }

  return <AgentMarkdown>{mesaj.metin}</AgentMarkdown>;
}
