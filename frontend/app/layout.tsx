import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

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
  themeColor: "#1a1b1f",
  colorScheme: "dark",
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
      className={`dark ${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex h-dvh min-h-dvh flex-col overflow-hidden overscroll-none">
        {children}
      </body>
    </html>
  );
}
