"use client";
import { useTms } from "../store";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, StatusBadge, Badge, Notice } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Integrations() {
  const { state, mutate } = useTms();
  return (
    <>
      <PageTitle
        title="Integrációk & SAP Business One"
        description="Átlátható adatkapcsolatok és ellenőrizhető küldési sor."
      />
      <div className="integration-grid">
        {[
          [
            "SAP Business One",
            "Számlaelőkészítés, partnerek, pénzügy",
            "building",
          ],
          [
            "GPS / telematika",
            "Pozíció, kilométeróra és vezetési idő",
            "truck",
          ],
          [
            "Transporeon / Project44",
            "Bejövő rendelés és teljesítési esemény",
            "route",
          ],
          ["scanR / docR", "Dokumentumfelismerés és archiválás", "scan"],
        ].map(([name, text, icon]) => (
          <article className="integration-card" key={name}>
            <span className="integration-icon">
              <Icon name={icon} size={26} />
            </span>
            <Badge>Nincs csatlakoztatva</Badge>
            <h2>{name}</h2>
            <p>{text}</p>
            <small>
              Szolgáltatói fiók és szerveroldali csatlakozó szükséges.
            </small>
          </article>
        ))}
      </div>
      <Notice>
        A lenti ellenőrzés helyi szerződésvalidálás. Nem küld adatot az SAP vagy
        más szolgáltató felé.
      </Notice>
      <Panel title="SAP-adatcsomagok · outbox">
        <Table
          headers={[
            "Előkészítés",
            "Állapot",
            "Próbák",
            "Ellenőrzési eredmény",
            "Művelet",
          ]}
        >
          {state.outbox.map((x) => (
            <tr key={x.id}>
              <td className="cell-title">{x.invoiceId}</td>
              <td>
                <StatusBadge status={x.status} />
              </td>
              <td>{x.attempts}</td>
              <td>{x.error || "—"}</td>
              <td>
                <button
                  className="button small"
                  onClick={() =>
                    mutate("SAP-csomag helyi ellenőrzése", x.invoiceId, (d) => {
                      const row = d.outbox.find((r) => r.id === x.id)!;
                      row.attempts++;
                      const i = d.invoices.find((i) => i.id === x.invoiceId);
                      row.status =
                        i?.status === "Jóváhagyva" ? "Tesztelve" : "Hibás";
                      row.error =
                        i?.status === "Jóváhagyva"
                          ? "Séma rendben · nincs elküldve"
                          : "Hiányzó vagy nem jóváhagyott előkészítés";
                    })
                  }
                >
                  Csomag tesztelése
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!state.outbox.length ? (
          <div className="form-body muted">
            A jóváhagyott számlaelőkészítések automatikusan ide kerülnek.
          </div>
        ) : null}
      </Panel>
      <div className="spaced" />
      <Panel title="Felelősségi és adatmező-megfeleltetés">
        <Table
          headers={["TMS adat", "SAP B1 mező / objektum", "Irány", "Állapot"]}
        >
          {[
            ["Partnerazonosító", "BusinessPartners.CardCode", "Kétirányú"],
            ["Fuvarszám", "U_TMSReference", "TMS → SAP"],
            ["Előkészített díj", "Invoices.DocumentLines", "TMS → SAP"],
            ["Pénzügyi rendezés", "IncomingPayments", "SAP → TMS"],
            ["Üzletág", "CostingCode", "Kétirányú"],
          ].map((r) => (
            <tr key={r[0]}>
              {r.map((c) => (
                <td key={c}>{c}</td>
              ))}
              <td>
                <Badge tone="amber">Egyeztetendő</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
