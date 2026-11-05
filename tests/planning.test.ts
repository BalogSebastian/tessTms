import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/tms/seed";
import {
  DAY,
  MINUTE,
  clipRange,
  freeRanges,
  percentRange,
  planOrder,
  planningConflicts,
  planningWindow,
  positionPlans,
  recordedRange,
  shiftPlanningDate,
} from "../lib/tms/planning";
import type { Order } from "../lib/tms/model";
const make = (
  id: string,
  start: string,
  end: string,
  changes: Partial<Order> = {},
): Order => ({
  ...structuredClone(seed.orders[0]),
  id,
  reference: id,
  status: "Kiosztva",
  emptyKm: 0,
  stops: [
    {
      id: `${id}-a`,
      type: "Felrakó",
      city: "Győr",
      address: "Ipar u.",
      date: start.slice(0, 10),
      time: start.slice(11, 16),
    },
    {
      id: `${id}-b`,
      type: "Lerakó",
      city: "Wien",
      address: "Ipar u.",
      date: end.slice(0, 10),
      time: end.slice(11, 16),
    },
  ],
  ...changes,
});
const assumptions = { handlingMinutes: 30, approachKph: 60 };
test("planning windows keep civil appointments and cross month/year boundaries for day, three days and week", () => {
  assert.equal(shiftPlanningDate("2026-12-31", 1), "2027-01-01");
  for (const days of [1, 3, 7] as const) {
    const window = planningWindow("2026-12-31", days);
    assert.equal(window.end - window.start, days * DAY);
    assert.equal(window.dates.length, days);
  }
  assert.deepEqual(planningWindow("2026-12-31", 3).dates, [
    "2026-12-31",
    "2027-01-01",
    "2027-01-02",
  ]);
});
test("stored multi-day intervals detect overlapping truck, driver and normalized trailer while adjacent trips do not conflict", () => {
  const a = make("a", "2026-11-05T22:00", "2026-11-06T08:00");
  const b = make("b", "2026-11-06T07:00", "2026-11-06T10:00", {
    trailer: "tp 01",
  });
  const overlap = planningConflicts([a, b]);
  assert.equal(overlap.length, 1);
  assert.deepEqual(overlap[0].resources, ["vehicle", "driver", "trailer"]);
  assert.equal(overlap[0].end - overlap[0].start, 60 * MINUTE);
  b.stops[0].time = "08:00";
  assert.equal(planningConflicts([a, b]).length, 0);
});
test("shared drivers and trailers are detected even when trucks differ, closed work is excluded", () => {
  const a = make("a", "2026-11-05T08:00", "2026-11-05T12:00");
  const b = make("b", "2026-11-05T10:00", "2026-11-05T14:00", {
    vehicleId: "different-truck",
    driverId: a.driverId,
    trailer: "different",
  });
  assert.deepEqual(planningConflicts([a, b])[0].resources, ["driver"]);
  b.driverId = "different";
  b.trailer = a.trailer;
  assert.deepEqual(planningConflicts([a, b])[0].resources, ["trailer"]);
  b.status = "Lezárva";
  assert.equal(planningConflicts([a, b]).length, 0);
});
test("estimated approach and loading segments are explicit and never enlarge recorded conflict occupancy", () => {
  const order = make("a", "2026-11-05T08:00", "2026-11-05T12:00", {
    emptyKm: 60,
  });
  const plan = planOrder(order, assumptions)!;
  assert.deepEqual(
    plan.segments.map((segment) => segment.kind),
    ["empty", "loading", "loaded", "unloading"],
  );
  assert.equal(plan.segments[0].end - plan.segments[0].start, 60 * MINUTE);
  assert.equal(plan.start, plan.recorded.start - 60 * MINUTE);
  assert.equal(plan.end, plan.recorded.end + 30 * MINUTE);
  assert.ok(
    plan.segments.every((segment) => segment.estimated && segment.note),
  );
  assert.deepEqual(plan.recorded, recordedRange(order));
  const previous = make("b", "2026-11-05T06:00", "2026-11-05T07:30");
  assert.equal(planningConflicts([previous, order]).length, 0);
});
test("clipping carries multi-day work across the left and right window edges without negative widths", () => {
  const window = planningWindow("2026-11-06", 1);
  const order = make("a", "2026-11-05T20:00", "2026-11-07T06:00");
  assert.deepEqual(clipRange(recordedRange(order)!, window), {
    start: window.start,
    end: window.end,
  });
  assert.deepEqual(percentRange(recordedRange(order)!, window), {
    left: 0,
    width: 100,
  });
  assert.equal(
    clipRange({ start: window.end, end: window.end + DAY }, window),
    null,
  );
});
test("overlapping work uses minimum separate lanes and adjacent jobs reuse a lane", () => {
  const plans = [
    make("a", "2026-11-05T08:00", "2026-11-05T12:00"),
    make("b", "2026-11-05T10:00", "2026-11-05T14:00"),
    make("c", "2026-11-05T12:30", "2026-11-05T16:00"),
  ].map((order) => planOrder(order, assumptions)!);
  const placed = positionPlans(plans);
  assert.equal(placed.lanes, 2);
  assert.equal(placed.items[0].lane, placed.items[2].lane);
  assert.notEqual(placed.items[0].lane, placed.items[1].lane);
});
test("free time merges overlapping work and preserves both outer gaps", () => {
  const window = { start: 0, end: 100 };
  assert.deepEqual(
    freeRanges(
      [
        { start: 20, end: 40 },
        { start: 30, end: 60 },
        { start: 60, end: 80 },
      ],
      window,
    ),
    [
      { start: 0, end: 20 },
      { start: 80, end: 100 },
    ],
  );
  assert.deepEqual(freeRanges([], window), [window]);
});

test("08:00 stored appointment remains 08:00 on the civil calendar axis", () => {
  const range = recordedRange(
    make("clock", "2026-11-05T08:00", "2026-11-05T16:00"),
  )!;
  assert.equal(new Date(range.start).getUTCHours(), 8);
  assert.equal(
    new Intl.DateTimeFormat("hu-HU", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
    }).format(range.start),
    "08:00",
  );
});
