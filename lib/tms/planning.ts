import type { Order, Stop } from "./model";

export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export type PlanningDays = 1 | 3 | 7;
export type SegmentKind = "loading" | "loaded" | "empty" | "unloading";
export interface TimeRange {
  start: number;
  end: number;
}
export interface PlanWindow extends TimeRange {
  days: PlanningDays;
  dates: string[];
}
export interface PlanningAssumptions {
  handlingMinutes: number;
  approachKph: number;
}
export interface PlanSegment extends TimeRange {
  id: string;
  kind: SegmentKind;
  label: string;
  estimated: boolean;
  note: string;
}
export interface PlannedOrder extends TimeRange {
  order: Order;
  recorded: TimeRange;
  segments: PlanSegment[];
}
export interface PlanningConflict extends TimeRange {
  id: string;
  first: Order;
  second: Order;
  resources: ("vehicle" | "driver" | "trailer")[];
}
export interface PositionedPlan {
  plan: PlannedOrder;
  lane: number;
}

/** A civil-time scale: stored local appointment strings remain exactly as entered on the calendar. */
export function appointmentTime(stop: Stop) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(stop.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time)
  )
    return NaN;
  const time = Date.parse(`${stop.date}T${stop.time}:00Z`);
  return Number.isFinite(time) &&
    new Date(time).toISOString().slice(0, 10) === stop.date
    ? time
    : NaN;
}
export function shiftPlanningDate(date: string, delta: number) {
  const time = Date.parse(`${date}T12:00:00Z`);
  return Number.isFinite(time)
    ? new Date(time + delta * DAY).toISOString().slice(0, 10)
    : date;
}
export function planningWindow(date: string, days: PlanningDays): PlanWindow {
  const start = Date.parse(`${date}T00:00:00Z`);
  return {
    start,
    end: start + days * DAY,
    days,
    dates: Array.from({ length: days }, (_, i) => shiftPlanningDate(date, i)),
  };
}
export function recordedRange(order: Order): TimeRange | null {
  if (order.stops.length < 2) return null;
  const start = appointmentTime(order.stops[0]);
  const end = appointmentTime(order.stops.at(-1)!);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? { start, end: Math.max(end, start + MINUTE) }
    : null;
}
export function overlaps(a: TimeRange, b: TimeRange) {
  return a.start < b.end && b.start < a.end;
}
export function clipRange(
  range: TimeRange,
  window: TimeRange,
): TimeRange | null {
  const start = Math.max(range.start, window.start),
    end = Math.min(range.end, window.end);
  return start < end ? { start, end } : null;
}
export function planOrder(
  order: Order,
  assumptions: PlanningAssumptions,
): PlannedOrder | null {
  const recorded = recordedRange(order);
  if (!recorded) return null;
  const handling =
    Math.max(0, Math.min(240, assumptions.handlingMinutes)) * MINUTE;
  const speed = Math.max(10, Math.min(130, assumptions.approachKph));
  const segments: PlanSegment[] = [];
  const approach = (Math.max(0, order.emptyKm) / speed) * 60 * MINUTE;
  if (approach > 0)
    segments.push({
      id: `${order.id}-approach`,
      kind: "empty",
      start: recorded.start - approach,
      end: recorded.start,
      label: "Üres út",
      estimated: true,
      note: `${order.emptyKm} km / ${speed} km/h alapján becsült megközelítés; nem rögzített indulás.`,
    });
  let loaded = false;
  order.stops.forEach((stop, index) => {
    const at = appointmentTime(stop);
    const next = order.stops[index + 1];
    const nextAt = next ? appointmentTime(next) : Infinity;
    if (!Number.isFinite(at)) return;
    const end = Math.min(at + handling, nextAt);
    if (end > at)
      segments.push({
        id: `${order.id}-stop-${stop.id}`,
        kind: stop.type === "Felrakó" ? "loading" : "unloading",
        start: at,
        end,
        label: stop.type === "Felrakó" ? "Felrakás" : "Lerakás",
        estimated: true,
        note: `${stop.city} · ${stop.time}; ${Math.round((end - at) / MINUTE)} perc feltételezett rakodási idő.`,
      });
    if (stop.type === "Felrakó") loaded = true;
    else if (!next || next.type === "Felrakó") loaded = false;
    if (next && Number.isFinite(nextAt) && nextAt > end)
      segments.push({
        id: `${order.id}-leg-${index}`,
        kind: loaded ? "loaded" : "empty",
        start: end,
        end: nextAt,
        label: loaded ? "Rakott út" : "Üres út",
        estimated: true,
        note: `${stop.city} → ${next.city} · Rakodási időpontok közötti tervezési ablak; várakozást is tartalmazhat, nem telematikai menetidő.`,
      });
  });
  return {
    order,
    recorded,
    start: segments[0]?.start ?? recorded.start,
    end: Math.max(recorded.end, ...segments.map((segment) => segment.end)),
    segments,
  };
}
/** Resource conflicts use recorded appointments only, not the configurable illustrative approach/handling buffers. */
export function planningConflicts(orders: Order[]): PlanningConflict[] {
  type Booking = { order: Order; range: TimeRange };
  const resources = new Map<
    string,
    { kind: PlanningConflict["resources"][number]; bookings: Booking[] }
  >();
  const trailer = (value: string) =>
    value.replace(/[\s-]/g, "").toLocaleUpperCase("hu-HU");
  for (const order of orders) {
    if (!order.vehicleId || ["Lezárva", "Dokumentáció"].includes(order.status))
      continue;
    const range = recordedRange(order);
    if (!range) continue;
    const keys: [PlanningConflict["resources"][number], string][] = [
      ["vehicle", order.vehicleId],
      ["driver", order.driverId],
      ["trailer", trailer(order.trailer)],
    ];
    for (const [kind, id] of keys) {
      if (!id) continue;
      const key = `${kind}:${id}`;
      if (!resources.has(key)) resources.set(key, { kind, bookings: [] });
      resources.get(key)!.bookings.push({ order, range });
    }
  }
  const conflicts = new Map<string, PlanningConflict>();
  for (const { kind, bookings } of resources.values()) {
    bookings.sort(
      (a, b) => a.range.start - b.range.start || a.range.end - b.range.end,
    );
    for (let i = 0; i < bookings.length; i++)
      for (let j = i + 1; j < bookings.length; j++) {
        const a = bookings[i],
          b = bookings[j];
        if (b.range.start >= a.range.end) break;
        if (!overlaps(a.range, b.range)) continue;
        const id = JSON.stringify([a.order.id, b.order.id].sort());
        const existing = conflicts.get(id);
        if (existing) {
          if (!existing.resources.includes(kind)) existing.resources.push(kind);
        } else
          conflicts.set(id, {
            id,
            first: a.order,
            second: b.order,
            resources: [kind],
            start: Math.max(a.range.start, b.range.start),
            end: Math.min(a.range.end, b.range.end),
          });
      }
  }
  return [...conflicts.values()].sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  );
}
/** Greedy interval partition: each overlapping plan has its own visible lane, adjacent plans reuse lanes. */
export function positionPlans(plans: PlannedOrder[]): {
  items: PositionedPlan[];
  lanes: number;
} {
  const ends: number[] = [];
  const items = [...plans]
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.order.id.localeCompare(b.order.id),
    )
    .map((plan) => {
      let lane = ends.findIndex((end) => end <= plan.start);
      if (lane < 0) {
        lane = ends.length;
        ends.push(plan.end);
      } else ends[lane] = plan.end;
      return { plan, lane };
    });
  return { items, lanes: Math.max(1, ends.length) };
}
export function freeRanges(plans: TimeRange[], window: TimeRange): TimeRange[] {
  const busy = plans
    .map((plan) => clipRange(plan, window))
    .filter((range): range is TimeRange => Boolean(range))
    .sort((a, b) => a.start - b.start);
  const free: TimeRange[] = [];
  let end = window.start;
  for (const range of busy) {
    if (range.start > end) free.push({ start: end, end: range.start });
    end = Math.max(end, range.end);
  }
  if (end < window.end) free.push({ start: end, end: window.end });
  return free;
}
export function percentRange(range: TimeRange, window: TimeRange) {
  const clipped = clipRange(range, window);
  return clipped
    ? {
        left:
          ((clipped.start - window.start) / (window.end - window.start)) * 100,
        width:
          ((clipped.end - clipped.start) / (window.end - window.start)) * 100,
      }
    : null;
}
