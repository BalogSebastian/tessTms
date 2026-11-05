import {
  freeCredit,
  huf,
  statuses,
  type TmsState,
  type Order,
  type Status,
} from "./model";
export function validateOrder(state: TmsState, order: Order): string[] {
  const errors: string[] = [];
  if (!order.reference.trim()) errors.push("A megbízásszám kötelező.");
  if (
    state.orders.some(
      (o) =>
        o.id !== order.id &&
        o.companyId === order.companyId &&
        o.reference.toLowerCase() === order.reference.toLowerCase(),
    )
  )
    errors.push("Ez a megbízásszám már létezik ennél a cégnél.");
  if (!state.partners.some((p) => p.id === order.partnerId))
    errors.push("Válassz érvényes partnert.");
  if (!Number.isFinite(order.price) || order.price <= 0)
    errors.push("A fuvardíj legyen pozitív.");
  if (!Number.isFinite(order.plannedCost) || order.plannedCost < 0)
    errors.push("A tervköltség nem lehet negatív.");
  if (
    huf(order.price, order.currency) >
    freeCredit(state, order.partnerId, order.id)
  )
    errors.push("A fuvardíj meghaladja a partner szabad hitelkeretét.");
  if (
    !order.stops.some((s) => s.type === "Felrakó") ||
    !order.stops.some((s) => s.type === "Lerakó")
  )
    errors.push("Legalább egy felrakó és egy lerakó szükséges.");
  if (
    order.stops.some(
      (s) => !s.city.trim() || !s.address.trim() || !s.date || !s.time,
    )
  )
    errors.push("Minden megálló címét és időablakát töltsd ki.");
  if (
    !order.cargo.name.trim() ||
    ![order.cargo.kg, order.cargo.pieces, order.cargo.ldm].every(Number.isFinite) ||
    order.cargo.kg <= 0 ||
    order.cargo.pieces <= 0 ||
    order.cargo.ldm < 0
  )
    errors.push("Add meg az áru nevét, pozitív tömegét és darabszámát.");
  if (!Number.isFinite(order.loadedKm) || !Number.isFinite(order.emptyKm) || order.loadedKm < 0 || order.emptyKm < 0)
    errors.push("A kilométer nem lehet negatív.");
  return errors;
}
export function assignmentError(
  state: TmsState,
  order: Order,
  vehicleId: string,
): string | null {
  const v = state.vehicles.find((v) => v.id === vehicleId);
  if (!v) return "Válassz járművet.";
  const d = state.drivers.find((d) => d.id === v.driverId);
  if (order.cargo.kg > v.capacity)
    return "A rakomány túllépi a jármű kapacitását.";
  if (order.cargo.adr && (!v.adr || !d?.adr))
    return "ADR-képes jármű és sofőr szükséges.";
  if (!d || d.drivingMinutes < 60)
    return "A sofőr vezetési idő tartaléka nem elegendő (demó küszöb: 60 perc).";
  const occupied = state.orders.some(
    (o) =>
      o.id !== order.id &&
      o.vehicleId === v.id &&
      !["Lezárva", "Dokumentáció"].includes(o.status) &&
      o.stops[0]?.date === order.stops[0]?.date,
  );
  if (occupied) return "A járműnek ezen a napon már van aktív kiosztása.";
  if (
    state.services.some((s) => s.vehicleId === v.id && s.status === "Műhelyben")
  )
    return "A jármű műhelyben van.";
  return null;
}
export function transitionError(
  state: TmsState,
  order: Order,
  next: Status,
): string | null {
  if (statuses.indexOf(next) !== statuses.indexOf(order.status) + 1)
    return "Csak a következő státuszra lehet továbblépni.";
  if (next === "Kiosztva" && !order.vehicleId)
    return "Előbb járművet és sofőrt kell kiosztani.";
  if (
    next === "Lezárva" &&
    !state.documents.some((d) => d.orderId === order.id && d.type === "CMR")
  )
    return "A lezáráshoz CMR dokumentum szükséges.";
  return null;
}
export function invoiceError(state: TmsState, ids: string[]): string | null {
  const orders = state.orders.filter((o) => ids.includes(o.id));
  if (!orders.length) return "Válassz legalább egy fuvart.";
  if (
    new Set(orders.map((o) => o.partnerId)).size !== 1 ||
    new Set(orders.map((o) => o.currency)).size !== 1 ||
    new Set(orders.map((o) => o.companyId)).size !== 1
  )
    return "Egy gyűjtőszámlára azonos partner, cég és deviza szükséges.";
  if (orders.some((o) => o.status !== "Lezárva"))
    return "Csak lezárt fuvar számlázható.";
  if (
    state.invoices.some(
      (i) =>
        i.status !== "Sztornó" && i.orderIds.some((id) => ids.includes(id)),
    )
  )
    return "Van már számlaelőkészítés a kiválasztott fuvarhoz.";
  return null;
}
