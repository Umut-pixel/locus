import { LoginShell } from "@/components/auth/LoginShell";
import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata("Giriş");

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const istenen = typeof params.next === "string" ? params.next : "";
  const nextPath =
    istenen.startsWith("/") && !istenen.startsWith("//") ? istenen : "/home";

  return <LoginShell nextPath={nextPath} />;
}
