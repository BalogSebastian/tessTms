"use client";
import { useTms } from "../store";
import { money, number, sumRevenue, sumCost } from "../../../lib/tms/model";
import { exportCsv } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Panel, Stat, Table } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Analytics() {
  const { state, orders } = useTms();
  const revenue = sumRevenue(orders);
  const cost = sumCost(orders);
  const km = orders.reduce((s, o) => s + o.loadedKm + o.emptyKm, 0);
  const partners = state.partners.map((p) => ({
    name: p.name,
    orders: orders.filter((o) => o.partnerId === p.id),
  }));
  const max = Math.max(...partners.map((p) => sumRevenue(p.orders)), 1);
  return (
    <>
      <PageTitle
        title="Riportok & analitika"
        description="A fuvarok mögötti üzleti teljesítmény, közös adatokból."
      >
        <button
          className="button"
          onClick={() =>
            exportCsv("partner-riport.csv", [
              ["Partner", "Fuvarok", "Árbevétel HUF", "Fedezet HUF"],
              ...partners.map((p) => [
                p.name,
                p.orders.length,
                sumRevenue(p.orders),
                sumRevenue(p.orders) - sumCost(p.orders),
              ]),
            ])
          }
        >
          <Icon name="download" size={16} />
          Riport exportálása
        </button>
      </PageTitle>
      <div className="stats-grid">
        <Stat
          label="Összes árbevétel"
          value={money(revenue)}
          note="Minden nyilvántartott fuvar"
          icon="finance"
        />
        <Stat
          label="Fedezet"
          value={money(revenue - cost)}
          note="Terv / lezárt fuvar tényköltség"
          icon="chart"
          accent
        />
        <Stat
          label="Tervezett összes kilométer"
          value={`${number(km)} km`}
          note={`${number(orders.reduce((s, o) => s + o.emptyKm, 0))} km üres futás`}
          icon="route"
        />
        <Stat
          label="Árbevétel / összes km"
          value={money(km ? revenue / km : 0)}
          note="HUF egyenértéken, demó árfolyammal"
          icon="truck"
        />
      </div>
      <div className="two-panel-grid">
        <Panel title="Partnerenkénti árbevétel">
          <div className="bar-chart">
            {partners.map((p) => (
              <div className="bar-chart-row" key={p.name}>
                <div>
                  <strong>{p.name}</strong>
                  <span>{money(sumRevenue(p.orders))}</span>
                </div>
                <div className="chart-track">
                  <span
                    style={{ width: `${(sumRevenue(p.orders) / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Fuvarok állapoteloszlása">
          <div className="status-chart">
            {[
              "Új",
              "Tervezett",
              "Kiosztva",
              "Úton",
              "Lerakodás",
              "Dokumentáció",
              "Lezárva",
            ].map((s) => (
              <div key={s}>
                <span>{s}</span>
                <div>
                  <i
                    style={{
                      width: `${Math.max(3, (orders.filter((o) => o.status === s).length / Math.max(1, orders.length)) * 100)}%`,
                    }}
                  />
                </div>
                <strong>{orders.filter((o) => o.status === s).length}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Ügyfél- és relációelemzés">
        <Table
          headers={["Partner", "Fuvarok", "Összes km", "Árbevétel", "Fedezet"]}
        >
          {partners.map((p) => (
            <tr key={p.name}>
              <td className="cell-title">{p.name}</td>
              <td>{p.orders.length}</td>
              <td>
                {number(
                  p.orders.reduce((s, o) => s + o.loadedKm + o.emptyKm, 0),
                )}{" "}
                km
              </td>
              <td>{money(sumRevenue(p.orders))}</td>
              <td className="positive">
                {money(sumRevenue(p.orders) - sumCost(p.orders))}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
