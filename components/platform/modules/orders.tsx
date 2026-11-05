"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useTms } from "../store";
import {
  statuses,
  huf,
  money,
  orderRoute,
  uid,
  type Order,
} from "../../../lib/tms/model";
import { exportCsv } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import {
  Panel,
  Table,
  StatusBadge,
  Modal,
  Field,
  Empty,
} from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Orders() {
  const { state, orders, saveOrder, transition, notify } = useTms();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const queryOrder = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("order"),
    () => null,
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const { assign } = useTms();
  const visible = orders.filter(
    (o) =>
      `${o.reference} ${orderRoute(o)} ${state.partners.find((p) => p.id === o.partnerId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === "all" || o.status === status),
  );
  const order = orders.find(
    (o) => o.id === (selected || (!dismissed ? queryOrder : null)),
  );
  function copy(o: Order) {
    const clone = {
      ...structuredClone(o),
      id: uid(),
      reference: `${o.reference}-MÁSOLAT-${Date.now().toString().slice(-4)}`,
      status: "Új" as const,
      vehicleId: "",
      driverId: "",
      createdAt: new Date().toISOString(),
    };
    saveOrder(clone);
  }
  return (
    <>
      <PageTitle
        title="Fuvarmegbízások"
        description={`${orders.length} megbízás. A teljes életciklus egy helyen.`}
      >
        <button
          className="button"
          onClick={() =>
            exportCsv("fuvarok.csv", [
              ["Fuvar", "Partner", "Útvonal", "Státusz", "Díj", "Deviza"],
              ...visible.map((o) => [
                o.reference,
                state.partners.find((p) => p.id === o.partnerId)?.name || "",
                orderRoute(o),
                o.status,
                o.price,
                o.currency,
              ]),
            ])
          }
        >
          <Icon name="download" size={16} />
          Export
        </button>
        <Link className="button primary" href="/new-order">
          <Icon name="plus" size={16} />
          Új megbízás
        </Link>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Fuvarok keresése"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Fuvarszám, partner vagy útvonal…"
          />
        </div>
        <select
          aria-label="Fuvarstátusz szűrő"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Minden státusz</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="result-count">{visible.length} találat</span>
      </div>
      <Panel
        title="Megbízások"
        actions={
          <span className="muted">
            Nettó összegek · demó árfolyam: 400 HUF/EUR
          </span>
        }
      >
        <Table
          headers={[
            "Megbízás / partner",
            "Útvonal / rakomány",
            "Erőforrás",
            "Státusz",
            "Fuvardíj",
            "Művelet",
          ]}
        >
          {visible.map((o) => (
            <tr key={o.id}>
              <td>
                <button
                  className="cell-title link-button"
                  onClick={() => setSelected(o.id)}
                >
                  {o.reference}
                </button>
                <small>
                  {state.partners.find((p) => p.id === o.partnerId)?.name}
                </small>
              </td>
              <td>
                {orderRoute(o)}
                <small>
                  {o.cargo.kg.toLocaleString("hu-HU")} kg · {o.cargo.type}
                  {o.cargo.adr ? " · ADR" : ""}
                </small>
              </td>
              <td>
                {state.vehicles.find((v) => v.id === o.vehicleId)?.plate ||
                  "Nincs kiosztva"}
                <small>{o.dispatcher}</small>
              </td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td>
                {money(o.price, o.currency)}
                <small>
                  Fedezet: {money(huf(o.price, o.currency) - o.plannedCost)}
                </small>
              </td>
              <td>
                <button
                  className="button small"
                  onClick={() => setSelected(o.id)}
                >
                  Részletek <Icon name="arrow" size={13} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!visible.length ? <Empty /> : null}
      </Panel>
      {order ? (
        <Modal
          title={order.reference}
          onClose={() => {
            setSelected(null);
            setDismissed(true);
          }}
          wide
        >
          <div className="modal-body">
            <div className="detail-hero">
              <div>
                <p className="eyebrow">
                  {state.partners.find((p) => p.id === order.partnerId)?.name}
                </p>
                <h3>{orderRoute(order)}</h3>
                <p>
                  {order.cargo.name} · {order.cargo.kg.toLocaleString("hu-HU")}{" "}
                  kg · {order.type}
                </p>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <div className="workflow-strip">
              {statuses.map((s) => (
                <span
                  className={
                    statuses.indexOf(s) <= statuses.indexOf(order.status)
                      ? "done"
                      : ""
                  }
                  key={s}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="detail-grid">
              <div>
                <span>Fuvardíj</span>
                <strong>{money(order.price, order.currency)}</strong>
              </div>
              <div>
                <span>Tervköltség</span>
                <strong>{money(order.plannedCost)}</strong>
              </div>
              <div>
                <span>Felelős</span>
                <strong>{order.dispatcher}</strong>
              </div>
              <div>
                <span>Rögzítve</span>
                <strong>
                  {new Date(order.createdAt).toLocaleDateString("hu-HU")}
                </strong>
              </div>
            </div>
            <div className="stop-list">
              {order.stops.map((s, i) => (
                <div key={s.id}>
                  <b>{i + 1}</b>
                  <div>
                    <strong>
                      {s.city} · {s.type}
                    </strong>
                    <p>
                      {s.address} · {s.date} {s.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="inline-form">
              <Field label="Jármű és sofőr">
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="">Válassz járművet</option>
                  {state.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.model}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                className="button"
                onClick={() => assign(order.id, vehicleId)}
              >
                Kiosztás
              </button>
            </div>
            <h3 className="section-label">Kapcsolódó dokumentumok</h3>
            {state.documents
              .filter((d) => d.orderId === order.id)
              .map((d) => (
                <div className="list-line" key={d.id}>
                  <Icon name="invoice" size={16} />
                  {d.name}
                  <span className="muted">{d.type}</span>
                </div>
              ))}
            <Link className="text-link" href="/documents">
              Dokumentum csatolása →
            </Link>
          </div>
          <footer className="modal-actions">
            <button className="button" onClick={() => copy(order)}>
              <Icon name="plus" size={14} />
              Másolás
            </button>
            <button
              className="button primary"
              disabled={order.status === "Lezárva"}
              onClick={() => {
                const next = statuses[statuses.indexOf(order.status) + 1];
                if (next) transition(order.id, next);
                else notify("A fuvar már lezárult.");
              }}
            >
              Következő státusz →
            </button>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}
