"use client";
import { useState } from "react";
import { useTms } from "../store";
import { uid } from "../../../lib/tms/model";
import { saveFile } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import {
  Panel,
  Table,
  StatusBadge,
  Modal,
  Field,
  Notice,
} from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Damage() {
  const { state, orders, mutate, mutateAsync, notify } = useTms();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle
        title="Állapot & káresemények"
        description="Incidensnapló, járműállapot és fényképes bizonyítékok."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Esemény rögzítése
        </button>
      </PageTitle>
      <Notice>
        A fotók dokumentációként tárolhatók. Automatikus sérülésfelismerés és
        előtte–utána AI-elemzés még nincs bekötve.
      </Notice>
      <Panel title="Incidensek és műveleti jelzések">
        <Table
          headers={[
            "Esemény",
            "Fuvar / jármű",
            "Súlyosság",
            "Állapot",
            "Művelet",
          ]}
        >
          {state.incidents
            .filter((i) => !i.orderId || orders.some((o) => o.id === i.orderId))
            .map((i) => (
              <tr key={i.id}>
                <td className="wide-cell">
                  {i.description}
                  <small>{new Date(i.createdAt).toLocaleString("hu-HU")}</small>
                </td>
                <td>
                  {state.orders.find((o) => o.id === i.orderId)?.reference ||
                    "Flottaesemény"}
                  <small>
                    {state.vehicles.find((v) => v.id === i.vehicleId)?.plate}
                  </small>
                </td>
                <td>{i.severity}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td>
                  {i.status === "Nyitott" ? (
                    <button
                      className="button small"
                      onClick={() =>
                        mutate("Incidens lezárva", i.id, (d) => {
                          d.incidents.find((x) => x.id === i.id)!.status =
                            "Lezárt";
                        })
                      }
                    >
                      Lezárás
                    </button>
                  ) : (
                    <Icon name="check" size={16} />
                  )}
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
      {open ? (
        <Modal
          title="Állapot / incidens rögzítése"
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                const id = uid();
                if (file) await saveFile(file, id);
                if (
                  await mutateAsync("Incidens rögzítve", String(f.get("order")), (d) => {
                    d.incidents.unshift({
                      id,
                      orderId: String(f.get("order")),
                      vehicleId: String(f.get("vehicle")),
                      description: String(f.get("description")),
                      severity: String(f.get("severity")),
                      status: "Nyitott",
                      createdAt: new Date().toISOString(),
                    });
                    if (file)
                      d.documents.push({
                        id,
                        blobId: id,
                        orderId: String(f.get("order")),
                        name: file.name,
                        type: "Megbízás",
                        version: 1,
                        createdAt: new Date().toISOString(),
                      });
                  })
                )
                  setOpen(false);
              } catch (error) {
                notify(String(error), true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="modal-body stack">
              <div className="form-grid">
                <Field label="Kapcsolódó fuvar">
                  <select name="order">
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.reference}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Jármű">
                  <select name="vehicle">
                    {state.vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Esemény leírása">
                <textarea name="description" required />
              </Field>
              <Field label="Súlyosság">
                <select name="severity">
                  <option>Alacsony</option>
                  <option>Közepes</option>
                  <option>Magas</option>
                </select>
              </Field>
              <Field label="Állapotfotó (opcionális)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
            </div>
            <footer className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Mentés…" : "Esemény mentése"}
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
