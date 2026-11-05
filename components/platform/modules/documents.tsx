"use client";
import { useState } from "react";
import { useTms } from "../store";
import { uid, type Doc } from "../../../lib/tms/model";
import { saveFile, downloadFile } from "../../../lib/tms/files";
import { PageTitle } from "../ui/page-title";
import { Panel, Table, Badge, Modal, Field, Empty } from "../ui/primitives";
import { Icon } from "../ui/icon";
export default function Documents() {
  const { state, orders, mutateAsync, notify } = useTms();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [orderId, setOrder] = useState(orders[0]?.id || "");
  const [type, setType] = useState<Doc["type"]>("CMR");
  const [busy, setBusy] = useState(false);
  const visible = state.documents.filter(
    (d) =>
      orders.some((o) => o.id === d.orderId) &&
      `${d.name} ${d.type} ${state.orders.find((o) => o.id === d.orderId)?.reference}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function submit() {
    if (!file || !orderId) return;
    setBusy(true);
    try {
      const id = uid();
      await saveFile(file, id);
      if (
        await mutateAsync("Dokumentum csatolva", file.name, (d) => {
          const version =
            d.documents.filter((x) => x.orderId === orderId && x.type === type)
              .length + 1;
          d.documents.unshift({
            id,
            blobId: id,
            orderId,
            type,
            name: file.name,
            createdAt: new Date().toISOString(),
            version,
          });
        })
      )
        setOpen(false);
    } catch (e) {
      notify(String(e), true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Dokumentumtár"
        description="Fuvarokmányok, verziók és azonnal látható dokumentumhiányok."
      >
        <button className="button primary" onClick={() => setOpen(true)}>
          <Icon name="import" size={16} />
          Dokumentum feltöltése
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Icon name="search" size={17} />
          <input
            aria-label="Dokumentum keresése"
            placeholder="Fájlnév, típus vagy fuvarszám…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Badge>{visible.length} dokumentum</Badge>
      </div>
      <Panel title="Fuvarokhoz kapcsolt dokumentumok">
        <Table
          headers={[
            "Dokumentum",
            "Fuvar",
            "Típus",
            "Verzió",
            "Dátum",
            "Letöltés",
          ]}
        >
          {visible.map((d) => (
            <tr key={d.id}>
              <td>
                <span className="file-cell">
                  <Icon name="invoice" />
                  {d.name}
                </span>
              </td>
              <td>{state.orders.find((o) => o.id === d.orderId)?.reference}</td>
              <td>
                <Badge tone="blue">{d.type}</Badge>
              </td>
              <td>v{d.version}</td>
              <td>{new Date(d.createdAt).toLocaleDateString("hu-HU")}</td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={`${d.name} letöltése`}
                  disabled={!d.blobId}
                  title={
                    d.blobId ? "Letöltés" : "Mintarekord, nincs fájltartalom"
                  }
                  onClick={async () => {
                    try {
                      await downloadFile(d.blobId!, d.name);
                    } catch (e) {
                      notify(String(e), true);
                    }
                  }}
                >
                  <Icon name="download" size={17} />
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {!visible.length ? <Empty /> : null}
      </Panel>
      <div className="spaced" />
      <Panel title="Bizonylati hiánymátrix">
        <Table headers={["Fuvar", "Státusz", "Megbízás", "CMR", "Mázsajegy"]}>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="cell-title">{o.reference}</td>
              <td>{o.status}</td>
              {(["Megbízás", "CMR", "Mázsajegy"] as const).map((t) => (
                <td key={t}>
                  <Badge
                    tone={
                      state.documents.some(
                        (d) => d.orderId === o.id && d.type === t,
                      )
                        ? "green"
                        : "amber"
                    }
                  >
                    {state.documents.some(
                      (d) => d.orderId === o.id && d.type === t,
                    )
                      ? "Megérkezett"
                      : "Hiányzik"}
                  </Badge>
                </td>
              ))}
            </tr>
          ))}
        </Table>
      </Panel>
      {open ? (
        <Modal title="Dokumentum csatolása" onClose={() => setOpen(false)}>
          <div className="modal-body stack">
            <Field label="Kapcsolódó fuvar">
              <select
                value={orderId}
                onChange={(e) => setOrder(e.target.value)}
              >
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.reference}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Dokumentum típusa">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Doc["type"])}
              >
                {["Megbízás", "CMR", "Mázsajegy", "Számla"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <label className="upload-zone">
              <Icon name="import" size={28} />
              <strong>{file?.name || "Válassz fájlt"}</strong>
              <span>PDF vagy kép · max. 20 MB · Védett szerveroldali fájltár</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>
          <footer className="modal-actions">
            <button
              className="button primary"
              disabled={!file || !orderId || busy}
              onClick={submit}
            >
              {busy ? "Mentés…" : "Feltöltés és kapcsolás"}
            </button>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}
