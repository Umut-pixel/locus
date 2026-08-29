import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { APP_NAME } from "@/lib/site";
import {
  readThemeCookie,
  THEME_CRITICAL_CSS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme-preference";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Sidebar tasarım brief'i Inter istiyor — app genelini Geist'ten taşımadan, --font-inter olarak eklendi. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

/** Asistan karşılama başlığı — Türkçe latin-ext, Geist’ten ayrı display yüzü. */
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `${APP_NAME} · %s`,
  },
  description:
    "Ege bölgesi petshop/veteriner müşterileri — konum ve risk durumu haritası",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon",
  },
};

export async function generateViewport(): Promise<Viewport> {
  const known = readThemeCookie((await cookies()).get(THEME_STORAGE_KEY)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    ...(known
      ? {
          colorScheme: known,
          themeColor: known === "dark" ? "#141517" : "#f7f7f7",
        }
      : { themeColor: "#f7f7f7" }),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const known = readThemeCookie((await cookies()).get(THEME_STORAGE_KEY)?.value);
  const theme = known ?? "dark";

  return (
    <html
      lang="tr"
      data-theme={known}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${sourceSerif.variable} h-full antialiased${known === "dark" ? " dark" : ""}`}
      style={known ? { colorScheme: known } : undefined}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: THEME_CRITICAL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex h-dvh min-h-dvh flex-col overflow-hidden overscroll-none">
        <ThemeProvider initialTheme={theme}>
          <ToastProvider position="bottom-right">{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
