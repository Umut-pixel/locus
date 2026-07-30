import { CelixionMark } from "@/components/brand/CelixionMark";
import { LoginForm } from "@/components/auth/LoginForm";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath =
    typeof params.next === "string" && params.next.startsWith("/")
      ? params.next
      : "/";

  return (
    <main className="relative flex h-dvh w-full max-w-[100vw] flex-col overflow-hidden">
      {/* Tam ekran blurlu arka plan */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/login-bg.png"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full scale-110 object-cover blur-[3px]"
      />
      <div
        className="absolute inset-0 bg-black/45"
        aria-hidden
      />

      {/* Üst — Celixion */}
      <header
        className="relative z-10 flex items-center gap-2.5 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2 text-white sm:px-8 sm:pt-8"
        aria-label="Celixion"
        role="img"
      >
        <CelixionMark
          size={28}
          className="shrink-0 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)]"
        />
        <span className="text-lg font-medium tracking-tight drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)] sm:text-xl">
          Celixion
        </span>
      </header>

      {/* Login kartı */}
      <section className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-contain px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/95 shadow-2xl shadow-black/30 backdrop-blur-md">
          <div className="border-b border-zinc-100 px-6 pt-5 pb-3 text-center">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Peritas
            </p>
            <h1 className="mt-1 text-lg font-medium tracking-tight text-zinc-900">
              Peritas Panel
            </h1>
          </div>
          <LoginForm nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
