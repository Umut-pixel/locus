"use client";

import { useCallback, useEffect, useState } from "react";

import type { IzinKodu } from "@/lib/permissions";

export interface CurrentUser {
  id: string;
  kullaniciAdi: string;
  adSoyad: string;
  rol: string | null;
  rolAdi: string | null;
  izinler: IzinKodu[];
}

/** `/api/auth/me` — nav filtreleme + profil kartı için oturumdaki kullanıcı. */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = (await res.json()) as CurrentUser;
      setUser(data);
    } catch (err) {
      console.warn("[useCurrentUser]", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const izinler = user?.izinler ?? [];

  return {
    user,
    izinler,
    loading,
    hasIzin: (izin: IzinKodu) => izinler.includes(izin),
    refresh: fetchUser,
  };
}
