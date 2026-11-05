import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/tms/seed";
import {
  emptyOrderFilters,
  filterOrderView,
  orderDate,
  orderMargin,
  sortOrderView,
} from "../lib/tms/order-view";

test("assignment views use resource ownership, independent of workflow status", () => {
  const state = structuredClone(seed);
  const assigned = filterOrderView(
    state.orders,
    state,
    "assigned",
    emptyOrderFilters,
  );
  const unassigned = filterOrderView(
    state.orders,
    state,
    "unassigned",
    emptyOrderFilters,
  );
  assert.equal(assigned.length + unassigned.length, state.orders.length);
  assert.ok(assigned.every((order) => order.vehicleId));
  assert.ok(unassigned.every((order) => !order.vehicleId));
  assert.equal(
    new Set([...assigned, ...unassigned].map((order) => order.id)).size,
    state.orders.length,
  );
});
test("compound filters combine dates, ADR, native currency and HUF-equivalent price", () => {
  const state = structuredClone(seed);
  const target = state.orders[0];
  target.price = 1000;
  target.currency = "EUR";
  target.cargo.adr = true;
  const filters = {
    ...emptyOrderFilters,
    partnerId: target.partnerId,
    currency: "EUR",
    adr: "yes" as const,
    dateFrom: target.stops[0].date,
    dateTo: target.stops[0].date,
    priceMin: "399999",
    priceMax: "400001",
  };
  assert.ok(
    filterOrderView(state.orders, state, "all", filters).some(
      (order) => order.id === target.id,
    ),
  );
  assert.equal(
    filterOrderView(state.orders, state, "all", {
      ...filters,
      priceMax: "399999",
    }).some((order) => order.id === target.id),
    false,
  );
});
test("search and route filters tolerate Hungarian accents and inspect the correct stop direction", () => {
  const state = structuredClone(seed);
  const target = state.orders[0];
  target.stops[0].city = "Győr";
  target.stops[1].city = "Pécs";
  assert.ok(
    filterOrderView(state.orders, state, "all", {
      ...emptyOrderFilters,
      search: "gyor",
      from: "gyor",
      to: "pecs",
    }).some((order) => order.id === target.id),
  );
  assert.equal(
    filterOrderView(state.orders, state, "all", {
      ...emptyOrderFilters,
      from: "pecs",
    }).some((order) => order.id === target.id),
    false,
  );
});
test("document completeness requires both order document and CMR", () => {
  const state = structuredClone(seed);
  const target = state.orders[0];
  state.documents = [];
  state.documents.push({
    id: "doc-a",
    orderId: target.id,
    name: "order.pdf",
    type: "Megbízás",
    createdAt: "2026-11-05",
    version: 1,
  });
  assert.equal(
    filterOrderView(state.orders, state, "all", {
      ...emptyOrderFilters,
      documents: "complete",
    }).length,
    0,
  );
  state.documents.push({
    id: "doc-b",
    orderId: target.id,
    name: "cmr.pdf",
    type: "CMR",
    createdAt: "2026-11-05",
    version: 1,
  });
  assert.deepEqual(
    filterOrderView(state.orders, state, "all", {
      ...emptyOrderFilters,
      documents: "complete",
    }).map((order) => order.id),
    [target.id],
  );
});
test("closed-order margin uses actual cost and price sorting compares currencies consistently", () => {
  const state = structuredClone(seed);
  const first = state.orders[0],
    second = state.orders[1];
  first.status = "Lezárva";
  first.price = 1000;
  first.currency = "EUR";
  first.plannedCost = 100000;
  first.actualCost = 500000;
  second.price = 300000;
  second.currency = "HUF";
  assert.equal(orderMargin(first).amount, -100000);
  assert.deepEqual(
    sortOrderView([first, second], "price", "asc").map((order) => order.id),
    [second.id, first.id],
  );
});
test("created-date filtering uses Budapest local date across the UTC day boundary", () => {
  const order = structuredClone(seed.orders[0]);
  order.createdAt = "2026-11-05T23:30:00Z";
  assert.equal(orderDate(order, "created"), "2026-11-06");
});
