"use client";
import { useTms } from "../store";
import { downloadBlob, exportCsv } from "../../../lib/tms/files";
import { modules } from "../../../lib/tms/catalog";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Badge, Notice } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Settings() {
  const { state } = useTms();
  return (
    <>
      <PageTitle
        title="Rendszer & eseménynapló"
        description="Helyi adatmentés, működési állapot és visszakereshető változások."
      >
        <button
          className="button"
          onClick={() =>
            downloadBlob(
              new Blob([JSON.stringify(state, null, 2)], {
                type: "application/json",
              }),
              "tessTMS-helyi-mentes.json",
            )
          }
        >
          <Icon name="download" size={16} />
          Teljes adatmentés
        </button>
      </PageTitle>
      <div className="two-panel-grid">
        <Panel title="Jelenlegi környezet">
          <div className="key-value-list">
            <div>
              <span>Adattárolás</span>
              <strong>Böngésző · localStorage + IndexedDB</strong>
            </div>
            <div>
              <span>Alkalmazás</span>
              <strong>Next.js · React · TypeScript</strong>
            </div>
            <div>
              <span>Hitelesítés</span>
              <Badge tone="amber">Nincs bekötve</Badge>
            </div>
            <div>
              <span>Központi adatbázis</span>
              <Badge tone="amber">Nincs bekötve</Badge>
            </div>
            <div>
              <span>Külső adatküldés</span>
              <Badge>Kikapcsolva</Badge>
            </div>
          </div>
        </Panel>
        <Panel title="Vállalati kiadás következő kapui">
          <div className="key-value-list">
            {[
              "Szerveroldali tenant- és cégszűrés",
              "SSO / MFA és szerepköralapú jogosultság",
              "Tranzakciós hitelkeret-foglalás",
              "Privát fájltár és kártevőellenőrzés",
              "Megváltoztathatatlan szerveroldali audit",
              "Mentés-visszaállítás és terhelésvizsgálat",
            ].map((s) => (
              <div key={s}>
                <span>{s}</span>
                <Badge tone="amber">Tervezett</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Notice>
        A demó adatai az adott böngészőben maradnak; a böngészőadatok törlése
        eltávolítja őket. Éles üzleti vagy személyes adatot csak a központi
        biztonsági réteg elkészülte után használjunk.
      </Notice>
      <Panel
        title="Eseménynapló"
        actions={
          <button
            className="text-link"
            onClick={() =>
              exportCsv("esemenynaplo.csv", [
                ["Idő", "Művelet", "Entitás", "Felhasználó"],
                ...state.audit.map((a) => [a.at, a.action, a.entity, a.actor]),
              ])
            }
          >
            Export <Icon name="download" size={14} />
          </button>
        }
      >
        <Table
          headers={["Időpont", "Művelet", "Kapcsolódó adat", "Felhasználó"]}
        >
          {state.audit.slice(0, 50).map((a) => (
            <tr key={a.id}>
              <td>
                {new Date(a.at).toLocaleString("hu-HU", {
                  timeZone: "Europe/Budapest",
                })}
              </td>
              <td className="cell-title">{a.action}</td>
              <td className="truncate-cell">{a.entity}</td>
              <td>{a.actor}</td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="spaced" />
      <Panel title="PDF-követelmények · modultérkép">
        <Table headers={["Követelménycsoport", "Modul", "Állapot"]}>
          {modules
            .filter((m) => m.key !== "overview" && m.key !== "settings")
            .map((m) => (
              <tr key={m.key}>
                <td>{m.ref}. fejezet</td>
                <td>{m.title}</td>
                <td>
                  <Badge tone="green">Helyi munkafolyamat</Badge>
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
    </>
  );
}
