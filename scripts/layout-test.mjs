/**
 * The dashboard layout merge, tested directly.
 *
 * This is pure logic and the piece most likely to break silently: get the
 * merge wrong and a widget you ship simply never appears for anyone who has
 * ever customised their dashboard, with no error to notice.
 *
 *   node --experimental-strip-types scripts/layout-test.mjs
 */
import { resolveLayout, defaultLayout, requiredData, WIDGETS, toStored } from "../src/lib/dashboard.ts";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.log(`  FAIL ${name} ${detail}`); failures += 1; }
};
const all = (l) => [...l.full, ...l.main, ...l.side, ...l.hidden];

console.log("— every widget lands in exactly one slot —");
for (const role of ["manager", "super_admin", "admin"]) {
  const l = defaultLayout(role);
  const ids = all(l);
  check(`${role}: no duplicates`, new Set(ids).size === ids.length, JSON.stringify(ids));
  const allowed = WIDGETS.filter((w) => !w.managerOnly || role !== "admin").map((w) => w.id);
  check(`${role}: covers the catalogue`, allowed.every((id) => ids.includes(id)),
    `missing ${allowed.filter((id) => !ids.includes(id))}`);
}

console.log("— manager-only widgets never reach an admin —");
const adminIds = all(defaultLayout("admin"));
check("admin cannot see takings_trend", !adminIds.includes("takings_trend"));
check("admin cannot see unpaid_tickets", !adminIds.includes("unpaid_tickets"));

console.log("— a saved layout is honoured —");
const saved = { v: 1, full: ["money"], main: ["in_service", "waiting_longest"], side: [], hidden: ["calendar_gaps"] };
const r = resolveLayout(saved, null, "manager");
check("full respects the saved order", r.full[0] === "money", JSON.stringify(r.full));
check("main respects the saved order", r.main[0] === "in_service" && r.main[1] === "waiting_longest", JSON.stringify(r.main));
check("explicitly hidden stays hidden", r.hidden.includes("calendar_gaps"));
check("unmentioned widgets still appear", r.side.includes("whats_coming") || r.main.includes("whats_coming"), JSON.stringify(r));
check("still exactly one slot each", new Set(all(r)).size === all(r).length);

console.log("— THE regression this design exists to prevent —");
const stale = { v: 1, full: [], main: ["waiting_longest"], side: [], hidden: [] };
const merged = resolveLayout(stale, null, "manager");
const shipped = WIDGETS.filter((w) => !w.defaultHidden).map((w) => w.id);
const visible = [...merged.full, ...merged.main, ...merged.side];
check("a layout saved before a widget existed still shows it",
  shipped.every((id) => visible.includes(id)),
  `hidden by accident: ${shipped.filter((id) => !visible.includes(id))}`);

console.log("— unknown and removed ids —");
const junk = resolveLayout({ v: 1, main: ["ghost_widget", "waiting_longest"], hidden: ["also_gone"] }, null, "manager");
check("unknown ids are dropped", !all(junk).includes("ghost_widget") && !all(junk).includes("also_gone"));
check("known ids around them survive", junk.main.includes("waiting_longest"));

console.log("— junk input degrades to the default —");
for (const bad of [null, undefined, "nonsense", 42, [], { full: "not-an-array" }]) {
  const out = resolveLayout(bad, null, "manager");
  check(`${JSON.stringify(bad)} → a usable layout`, all(out).length === WIDGETS.length);
}

console.log("— salon default is used only when the user has none —");
const salon = { v: 1, main: ["money"], full: [], side: [], hidden: [] };
check("falls back to the salon layout", resolveLayout(null, salon, "manager").main[0] === "money");
check("the user's own layout wins", resolveLayout(saved, salon, "manager").full[0] === "money");

console.log("— data deps follow visibility —");
const hideAll = resolveLayout({ v: 1, full: [], main: [], side: [], hidden: WIDGETS.map((w) => w.id) }, null, "manager");
check("everything hidden needs no queries", requiredData(hideAll).size === 0, [...requiredData(hideAll)].join(","));
check("the default layout needs several", requiredData(defaultLayout("manager")).size >= 6);
check("hiding the floor cards drops the floor query",
  !requiredData(resolveLayout({ v: 1, main: ["waiting_longest"], hidden: ["needs_attention", "floor_cards"] }, null, "manager")).has("floor"));

console.log("— a round trip is stable —");
const once = resolveLayout(saved, null, "manager");
const twice = resolveLayout(toStored(once), null, "manager");
check("saving and reloading changes nothing", JSON.stringify(once) === JSON.stringify(twice),
  `${JSON.stringify(once)} vs ${JSON.stringify(twice)}`);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILING`);
process.exit(failures === 0 ? 0 : 1);
