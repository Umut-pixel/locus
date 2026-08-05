"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { CelixionMarkReveal } from "@/components/brand/CelixionMarkReveal";
import { LoginForm } from "@/components/auth/LoginForm";
import { LOGIN_TRANSITION_KEY } from "@/lib/login-transition";

const LoginMapPreview = dynamic(
  () =>
    import("@/components/auth/LoginMapPreview").then((m) => m.LoginMapPreview),
  {
    ssr: false,
    loading: () => (
      <div className="size-full bg-[oklch(0.16_0.004_260)]" aria-hidden />
    ),
  }
);

const EASE = [0.22, 1, 0.36, 1] as const;

export function LoginShell({ nextPath = "/" }: { nextPath?: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function handleSuccess() {
    if (exiting) return;
    setExiting(true);

    try {
      sessionStorage.setItem(LOGIN_TRANSITION_KEY, "1");
    } catch {
      /* ignore */
    }

    await new Promise((r) => setTimeout(r, 520));

    const target = nextPath.startsWith("/") ? nextPath : "/";
    router.replace(target);
    router.refresh();
  }

  return (
    <main className="relative flex h-dvh w-full max-w-[100vw] items-center justify-center overflow-hidden bg-[oklch(0.16_0.004_260)]">
      <div className="absolute inset-0">
        <div className="absolute inset-0 origin-center scale-[1.06] blur-[10px]">
          <LoginMapPreview />
        </div>
        <div className="absolute inset-0 bg-black/35" aria-hidden />
      </div>

      <AnimatePresence>
        {!exiting ? (
          <motion.div
            key="login-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="relative z-10 w-[min(100%,23rem)] px-4"
          >
            <div className="rounded-2xl bg-white px-7 py-8 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] sm:px-8 sm:py-9">
              <div className="flex flex-col items-center text-center">
                <CelixionMarkReveal size={32} className="text-zinc-900" />
                <motion.h1
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.95, duration: 0.4, ease: EASE }}
                  className="mt-5 text-[1.375rem] leading-snug font-semibold tracking-tight text-zinc-900"
                >
                  Giriş yap
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.08, duration: 0.4, ease: EASE }}
                  className="mt-1.5 text-[13px] leading-relaxed text-zinc-500"
                >
                  Peritas müşteri haritasına devam etmek için oturum açın.
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.4, ease: EASE }}
                className="mt-7"
              >
                <LoginForm onSuccess={handleSuccess} />
              </motion.div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {exiting ? (
          <motion.div
            key="exit-veil"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(16px)" }}
            transition={{ duration: 0.5, ease: EASE }}
            className="pointer-events-none absolute inset-0 z-20 bg-[oklch(0.16_0.004_260)/55]"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}
