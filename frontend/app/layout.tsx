import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";

import { ThemeProvider, THEME_STORAGE_KEY } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";

/** Hydration öncesi kayıtlı tema uygulanır — FOUC yok. Kayıt yoksa koyu. */
const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY
)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="dark";var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){document.documentElement.classList.add("dark");document.documentElement.setAttribute("data-theme","dark");}})();`;

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
  title: "Patigo · Müşteri Haritası",
  description:
    "Ege bölgesi petshop/veteriner müşterileri — konum ve risk durumu haritası",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#141517" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      data-theme="dark"
      // Blocking script hydration öncesi .dark class'ını/data-theme'i değiştirebilir;
      // React bu tek attribute mismatch'ini görmezden gelsin, kendi (temasız)
      // değerine geri almasın.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${sourceSerif.variable} dark h-full antialiased`}
    >
      <body className="flex h-dvh min-h-dvh flex-col overflow-hidden overscroll-none">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <ToastProvider position="bottom-right">{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
