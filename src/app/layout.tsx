import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import { cookies } from "next/headers";

import { MotionProvider } from "@/components/motion";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/toast";
import {
  DEFAULT_THEME,
  MODE_COOKIE,
  THEME_COOKIE,
  THEME_SCRIPT,
  isThemeId,
  resolveModePreference,
} from "@/lib/theme";
import "./globals.css";

/**
 * The brand pair, self-hosted at build time (next/font — no runtime fetch, so
 * a salon tablet on flaky wifi never waits on a font CDN).
 *
 *   Montserrat  display — geometric caps that sit with the ZOLVORA wordmark.
 *   Inter       text — a screen face built for UI legibility; the app is read
 *               from several feet away on a mounted tablet, so the text face
 *               is chosen for distance legibility over personality.
 *
 * Exposed as CSS variables; globals.css decides what uses which. Components
 * never name a font, same rule as colours.
 */
const inter = Inter({ subsets: ["latin", "vietnamese"], variable: "--font-text" });
const montserrat = Montserrat({ subsets: ["latin", "vietnamese"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Zolvora — Salon Management",
  description: "Fair turn rotation, walk-ins, appointments and clients for nail salons.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Follows the mode the browser is about to paint, so a phone's status bar
  // isn't left in the wrong colour.
  themeColor: [
    // Zolvora ink and paper — the measured canvas of each mode.
    { media: "(prefers-color-scheme: dark)", color: "#14151a" },
    { media: "(prefers-color-scheme: light)", color: "#f6f3ea" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /*
   * Two stages, which together remove the flash entirely:
   *
   *   1. The server reads the appearance cookies and renders the attributes
   *      straight onto <html>, so correct markup arrives already themed.
   *   2. The inline script runs before first paint and reconciles against
   *      localStorage — which wins, being this device's own choice — and
   *      resolves `system` mode from prefers-color-scheme.
   *
   * `suppressHydrationWarning` is required and deliberate: the script mutates
   * these two attributes before React hydrates.
   */
  const store = await cookies();
  const cookieTheme = store.get(THEME_COOKIE)?.value;
  const theme = isThemeId(cookieTheme) ? cookieTheme : DEFAULT_THEME;
  const mode = resolveModePreference(store.get(MODE_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme}
      data-mode={mode === "system" ? "dark" : mode}
      className={`${inter.variable} ${montserrat.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider initialTheme={theme} initialMode={mode}>
          <MotionProvider>
            <ToastProvider>{children}</ToastProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
