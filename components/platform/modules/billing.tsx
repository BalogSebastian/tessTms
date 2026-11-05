"use client";
import { useState } from "react";
import { useTms } from "../store";
import { money, uid } from "../../../lib/tms/model";
import { invoiceError } from "../../../lib/tms/rules";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, StatusBadge, Notice, Empty } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Billing() {
  const { state, orders, mutate } = useTms();
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = orders.filter(
    (o) =>
      o.status === "Lezárva" &&
      !state.invoices.some(
        (i) => i.status !== "Sztornó" && i.orderIds.includes(o.id),
      ),
  );
  function prepare() {
    mutate("Számlaelőkészítés létrehozva", "Gyűjtőszámla", (d) => {
      const err = invoiceError(d, selected);
      if (err) throw new Error(err);
      const list = d.orders.filter((o) => selected.includes(o.id));
      d.invoices.unshift({
        id: `ELŐ-${uid().slice(0, 8).toUpperCase()}`,
        orderIds: [...selected],
        companyId: list[0].companyId,
        partnerId: list[0].partnerId,
        amount: list.reduce((s, o) => s + o.price, 0),
        currency: list[0].currency,
        status: "Előkészítve",
        createdAt: new Date().toISOString(),
      });
    });
    setSelected([]);
  }
  return (
    <>
      <PageTitle
        title="Számlaelőkészítés"
        description="Lezárt fuvarok ellenőrzése, gyűjtés és jóváhagyás."
      >
        <button
          className="button primary"
          disabled={!selected.length}
          onClick={prepare}
        >
          <Icon name="invoice" size={16} />
          Előkészítés ({selected.length})
        </button>
      </PageTitle>
      <Notice>
        A modul számlázási adatcsomagot készít. Jogi értelemben vett
        számlakiállítás és NAV-adatszolgáltatás nincs bekötve.
      </Notice>
      <Panel title="Számlázható fuvarok">
        <Table headers={["Kijelölés", "Fuvar", "Partner", "Díj", "Státusz"]}>
          {eligible.map((o) => (
            <tr key={o.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`${o.reference} kijelölése`}
                  checked={selected.includes(o.id)}
                  onChange={(e) =>
                    setSelected((x) =>
                      e.target.checked
                        ? [...x, o.id]
                        : x.filter((id) => id !== o.id),
                    )
                  }
                />
              </td>
              <td className="cell-title">{o.reference}</td>
              <td>{state.partners.find((p) => p.id === o.partnerId)?.name}</td>
              <td>{money(o.price, o.currency)}</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
            </tr>
          ))}
        </Table>
        {!eligible.length ? (
          <Empty
            title="Nincs új számlázható fuvar."
            text="A lezárás és a CMR beérkezése után itt folytathatod."
          />
        ) : null}
      </Panel>
      <div className="spaced" />
      <Panel title="Előkészítések és bizonylati lánc">
        <Table
          headers={[
            "Előkészítés",
            "Partner",
            "Fuvarok",
            "Összeg",
            "Állapot",
            "Művelet",
          ]}
        >
          {state.invoices
            .filter((i) => orders.some((o) => i.orderIds.includes(o.id)))
            .map((i) => (
              <tr key={i.id}>
                <td className="cell-title">{i.id}</td>
                <td>
                  {state.partners.find((p) => p.id === i.partnerId)?.name}
                </td>
                <td>{i.orderIds.length} fuvar</td>
                <td>{money(i.amount, i.currency)}</td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
                <td>
                  {i.status === "Előkészítve" ? (
                    <button
                      className="button small"
                      onClick={() =>
                        mutate("Előkészítés jóváhagyva", i.id, (d) => {
                          d.invoices.find((x) => x.id === i.id)!.status =
                            "Jóváhagyva";
                          d.outbox.push({
                            id: uid(),
                            invoiceId: i.id,
                            status: "Várakozik",
                            attempts: 0,
                            error: "",
                          });
                        })
                      }
                    >
                      Jóváhagyás
                    </button>
                  ) : i.status === "Jóváhagyva" ? (
                    <button
                      className="button small"
                      onClick={() =>
                        mutate("Előkészítés visszavonva", i.id, (d) => {
                          d.invoices.find((x) => x.id === i.id)!.status =
                            "Sztornó";
                          d.outbox = d.outbox.filter(
                            (x) => x.invoiceId !== i.id,
                          );
                        })
                      }
                    >
                      Visszavonás
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
        </Table>
      </Panel>
    </>
  );
}
