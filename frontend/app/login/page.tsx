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
    <main className="grid h-dvh w-full max-w-[100vw] overflow-hidden md:grid-cols-2">
      {/* Sol — görsel (desktop) */}
      <aside className="relative hidden overflow-hidden md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-bg.png"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full scale-105 object-cover blur-[3px]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/30"
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 z-10 flex items-center gap-3 p-8 text-white lg:p-10"
          aria-label="Celixion"
          role="img"
        >
          <CelixionMark
            size={32}
            className="shrink-0 drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)]"
          />
          <span className="text-xl font-medium tracking-tight drop-shadow-[0_1px_8px_rgba(0,0,0,0.55)]">
            Celixion
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-10 lg:p-12">
          <p className="text-xs font-medium tracking-wide text-white/70 uppercase">
            Peritas
          </p>
          <h1 className="mt-2 max-w-sm text-3xl font-medium leading-snug tracking-tight text-white">
            Peritas Panel
          </h1>
        </div>
      </aside>

      {/* Sağ — login */}
      <section className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain bg-white">
        <div
          className="flex flex-col items-center gap-2 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-1 md:hidden"
          aria-label="Celixion"
          role="img"
        >
          <div className="flex items-center gap-2 text-zinc-900">
            <CelixionMark size={26} className="shrink-0" />
            <span className="text-lg font-medium tracking-tight">Celixion</span>
          </div>
          <p className="text-xs font-medium tracking-wide text-zinc-500">
            Peritas Panel
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
          <LoginForm nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
