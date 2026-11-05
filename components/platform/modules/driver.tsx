"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import { statuses, uid } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, StatusBadge, Empty, Field } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Driver() {
  const { state, orders, transition, mutate } = useTms();
  const [driver, setDriver] = useState("d1");
  const [message, setMessage] = useState("");
  const jobs = orders.filter(
    (o) => o.driverId === driver && o.status !== "Lezárva",
  );
  const [selection, setSelection] = useState("");
  const order = jobs.find((o) => o.id === selection) || jobs[0];
  return (
    <>
      <PageTitle
        title="Sofőr munkatér"
        description="Feladatra szabott nézet, státuszfrissítés és diszpécserüzenetek."
      >
        <select
          aria-label="Sofőr kiválasztása"
          value={driver}
          onChange={(e) => setDriver(e.target.value)}
        >
          {state.drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </PageTitle>
      <div className="two-panel-grid">
        <Panel title="Kiosztott feladatok">
          <div className="driver-job-list">
            {jobs.map((o) => (
              <button
                className={`driver-job ${order?.id === o.id ? "selected" : ""}`}
                key={o.id}
                onClick={() => setSelection(o.id)}
              >
                <div>
                  <strong>{o.reference}</strong>
                  <StatusBadge status={o.status} />
                </div>
                <h3>
                  {o.stops[0]?.city} → {o.stops.at(-1)?.city}
                </h3>
                <small>
                  {o.cargo.name} · {o.cargo.kg} kg
                </small>
              </button>
            ))}
            {!jobs.length ? <Empty title="Nincs aktív feladat." /> : null}
          </div>
        </Panel>
        {order ? (
          <Panel title="Aktuális feladat">
            <div className="form-body">
              <div className="stop-list">
                {order.stops.map((s, i) => (
                  <div key={s.id}>
                    <b>{i + 1}</b>
                    <div>
                      <strong>
                        {s.type} · {s.city}
                      </strong>
                      <p>
                        {s.address} · {s.date} {s.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={order.status === "Lezárva"}
                  onClick={() => {
                    const next = statuses[statuses.indexOf(order.status) + 1];
                    if (next) transition(order.id, next);
                  }}
                >
                  Következő státusz
                </button>
                <Link href="/documents" className="button">
                  <Icon name="import" size={15} />
                  Okmány csatolása
                </Link>
              </div>
              <h3 className="section-label">Sofőr–diszpécser üzenetek</h3>
              <div className="chat-feed">
                {state.messages
                  .filter((m) => m.orderId === order.id)
                  .map((m) => (
                    <div className="chat-bubble" key={m.id}>
                      <small>{m.author}</small>
                      <p>{m.text}</p>
                    </div>
                  ))}
              </div>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (message.trim()) {
                    mutate("Üzenet rögzítve", order.reference, (d) =>
                      d.messages.push({
                        id: uid(),
                        orderId: order.id,
                        author:
                          state.drivers.find((d) => d.id === driver)?.name ||
                          "Sofőr",
                        text: message.trim(),
                        createdAt: new Date().toISOString(),
                      }),
                    );
                    setMessage("");
                  }
                }}
              >
                <Field label="Helyi üzenet">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    placeholder="Üzenet a diszpécsernek…"
                  />
                </Field>
                <button
                  className="button primary"
                  aria-label="Üzenet rögzítése"
                >
                  <Icon name="send" size={17} />
                </button>
              </form>
            </div>
          </Panel>
        ) : null}
      </div>
    </>
  );
}
