/**
 * Static proof that a kiosk cannot reach a staff screen.
 *
 * Not a substitute for the SQL test — that one is the real boundary. This
 * checks the *other* two layers hold their shape, because both are the kind of
 * thing that rots silently: a new page added without a guard, or a role check
 * quietly rewritten back to "everything that isn't a tech".
 *
 * Run: node scripts/kiosk-guard-check.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failed = 0;
const ok = (name) => console.log(`  ok    ${name}`);
const bad = (name, detail) => {
  failed += 1;
  console.log(`  FAIL  ${name}\n        ${detail}`);
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/^(page|layout|route)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

console.log("Every staff route entry point calls a server guard:");
const PUBLIC = ["src/app/login", "src/app/auth", "src/app/kiosk"];
for (const file of walk("src/app")) {
  if (PUBLIC.some((p) => file.startsWith(p))) continue;
  if (file === "src/app/layout.tsx") continue; // root shell, renders no data
  const body = readFileSync(file, "utf8");
  if (/require(Session|Manager|FloorAccess|Kiosk)|getSessionContext/.test(body)) ok(file);
  else bad(file, "no requireSession/requireManager/requireFloorAccess/getSessionContext");
}

console.log("\nEvery /kiosk entry point calls requireKiosk:");
for (const file of walk("src/app/kiosk")) {
  const body = readFileSync(file, "utf8");
  if (/requireKiosk/.test(body)) ok(file);
  else bad(file, "missing requireKiosk()");
}

console.log("\nRole checks are allow-lists, not deny-by-exception:");
const auth = readFileSync("src/lib/auth.ts", "utf8");
if (/canManageFloor:\s*FLOOR_ROLES\.includes/.test(auth)) ok("canManageFloor is an allow-list");
else bad("canManageFloor", 'expected FLOOR_ROLES.includes(...), not `role !== "tech"`');

if (/FLOOR_ROLES[^=]*=\s*\[\s*"manager",\s*"admin",\s*"super_admin"\s*\]/.test(auth)) {
  ok("FLOOR_ROLES matches can_manage_floor() in SQL");
} else bad("FLOOR_ROLES", "must be exactly manager, admin, super_admin");

if (/if \(session\.isKiosk\) redirect\("\/kiosk"\)/.test(auth)) {
  ok("requireSession bounces a kiosk");
} else bad("requireSession", "a kiosk must not pass the shared guard");

const nav = readFileSync("src/lib/navigation.ts", "utf8");
if (/role === "kiosk"\) return \[\]/.test(nav)) ok("navForRole gives a kiosk no links");
else bad("navForRole", "a kiosk must not fall through to the tech menu");
// Any /kiosk route is fine — it is the lobby now, not the customer screen.
if (/role === "kiosk"\) return "\/kiosk/.test(nav)) ok("homeForRole sends a kiosk into /kiosk");
else bad("homeForRole", "a kiosk must not default to /dashboard");

console.log("\nThe kiosk reads no table directly:");
const actions = readFileSync("src/lib/actions/kiosk.ts", "utf8");
// Split on the divider FIRST, then strip comments. The divider is itself a
// line comment, so stripping first deleted the very marker this relies on.
const MARKER = "// Manager side";
const cut = actions.indexOf(MARKER);
if (cut === -1) bad("kiosk actions", `missing the "${MARKER}" divider this check relies on`);

// Prose *about* not calling `.from("customers")` is not a call to it, and
// matching it made this check fail on its own documentation.
const withoutComments = (cut === -1 ? actions : actions.slice(0, cut))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const kioskOnly = withoutComments;
const tables = [...kioskOnly.matchAll(/\.from\(["']([a-z_]+)["']\)/g)].map((m) => m[1]);
if (tables.length === 0) ok("no .from() in any kiosk-facing action");
else bad("kiosk actions", `direct table access: ${tables.join(", ")}`);

console.log("\nThe kiosk shell renders no app chrome:");
const shell = readFileSync("src/components/kiosk/kiosk-shell.tsx", "utf8");
for (const banned of ["Sidebar", "navForRole", "TabBar", "UserMenu", "AppShell"]) {
  if (shell.includes(banned)) bad("kiosk-shell", `imports ${banned}`);
}
ok("no nav, sidebar, tab bar or user menu");

console.log(failed === 0 ? "\nAll guard checks passed." : `\n${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
