import { requireSession } from "@/lib/auth";
import { GuideBrowser } from "@/components/guide-browser";
import { GUIDE_INTRO, GUIDE_SECTIONS } from "@/lib/guide-content";

export const dynamic = "force-dynamic";

/** Get Started — plain-language help for every screen, in English and Vietnamese. */
export default async function GuidePage() {
  await requireSession();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-display">Get Started</h1>
        <p className="mt-1 text-title font-normal text-muted-foreground">Bắt đầu sử dụng</p>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{GUIDE_INTRO.en}</p>
        <p className="max-w-2xl text-sm text-muted-foreground opacity-80">{GUIDE_INTRO.vi}</p>
      </header>

      <GuideBrowser sections={GUIDE_SECTIONS} />
    </div>
  );
}
