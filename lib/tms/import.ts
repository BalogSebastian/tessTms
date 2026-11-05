import { uid, companies, type Order, type TmsState } from "./model";
import { validateOrder } from "./rules";
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ";" && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quoted) throw new Error("Lezáratlan idézőjel a CSV-ben.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function importOrders(
  state: TmsState,
  text: string,
  batchId: string,
): Order[] {
  const rows = parseCsv(text.replace(/^\ufeff/, ""));
  const header = rows.shift();
  if (
    !header ||
    header.join(";") !== "reference;partner;from;to;price;currency;kg"
  )
    throw new Error("Hibás fejléc. Töltsd le a CSV-sablont.");
  if (rows.length > 1000)
    throw new Error("Egy import legfeljebb 1000 sort tartalmazhat.");
  if (!rows.length) throw new Error("A fájl nem tartalmaz adatsort.");
  const draft = structuredClone(state);
  const result: Order[] = [];
  const deliveryDate = new Date(Date.now() + 86400000).toLocaleDateString(
    "en-CA",
    { timeZone: "Europe/Budapest" },
  );
  rows.forEach((row, index) => {
    if (row.length !== 7)
      throw new Error(`${index + 2}. sor: pontosan 7 oszlop szükséges.`);
    const [reference, partnerName, from, to, amount, currency, kg] = row;
    const partner = state.partners.find(
      (p) => p.name.toLowerCase() === partnerName.toLowerCase(),
    );
    if (!partner) throw new Error(`${index + 2}. sor: ismeretlen partner.`);
    if (currency !== "HUF" && currency !== "EUR")
      throw new Error(`${index + 2}. sor: HUF vagy EUR deviza szükséges.`);
    if (!/^\d+(?:[.,]\d+)?$/.test(amount))
      throw new Error(
        `${index + 2}. sor: a fuvardíj érvényes pozitív szám legyen.`,
      );
    if (!/^\d+(?:[.,]\d+)?$/.test(kg))
      throw new Error(
        `${index + 2}. sor: a tömeg érvényes pozitív szám legyen.`,
      );
    const o: Order = {
      id: uid(),
      reference,
      partnerId: partner.id,
      companyId: (state.companies ?? companies)[0]?.id || "",
      division: "Általános",
      type: "Belföld",
      dispatcher: "Import – kiosztandó",
      createdBy: "CSV-import",
      contact: partner.contact,
      createdAt: new Date().toISOString(),
      status: "Új",
      stops: [
        {
          id: uid(),
          type: "Felrakó",
          city: from,
          address: "Importált cím – ellenőrizendő",
          date: deliveryDate,
          time: "08:00",
        },
        {
          id: uid(),
          type: "Lerakó",
          city: to,
          address: "Importált cím – ellenőrizendő",
          date: deliveryDate,
          time: "16:00",
        },
      ],
      cargo: {
        name: "Importált rakomány",
        kg: Number(kg.replace(",", ".")),
        pieces: 1,
        ldm: 0,
        adr: false,
        type: "Ponyvás",
      },
      loadedKm: 0,
      emptyKm: 0,
      price: Number(amount.replace(",", ".")),
      currency,
      plannedCost: 0,
      actualCost: 0,
      vehicleId: "",
      driverId: "",
      trailer: "",
      notes: "Import után cím- és díjellenőrzés szükséges.",
      batchId,
    };
    const errors = validateOrder(draft, o);
    if (errors.length) throw new Error(`${index + 2}. sor: ${errors[0]}`);
    draft.orders.push(o);
    result.push(o);
  });
  return result;
}
