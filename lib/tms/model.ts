export const statuses = [
  "Új",
  "Tervezett",
  "Kiosztva",
  "Felrakodás",
  "Úton",
  "Lerakodás",
  "Dokumentáció",
  "Lezárva",
] as const;
export type Status = (typeof statuses)[number];
export type Currency = "HUF" | "EUR";
export type CompanyId = "steel" | "west";
export interface Partner {
  id: string;
  name: string;
  contact: string;
  email: string;
  credit: number;
  receivable: number;
  terms: number;
  country: string;
}
export interface Stop {
  id: string;
  type: "Felrakó" | "Lerakó";
  city: string;
  address: string;
  date: string;
  time: string;
}
export interface Cargo {
  name: string;
  kg: number;
  pieces: number;
  ldm: number;
  adr: boolean;
  type: string;
}
export interface Order {
  id: string;
  reference: string;
  partnerId: string;
  companyId: CompanyId;
  division: string;
  type: string;
  dispatcher: string;
  contact: string;
  createdAt: string;
  status: Status;
  stops: Stop[];
  cargo: Cargo;
  loadedKm: number;
  emptyKm: number;
  price: number;
  currency: Currency;
  plannedCost: number;
  actualCost: number;
  vehicleId: string;
  trailer: string;
  driverId: string;
  notes: string;
  batchId?: string;
}
export interface Vehicle {
  id: string;
  plate: string;
  model: string;
  companyId: CompanyId;
  driverId: string;
  trailer: string;
  capacity: number;
  adr: boolean;
  lastCity: string;
  lat: number;
  lng: number;
  km: number;
  serviceAt: number;
  inspection: string;
}
export interface Driver {
  id: string;
  name: string;
  phone: string;
  companyId: CompanyId;
  drivingMinutes: number;
  adr: boolean;
}
export interface Doc {
  id: string;
  orderId: string;
  name: string;
  type: "Megbízás" | "CMR" | "Mázsajegy" | "Számla";
  createdAt: string;
  version: number;
  blobId?: string;
}
export interface Cost {
  id: string;
  orderId: string;
  name: string;
  amount: number;
  currency: Currency;
  kind: "Terv" | "Tény";
}
export interface Invoice {
  id: string;
  orderIds: string[];
  partnerId: string;
  companyId: CompanyId;
  amount: number;
  currency: Currency;
  status: "Előkészítve" | "Jóváhagyva" | "Sztornó";
  createdAt: string;
}
export interface Purchase {
  id: string;
  companyId: CompanyId;
  supplier: string;
  description: string;
  amount: number;
  status: "Igény" | "Jóváhagyva" | "Megrendelve" | "Beérkezett";
  orderId: string;
}
export interface Service {
  id: string;
  vehicleId: string;
  description: string;
  date: string;
  cost: number;
  status: "Tervezett" | "Műhelyben" | "Kész";
}
export interface Stock {
  id: string;
  name: string;
  companyId: CompanyId;
  depot: string;
  quantity: number;
  minimum: number;
  unit: string;
  price: number;
}
export interface StockMove {
  id: string;
  stockId: string;
  quantity: number;
  recipient: string;
  createdAt: string;
}
export interface RoutePlan {
  id: string;
  name: string;
  from: string;
  to: string;
  km: number;
  toll: number;
  minutes: number;
}
export interface Message {
  id: string;
  orderId: string;
  author: string;
  text: string;
  createdAt: string;
}
export interface Incident {
  id: string;
  orderId: string;
  vehicleId: string;
  description: string;
  severity: string;
  status: "Nyitott" | "Lezárt";
  createdAt: string;
}
export interface Audit {
  id: string;
  action: string;
  entity: string;
  at: string;
  actor: string;
}
export interface Outbox {
  id: string;
  invoiceId: string;
  status: "Várakozik" | "Tesztelve" | "Hibás";
  attempts: number;
  error: string;
}
export interface TmsState {
  schema: 1;
  partners: Partner[];
  orders: Order[];
  vehicles: Vehicle[];
  drivers: Driver[];
  documents: Doc[];
  costs: Cost[];
  invoices: Invoice[];
  purchases: Purchase[];
  services: Service[];
  stock: Stock[];
  stockMoves: StockMove[];
  routes: RoutePlan[];
  messages: Message[];
  incidents: Incident[];
  audit: Audit[];
  outbox: Outbox[];
}
export const companies = [
  { id: "steel" as const, name: "Steel-Transz Kft.", short: "ST" },
  { id: "west" as const, name: "West-Bridge Kft.", short: "WB" },
];
export const exchangeRate = 400;
export const huf = (amount: number, currency: Currency) =>
  Math.round(amount * (currency === "EUR" ? exchangeRate : 1));
export const money = (amount: number, currency: Currency = "HUF") =>
  new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "HUF" ? 0 : 2,
  }).format(amount);
export const number = (value: number) =>
  new Intl.NumberFormat("hu-HU").format(value);
export const uid = () => crypto.randomUUID();
export function freeCredit(
  state: TmsState,
  partnerId: string,
  excludeId?: string,
) {
  const partner = state.partners.find((p) => p.id === partnerId);
  if (!partner) return 0;
  const reserved = state.orders
    .filter(
      (o) =>
        o.partnerId === partnerId &&
        o.status !== "Lezárva" &&
        o.id !== excludeId,
    )
    .reduce((s, o) => s + huf(o.price, o.currency), 0);
  return partner.credit - partner.receivable - reserved;
}
export const orderRoute = (order: Order) =>
  order.stops.map((s) => s.city).join(" → ");
export const sumRevenue = (orders: Order[]) =>
  orders.reduce((s, o) => s + huf(o.price, o.currency), 0);
export const sumCost = (orders: Order[]) =>
  orders.reduce(
    (s, o) => s + (o.status === "Lezárva" ? o.actualCost : o.plannedCost),
    0,
  );
