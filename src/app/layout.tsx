import type { Metadata, Viewport } from "next";
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

export const metadata: Metadata = {
  title: "Teeda — Salon Management",
  description: "Fair turn rotation, walk-ins, appointments and clients for nail salons.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Follows the mode the browser is about to paint, so a phone's status bar
  // isn't left in the wrong colour.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#211a24" },
    { media: "(prefers-color-scheme: light)", color: "#f5f2f6" },
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
