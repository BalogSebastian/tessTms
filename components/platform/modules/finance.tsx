"use client";
import { useState } from "react";
import { useTms } from "../store";
import {
  money,
  huf,
  sumRevenue,
  sumCost,
  uid,
  type Currency,
} from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Stat, Table, Modal, Field, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Finance() {
  const { state, orders, mutate } = useTms();
  const [open, setOpen] = useState(false);
  const revenue = sumRevenue(orders);
  const cost = sumCost(orders);
  return (
    <>
      <PageTitle
        title="Költség & fedezet"
        description="Terv–tény költségek, extra díjak és fuvarszintű jövedelmezőség."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Költségtétel rögzítése
        </button>
      </PageTitle>
      <div className="stats-grid three">
        <Stat
          label="Bevétel HUF egyenértéken"
          value={money(revenue)}
          note="Demó EUR árfolyam: 400 HUF"
          icon="finance"
        />
        <Stat
          label="Terv / lezárt tényköltség"
          value={money(cost)}
          note="Lezárt fuvaroknál a tényköltség számít"
          icon="cart"
        />
        <Stat
          label="Összesített fedezet"
          value={money(revenue - cost)}
          note={`${revenue ? (((revenue - cost) / revenue) * 100).toFixed(1) : 0}% árbevétel-arányosan`}
          icon="chart"
          accent
        />
      </div>
      <Panel title="Fuvarszintű terv–tény">
        <Table
          headers={[
            "Fuvar",
            "Bevétel",
            "Tervköltség",
            "Tényköltség",
            "Eltérés",
            "Tervezett fedezet",
          ]}
        >
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="cell-title">{o.reference}</td>
              <td>{money(o.price, o.currency)}</td>
              <td>{money(o.plannedCost)}</td>
              <td>
                {o.actualCost ? money(o.actualCost) : "Még nincs tényadat"}
              </td>
              <td>
                {o.actualCost ? (
                  <Badge tone={o.actualCost > o.plannedCost ? "red" : "green"}>
                    {money(o.actualCost - o.plannedCost)}
                  </Badge>
                ) : (
                  "—"
                )}
              </td>
              <td className="positive">
                {money(huf(o.price, o.currency) - o.plannedCost)}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="spaced" />
      <Panel title="Rögzített elemi költségek">
        <Table headers={["Tétel", "Fuvar", "Típus", "Összeg"]}>
          {state.costs
            .filter((c) => orders.some((o) => o.id === c.orderId))
            .map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  {state.orders.find((o) => o.id === c.orderId)?.reference}
                </td>
                <td>
                  <Badge>{c.kind}</Badge>
                </td>
                <td>{money(c.amount, c.currency)}</td>
              </tr>
            ))}
        </Table>
      </Panel>
      {open ? (
        <Modal title="Új költségtétel" onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const amount = Number(f.get("amount"));
              const currency = f.get("currency") as Currency;
              const kind = f.get("kind") as "Terv" | "Tény";
              const id = String(f.get("orderId"));
              if (
                mutate("Költségtétel rögzítve", id, (d) => {
                  d.costs.push({
                    id: uid(),
                    orderId: id,
                    name: String(f.get("name")),
                    amount,
                    currency,
                    kind,
                  });
                  const o = d.orders.find((o) => o.id === id)!;
                  if (kind === "Tény") o.actualCost += huf(amount, currency);
                  else o.plannedCost += huf(amount, currency);
                })
              )
                setOpen(false);
            }}
          >
            <div className="modal-body form-grid">
              <Field label="Fuvar">
                <select name="orderId">
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.reference}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Költségnem">
                <select name="name">
                  {[
                    "Üzemanyag",
                    "Útdíj",
                    "Sofőr",
                    "Állásdíj",
                    "Rakodás",
                    "Alvállalkozó",
                    "Egyéb",
                  ].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Field>
              <Field label="Összeg">
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </Field>
              <Field label="Deviza">
                <select name="currency">
                  <option>HUF</option>
                  <option>EUR</option>
                </select>
              </Field>
              <Field label="Terv vagy tény">
                <select name="kind">
                  <option>Tény</option>
                  <option>Terv</option>
                </select>
              </Field>
            </div>
            <footer className="modal-actions">
              <button className="button primary" disabled={!orders.length}>
                Rögzítés
              </button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
