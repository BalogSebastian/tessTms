"use client";
import Link from "next/link";
import { useTms } from "../store";
import {
  huf,
  money,
  number,
  orderRoute,
  sumRevenue,
  sumCost,
} from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Stat, Panel, StatusBadge, Empty } from "../ui/primitives";
import { FleetMap } from "../ui/fleet-map";
import { Icon } from "../ui/icon";
export default function Dashboard() {
  const { state, orders } = useTms();
  const active = orders.filter((o) => o.status !== "Lezárva");
  const unassigned = active.filter((o) => !o.vehicleId);
  const revenue = sumRevenue(orders);
  const margin = revenue - sumCost(orders);
  const missingDocs = orders.filter(
    (o) =>
      ["Dokumentáció", "Lezárva"].includes(o.status) &&
      !state.documents.some((d) => d.orderId === o.id && d.type === "CMR"),
  );
  return (
    <>
      <PageTitle
        title="Minden mozgásban. Minden kézben."
        description="A teljes fuvarozási operációd, egyetlen tiszta nézetben."
        eyebrow="MŰVELETI KÖZPONT"
      >
        <span className="date-chip">
          <Icon name="calendar" size={15} /> 2026. november 5. · mintanap
        </span>
        <Link className="button primary" href="/new-order">
          <Icon name="plus" size={17} />
          Új fuvarmegbízás
        </Link>
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label="Aktív fuvarmegbízások"
          value={active.length}
          note={`${unassigned.length} megbízás kiosztásra vár`}
          icon="orders"
        />
        <Stat
          label="Tervezett árbevétel"
          value={money(revenue)}
          note={`${orders.length} fuvar · HUF egyenérték`}
          icon="finance"
        />
        <Stat
          label="Összesített fedezet"
          value={money(margin)}
          note={`${revenue ? ((margin / revenue) * 100).toFixed(1) : 0}% árbevétel-arányos fedezet`}
          icon="chart"
          accent
        />
        <Stat
          label="Dokumentumhiány"
          value={missingDocs.length}
          note="Hiányzó CMR a teljesítési szakaszban"
          icon="folder"
        />
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Flotta mozgásban"
          eyebrow="OPERÁCIÓS TÉRKÉP"
          actions={
            <Link className="text-link" href="/routes">
              Térkép megnyitása <Icon name="arrow" size={14} />
            </Link>
          }
        >
          <FleetMap compact />
        </Panel>
        <Panel
          title="Ami most figyelmet kér"
          eyebrow="PRIORITÁSOK"
          className="attention-panel"
        >
          <Link className="attention red" href="/damage">
            <span>
              <Icon name="alert" />
            </span>
            <div>
              <strong>
                {state.incidents.filter((i) => i.status === "Nyitott").length}{" "}
                nyitott műveleti jelzés
              </strong>
              <p>Incidensek és beavatkozások kezelése</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <Link className="attention amber" href="/dispatch">
            <span>
              <Icon name="calendar" />
            </span>
            <div>
              <strong>{unassigned.length} fuvar erőforrásra vár</strong>
              <p>Jármű és sofőr hozzárendelése</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <Link className="attention green" href="/documents">
            <span>
              <Icon name="folder" />
            </span>
            <div>
              <strong>{missingDocs.length} hiányzó fuvarokmány</strong>
              <p>A számlázási lánc ellenőrzése</p>
            </div>
            <Icon name="right" size={15} />
          </Link>
          <div className="attention-footer">
            <Icon name="sparkles" size={16} />
            <span>A megfelelő információ, a megfelelő pillanatban.</span>
          </div>
        </Panel>
      </div>
      <Panel
        title="Aktuális fuvarok"
        eyebrow="ÉLŐ MUNKALISTA"
        actions={
          <Link className="text-link" href="/orders">
            Összes megbízás <Icon name="arrow" size={14} />
          </Link>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Megbízás / partner</th>
                <th>Útvonal</th>
                <th>Jármű / sofőr</th>
                <th>Státusz</th>
                <th>Fuvardíj</th>
                <th>Fedezet</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 5).map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link className="cell-title" href={`/orders?order=${o.id}`}>
                      {o.reference}
                    </Link>
                    <small>
                      {state.partners.find((p) => p.id === o.partnerId)?.name}
                    </small>
                  </td>
                  <td>
                    {orderRoute(o)}
                    <small>
                      {number(o.cargo.kg)} kg · {o.cargo.type}
                    </small>
                  </td>
                  <td>
                    {state.vehicles.find((v) => v.id === o.vehicleId)?.plate ||
                      "Nincs kiosztva"}
                    <small>
                      {state.drivers.find((d) => d.id === o.driverId)?.name ||
                        "Kiosztásra vár"}
                    </small>
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="numeric">{money(o.price, o.currency)}</td>
                  <td className="positive">
                    {(
                      ((huf(o.price, o.currency) - o.plannedCost) /
                        huf(o.price, o.currency)) *
                      100
                    ).toFixed(1)}
                    %
                  </td>
                  <td>
                    <Link
                      href={`/orders?order=${o.id}`}
                      className="icon-link"
                      aria-label={`${o.reference} részletei`}
                    >
                      <Icon name="arrow" size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length ? <Empty /> : null}
        </div>
      </Panel>
      <div className="dashboard-bottom-grid">
        <Panel
          title="Legutóbbi változások"
          actions={
            <Link className="text-link" href="/settings">
              Eseménynapló <Icon name="arrow" size={14} />
            </Link>
          }
        >
          <div className="activity-list">
            {state.audit.slice(0, 4).map((a) => (
              <div key={a.id}>
                <span className="activity-dot" />
                <div>
                  <strong>{a.action}</strong>
                  <small>
                    {a.entity} · {a.actor}
                  </small>
                </div>
                <time>
                  {new Date(a.at).toLocaleTimeString("hu-HU", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Budapest",
                  })}
                </time>
              </div>
            ))}
          </div>
        </Panel>
        <article className="ecosystem-card">
          <div className="ecosystem-icon">
            <Icon name="sparkles" size={27} />
          </div>
          <p className="eyebrow">TESOTTER ÖKOSZISZTÉMA</p>
          <h2>
            A papírból adat.
            <br />
            Az adatból lendület.
          </h2>
          <p>Fuvar, dokumentum és pénzügy — egy közös működési térben.</p>
          <Link href="/scan">
            Fedezd fel a scanR munkateret <Icon name="arrow" size={16} />
          </Link>
          <span className="ecosystem-decoration">t</span>
        </article>
      </div>
    </>
  );
}
