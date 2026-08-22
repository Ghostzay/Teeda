import type { Metadata } from "next";

import { ZolvoraLogo, ZolvoraWordmark } from "@/components/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Salon not found",
  robots: { index: false, follow: false },
};

/**
 * An unknown subdomain lands here, by middleware REWRITE — the address bar
 * keeps what was typed, and this page names no slugs that do exist. Bilingual
 * and calm: the person most likely to see it followed a mistyped link from a
 * nail salon's Instagram bio.
 */
export default function SalonNotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <ZolvoraLogo size={72} />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          There&apos;s no salon at this address
        </h1>
        <p className="text-lg text-secondary-text">Không tìm thấy tiệm ở địa chỉ này</p>
      </div>
      <p className="max-w-md text-muted-foreground">
        Check the link you were given — the salon&apos;s name comes right before
        the dot. Vui lòng kiểm tra lại đường dẫn của tiệm.
      </p>
      <p className="mt-4 text-meta text-muted-text">
        Powered by <ZolvoraWordmark className="text-meta" />
      </p>
    </main>
  );
}
