import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/tms/seed";
import { freeCredit, huf, type Order } from "../lib/tms/model";
import {
  validateOrder,
  validateStops,
  assignmentError,
  transitionError,
  invoiceError,
} from "../lib/tms/rules";
import { importOrders, parseCsv } from "../lib/tms/import";

function newOrder(patch: Partial<Order> = {}): Order {
  return {
    ...structuredClone(seed.orders[3]),
    id: "new-test",
    reference: "TEST-001",
    vehicleId: "",
    driverId: "",
    cargo: {
      name: "Áru",
      kg: 10000,
      pieces: 1,
      ldm: 5,
      adr: false,
      type: "Ponyvás",
    },
    price: 100000,
    currency: "HUF",
    status: "Új",
    ...patch,
  };
}
test("a hitelkeret a kintlévőségeket és az összes nyitott megbízást levonja", () => {
  assert.equal(freeCredit(seed, "p1"), 8000000 - 900000 - 380000 - 580000);
  assert.equal(huf(950, "EUR"), 380000);
});
test("a meglévő fuvar saját foglalása módosításkor egyszer számít", () => {
  assert.equal(freeCredit(seed, "p1", "order-1"), 8000000 - 900000 - 580000);
});
test("hitelkeret-túllépés blokkolja a mentést", () => {
  assert.ok(
    validateOrder(seed, newOrder({ price: 999999999 })).some((x) =>
      x.includes("hitelkeret"),
    ),
  );
});
test("azonos cég megbízásszáma nem duplikálható", () => {
  assert.ok(
    validateOrder(
      seed,
      newOrder({ reference: seed.orders[0].reference, companyId: "steel" }),
    ).some((x) => x.includes("már létezik")),
  );
});
test("a rakománysúly és az ADR követelmények érvényesülnek", () => {
  assert.match(
    assignmentError(
      seed,
      newOrder({
        cargo: {
          name: "Túlméret",
          kg: 99999,
          pieces: 1,
          ldm: 0,
          adr: false,
          type: "Ponyvás",
        },
      }),
      "v4",
    )!,
    /kapacitás/,
  );
  assert.match(
    assignmentError(
      seed,
      newOrder({
        cargo: {
          name: "ADR",
          kg: 15000,
          pieces: 1,
          ldm: 0,
          adr: true,
          type: "Tartályos",
        },
      }),
      "v4",
    )!,
    /ADR/,
  );
});
test("vezetési tartalék és járműfoglaltság megakadályozza a kiosztást", () => {
  assert.match(assignmentError(seed, newOrder(), "v3")!, /vezetési idő/);
  assert.match(assignmentError(seed, newOrder(), "v2")!, /aktív kiosztás/);
  assert.equal(assignmentError(seed, newOrder(), "v4"), null);
});
test("státuszok nem ugorhatók át és CMR nélkül nem zárható le a fuvar", () => {
  assert.match(transitionError(seed, newOrder(), "Úton")!, /következő/);
  assert.match(
    transitionError(
      seed,
      { ...newOrder(), status: "Dokumentáció" },
      "Lezárva",
    )!,
    /CMR/,
  );
  assert.equal(
    transitionError(seed, seed.orders[6], "Lezárva")?.includes("következő"),
    true,
  );
});
test("számlaelőkészítéshez azonos partner, cég és deviza szükséges", () => {
  assert.equal(invoiceError(seed, ["order-7"]), null);
  assert.match(invoiceError(seed, ["order-1"])!, /lezárt/);
  assert.match(invoiceError(seed, ["order-7", "order-2"])!, /azonos/);
});
test("egy fuvarra nem készülhet kétszer számlaelőkészítés", () => {
  const s = structuredClone(seed);
  s.invoices.push({
    id: "i",
    orderIds: ["order-7"],
    partnerId: "p3",
    companyId: "west",
    amount: 240000,
    currency: "HUF",
    status: "Előkészítve",
    createdAt: "",
  });
  assert.match(invoiceError(s, ["order-7"])!, /már/);
});
test("CSV-ben az idézett pontosvessző és sortörés megmarad", () => {
  assert.deepEqual(parseCsv('a;"b;c";"d\ne"\r\n1;2;3'), [
    ["a", "b;c", "d\ne"],
    ["1", "2", "3"],
  ]);
  assert.throws(() => parseCsv('a;"b'), /idézőjel/);
});
test("import az összes sor közös hitelkeret-foglalását ellenőrzi", () => {
  const header = "reference;partner;from;to;price;currency;kg\n";
  const csv =
    header +
    "ONE;Panon Építő Kft.;Győr;Pécs;1500000;HUF;10000\nTWO;Panon Építő Kft.;Győr;Pécs;1500000;HUF;10000";
  assert.throws(() => importOrders(seed, csv, "batch"), /hitelkeret/);
  assert.equal(seed.orders.length, 8);
});
test("érvényes import új megbízást hoz létre és kötegazonosítót kap", () => {
  const list = importOrders(
    seed,
    "reference;partner;from;to;price;currency;kg\nIMP-NEW;Duna Útépítő Kft.;Győr;Budapest;100000;HUF;18000",
    "batch-42",
  );
  assert.equal(list.length, 1);
  assert.equal(list[0].batchId, "batch-42");
  assert.equal(list[0].status, "Új");
});
test("hibás számszerű mező nem kerülhet be az importból", () => {
  assert.throws(
    () =>
      importOrders(
        seed,
        "reference;partner;from;to;price;currency;kg\nBAD;Duna Útépítő Kft.;Győr;Pécs;1000;HUF;hibás",
        "batch",
      ),
    /tömeg/,
  );
});

test("a hibás naptári dátum és a fordított rakodási időrend blokkolja a mentést", () => {
  const order = newOrder();
  order.stops[0].date = "2026-02-31";
  assert.ok(
    validateStops(order).some((x) => x.includes("érvényes cím, dátum")),
  );
  order.stops[0].date = "2026-11-07";
  order.stops[1].date = "2026-11-06";
  assert.ok(validateStops(order).some((x) => x.includes("sorrendjében")));
});

test("a referencia körüli szóköz nem kerüli meg az egyediséget", () => {
  assert.ok(
    validateOrder(
      seed,
      newOrder({
        companyId: "steel",
        reference: ` ${seed.orders[0].reference.toLowerCase()} `,
      }),
    ).some((x) => x.includes("már létezik")),
  );
});

test("a tételek rakodási egyenlege és az összesített mennyiség együtt ellenőrzött", () => {
  const order = newOrder();
  order.stops[0].cargoItems = [
    {
      id: "item-pickup",
      name: "Áru",
      kg: 10000,
      pieces: 1,
      ldm: 5,
      lengthCm: 120,
      widthCm: 80,
      heightCm: 100,
    },
  ];
  order.stops[1].cargoItems = [
    { id: "item-delivery", name: "Áru", kg: 10000, pieces: 1, ldm: 5 },
  ];
  assert.deepEqual(validateStops(order), []);
  order.stops[1].cargoItems[0].kg = 11000;
  assert.ok(
    validateStops(order).some((x) => x.includes("Nem rakható le több")),
  );
  order.stops[1].cargoItems[0].kg = 10000;
  order.cargo.kg = 9000;
  assert.ok(validateStops(order).some((x) => x.includes("összesített")));
});

test("a hőmérsékleti tartomány és az ADR UN-szám érvényessége kötelező", () => {
  const order = newOrder({
    requirements: {
      sealNumber: "PL-123",
      temperatureMin: 8,
      temperatureMax: 2,
      adrUnNumber: "1203",
      instructions: "",
    },
  });
  assert.ok(
    validateStops(order).some((x) => x.includes("minimum hőmérséklet")),
  );
  assert.ok(validateStops(order).some((x) => x.includes("ADR rakomány")));
  order.cargo.adr = true;
  order.requirements!.temperatureMax = 10;
  assert.deepEqual(validateStops(order), []);
});

test("többnapos járműfoglalás átfedése a második napon is blokkol", () => {
  const state = structuredClone(seed);
  state.services = [];
  const busy = newOrder({
    id: "busy",
    vehicleId: "v4",
    driverId: "d4",
    trailer: "TP-04",
    status: "Kiosztva",
  });
  busy.stops[0].date = "2026-11-04";
  busy.stops[1].date = "2026-11-06";
  state.orders = [busy];
  assert.match(assignmentError(state, newOrder(), "v4")!, /aktív kiosztás/);
});

test("egymás utáni, nem átfedő aznapi fuvarok kioszthatók", () => {
  const state = structuredClone(seed);
  state.services = [];
  const busy = newOrder({
    id: "busy",
    vehicleId: "v4",
    driverId: "d4",
    status: "Kiosztva",
  });
  busy.stops[1].time = "10:00";
  state.orders = [busy];
  const later = newOrder();
  later.stops[0].time = "10:30";
  assert.equal(assignmentError(state, later, "v4"), null);
});

test("azonos sofőr másik járművön sem foglalható kétszer", () => {
  const state = structuredClone(seed);
  state.services = [];
  state.orders = [
    newOrder({
      id: "busy",
      vehicleId: "v4",
      driverId: "d4",
      status: "Kiosztva",
    }),
  ];
  state.vehicles.push({
    ...state.vehicles[3],
    id: "v5",
    plate: "TEST-005",
    trailer: "TP-05",
  });
  assert.match(assignmentError(state, newOrder(), "v5")!, /sofőrnek/);
});

test("lejárt műszaki és tervezett szerviz meggátolja a kiosztást", () => {
  const state = structuredClone(seed);
  state.orders = [];
  state.services = [];
  state.vehicles[3].inspection = "2026-11-04";
  assert.match(assignmentError(state, newOrder(), "v4")!, /műszaki/);
  state.vehicles[3].inspection = "2027-01-01";
  state.services.push({
    id: "service-test",
    vehicleId: "v4",
    description: "Karbantartás",
    date: "2026-11-05",
    cost: 0,
    status: "Tervezett",
  });
  assert.match(assignmentError(state, newOrder(), "v4")!, /szervizre/);
});

test("nem létező vagy ismétlődő fuvar nem kerülhet gyűjtőszámlára", () => {
  assert.match(invoiceError(seed, ["order-7", "missing"])!, /léteznie/);
  assert.match(invoiceError(seed, ["order-7", "order-7"])!, /csak egyszer/);
});

test("CSV import fogad tizedesvesszőt, de nem fogad hexadecimális számot", () => {
  const header = "reference;partner;from;to;price;currency;kg\n";
  const [order] = importOrders(
    seed,
    header + "DECIMAL;Duna Útépítő Kft.;Győr;Budapest;1000,50;EUR;10000,5",
    "batch",
  );
  assert.equal(order.price, 1000.5);
  assert.equal(order.cargo.kg, 10000.5);
  assert.throws(
    () =>
      importOrders(
        seed,
        header + "HEX;Duna Útépítő Kft.;Győr;Budapest;0x100;EUR;1000",
        "batch",
      ),
    /fuvardíj/,
  );
});
