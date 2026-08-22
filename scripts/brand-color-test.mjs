/**
 * An owner will pick a colour that fails AA. Prove the app stays readable
 * when they do — for the colours owners actually pick.
 *
 * Run: node scripts/brand-color-test.mjs
 */
const { deriveBrandAccent, hexToOklch, contrast } = await import(
  new URL("../src/lib/brand-color.ts", import.meta.url).href
);

let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL  ${name}  ${detail}`);
  }
};

// The same anchors the derivation targets — asserted independently here.
const DARK = [hexToOklch("#14151a"), hexToOklch("#1c1d22")];
const LIGHT = [hexToOklch("#f6f3ea"), hexToOklch("#fdfcf9")];

const parse = (value) => {
  const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(value);
  return { l: +m[1], c: +m[2], h: +m[3] };
};

const NASTY = {
  "sunflower yellow": "#ffd400",
  "neon green": "#39ff14",
  "near-black": "#0a0a0a",
  "near-white": "#fbfbfb",
  "hot pink": "#ff69b4",
  "navy": "#001f5b",
  "mid grey": "#808080",
  "pure red": "#ff0000",
  "teal": "#00695c",
  "brand gold": "#c6a56a",
};

for (const [name, hex] of Object.entries(NASTY)) {
  const tokens = deriveBrandAccent(hex);
  check(`${name}: derives`, tokens !== null);
  if (!tokens) continue;

  for (const [mode, backgrounds] of [["dark", DARK], ["light", LIGHT]]) {
    const t = tokens[mode];
    const accent = parse(t["--accent-default"]);
    const hover = parse(t["--accent-hover"]);
    const subtle = parse(t["--accent-subtle-bg"]);
    const onAccent = parse(t["--accent-on-accent"]);

    for (const bg of backgrounds) {
      const ratio = contrast(accent, bg);
      check(`${name} ${mode}: accent vs surface >= 4.5`, ratio >= 4.5, ratio.toFixed(2));
    }
    const onRatio = contrast(onAccent, accent);
    check(`${name} ${mode}: on-accent vs accent >= 4.5`, onRatio >= 4.5, onRatio.toFixed(2));
    const subtleRatio = contrast(accent, subtle);
    check(`${name} ${mode}: accent vs subtle-bg >= 4.5`, subtleRatio >= 4.5, subtleRatio.toFixed(2));
    const hoverRatio = contrast(hover, backgrounds[0]);
    check(`${name} ${mode}: hover vs canvas >= 3`, hoverRatio >= 3, hoverRatio.toFixed(2));

    // The brand survives the correction: hue stays within a stone's throw
    // (grey inputs have no meaningful hue, skip them).
    const picked = hexToOklch(hex);
    if (picked.c > 0.03) {
      const drift = Math.min(Math.abs(picked.h - accent.h), 360 - Math.abs(picked.h - accent.h));
      check(`${name} ${mode}: hue preserved (<12deg drift)`, drift < 12, `${drift.toFixed(1)}deg`);
    }
  }
}

// Garbage in, platform accent out — never a guess.
for (const bad of ["", "#12", "red", "#ggg000", null, undefined]) {
  check(`invalid ${JSON.stringify(bad)}: returns null`, deriveBrandAccent(bad) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
