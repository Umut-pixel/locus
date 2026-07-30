"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ nextPath = "/" }: { nextPath?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Giriş başarısız");
        return;
      }
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
      router.refresh();
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col px-5 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-[22rem] text-center">
        <h2 className="text-xl font-medium tracking-tight text-zinc-900">
          Hoş geldiniz
        </h2>
        <p className="mt-1.5 text-sm text-zinc-500">
          Devam etmek için giriş yapın
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mx-auto mt-5 flex w-full max-w-[22rem] flex-col gap-4 sm:mt-6"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="username"
            className="text-sm font-medium text-zinc-900"
          >
            Kullanıcı adı
          </label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            placeholder="kullanıcı adınız"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading}
            required
            className="h-11 rounded-lg border-zinc-200 bg-white text-base text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-zinc-400/30 sm:h-10 sm:text-sm dark:bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-zinc-900"
          >
            Şifre
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            className="h-11 rounded-lg border-zinc-200 bg-white text-base text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-zinc-400/30 sm:h-10 sm:text-sm dark:bg-white"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="mt-1 h-11 w-full rounded-lg bg-zinc-950 text-white hover:bg-zinc-800 sm:h-10"
        >
          {loading ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
      </form>
    </div>
  );
}
