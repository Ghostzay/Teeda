/**
 * The kiosk-mode cookie is the security boundary. These assert it holds.
 *
 * Run: node --experimental-strip-types scripts/kiosk-mode-test.mjs
 */
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-secret-not-a-real-key";

const {
  issueKioskMode,
  readKioskMode,
  clearKioskModeCookie,
  kioskBrandCookie,
  readKioskBrand,
  KIOSK_COOKIE,
  KIOSK_BRAND_COOKIE,
} = await import(new URL("../src/lib/kiosk-mode.ts", import.meta.url).href);

let passed = 0, failed = 0;
const check = async (name, actual, expected) => {
  const a = JSON.stringify(await actual), e = JSON.stringify(expected);
  if (a === e) passed += 1;
  else { failed += 1; console.log(`FAIL  ${name}\n      expected ${e}\n      actual   ${a}`); }
};

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB   = "22222222-2222-2222-2222-222222222222";

const issued = await issueKioskMode(ALICE, "device-1");

await check("a freshly issued cookie verifies",
  (await readKioskMode(issued.value, ALICE))?.deviceKey, "device-1");

await check("it is httpOnly", issued.options.httpOnly, true);
await check("SameSite=Lax", issued.options.sameSite, "lax");
await check("path is the whole app", issued.options.path, "/");
await check("it outlives a reboot (>= 1 year)", issued.options.maxAge >= 31_536_000, true);

// --- the ones that matter ---------------------------------------------------
await check("another user's session cannot use it",
  await readKioskMode(issued.value, BOB), null);

const [k, u, e, sig] = issued.value.split(".");
await check("a flipped signature is rejected",
  await readKioskMode(`${k}.${u}.${e}.${sig.slice(0, -1)}X`, ALICE), null);
await check("a rewritten user id is rejected",
  await readKioskMode(`${k}.${BOB}.${e}.${sig}`, ALICE), null);
await check("a stretched expiry is rejected",
  await readKioskMode(`${k}.${u}.${Number(e) + 10_000}.${sig}`, ALICE), null);
await check("an unsigned value is rejected",
  await readKioskMode(`${k}.${u}.${e}.`, ALICE), null);
await check("a hand-written cookie is rejected",
  await readKioskMode("device-1." + ALICE + ".9999999999999.anything", ALICE), null);
await check("garbage is rejected", await readKioskMode("true", ALICE), null);
await check("no cookie means not in kiosk mode",
  await readKioskMode(undefined, ALICE), null);

// Expiry is enforced, not merely stored.
const expired = await issueKioskMode(ALICE, "device-1");
const [ek, eu, , esig] = expired.value.split(".");
await check("an expired cookie is rejected",
  await readKioskMode(`${ek}.${eu}.${Date.now() - 1000}.${esig}`, ALICE), null);

// The device key survives a re-issue, so the PIN lockout follows the device.
const reissued = await issueKioskMode(ALICE, "device-1");
await check("re-issuing keeps the device key (lockout follows the device)",
  (await readKioskMode(reissued.value, ALICE))?.deviceKey, "device-1");

// Leaving kiosk mode has to clear the branding too. Leave it behind and the
// next stall on that device shows the previous salon's name.
const cleared = clearKioskModeCookie();
await check("clearing targets both cookies",
  cleared.map((c) => c.name).sort(), [KIOSK_BRAND_COOKIE, KIOSK_COOKIE].sort());
await check("clearing expires them immediately",
  cleared.every((c) => c.options.maxAge === 0), true);
await check("clearing stays httpOnly",
  cleared.every((c) => c.options.httpOnly === true), true);

// --- the branding cache -----------------------------------------------------
//
// Display text only. It is never trusted for a decision, but it does have to
// survive a round trip: a salon called "Nails | Co" must not lose its device
// label to the separator.
const brand = kioskBrandCookie({ salonName: "Nails & Co", deviceLabel: "Front desk" });
await check("branding round-trips", readKioskBrand(brand.value),
  { salonName: "Nails & Co", deviceLabel: "Front desk" });
await check("branding is httpOnly", brand.options.httpOnly, true);

const piped = kioskBrandCookie({ salonName: "Nails | Co", deviceLabel: "Desk | 2" });
await check("a pipe in the name cannot split the value", readKioskBrand(piped.value),
  { salonName: "Nails   Co", deviceLabel: "Desk   2" });

await check("no branding cookie is not half a brand", readKioskBrand(undefined), null);
await check("a truncated branding cookie is rejected", readKioskBrand("OnlyASalon"), null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
