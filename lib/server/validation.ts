import type { TmsState } from "../tms/model";
import { huf, companies as defaultCompanies } from "../tms/model";
import {
  assignmentError,
  invoiceError,
  transitionError,
  validateOrder,
} from "../tms/rules";
import { ApiError } from "./errors";
import type { Role } from "./schema";
import { isDeepStrictEqual } from "node:util";

const equal = isDeepStrictEqual;
const fail = (message: string): never => {
  throw new ApiError(422, message);
};
const permissions: Record<Role, readonly (keyof TmsState)[]> = {
  admin: [
    "companies",
    "partners",
    "orders",
    "vehicles",
    "drivers",
    "documents",
    "costs",
    "invoices",
    "purchases",
    "services",
    "stock",
    "stockMoves",
    "routes",
    "messages",
    "incidents",
    "outbox",
  ],
  dispatcher: [
    "orders",
    "vehicles",
    "drivers",
    "documents",
    "purchases",
    "services",
    "stock",
    "stockMoves",
    "routes",
    "messages",
    "incidents",
  ],
  finance: [
    "partners",
    "orders",
    "documents",
    "costs",
    "invoices",
    "purchases",
    "outbox",
  ],
  viewer: [],
};

export function validateMutation(
  before: TmsState,
  after: TmsState,
  role: Role,
  fileExists: (id: string) => boolean,
) {
  const changed = (
    [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ] as (keyof TmsState)[]
  ).filter(
    (key) =>
      key !== "schema" && key !== "audit" && !equal(before[key], after[key]),
  );
  if (changed.some((key) => !permissions[role].includes(key)))
    throw new ApiError(403, "A szerepköröd nem jogosult erre a módosításra.");
  if (role === "viewer")
    throw new ApiError(403, "Megtekintőként nem módosíthatod a munkateret.");
  for (const key of Object.keys(after) as (keyof TmsState)[]) {
    if (key === "schema" || key === "audit") continue;
    const list = after[key] as { id: string }[] | undefined;
    if (!list) continue;
    if (new Set(list.map((row) => row.id)).size !== list.length)
      fail(`Ismétlődő azonosító: ${key}.`);
  }
  const companies = after.companies ?? defaultCompanies;
  if (!companies.length) fail("Legalább egy cég szükséges a munkatérben.");
  const companyIds = new Set(companies.map((company) => company.id));
  const companyKeys = [
    "orders",
    "vehicles",
    "drivers",
    "invoices",
    "purchases",
    "stock",
  ] as const;
  for (const key of companyKeys) {
    if (after[key].some((record) => !companyIds.has(record.companyId)))
      fail(`Érvénytelen vagy törölt cégre mutató hivatkozás: ${key}.`);
  }
  for (const company of before.companies ?? defaultCompanies) {
    if (
      !companyIds.has(company.id) &&
      companyKeys.some((key) =>
        before[key].some((record) => record.companyId === company.id),
      )
    )
      fail("Használatban lévő cég nem törölhető a munkatérből.");
  }
  const companyNames = companies.map((company) =>
    company.name.trim().toLocaleLowerCase("hu-HU"),
  );
  if (new Set(companyNames).size !== companies.length)
    fail("Minden céghez egyedi cégnév szükséges.");
  const plates = after.vehicles.map((vehicle) =>
    vehicle.plate.trim().toUpperCase().replace(/[\s-]/g, ""),
  );
  if (plates.some((plate) => !plate) || new Set(plates).size !== plates.length)
    fail("A jármű rendszáma kötelező és csak egyszer szerepelhet a flottában.");
  const stockKeys = after.stock.map(
    (stock) =>
      `${stock.companyId}|${stock.depot.trim().toLocaleLowerCase("hu-HU")}|${stock.name.trim().toLocaleLowerCase("hu-HU")}`,
  );
  if (new Set(stockKeys).size !== stockKeys.length)
    fail("Ugyanaz a készletcikk egy cég telephelyén csak egyszer szerepelhet.");
  const orderExists = (id: string) => after.orders.some((o) => o.id === id);
  const vehicleExists = (id: string) => after.vehicles.some((o) => o.id === id);
  const partnerExists = (id: string) => after.partners.some((o) => o.id === id);
  if (after.documents.some((d) => !orderExists(d.orderId)))
    fail("A dokumentum hivatkozott fuvara nem található.");
  if (after.costs.some((c) => !orderExists(c.orderId)))
    fail("A költséghez érvényes fuvar szükséges.");
  if (after.messages.some((m) => !orderExists(m.orderId)))
    fail("Az üzenethez érvényes fuvar szükséges.");
  if (
    after.incidents.some(
      (i) =>
        !orderExists(i.orderId) || (i.vehicleId && !vehicleExists(i.vehicleId)),
    )
  )
    fail("Az incidens hivatkozása érvénytelen.");
  if (after.services.some((s) => !vehicleExists(s.vehicleId)))
    fail("A szervizhez érvényes jármű szükséges.");
  if (
    after.vehicles.some((v) => !after.drivers.some((d) => d.id === v.driverId))
  )
    fail("A járműhöz érvényes sofőr szükséges.");
  if (after.purchases.some((p) => p.orderId && !orderExists(p.orderId)))
    fail("A beszerzés hivatkozott fuvara nem található.");
  if (
    after.stockMoves.some((m) => !after.stock.some((s) => s.id === m.stockId))
  )
    fail("A készletmozgás hivatkozása érvénytelen.");
  if (
    after.outbox.some(
      (x) =>
        !after.invoices.some(
          (i) => i.id === x.invoiceId && i.status === "Jóváhagyva",
        ),
    )
  )
    fail("Az átadási sorhoz jóváhagyott számlaelőkészítés szükséges.");
  for (const vehicle of after.vehicles) {
    const old = before.vehicles.find((v) => v.id === vehicle.id);
    if (!old || equal(old, vehicle)) continue;
    const jobs = after.orders.filter(
      (o) =>
        o.vehicleId === vehicle.id &&
        !["Dokumentáció", "Lezárva"].includes(o.status),
    );
    if (jobs.length && old.companyId !== vehicle.companyId)
      fail("Aktív fuvaron dolgozó jármű nem irányítható át másik céghez.");
    if (
      jobs.some(
        (o) =>
          o.cargo.kg > vehicle.capacity ||
          (o.cargo.adr && !vehicle.adr) ||
          o.driverId !== vehicle.driverId,
      )
    )
      fail("A jármű módosítása érvénytelenítené egy aktív fuvar kiosztását.");
  }
  for (const order of after.orders) {
    const old = before.orders.find((o) => o.id === order.id);
    if (!partnerExists(order.partnerId))
      fail("A fuvar partnere nem található.");
    if (order.vehicleId && !vehicleExists(order.vehicleId))
      fail("A fuvarhoz rendelt jármű nem törölhető a nyilvántartásból.");
    if (
      order.driverId &&
      !after.drivers.some((driver) => driver.id === order.driverId)
    )
      fail("A fuvarhoz rendelt sofőr nem törölhető a nyilvántartásból.");
    if (equal(old, order)) continue;
    if (
      role === "finance" &&
      (!old ||
        !equal(
          { ...old, plannedCost: 0, actualCost: 0 },
          { ...order, plannedCost: 0, actualCost: 0 },
        ))
    )
      throw new ApiError(
        403,
        "Pénzügyi szerepkörrel a fuvarnak csak a költsége módosítható.",
      );
    const errors = validateOrder(after, order);
    if (errors.length) fail(`${order.reference}: ${errors[0]}`);
    if (!old && !["Új", "Tervezett", "Kiosztva"].includes(order.status))
      fail("Új fuvar nem hozható létre teljesítési státuszban.");
    const assignmentChanged =
      !old ||
      old.vehicleId !== order.vehicleId ||
      old.driverId !== order.driverId ||
      !equal(old.cargo, order.cargo) ||
      !equal(old.stops, order.stops);
    if (
      order.vehicleId &&
      assignmentChanged &&
      !["Dokumentáció", "Lezárva"].includes(order.status)
    ) {
      const error = assignmentError(after, order, order.vehicleId);
      if (error) fail(error);
      const vehicle = after.vehicles.find((v) => v.id === order.vehicleId)!;
      if (
        vehicle.driverId !== order.driverId ||
        vehicle.trailer !== order.trailer
      )
        fail("A jármű, sofőr és pótkocsi kiosztása nem egyezik.");
    }
    if (!order.vehicleId && order.driverId)
      fail("Sofőr csak járművel együtt osztható ki.");
    if (
      !["Új", "Tervezett"].includes(order.status) &&
      (!order.vehicleId || !order.driverId)
    )
      fail("A teljesítéshez jármű és sofőr szükséges.");
    if (old && old.status !== order.status) {
      const directAssignment =
        ["Új", "Tervezett"].includes(old.status) &&
        order.status === "Kiosztva" &&
        Boolean(order.vehicleId) &&
        assignmentChanged;
      if (!directAssignment) {
        const error = transitionError(after, old, order.status);
        if (error) fail(error);
      }
    }
    if (
      old?.status === "Lezárva" &&
      !equal(
        { ...old, actualCost: 0, plannedCost: 0 },
        { ...order, actualCost: 0, plannedCost: 0 },
      )
    )
      fail("Lezárt fuvar operatív adatai nem írhatók át.");
  }
  if (changed.includes("partners")) {
    for (const partner of after.partners) {
      const old = before.partners.find((p) => p.id === partner.id);
      if (old && equal(old, partner)) continue;
      const reserved = after.orders
        .filter((o) => o.partnerId === partner.id && o.status !== "Lezárva")
        .reduce((sum, o) => sum + huf(o.price, o.currency), 0);
      if (partner.credit < reserved + partner.receivable)
        fail(
          "A partner hitelkerete nem csökkenthető a foglalt összeg és kintlévőség alá.",
        );
    }
  }
  for (const old of before.orders) {
    if (
      !after.orders.some((o) => o.id === old.id) &&
      (old.status !== "Új" || !old.batchId)
    )
      fail("Csak még fel nem dolgozott importköteg fuvara vonható vissza.");
  }
  for (const doc of after.documents) {
    const old = before.documents.find((d) => d.id === doc.id);
    if (!equal(old, doc) && (!doc.blobId || !fileExists(doc.blobId)))
      fail("A dokumentumhoz feltöltött, munkatérhez tartozó fájl szükséges.");
  }
  for (const invoice of after.invoices) {
    const old = before.invoices.find((i) => i.id === invoice.id);
    if (
      !partnerExists(invoice.partnerId) ||
      invoice.orderIds.some((id) => !orderExists(id))
    )
      fail("A számlaelőkészítés hivatkozása érvénytelen.");
    if (equal(old, invoice)) continue;
    if (!old) {
      const error = invoiceError(
        {
          ...after,
          invoices: after.invoices.filter((i) => i.id !== invoice.id),
        },
        invoice.orderIds,
      );
      if (error) fail(error);
      const orders = after.orders.filter((o) =>
        invoice.orderIds.includes(o.id),
      );
      if (
        invoice.status !== "Előkészítve" ||
        orders[0].partnerId !== invoice.partnerId ||
        orders[0].companyId !== invoice.companyId ||
        orders[0].currency !== invoice.currency ||
        Math.abs(orders.reduce((s, o) => s + o.price, 0) - invoice.amount) >
          0.01
      )
        fail(
          "A számlaelőkészítés összege vagy partnere nem egyezik a fuvarokkal.",
        );
    } else {
      if (!equal({ ...old, status: "" }, { ...invoice, status: "" }))
        fail("A számlaelőkészítés tartalma nem írható át.");
      if (!(
        (old.status === "Előkészítve" && invoice.status === "Jóváhagyva") ||
        (old.status === "Jóváhagyva" && invoice.status === "Sztornó")
      ))
        fail("Érvénytelen számlázási állapotváltás.");
    }
  }
  if (before.invoices.some((i) => !after.invoices.some((n) => n.id === i.id)))
    fail("Számlaelőkészítés nem törölhető; sztornózás szükséges.");
  const phases = ["Igény", "Jóváhagyva", "Megrendelve", "Beérkezett"];
  if (
    before.purchases.some(
      (purchase) =>
        purchase.status !== "Igény" &&
        !after.purchases.some((next) => next.id === purchase.id),
    )
  )
    fail("Jóváhagyott beszerzés nem törölhető a nyilvántartásból.");
  for (const purchase of after.purchases) {
    const old = before.purchases.find((p) => p.id === purchase.id);
    if (!old && purchase.status !== "Igény")
      fail("Új beszerzés csak igényként hozható létre.");
    if (
      old &&
      old.status !== "Igény" &&
      !equal({ ...old, status: "" }, { ...purchase, status: "" })
    )
      fail("Jóváhagyott beszerzés tartalma nem írható át.");
    if (old && old.status !== purchase.status) {
      if (phases.indexOf(purchase.status) !== phases.indexOf(old.status) + 1)
        fail("A beszerzés csak a következő állapotba léphet.");
      if (
        purchase.status === "Jóváhagyva" &&
        !["admin", "finance"].includes(role)
      )
        throw new ApiError(
          403,
          "Beszerzést csak pénzügyi vagy adminisztrátori szerepkör hagyhat jóvá.",
        );
    }
  }
  for (const old of before.stockMoves)
    if (!after.stockMoves.some((m) => equal(m, old)))
      fail("Készletmozgás utólag nem módosítható vagy törölhető.");
  for (const stock of after.stock) {
    const old = before.stock.find((s) => s.id === stock.id);
    const movements = after.stockMoves.filter(
      (m) =>
        m.stockId === stock.id && !before.stockMoves.some((b) => b.id === m.id),
    );
    if (
      Math.abs(
        (old?.quantity || 0) +
          movements.reduce((s, m) => s + m.quantity, 0) -
          stock.quantity,
      ) > 0.00001
    )
      fail(
        "A készletváltozásnak és a nyitókészletnek egyeznie kell a rögzített készletmozgásokkal.",
      );
  }
}
