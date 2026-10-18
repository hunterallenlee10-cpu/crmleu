import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { getTheme } from "@/lib/theme";
import { THEME_COLORS } from "@/lib/theme-shared";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "LEU", template: "%s · LEU" },
  description: "Lee Enterprises Unlimited CRM",
  robots: { index: false, follow: false },
};

export async function generateViewport(): Promise<Viewport> {
  return { themeColor: THEME_COLORS[await getTheme()] };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Rendered on the server from the cookie, so there's no flash of the wrong theme.
  const theme = await getTheme();
  return (
    <html lang="en" data-theme={theme} className={`${hanken.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
