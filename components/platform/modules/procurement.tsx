"use client";
import { useState } from "react";
import { useTms } from "../store";
import { money, uid, type CompanyId } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, StatusBadge, Modal, Field } from "../ui/primitives";
import { Icon } from "../ui/icon";
const phases = ["Igény", "Jóváhagyva", "Megrendelve", "Beérkezett"] as const;
export default function Procurement() {
  const { state, companies, orders, companyId, mutate } = useTms();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageTitle
        title="Beszerzés & szolgáltatások"
        description="Beszerzési igények, jóváhagyások és fuvarhoz kapcsolt megrendelések."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Új beszerzési igény
        </button>
      </PageTitle>
      <Panel title="Megrendelési lánc">
        <Table
          headers={[
            "Azonosító / szállító",
            "Igény / szolgáltatás",
            "Cég",
            "Összeg",
            "Állapot",
            "Következő lépés",
          ]}
        >
          {state.purchases
            .filter((p) => companyId === "all" || p.companyId === companyId)
            .map((p) => (
              <tr key={p.id}>
                <td className="cell-title">
                  {p.id}
                  <small>{p.supplier}</small>
                </td>
                <td>
                  {p.description}
                  <small>
                    {state.orders.find((o) => o.id === p.orderId)?.reference ||
                      "Belső beszerzés"}
                  </small>
                </td>
                <td>{companies.find((c) => c.id === p.companyId)?.name}</td>
                <td>{money(p.amount)}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  {p.status !== "Beérkezett" ? (
                    <button
                      className="button small"
                      onClick={() =>
                        mutate("Beszerzési állapot frissítve", p.id, (d) => {
                          const row = d.purchases.find((x) => x.id === p.id)!;
                          row.status = phases[phases.indexOf(row.status) + 1];
                        })
                      }
                    >
                      {phases[phases.indexOf(p.status) + 1]} →
                    </button>
                  ) : (
                    <Icon name="check" />
                  )}
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
      {open ? (
        <Modal title="Beszerzési igény" onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                mutate(
                  "Beszerzési igény létrehozva",
                  String(f.get("supplier")),
                  (d) =>
                    d.purchases.unshift({
                      id: `PO-${uid().slice(0, 7).toUpperCase()}`,
                      supplier: String(f.get("supplier")),
                      description: String(f.get("description")),
                      amount: Number(f.get("amount")),
                      companyId: f.get("company") as CompanyId,
                      orderId: String(f.get("order")),
                      status: "Igény",
                    }),
                )
              )
                setOpen(false);
            }}
          >
            <div className="modal-body form-grid">
              <Field label="Szállító">
                <input name="supplier" required />
              </Field>
              <Field label="Igény megnevezése">
                <input name="description" required />
              </Field>
              <Field label="Tervezett nettó összeg (HUF)">
                <input name="amount" type="number" min="1" required />
              </Field>
              <Field label="Cég">
                <select name="company">
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Kapcsolódó fuvar">
                <select name="order">
                  <option value="">Belső beszerzés</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <footer className="modal-actions">
              <button className="button primary">Igény rögzítése</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
