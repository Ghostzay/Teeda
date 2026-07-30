/**
 * Unit tests for `layoutDay` — the pure positioning function.
 *
 * Run: node scripts/calendar-test.mjs
 *
 * Everything here is integer arithmetic on salon-local minutes, which is the
 * whole reason this function exists as a pure unit rather than inline in a
 * render: the cases that break calendars (clipping, overlap, DST) are cheap to
 * assert and expensive to notice by eye.
 */
const { layoutDay, PX_PER_MIN, shortName, nowMinuteInSalon } = await import(
  new URL("../src/lib/calendar.ts", import.meta.url).href
);

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
  } else {
    failed += 1;
    console.log(`FAIL  ${name}\n      expected ${e}\n      actual   ${a}`);
  }
}

const base = {
  day: "2027-03-15",
  timezone: "America/New_York",
  open_minute: 540,   // 9:00
  close_minute: 1200, // 20:00
  techs: [{ id: "t1", full_name: "Mai Nguyen", has_shift: true }],
  bands: [],
  appointments: [],
  unassigned_count: 0,
};

const appt = (over) => ({
  id: "a", tech_id: "t1", customer_id: "c", client_name: "Rosa Diaz",
  status: "scheduled", notes: null, service_name: "Gel manicure",
  services: "Gel manicure", start_min: 600, duration_min: 45, ...over,
});

// --- geometry --------------------------------------------------------------
{
  const l = layoutDay({ ...base, appointments: [appt({})] });
  const b = l.columns[0].appointments[0];
  check("10:00 sits 60 min below open", b.top, 60 * PX_PER_MIN);
  check("45 min is 45 * PX_PER_MIN tall", b.height, 45 * PX_PER_MIN);
  check("grid height is the open span", l.height, 660 * PX_PER_MIN);
  check("hour marks run open..close inclusive", l.hours.length, 12);
  check("first hour label", l.hours[0].label, "9 AM");
  check("last hour label", l.hours[11].label, "8 PM");
}

// --- clipping: never negative, never overflowing ---------------------------
{
  const l = layoutDay({
    ...base,
    appointments: [
      appt({ id: "early", start_min: 480, duration_min: 120 }), // 8:00-10:00
      appt({ id: "late", start_min: 1140, duration_min: 180 }), // 19:00-22:00
      appt({ id: "miss", start_min: 60, duration_min: 30 }),    // 1:00, off-grid
    ],
  });
  const blocks = l.columns[0].appointments;
  const early = blocks.find((b) => b.appointment.id === "early");
  const late = blocks.find((b) => b.appointment.id === "late");

  check("starts before open -> top 0, not negative", early.top, 0);
  check("starts before open -> height is the visible part", early.height, 60 * PX_PER_MIN);
  check("starts before open -> flagged", early.clippedStart, true);
  check("runs past close -> height stops at close", late.height, 60 * PX_PER_MIN);
  check("runs past close -> flagged", late.clippedEnd, true);
  check("bottom never exceeds the grid", late.top + late.height, l.height);
  check("entirely off-grid is dropped, not drawn at the edge", blocks.length, 2);
}

// --- overlap: both visible, side by side -----------------------------------
{
  const l = layoutDay({
    ...base,
    appointments: [
      appt({ id: "x", start_min: 600, duration_min: 60 }),
      appt({ id: "y", start_min: 630, duration_min: 60 }),
    ],
  });
  const blocks = l.columns[0].appointments;
  check("both overlapping blocks are rendered", blocks.length, 2);
  check("they take different lanes", blocks.map((b) => b.lane).sort(), [0, 1]);
  check("cluster is two lanes wide", blocks.map((b) => b.lanes), [2, 2]);
}
{
  // Non-overlapping neighbours must NOT be squeezed into lanes.
  const l = layoutDay({
    ...base,
    appointments: [
      appt({ id: "x", start_min: 600, duration_min: 60 }),
      appt({ id: "y", start_min: 660, duration_min: 60 }),
    ],
  });
  check("touching-but-not-overlapping stays full width",
    l.columns[0].appointments.map((b) => b.lanes), [1, 1]);
}
{
  // Three-deep overlap, then a clear gap: the gap must reset the width.
  const l = layoutDay({
    ...base,
    appointments: [
      appt({ id: "a", start_min: 600, duration_min: 90 }),
      appt({ id: "b", start_min: 615, duration_min: 60 }),
      appt({ id: "c", start_min: 630, duration_min: 30 }),
      appt({ id: "d", start_min: 900, duration_min: 30 }),
    ],
  });
  const byId = Object.fromEntries(l.columns[0].appointments.map((b) => [b.appointment.id, b]));
  check("triple overlap is three lanes", [byId.a.lanes, byId.b.lanes, byId.c.lanes], [3, 3, 3]);
  check("a later booking is not squeezed by an earlier pile-up", byId.d.lanes, 1);
}

// --- terse blocks ----------------------------------------------------------
{
  const l = layoutDay({
    ...base,
    appointments: [
      appt({ id: "short", duration_min: 15 }),
      appt({ id: "long", start_min: 800, duration_min: 45 }),
    ],
  });
  const byId = Object.fromEntries(l.columns[0].appointments.map((b) => [b.appointment.id, b]));
  check("under 30 min is terse", byId.short.terse, true);
  check("45 min is not terse", byId.long.terse, false);
}

// --- bands -----------------------------------------------------------------
{
  const l = layoutDay({
    ...base,
    bands: [
      { tech_id: "t1", kind: "shift", note: null, start_min: 480, end_min: 1260 },
      { tech_id: "t1", kind: "break", note: "lunch", start_min: 720, end_min: 750 },
      { tech_id: "t1", kind: "time_off", note: null, start_min: 60, end_min: 120 },
    ],
  });
  const bands = l.columns[0].bands;
  check("a shift wider than the day is clamped to it", [bands[0].top, bands[0].height],
    [0, 660 * PX_PER_MIN]);
  check("a break sits where it belongs", bands[1].top, 180 * PX_PER_MIN);
  check("a band entirely outside the day is dropped", bands.length, 2);
}

// --- unassigned ------------------------------------------------------------
{
  const l = layoutDay({ ...base, appointments: [appt({ tech_id: null })], unassigned_count: 1 });
  check("a booking with no tech goes to its own lane", l.unassigned.length, 1);
  check("and not into a tech column", l.columns[0].appointments.length, 0);
}

// --- names -----------------------------------------------------------------
check("first name + last initial", shortName("Rosa Diaz"), "Rosa D.");
check("one name stays whole", shortName("Cher"), "Cher");
check("three names use the last", shortName("Ana Maria Cruz"), "Ana C.");
check("empty falls back", shortName("   "), "Client");

// --- DST: the same wall-clock minute either side of the boundary -----------
{
  // 2027-03-14 is US spring-forward. 9:00 New York is 14:00Z before, 13:00Z after.
  const before = nowMinuteInSalon("America/New_York", "2027-03-13", new Date("2027-03-13T14:00:00Z"));
  const after = nowMinuteInSalon("America/New_York", "2027-03-15", new Date("2027-03-15T13:00:00Z"));
  check("9:00 local reads 540 before DST", before, 540);
  check("9:00 local reads 540 after DST", after, 540);
  check("a different day has no now-line",
    nowMinuteInSalon("America/New_York", "2027-03-13", new Date("2027-03-15T13:00:00Z")), null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
