import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { ThemeProvider, THEME_STORAGE_KEY } from "@/components/theme/ThemeProvider";

/** Hydration öncesi .dark class'ı uygulanır — FOUC (yanlış tema flaşı) yok. */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var d=t==="dark";document.documentElement.classList.toggle("dark",d);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

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

export const metadata: Metadata = {
  title: "Patigo · Müşteri Haritası",
  description:
    "Ege bölgesi petshop/veteriner müşterileri — konum ve risk durumu haritası",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#F8F8FA",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      data-theme="light"
      // Blocking script hydration öncesi .dark class'ını/data-theme'i değiştirebilir;
      // React bu tek attribute mismatch'ini görmezden gelsin, kendi (temasız)
      // değerine geri almasın.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex h-dvh min-h-dvh flex-col overflow-hidden overscroll-none">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
