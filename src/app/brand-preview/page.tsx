import Image from "next/image";

/**
 * The design system, on one page — every token family rendered as it is used.
 *
 * Exists so a theme can be judged and screenshotted as a whole rather than
 * hunted across the app. Public and static on purpose: it contains no data,
 * reads nothing, and doubles as the reference sheet for anyone adding a theme
 * (render this page in all four theme × mode combinations; nothing may look
 * wrong in any of them).
 */
export const dynamic = "force-static";

export const metadata = { robots: { index: false, follow: false } };

/* Literal class strings — Tailwind's scanner cannot see interpolation. */
const SURFACES = [
  ["canvas", "bg-surface-canvas"],
  ["raised", "bg-surface-raised"],
  ["overlay", "bg-surface-overlay"],
  ["sunken", "bg-surface-sunken"],
] as const;
const STATUSES = [
  ["success", "bg-success-bg border-success-border", "text-success"],
  ["warning", "bg-warning-bg border-warning-border", "text-warning"],
  ["danger", "bg-danger-bg border-danger-border", "text-danger"],
  ["info", "bg-info-bg border-info-border", "text-info"],
] as const;

export default function BrandPreviewPage() {
  return (
    <div className="min-h-dvh bg-surface-canvas px-8 py-10 text-primary-text">
      <div className="mx-auto max-w-3xl space-y-10">
        {/* Identity */}
        <header className="flex items-center gap-6">
          <Image src="/brand/logo.svg" alt="Zolvora" width={96} height={96} priority />
          <div>
            <p className="text-display" style={{ letterSpacing: "0.08em" }}>
              ZOLVORA
            </p>
            <p className="mt-1 text-secondary-text">
              Ink &amp; gold, measured from the mark — not invented.
            </p>
          </div>
        </header>

        {/* Type scale */}
        <section className="space-y-3">
          <p className="text-meta uppercase tracking-widest text-muted-text">Type</p>
          <p className="text-display">Display — Montserrat 700</p>
          <p className="text-title">Title — the working heading size</p>
          <p>Body — Inter, sized to read from a few feet away on a mounted tablet.</p>
          <p className="text-secondary-text">Secondary — supporting copy.</p>
          <p className="text-meta text-muted-text">META — LABELS AND TIMESTAMPS</p>
          <div className="flex items-baseline gap-6">
            <span className="text-metric">$1,284</span>
            <span className="text-metric-sm">17 visits</span>
          </div>
        </section>

        {/* Surfaces & borders */}
        <section className="space-y-3">
          <p className="text-meta uppercase tracking-widest text-muted-text">Surfaces</p>
          <div className="grid grid-cols-4 gap-3">
            {SURFACES.map(([name, cls]) => (
              <div key={name} className={`rounded-xl border border-default p-4 text-center text-sm ${cls}`}>
                {name}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl border border-subtle p-3 text-center text-meta">subtle</div>
            <div className="flex-1 rounded-xl border border-default p-3 text-center text-meta">default</div>
            <div className="flex-1 rounded-xl border-2 border-strong p-3 text-center text-meta">strong</div>
          </div>
        </section>

        {/* Accent + controls */}
        <section className="space-y-3">
          <p className="text-meta uppercase tracking-widest text-muted-text">Accent</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-xl bg-accent-default px-6 py-3 font-semibold text-on-accent">
              Assign to Kim
            </button>
            <button className="rounded-xl bg-accent-hover px-6 py-3 font-semibold text-on-accent">
              Hover state
            </button>
            <button className="rounded-xl border border-default bg-surface-raised px-6 py-3 font-semibold">
              Secondary
            </button>
            <span className="rounded-full bg-accent-subtle px-4 py-1.5 text-sm font-medium text-accent-default">
              Quiet accent chip
            </span>
            <a className="font-medium text-accent-default underline">Accent as link text</a>
          </div>
        </section>

        {/* Status families */}
        <section className="space-y-3">
          <p className="text-meta uppercase tracking-widest text-muted-text">Status</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STATUSES.map(([name, box, txt]) => (
              <div key={name} className={`rounded-xl border p-3 text-center ${box}`}>
                <span className={`font-semibold ${txt}`}>{name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* The wait ladder — the most important number in the product */}
        <section className="space-y-2">
          <p className="text-meta uppercase tracking-widest text-muted-text">
            Wait escalation
          </p>
          {(
            [
              ["Anna N.", "8m", "", ""],
              ["Linh T.", "22m", "bg-warning-bg text-warning border-warning-border", "text-warning"],
              ["Maria S.", "38m", "bg-danger-bg text-danger border-danger-border", "text-danger"],
            ] as const
          ).map(([name, wait, chip, txt]) => (
            <div
              key={name}
              className="flex items-center justify-between rounded-xl border border-subtle bg-surface-raised px-4 py-3"
            >
              <span className="font-medium">{name}</span>
              <span
                className={`rounded-full border px-3 py-1 text-sm font-semibold tabular-nums ${chip || "border-subtle bg-surface-sunken text-secondary-text"} ${txt}`}
              >
                {wait}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl border border-danger-border bg-danger-bg/60 px-4 py-3">
            <span className="font-medium">Kim P.</span>
            <span className="rounded-full border border-danger-border bg-danger-bg px-3 py-1 text-sm font-semibold text-danger tabular-nums">
              52m
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
