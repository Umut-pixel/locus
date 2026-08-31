"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { HomeOverviewBento } from "@/components/agent/HomeOverviewBento";
import { PromptBar } from "@/components/agent/PromptBar";
import { AppSidebarMobileTrigger } from "@/components/sidebar/AppSidebar";
import { LightRays } from "@/components/ui/light-rays";
import { Text3DFlip } from "@/components/ui/text-3d-flip";
import { useAgentSession } from "@/hooks/useAgentSession";
import { konusmaHref } from "@/lib/agent-konusma";

const ORNEK_SORULAR = [
  "Toplam kaç müşteri var?",
  "İzmir'de riskli müşteri sayısı nedir?",
  "Bu dönem en yüksek cirolu 5 müşteri kim?",
  "Bornova teslimat ve borç durumu nedir?",
];

const BASLIKLAR = [
  "Veriye ne sormak istersin?",
  "Bugün kime bakıyoruz?",
  "Ciroyu mu, riski mi?",
  "Ege'de ne öne çıkıyor?",
];

const EXIT_EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Ana sayfa — yalnız başlatıcı. Sohbetin kendisi /sohbet/{slug}-{no} altında.
 *
 * İlk soru gönderilince runtime konuşmayı yaratıp threadSiraNo/threadBaslik'i
 * dolduruyor; burası onu görünce kanonik sohbet URL'ine geçiyor. Akış
 * AgentRuntimeProvider'da (layout seviyesi) sürdüğü için navigasyon turu
 * kesmez — AgentFollowCard da aynı davranışa dayanıyor.
 */
export function HomeLauncher() {
  const router = useRouter();
  const {
    threadId,
    threadSiraNo,
    threadBaslik,
    draft,
    setDraft,
    busy,
    pendingQuote,
    setPendingQuote,
    send,
    stop,
    reset,
  } = useAgentSession();
  const reduced = useReducedMotion();

  const ilkKosuRef = useRef(false);
  useEffect(() => {
    // 1) Ana sayfa = temiz başlangıç. Provider layout seviyesinde yaşadığı
    //    için /sohbet/… üzerinden geri tuşuyla buraya düşüldüğünde runtime'da
    //    eski konuşma duruyor olabilir; bırakmazsak yeni soru o konuşmaya
    //    eklenir ve (2) kullanıcıyı anında sohbete geri atardı.
    if (!ilkKosuRef.current) {
      ilkKosuRef.current = true;
      if (threadId) {
        reset();
        return;
      }
    }
    // 2) Yalnız burada başlatılan yeni konuşmaya geç — mount'ta temizlendiği
    //    için threadId ancak bu sayfadan gönderilen ilk soruyla dolar.
    if (!threadId || !threadSiraNo || !threadBaslik) return;
    router.push(konusmaHref(threadBaslik, threadSiraNo));
  }, [threadId, threadSiraNo, threadBaslik, reset, router]);

  const composer = (
    <div>
      <PromptBar
        value={draft}
        onChange={setDraft}
        onSend={send}
        onStop={stop}
        busy={busy}
        quote={pendingQuote}
        onClearQuote={() => setPendingQuote(null)}
        placeholder="Veriye bir şey sor…  @ kaynak  / komut"
      />
      <p className="mt-2 text-center font-display text-[12px] italic text-ink-3">
        Yanıt salt okunur; önemli kararı rapordaki rakamla teyit edin.
      </p>
    </div>
  );

  return (
    <main className="agent-ui relative flex h-dvh min-w-0 flex-1 flex-col overflow-hidden">
      <motion.div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.26, ease: EXIT_EASE }}
      >
        <LightRays />
      </motion.div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-4">
        <div className="pointer-events-auto">
          <AppSidebarMobileTrigger />
        </div>
        <span className="ml-auto hidden font-mono text-[10px] tracking-wide text-ink-3 uppercase sm:inline">
          locus-analyst
        </span>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-4 pt-16">
            <div className="mx-auto w-full max-w-5xl">
              <RotatingHeadline />
              <p className="mb-5 text-center font-display text-[15px] leading-snug italic text-ink-3">
                Sor — tablo ve grafik cevapta açılsın.
              </p>
            </div>
          </div>
          <div className="relative z-20 px-4">
            <div className="mx-auto w-full max-w-5xl">{composer}</div>
          </div>
          <div className="px-4 pb-10">
            <div className="mx-auto w-full max-w-5xl">
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {ORNEK_SORULAR.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-line bg-card px-3 py-1 text-[12px] leading-5 shadow-agent transition-[border-color,background-color] duration-150 hover:border-line-strong hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="shimmer-ink font-medium">{s}</span>
                  </button>
                ))}
              </div>
              <div className="mt-6">
                <HomeOverviewBento onAsk={send} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function RotatingHeadline() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const text = BASLIKLAR[index];

  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return;
      setIndex((n) => (n + 1) % BASLIKLAR.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  const headingClass =
    "mb-1 w-full justify-center font-display text-[1.625rem] leading-snug font-semibold tracking-[-0.03em] text-ink";

  return (
    <div
      className="flex min-h-[2.6em] items-center justify-center"
      onPointerEnter={() => {
        paused.current = true;
      }}
      onPointerLeave={() => {
        paused.current = false;
      }}
    >
      {reduced ? (
        <h2 className={headingClass} aria-live="polite">
          {text}
        </h2>
      ) : (
        <Text3DFlip
          key={text}
          as="h2"
          className={headingClass}
          textClassName="bg-background text-ink"
          flipTextClassName="bg-background text-ink"
          rotateDirection="top"
          staggerFrom="center"
          playOnMount={index === 0}
        >
          {text}
        </Text3DFlip>
      )}
    </div>
  );
}
