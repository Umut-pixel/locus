import { redirect } from "next/navigation";

/** Uygulama açılışı — Analyst (home). Harita `/harita`. */
export default function RootPage() {
  redirect("/home");
}
