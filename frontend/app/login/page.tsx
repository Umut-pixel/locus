import { LoginShell } from "@/components/auth/LoginShell";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // middleware zaten `/home`'u `next` olarak koymuyor; burada da reddediyoruz
  // çünkü adres elle uydurulabilir (`/login?next=/home`). Açılış her zaman harita.
  const istenen = typeof params.next === "string" ? params.next : "";
  const nextPath =
    istenen.startsWith("/") && istenen !== "/home" ? istenen : "/";

  return <LoginShell nextPath={nextPath} />;
}
