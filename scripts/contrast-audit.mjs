/**
 * WCAG contrast audit for the theme layer.
 *
 * Parses the shipped globals.css rather than a duplicate copy of the palette,
 * so what is audited is exactly what renders. Every theme × mode combination is
 * checked; a non-zero exit means something regressed.
 *
 *   node scripts/contrast-audit.mjs            table + exit code
 *   node scripts/contrast-audit.mjs --md       markdown table
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, "../src/app/globals.css"), "utf8");

/* -------------------------------------------------------------------------- */
/* Colour maths                                                               */
/* -------------------------------------------------------------------------- */

/** OKLCH → linear sRGB → gamma-encoded sRGB, per the OKLab spec. */
function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  // Clip to gamut the way a browser does before compositing.
  return lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, c)) * 255;
  });
}

function relativeLuminance([r, g, b]) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg, bg) {
  const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/** Every `[data-theme="x"][data-mode="y"] { ... }` block, as token maps. */
function parseThemeBlocks(css) {
  const blocks = new Map();
  // Strip comments first: the file documents the selector shape in prose, and
  // that example would otherwise parse as a real (empty) theme.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /\[data-theme="([^"]+)"\]\[data-mode="([^"]+)"\]\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const [, theme, mode, body] = match;
    const tokens = {};
    for (const decl of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tokens[decl[1]] = decl[2].trim();
    }
    blocks.set(`${theme}|${mode}`, { theme, mode, tokens });
  }
  return blocks;
}

function parseOklch(value) {
  const m = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!m) throw new Error(`Not a plain oklch() value: ${value}`);
  return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

/* -------------------------------------------------------------------------- */
/* The pairs that matter                                                      */
/* -------------------------------------------------------------------------- */

const SURFACES = ["canvas", "raised", "overlay", "sunken"];
const STATUSES = ["success", "warning", "danger", "info"];

/** requirement: 4.5 body text · 3 large text and UI boundaries · null decorative */
function pairsFor() {
  const pairs = [];

  for (const level of ["primary", "secondary", "muted"]) {
    for (const surface of SURFACES) {
      pairs.push({
        group: "Text",
        fg: `--text-${level}`,
        bg: `--surface-${surface}`,
        need: 4.5,
      });
    }
  }

  pairs.push({ group: "Accent", fg: "--text-on-accent", bg: "--accent-default", need: 4.5 });
  pairs.push({ group: "Accent", fg: "--accent-on-accent", bg: "--accent-default", need: 4.5 });
  for (const surface of ["canvas", "raised"]) {
    // The accent carries link and emphasis text, so it is held to body level.
    pairs.push({ group: "Accent", fg: "--accent-default", bg: `--surface-${surface}`, need: 4.5 });
  }
  pairs.push({ group: "Accent", fg: "--accent-default", bg: "--accent-subtle-bg", need: 4.5 });
  pairs.push({ group: "Accent", fg: "--accent-hover", bg: "--surface-canvas", need: 3 });

  for (const status of STATUSES) {
    pairs.push({
      group: "Status",
      fg: `--status-${status}-fg`,
      bg: `--status-${status}-bg`,
      need: 4.5,
    });
    for (const surface of ["canvas", "raised"]) {
      pairs.push({
        group: "Status",
        fg: `--status-${status}-fg`,
        bg: `--surface-${surface}`,
        need: 4.5,
      });
    }
    pairs.push({
      group: "Status",
      fg: `--status-${status}-border`,
      bg: "--surface-raised",
      need: 3,
    });
  }

  for (const surface of ["canvas", "raised"]) {
    pairs.push({ group: "Border", fg: "--border-default", bg: `--surface-${surface}`, need: 3 });
    pairs.push({ group: "Border", fg: "--border-strong", bg: `--surface-${surface}`, need: 3 });
    // Decorative hairline *inside* a surface. It never carries state or marks a
    // control boundary, so WCAG 1.4.11 does not apply; reported for visibility.
    pairs.push({ group: "Border", fg: "--border-subtle", bg: `--surface-${surface}`, need: null });
  }

  return pairs;
}

/* -------------------------------------------------------------------------- */

const asMarkdown = process.argv.includes("--md");
const blocks = parseThemeBlocks(CSS);

if (blocks.size === 0) {
  console.error("No [data-theme][data-mode] blocks found in globals.css.");
  process.exit(1);
}

const rows = [];
let failures = 0;

for (const { theme, mode, tokens } of blocks.values()) {
  for (const pair of pairsFor()) {
    const fgValue = tokens[pair.fg];
    const bgValue = tokens[pair.bg];
    if (!fgValue || !bgValue) {
      console.error(`${theme}/${mode}: missing ${!fgValue ? pair.fg : pair.bg}`);
      failures += 1;
      continue;
    }
    const ratio = contrast(parseOklch(fgValue), parseOklch(bgValue));
    const pass = pair.need === null ? null : ratio >= pair.need;
    if (pass === false) failures += 1;
    rows.push({ theme, mode, ...pair, ratio, pass });
  }
}

const label = (t) => t.replace(/^--/, "").replace(/^(text|surface|status|accent|border)-/, "");
const verdict = (row) =>
  row.pass === null ? "decorative" : row.pass ? "PASS" : `FAIL (needs ${row.need})`;

if (asMarkdown) {
  console.log("| Theme | Mode | Group | Foreground | Background | Ratio | Requires | Result |");
  console.log("| --- | --- | --- | --- | --- | ---: | ---: | --- |");
  for (const r of rows) {
    console.log(
      `| ${r.theme} | ${r.mode} | ${r.group} | ${label(r.fg)} | ${label(r.bg)} | ` +
        `${r.ratio.toFixed(2)} | ${r.need ?? "—"} | ${verdict(r)} |`,
    );
  }
} else {
  const w = (s, n) => String(s).padEnd(n);
  let current = "";
  for (const r of rows) {
    const key = `${r.theme}/${r.mode}`;
    if (key !== current) {
      current = key;
      console.log(`\n=== ${key} ===`);
    }
    console.log(
      `${w(r.group, 7)} ${w(label(r.fg), 16)} on ${w(label(r.bg), 10)} ` +
        `${String(r.ratio.toFixed(2)).padStart(6)}  ${verdict(r)}`,
    );
  }
}

const checked = rows.filter((r) => r.pass !== null).length;
console.log(
  `\n${blocks.size} combinations · ${checked} required pairs · ` +
    `${failures === 0 ? "all pass" : `${failures} FAILING`}`,
);
process.exit(failures === 0 ? 0 : 1);
