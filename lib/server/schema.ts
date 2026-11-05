import { z } from "zod";
import { statuses } from "../tms/model";

const text = z.string().max(4000);
const id = z.string().min(1).max(160);
const value = z.number().finite().nonnegative().max(1e14);
const company = id.refine(
  (value) => value.trim() === value && value !== "all",
  "Érvénytelen cégazonosító.",
);
const currency = z.enum(["HUF", "EUR"]);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cargoItem = z.strictObject({
  id,
  name: text,
  kg: value,
  pieces: value,
  ldm: value,
  lengthCm: value.optional(),
  widthCm: value.optional(),
  heightCm: value.optional(),
});
const stop = z.strictObject({
  id,
  type: z.enum(["Felrakó", "Lerakó"]),
  city: text,
  address: text,
  date,
  time: z.string().regex(/^\d{2}:\d{2}$/),
  cargoItems: z.array(cargoItem).max(100).optional(),
});
const cargo = z.strictObject({
  name: text,
  kg: value,
  pieces: value,
  ldm: value,
  adr: z.boolean(),
  type: text,
});
const order = z.strictObject({
  id,
  reference: text,
  partnerId: id,
  companyId: company,
  division: text,
  type: text,
  dispatcher: text,
  contact: text,
  createdAt: text,
  status: z.enum(statuses),
  stops: z.array(stop).max(100),
  cargo,
  loadedKm: value,
  emptyKm: value,
  price: value,
  currency,
  plannedCost: value,
  actualCost: value,
  vehicleId: text,
  trailer: text,
  driverId: text,
  notes: text,
  batchId: text.optional(),
  createdBy: text.optional(),
  requirements: z
    .strictObject({
      sealNumber: text,
      temperatureMin: z.number().finite().optional(),
      temperatureMax: z.number().finite().optional(),
      adrUnNumber: text,
      instructions: text,
    })
    .optional(),
});
const array = <T extends z.ZodType>(schema: T) => z.array(schema).max(20000);
export const stateSchema = z.strictObject({
  schema: z.literal(1),
  companies: z
    .array(
      z.strictObject({
        id: company,
        name: z.string().trim().min(2).max(160),
        short: z.string().trim().min(1).max(12),
      }),
    )
    .min(1)
    .max(1000)
    .optional(),
  partners: array(
    z.strictObject({
      id,
      name: text,
      contact: text,
      email: text,
      credit: value,
      receivable: value,
      terms: value,
      country: text,
    }),
  ),
  orders: array(order),
  vehicles: array(
    z.strictObject({
      id,
      plate: text,
      model: text,
      companyId: company,
      driverId: id,
      trailer: text,
      capacity: value,
      adr: z.boolean(),
      lastCity: text,
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
      km: value,
      serviceAt: value,
      inspection: date,
    }),
  ),
  drivers: array(
    z.strictObject({
      id,
      name: text,
      phone: text,
      companyId: company,
      drivingMinutes: value,
      adr: z.boolean(),
    }),
  ),
  documents: array(
    z.strictObject({
      id,
      orderId: id,
      name: text,
      type: z.enum(["Megbízás", "CMR", "Mázsajegy", "Számla"]),
      createdAt: text,
      version: z.number().int().positive(),
      blobId: id.optional(),
    }),
  ),
  costs: array(
    z.strictObject({
      id,
      orderId: id,
      name: text,
      amount: value,
      currency,
      kind: z.enum(["Terv", "Tény"]),
    }),
  ),
  invoices: array(
    z.strictObject({
      id,
      orderIds: z.array(id).min(1).max(1000),
      partnerId: id,
      companyId: company,
      amount: value,
      currency,
      status: z.enum(["Előkészítve", "Jóváhagyva", "Sztornó"]),
      createdAt: text,
    }),
  ),
  purchases: array(
    z.strictObject({
      id,
      companyId: company,
      supplier: text,
      description: text,
      amount: value,
      status: z.enum(["Igény", "Jóváhagyva", "Megrendelve", "Beérkezett"]),
      orderId: text,
    }),
  ),
  services: array(
    z.strictObject({
      id,
      vehicleId: id,
      description: text,
      date,
      cost: value,
      status: z.enum(["Tervezett", "Műhelyben", "Kész"]),
    }),
  ),
  stock: array(
    z.strictObject({
      id,
      name: text,
      companyId: company,
      depot: text,
      quantity: value,
      minimum: value,
      unit: text,
      price: value,
    }),
  ),
  stockMoves: array(
    z.strictObject({
      id,
      stockId: id,
      quantity: z.number().finite().min(-1e14).max(1e14),
      recipient: text,
      createdAt: text,
    }),
  ),
  routes: array(
    z.strictObject({
      id,
      name: text,
      from: text,
      to: text,
      km: value,
      toll: value,
      minutes: value,
    }),
  ),
  messages: array(
    z.strictObject({ id, orderId: id, author: text, text, createdAt: text }),
  ),
  incidents: array(
    z.strictObject({
      id,
      orderId: id,
      vehicleId: text,
      description: text,
      severity: text,
      status: z.enum(["Nyitott", "Lezárt"]),
      createdAt: text,
    }),
  ),
  audit: array(
    z.strictObject({ id, action: text, entity: text, at: text, actor: text }),
  ),
  outbox: array(
    z.strictObject({
      id,
      invoiceId: id,
      status: z.enum(["Várakozik", "Tesztelve", "Hibás"]),
      attempts: value,
      error: text,
    }),
  ),
});
export const roleSchema = z.enum(["admin", "dispatcher", "finance", "viewer"]);
export type Role = z.infer<typeof roleSchema>;
export const credentialsSchema = z.strictObject({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(128),
});
export const userSchema = credentialsSchema.extend({
  name: z.string().trim().min(2).max(100),
  password: z
    .string()
    .min(12, "Legalább 12 karakteres jelszó szükséges.")
    .max(128),
  role: roleSchema,
});
export const userUpdateSchema = z
  .strictObject({ role: roleSchema.optional(), active: z.boolean().optional() })
  .refine(
    (data) => data.role !== undefined || data.active !== undefined,
    "Legalább egy módosítandó mező szükséges.",
  );
export const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z
    .string()
    .min(12, "Legalább 12 karakteres jelszó szükséges.")
    .max(128),
});
export const setupSchema = userSchema
  .omit({ role: true })
  .extend({
    workspaceName: z.string().trim().min(2).max(100),
    sampleData: z.boolean().default(false),
  });
export const workspaceSchema = z.strictObject({
  state: stateSchema,
  revision: z.number().int().nonnegative(),
  action: z.string().trim().min(1).max(200),
  entity: z.string().max(300),
});
