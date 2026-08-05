"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { LOGIN_TRANSITION_KEY } from "@/lib/login-transition";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Login sonrası dashboard fade-in — blurlu örtü kalkar. */
export function LoginEnterTransition() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOGIN_TRANSITION_KEY) === "1") {
        sessionStorage.removeItem(LOGIN_TRANSITION_KEY);
        setVisible(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          key="enter-veil"
          initial={{ opacity: 1, backdropFilter: "blur(18px)" }}
          animate={{ opacity: 0, backdropFilter: "blur(0px)" }}
          transition={{ duration: 0.75, ease: EASE }}
          onAnimationComplete={() => setVisible(false)}
          className="pointer-events-none fixed inset-0 z-[100] bg-[oklch(0.16_0.004_260)/50]"
          aria-hidden
        />
      ) : null}
    </AnimatePresence>
  );
}
