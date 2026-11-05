"use client";
import { useState } from "react";
import { useTms } from "../store";
import { freeCredit, money, uid, sumRevenue } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Modal, Field, Badge, Progress } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Partners() {
  const { state, mutate } = useTms();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const p = state.partners.find((p) => p.id === selected);
  return (
    <>
      <PageTitle
        title="Partnerek & CRM"
        description="Kapcsolattartók, fizetési feltételek és a teljes üzleti kapcsolat."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="plus" size={16} />
          Új partner
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Partner keresése"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Partner vagy kapcsolattartó…"
          />
        </div>
      </div>
      <div className="partner-grid">
        {state.partners
          .filter((p) =>
            `${p.name} ${p.contact}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .map((p) => {
            const credit = freeCredit(state, p.id);
            return (
              <button
                className="partner-card"
                key={p.id}
                onClick={() => setSelected(p.id)}
              >
                <div className="partner-card-top">
                  <span className="partner-avatar">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <Badge tone={credit > 0 ? "green" : "red"}>
                    {p.country} · {p.terms} nap
                  </Badge>
                </div>
                <h2>{p.name}</h2>
                <p>{p.contact}</p>
                <div className="partner-credit">
                  <span>
                    Rendelkezésre álló keret<strong>{money(credit)}</strong>
                  </span>
                  <Icon name="arrow" size={20} />
                </div>
                <Progress value={((p.credit - credit) / p.credit) * 100} />
                <small>Hitelkeret: {money(p.credit)}</small>
              </button>
            );
          })}
      </div>
      {p ? (
        <Modal title={p.name} onClose={() => setSelected("")} wide>
          <div className="modal-body">
            <div className="detail-grid">
              <div>
                <span>Kapcsolattartó</span>
                <strong>{p.contact}</strong>
              </div>
              <div>
                <span>E-mail (minta)</span>
                <strong>{p.email}</strong>
              </div>
              <div>
                <span>Fuvarozási árbevétel</span>
                <strong>
                  {money(
                    sumRevenue(
                      state.orders.filter((o) => o.partnerId === p.id),
                    ),
                  )}
                </strong>
              </div>
              <div>
                <span>Szabad hitelkeret</span>
                <strong>{money(freeCredit(state, p.id))}</strong>
              </div>
            </div>
            <Panel title="Fuvarozási előzmények">
              <Table headers={["Megrendelés", "Státusz", "Fuvardíj"]}>
                {state.orders
                  .filter((o) => o.partnerId === p.id)
                  .map((o) => (
                    <tr key={o.id}>
                      <td>{o.reference}</td>
                      <td>{o.status}</td>
                      <td>{money(o.price, o.currency)}</td>
                    </tr>
                  ))}
              </Table>
            </Panel>
          </div>
        </Modal>
      ) : null}
      {open ? (
        <Modal title="Partner létrehozása" onClose={() => setOpen(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                mutate("Partner létrehozva", String(f.get("name")), (d) =>
                  d.partners.push({
                    id: uid(),
                    name: String(f.get("name")),
                    contact: String(f.get("contact")),
                    email: String(f.get("email")),
                    credit: Number(f.get("credit")),
                    receivable: 0,
                    terms: Number(f.get("terms")),
                    country: String(f.get("country")),
                  }),
                )
              )
                setOpen(false);
            }}
          >
            <div className="modal-body form-grid">
              {[
                ["name", "Partner neve"],
                ["contact", "Kapcsolattartó"],
                ["email", "E-mail"],
                ["credit", "Hitelkeret (HUF)"],
                ["terms", "Fizetési határidő (nap)"],
                ["country", "Országkód"],
              ].map(([key, label], i) => (
                <Field key={key} label={label}>
                  <input
                    name={key}
                    type={
                      i === 2 ? "email" : i === 3 || i === 4 ? "number" : "text"
                    }
                    min="1"
                    required
                    defaultValue={
                      key === "terms"
                        ? 30
                        : key === "country"
                          ? "HU"
                          : undefined
                    }
                  />
                </Field>
              ))}
            </div>
            <footer className="modal-actions">
              <button className="button primary">Partner mentése</button>
            </footer>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
