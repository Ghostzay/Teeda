import { ZolvoraWordmark } from "@/components/brand";

/**
 * What everyone in a suspended salon sees instead of the floor.
 *
 * Suspension is a billing/status state, not a deletion: every row the salon
 * owns is retained untouched, and reactivation is one admin action. So the
 * screen says exactly that, names nobody's debt, and gives staff the one
 * useful instruction — talk to the owner, who talks to us. Bilingual, because
 * the person most likely to be standing at the tablet reads Vietnamese.
 */
export function SuspendedScreen({ salonName }: { salonName: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="space-y-1">
        <p className="text-xl text-secondary-text">{salonName}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          This salon&apos;s account is paused
        </h1>
        <p className="text-xl text-secondary-text">Tài khoản của tiệm đang tạm ngưng</p>
      </div>
      <div className="max-w-md space-y-2 text-muted-foreground">
        <p>
          Everything is safe — appointments, clients and earnings are all kept
          exactly as they were. The owner should get in touch with Zolvora to
          switch it back on.
        </p>
        <p>
          Mọi dữ liệu vẫn được giữ nguyên. Chủ tiệm vui lòng liên hệ Zolvora để
          mở lại tài khoản.
        </p>
      </div>
      <p className="mt-4 text-meta text-muted-text">
        <ZolvoraWordmark className="text-meta" />
      </p>
    </main>
  );
}
