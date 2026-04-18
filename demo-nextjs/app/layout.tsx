import type { ReactNode } from "react";
import { DM_Sans, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["200", "400", "500"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "charli3-js demo",
  description: "Charli3 oracle feeds in a Next.js + Lace wallet dApp",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${inter.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
