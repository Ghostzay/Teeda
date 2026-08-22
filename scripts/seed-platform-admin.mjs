/**
 * Seed the platform admin. Idempotent — safe on every deploy and in CI.
 *
 *   node scripts/seed-platform-admin.mjs
 *
 * Env (never hardcoded, never committed):
 *   NEXT_PUBLIC_SUPABASE_URL   the project URL
 *   SUPABASE_SERVICE_ROLE_KEY  service key (server-side only, as ever)
 *   PLATFORM_ADMIN_EMAIL       who the platform admin is
 *
 * What it does, in order, skipping every step already done:
 *   1. If ANY platform admin (role super_admin) exists -> report and exit 0.
 *      The email in env does not get to demote or replace an existing one.
 *   2. Ensure the "Zolvora HQ" salon row exists (slug zolvora-hq). The
 *      platform admin's profile has to live somewhere — profiles.salon_id is
 *      NOT NULL by design — and HQ is a real row, not a magic null.
 *   3. Ensure an auth user for PLATFORM_ADMIN_EMAIL exists; create it with no
 *      password and print a one-time recovery link so the human sets their
 *      own. No password ever exists in this script, its env, or its output
 *      beyond that single-use link.
 *   4. Upsert the profile: role super_admin, attached to HQ.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.PLATFORM_ADMIN_EMAIL ?? "").trim().toLowerCase();

if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  "content-type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

// --- 1. Already seeded? -----------------------------------------------------
const existing = await rest("/rest/v1/profiles?role=eq.super_admin&select=id,full_name&limit=1");
if (!existing.ok) {
  console.error("Could not read profiles:", existing.status, existing.body);
  process.exit(1);
}
if (existing.body.length > 0) {
  console.log(`Platform admin already exists (${existing.body[0].full_name}). Nothing to do.`);
  process.exit(0);
}

if (!email) {
  console.error("No platform admin exists and PLATFORM_ADMIN_EMAIL is not set.");
  process.exit(1);
}

// --- 2. HQ salon ------------------------------------------------------------
let hq = (await rest("/rest/v1/salons?slug=eq.zolvora-hq&select=id&limit=1")).body?.[0]?.id;
if (!hq) {
  const made = await rest("/rest/v1/salons", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({ name: "Zolvora HQ", slug: "zolvora-hq" }),
  });
  if (!made.ok) {
    console.error("Could not create the HQ salon:", made.status, made.body);
    process.exit(1);
  }
  hq = made.body[0].id;
  console.log("Created the Zolvora HQ salon.");
} else {
  console.log("Zolvora HQ salon already exists.");
}

// --- 3. Auth user -----------------------------------------------------------
// GoTrue's admin listing filters server-side on email in current versions;
// fall back to scanning the first page if the filter is ignored.
const listed = await rest(`/auth/v1/admin/users?email=${encodeURIComponent(email)}&per_page=200`);
const users = listed.body?.users ?? [];
let user = users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;

if (!user) {
  const created = await rest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (!created.ok) {
    console.error("Could not create the auth user:", created.status, created.body);
    process.exit(1);
  }
  user = created.body;
  console.log(`Created auth user for ${email}.`);

  const link = await rest("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "recovery", email }),
  });
  const action = link.body?.properties?.action_link ?? link.body?.action_link;
  if (action) {
    console.log("\nOne-time link to set the password (expires; do not commit this anywhere):");
    console.log(`  ${action}\n`);
  } else {
    console.log("Send a password reset from the dashboard so they can set a password.");
  }
} else {
  console.log(`Auth user for ${email} already exists.`);
}

// --- 4. Profile -------------------------------------------------------------
const upsert = await rest("/rest/v1/profiles?on_conflict=id", {
  method: "POST",
  headers: { prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({
    id: user.id,
    salon_id: hq,
    full_name: "Platform Admin",
    role: "super_admin",
  }),
});
if (!upsert.ok) {
  console.error("Could not upsert the profile:", upsert.status, upsert.body);
  process.exit(1);
}

console.log(`Done: ${email} is the platform admin. /admin is theirs.`);
