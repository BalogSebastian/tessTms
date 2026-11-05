import {
  companies,
  freeCredit,
  huf,
  statuses,
  type TmsState,
  type Order,
  type Status,
  type Stop,
} from "./model";

function stopTime(stop: Stop): number {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(stop.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(stop.time)
  )
    return NaN;
  const result = Date.parse(`${stop.date}T${stop.time}:00Z`);
  if (
    !Number.isFinite(result) ||
    new Date(result).toISOString().slice(0, 10) !== stop.date
  )
    return NaN;
  return result;
}

export function validateStops(order: Order): string[] {
  const errors: string[] = [];
  if (
    order.stops.length < 2 ||
    order.stops[0]?.type !== "Felrakó" ||
    order.stops.at(-1)?.type !== "Lerakó"
  )
    errors.push("A fuvar felrakóval kezdődjön és lerakóval végződjön.");
  if (new Set(order.stops.map((s) => s.id)).size !== order.stops.length)
    errors.push("A megállók azonosítója nem ismétlődhet.");
  if (
    order.stops.some(
      (s) =>
        !s.city.trim() || !s.address.trim() || !Number.isFinite(stopTime(s)),
    )
  )
    errors.push("Minden megállóhoz érvényes cím, dátum és időpont szükséges.");
  if (
    order.stops.some(
      (s, i) => i > 0 && stopTime(s) < stopTime(order.stops[i - 1]),
    )
  )
    errors.push(
      "A megállók időpontjai az útvonal sorrendjében kövessék egymást.",
    );
  if (
    !order.cargo.name.trim() ||
    ![order.cargo.kg, order.cargo.pieces, order.cargo.ldm].every(
      Number.isFinite,
    ) ||
    order.cargo.kg <= 0 ||
    !Number.isInteger(order.cargo.pieces) ||
    order.cargo.pieces <= 0 ||
    order.cargo.ldm < 0
  )
    errors.push("Add meg az áru nevét, pozitív tömegét és egész darabszámát.");

  if (order.stops.some((s) => s.cargoItems?.length)) {
    const balance = new Map<string, { kg: number; pieces: number }>();
    let loadedKg = 0;
    let loadedPieces = 0;
    const itemIds = new Set<string>();
    for (const stop of order.stops) {
      if (!stop.cargoItems?.length) {
        errors.push(
          "Tételszintű követésnél minden megállóhoz adj rakománytételt.",
        );
        continue;
      }
      for (const item of stop.cargoItems) {
        if (itemIds.has(item.id))
          errors.push("A rakománytételek azonosítója nem ismétlődhet.");
        itemIds.add(item.id);
        if (
          !item.name.trim() ||
          ![item.kg, item.pieces, item.ldm].every(Number.isFinite) ||
          item.kg <= 0 ||
          !Number.isInteger(item.pieces) ||
          item.pieces <= 0 ||
          item.ldm < 0 ||
          [item.lengthCm, item.widthCm, item.heightCm].some(
            (n) => n !== undefined && (!Number.isFinite(n) || n <= 0),
          )
        ) {
          errors.push(
            "A rakománytételhez név, pozitív tömeg, egész darabszám és érvényes méretek szükségesek.",
          );
          continue;
        }
        const key = item.name.trim().toLocaleLowerCase("hu-HU");
        const previous = balance.get(key) || { kg: 0, pieces: 0 };
        const sign = stop.type === "Felrakó" ? 1 : -1;
        const next = {
          kg: previous.kg + sign * item.kg,
          pieces: previous.pieces + sign * item.pieces,
        };
        if (next.kg < -0.01 || next.pieces < 0)
          errors.push(
            "Nem rakható le több áru, mint amennyit előzőleg felraktak.",
          );
        balance.set(key, next);
        if (sign === 1) {
          loadedKg += item.kg;
          loadedPieces += item.pieces;
        }
      }
    }
    if (
      [...balance.values()].some((b) => Math.abs(b.kg) > 0.01 || b.pieces !== 0)
    )
      errors.push(
        "A felrakott és lerakott tételek tömegének és darabszámának egyeznie kell.",
      );
    if (
      Math.abs(loadedKg - order.cargo.kg) > 0.01 ||
      loadedPieces !== order.cargo.pieces
    )
      errors.push(
        "A felrakási tételek összege egyezzen a fuvar összesített áruadataival.",
      );
  }
  const requirements = order.requirements;
  if (requirements) {
    if (
      [requirements.temperatureMin, requirements.temperatureMax].some(
        (n) => n !== undefined && !Number.isFinite(n),
      )
    )
      errors.push("A hőmérsékleti érték legyen érvényes szám.");
    if (
      requirements.temperatureMin !== undefined &&
      requirements.temperatureMax !== undefined &&
      requirements.temperatureMin > requirements.temperatureMax
    )
      errors.push("A minimum hőmérséklet nem lehet nagyobb a maximumnál.");
    if (
      requirements.adrUnNumber &&
      (!/^\d{4}$/.test(requirements.adrUnNumber) || !order.cargo.adr)
    )
      errors.push(
        "Az UN-szám négy számjegy legyen és ADR rakományhoz tartozzon.",
      );
  }
  return [...new Set(errors)];
}

export function validateOrder(state: TmsState, order: Order): string[] {
  const errors: string[] = [];
  if (!order.reference.trim()) errors.push("A megbízásszám kötelező.");
  if (
    state.orders.some(
      (o) =>
        o.id !== order.id &&
        o.companyId === order.companyId &&
        o.reference.trim().toLocaleLowerCase("hu-HU") ===
          order.reference.trim().toLocaleLowerCase("hu-HU"),
    )
  )
    errors.push("Ez a megbízásszám már létezik ennél a cégnél.");
  if (!state.partners.some((p) => p.id === order.partnerId))
    errors.push("Válassz érvényes partnert.");
  if (!(state.companies ?? companies).some((c) => c.id === order.companyId))
    errors.push("Válassz érvényes céget.");
  if (!statuses.includes(order.status))
    errors.push("Érvénytelen fuvarstátusz.");
  if (order.currency !== "HUF" && order.currency !== "EUR")
    errors.push("HUF vagy EUR deviza szükséges.");
  if (!Number.isFinite(order.price) || order.price <= 0)
    errors.push("A fuvardíj legyen pozitív.");
  if (!Number.isFinite(order.plannedCost) || order.plannedCost < 0)
    errors.push("A tervköltség nem lehet negatív.");
  if (!Number.isFinite(order.actualCost) || order.actualCost < 0)
    errors.push("A tényköltség nem lehet negatív.");
  if (
    order.status !== "Lezárva" &&
    huf(order.price, order.currency) >
      freeCredit(state, order.partnerId, order.id)
  )
    errors.push("A fuvardíj meghaladja a partner szabad hitelkeretét.");
  errors.push(...validateStops(order));
  if (
    !Number.isFinite(order.loadedKm) ||
    !Number.isFinite(order.emptyKm) ||
    order.loadedKm < 0 ||
    order.emptyKm < 0
  )
    errors.push("A kilométer legyen érvényes, nem negatív szám.");
  return errors;
}

function overlap(a: Order, b: Order) {
  const aStart = a.stops[0] && stopTime(a.stops[0]);
  const aEnd = a.stops.at(-1) && stopTime(a.stops.at(-1)!);
  const bStart = b.stops[0] && stopTime(b.stops[0]);
  const bEnd = b.stops.at(-1) && stopTime(b.stops.at(-1)!);
  if (
    [aStart, aEnd, bStart, bEnd].some(
      (v) => v === undefined || !Number.isFinite(v),
    )
  )
    return true;
  return aStart! < bEnd! && bStart! < aEnd!;
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
    return "A sofőr vezetési idő tartaléka nem elegendő (beállított küszöb: 60 perc).";
  const lastDate = order.stops.at(-1)?.date;
  if (v.inspection && lastDate && lastDate > v.inspection)
    return "A jármű műszaki érvényessége a fuvar vége előtt lejár.";
  const activeOverlaps = state.orders.filter(
    (o) =>
      o.id !== order.id &&
      !["Lezárva", "Dokumentáció"].includes(o.status) &&
      overlap(o, order),
  );
  if (activeOverlaps.some((o) => o.vehicleId === v.id))
    return "A járműnek ebben az időszakban már van aktív kiosztása.";
  if (activeOverlaps.some((o) => o.driverId && o.driverId === v.driverId))
    return "A sofőrnek ebben az időszakban másik járművön van aktív kiosztása.";
  if (
    v.trailer &&
    activeOverlaps.some((o) => o.vehicleId && o.trailer === v.trailer)
  )
    return "A pótkocsi ebben az időszakban már másik fuvarhoz tartozik.";
  if (
    state.services.some(
      (s) =>
        s.vehicleId === v.id &&
        (s.status === "Műhelyben" ||
          (s.status === "Tervezett" &&
            s.date >= order.stops[0]?.date &&
            s.date <= order.stops.at(-1)!.date)),
    )
  )
    return "A jármű műhelyben van vagy a fuvar idejére szervizre tervezett.";
  return null;
}

export function transitionError(
  state: TmsState,
  order: Order,
  next: Status,
): string | null {
  if (statuses.indexOf(next) !== statuses.indexOf(order.status) + 1)
    return "Csak a következő státuszra lehet továbblépni.";
  if (next === "Kiosztva") {
    if (!order.vehicleId || !order.driverId)
      return "Előbb járművet és sofőrt kell kiosztani.";
    const err = assignmentError(state, order, order.vehicleId);
    if (err) return err;
  }
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
  if (new Set(ids).size !== ids.length || orders.length !== ids.length)
    return "Minden kiválasztott fuvarnak léteznie kell és csak egyszer szerepelhet.";
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
