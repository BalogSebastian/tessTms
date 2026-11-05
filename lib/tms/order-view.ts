import { huf, statuses, type Order, type TmsState } from "./model";

export type OrderView = "unassigned" | "assigned" | "all";
export interface OrderFilters {
  search: string;
  dateField: "pickup" | "delivery" | "created";
  dateFrom: string;
  dateTo: string;
  statuses: string[];
  partnerId: string;
  dispatcher: string;
  from: string;
  to: string;
  cargoType: string;
  adr: "all" | "yes" | "no";
  vehicleId: string;
  driverId: string;
  priceMin: string;
  priceMax: string;
  currency: string;
  documents: "all" | "missing-order" | "missing-cmr" | "complete";
  margin: "all" | "negative" | "low";
}
export const emptyOrderFilters: OrderFilters = {
  search: "",
  dateField: "pickup",
  dateFrom: "",
  dateTo: "",
  statuses: [],
  partnerId: "",
  dispatcher: "",
  from: "",
  to: "",
  cargoType: "",
  adr: "all",
  vehicleId: "",
  driverId: "",
  priceMin: "",
  priceMax: "",
  currency: "all",
  documents: "all",
  margin: "all",
};
export function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("hu-HU")
    .trim();
}
export function orderMargin(order: Order) {
  const revenue = huf(order.price, order.currency);
  const cost =
    order.status === "Lezárva" ? order.actualCost : order.plannedCost;
  return {
    revenue,
    cost,
    amount: revenue - cost,
    percentage: revenue ? ((revenue - cost) / revenue) * 100 : 0,
  };
}
export function orderDate(order: Order, field: OrderFilters["dateField"]) {
  if (field === "pickup")
    return order.stops.find((stop) => stop.type === "Felrakó")?.date || "";
  if (field === "delivery")
    return (
      order.stops.filter((stop) => stop.type === "Lerakó").at(-1)?.date || ""
    );
  const date = new Date(order.createdAt);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Budapest",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
}
export function hasDocument(
  state: TmsState,
  orderId: string,
  type: "Megbízás" | "CMR",
) {
  return state.documents.some(
    (document) => document.orderId === orderId && document.type === type,
  );
}
export function filterOrderView(
  orders: Order[],
  state: TmsState,
  view: OrderView,
  filters: OrderFilters,
) {
  const text = searchText(filters.search);
  const from = searchText(filters.from),
    to = searchText(filters.to);
  return orders.filter((order) => {
    if (view === "unassigned" && order.vehicleId) return false;
    if (view === "assigned" && !order.vehicleId) return false;
    if (filters.statuses.length && !filters.statuses.includes(order.status))
      return false;
    if (filters.partnerId && order.partnerId !== filters.partnerId)
      return false;
    if (filters.dispatcher && order.dispatcher !== filters.dispatcher)
      return false;
    if (filters.vehicleId && order.vehicleId !== filters.vehicleId)
      return false;
    if (filters.driverId && order.driverId !== filters.driverId) return false;
    if (filters.cargoType && order.cargo.type !== filters.cargoType)
      return false;
    if (filters.currency !== "all" && order.currency !== filters.currency)
      return false;
    if (filters.adr !== "all" && order.cargo.adr !== (filters.adr === "yes"))
      return false;
    if (
      from &&
      !order.stops.some(
        (stop) =>
          stop.type === "Felrakó" &&
          searchText(`${stop.city} ${stop.address}`).includes(from),
      )
    )
      return false;
    if (
      to &&
      !order.stops.some(
        (stop) =>
          stop.type === "Lerakó" &&
          searchText(`${stop.city} ${stop.address}`).includes(to),
      )
    )
      return false;
    const date = orderDate(order, filters.dateField);
    if (filters.dateFrom && (!date || date < filters.dateFrom)) return false;
    if (filters.dateTo && (!date || date > filters.dateTo)) return false;
    const margin = orderMargin(order);
    if (filters.priceMin !== "" && margin.revenue < Number(filters.priceMin))
      return false;
    if (filters.priceMax !== "" && margin.revenue > Number(filters.priceMax))
      return false;
    if (filters.margin === "negative" && margin.amount >= 0) return false;
    if (filters.margin === "low" && margin.percentage >= 15) return false;
    if (
      filters.documents === "missing-order" &&
      hasDocument(state, order.id, "Megbízás")
    )
      return false;
    if (
      filters.documents === "missing-cmr" &&
      hasDocument(state, order.id, "CMR")
    )
      return false;
    if (
      filters.documents === "complete" &&
      (!hasDocument(state, order.id, "Megbízás") ||
        !hasDocument(state, order.id, "CMR"))
    )
      return false;
    if (text) {
      const partner = state.partners.find(
        (item) => item.id === order.partnerId,
      );
      const vehicle = state.vehicles.find(
        (item) => item.id === order.vehicleId,
      );
      const driver = state.drivers.find((item) => item.id === order.driverId);
      const haystack = [
        order.reference,
        partner?.name,
        order.contact,
        order.dispatcher,
        order.cargo.name,
        order.notes,
        vehicle?.plate,
        driver?.name,
        order.trailer,
        ...order.stops.map((stop) => `${stop.city} ${stop.address}`),
      ].join(" ");
      if (!searchText(haystack).includes(text)) return false;
    }
    return true;
  });
}
export type OrderSortKey =
  | "reference"
  | "createdAt"
  | "pickup"
  | "delivery"
  | "status"
  | "price"
  | "margin";
export function sortOrderView(
  orders: Order[],
  key: string,
  direction: "asc" | "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  return [...orders].sort((a, b) => {
    let comparison = 0;
    if (key === "price")
      comparison = huf(a.price, a.currency) - huf(b.price, b.currency);
    else if (key === "margin")
      comparison = orderMargin(a).amount - orderMargin(b).amount;
    else if (key === "status")
      comparison = statuses.indexOf(a.status) - statuses.indexOf(b.status);
    else if (key === "pickup" || key === "delivery")
      comparison = orderDate(a, key).localeCompare(orderDate(b, key));
    else if (key === "reference" || key === "createdAt")
      comparison = a[key].localeCompare(b[key], "hu", { numeric: true });
    return comparison * sign || a.id.localeCompare(b.id);
  });
}
