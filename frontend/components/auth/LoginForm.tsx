"use client";

import { useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type LoginFormProps = {
  onSuccess?: () => void | Promise<void>;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      await onSuccess?.();
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="username"
          className="text-[13px] font-medium text-zinc-800"
        >
          Kullanıcı adı
        </label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          required
          className="h-11 rounded-lg border-zinc-200 bg-zinc-50/80 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-zinc-900/10 sm:h-10 sm:text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[13px] font-medium text-zinc-800"
        >
          Şifre
        </label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            required
            className="h-11 rounded-lg border-zinc-200 bg-zinc-50/80 pr-10 text-[15px] text-zinc-900 placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:bg-white focus-visible:ring-zinc-900/10 sm:h-10 sm:text-sm"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700"
          >
            {showPassword ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        className={cn(
          "mt-2 h-11 w-full rounded-lg bg-zinc-900 text-[15px] font-medium text-white hover:bg-zinc-800 sm:h-10 sm:text-sm"
        )}
      >
        {loading ? "Giriş yapılıyor…" : "Giriş yap"}
      </Button>
    </form>
  );
}
