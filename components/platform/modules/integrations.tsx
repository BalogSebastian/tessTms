"use client";
import { useEffect, useState } from "react";
import { api, useTms } from "../store";
import { PageTitle } from "../ui/page-title";
import {
  Panel,
  Table,
  Badge,
  Notice,
  Modal,
  Field,
  Empty,
} from "../ui/primitives";
import { Icon } from "../ui/icon";
import { uid } from "../../../lib/tms/model";

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  configured: boolean;
  requiredEnv: string[];
  capability: string;
  status: "configured" | "not_configured" | "contract_required";
}
const icons: Record<string, string> = {
  here: "map",
  google: "route",
  scanr: "scan",
  sap: "building",
  transporeon: "truck",
  project44: "map",
  smtp: "send",
  webhook: "plug",
};
export default function Integrations() {
  const { state, user, notify, mutateAsync } = useTms();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Integration | null>(null);
  const [filter, setFilter] = useState("Mind");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    checkedAt: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<{
    provider: string;
    kilometers: number;
    minutes: number;
    truckRestrictionsApplied: boolean;
    from: string;
    to: string;
    notice: string;
  } | null>(null);
  async function load() {
    try {
      const data = await api<{ integrations: Integration[] }>(
        "/api/integrations",
      );
      setIntegrations(data.integrations);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Kapcsolódási hiba.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    void api<{ integrations: Integration[] }>("/api/integrations")
      .then((data) => {
        if (mounted) setIntegrations(data.integrations);
      })
      .catch((failure: unknown) => {
        if (mounted)
          setError(
            failure instanceof Error ? failure.message : "Kapcsolódási hiba.",
          );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  async function test(id: string) {
    setBusy(id);
    setResult(null);
    try {
      const data = await api<{
        ok: boolean;
        message: string;
        checkedAt: string;
      }>("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setResult(data);
      notify(data.message, !data.ok);
    } catch (failure) {
      notify(String(failure), true);
    } finally {
      setBusy("");
    }
  }
  const categories = [
    "Mind",
    ...new Set(integrations.map((integration) => integration.category)),
  ];
  return (
    <>
      <PageTitle
        title="Minden rendszer. Egy közös nyelv."
        description="Útvonaltervezés, dokumentumok és vállalatirányítás összekapcsolva."
        eyebrow="INTEGRÁCIÓS KÖZPONT"
      >
        <button
          className="button"
          onClick={() => {
            setError("");
            setLoading(true);
            void load();
          }}
          disabled={loading}
        >
          <Icon name="refresh" size={16} /> Állapot frissítése
        </button>
      </PageTitle>
      <div className="stats-grid three">
        <article className="stat">
          <div className="stat-top">
            <span>Előkészített kapcsolatok</span>
            <Icon name="plug" size={18} />
          </div>
          <strong>{integrations.length || "–"}</strong>
          <p>Egy központból áttekinthető</p>
        </article>
        <article className="stat accent">
          <div className="stat-top">
            <span>Konfigurált szolgáltatások</span>
            <Icon name="check" size={18} />
          </div>
          <strong>
            {
              integrations.filter((integration) => integration.configured)
                .length
            }
          </strong>
          <p>A szolgáltatói teszttel ellenőrizhetők</p>
        </article>
        <article className="stat">
          <div className="stat-top">
            <span>SAP adatcsomagok</span>
            <Icon name="invoice" size={18} />
          </div>
          <strong>{state.outbox.length}</strong>
          <p>Jóváhagyott számlaelőkészítések</p>
        </article>
      </div>
      <Notice>
        A szolgáltatói kulcsokat az üzemeltető állítja be a szerveren, az adott
        munkatérhez kötve. A „konfigurált” állapot a beállítások meglétét
        jelenti; az elérhetőséget a kapcsolatteszt ellenőrzi.
      </Notice>
      <div className="toolbar">
        <div className="tabs">
          {categories.map((category) => (
            <button
              key={category}
              className={filter === category ? "active" : ""}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <Notice tone="warning">
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setLoading(true);
              void load();
            }}
          >
            Újrapróbálás
          </button>
        </Notice>
      ) : null}
      {loading ? (
        <Empty
          title="Kapcsolatok betöltése…"
          text="A szerveroldali konfiguráció ellenőrzése folyamatban."
        />
      ) : (
        <div className="integration-config-grid">
          {integrations
            .filter(
              (integration) =>
                filter === "Mind" || integration.category === filter,
            )
            .map((integration) => (
              <article key={integration.id} className="connection-card">
                <div className="connection-card-head">
                  <span>
                    <Icon name={icons[integration.id] || "plug"} size={23} />
                  </span>
                  <Badge
                    tone={
                      integration.configured
                        ? "green"
                        : integration.status === "contract_required"
                          ? "neutral"
                          : "amber"
                    }
                  >
                    {integration.configured
                      ? "Konfigurált"
                      : integration.status === "contract_required"
                        ? "Egyeztetés szükséges"
                        : "Beállításra vár"}
                  </Badge>
                </div>
                <div>
                  <small>{integration.category}</small>
                  <h3>{integration.name}</h3>
                </div>
                <p>{integration.description}</p>
                <div className="connection-bottom">
                  <small>{integration.capability}</small>
                  <button
                    className="text-link"
                    onClick={() => {
                      setSelected(integration);
                      setResult(null);
                      setRoute(null);
                    }}
                  >
                    Részletek <Icon name="arrow" size={14} />
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      <div className="spaced" />
      <Panel title="SAP B1 · Átadási munkalista" eyebrow="PÉNZÜGYI ADATLÁNC">
        <Notice>
          Az adatcsomagok ellenőrizhetők és exportálhatók. SAP-bizonylat
          feladása a megrendelővel egyeztetett mezőtérkép és jóváhagyás bekötése
          után engedélyezhető.
        </Notice>
        {state.outbox.length ? (
          <Table
            headers={[
              "Csomag",
              "Számlaelőkészítés",
              "Állapot",
              "Próbálkozás",
              "Ellenőrzés",
            ]}
          >
            {state.outbox.map((item) => (
              <tr key={item.id}>
                <td className="cell-title">
                  {item.id.slice(0, 8).toUpperCase()}
                </td>
                <td>{item.invoiceId}</td>
                <td>
                  <Badge
                    tone={
                      item.status === "Tesztelve"
                        ? "green"
                        : item.status === "Hibás"
                          ? "red"
                          : "amber"
                    }
                  >
                    {item.status}
                  </Badge>
                  <small>{item.error}</small>
                </td>
                <td>{item.attempts}</td>
                <td>
                  <button
                    className="button small"
                    disabled={
                      busy !== "" ||
                      user.role === "viewer" ||
                      user.role === "dispatcher"
                    }
                    onClick={async () => {
                      setBusy(item.id);
                      await mutateAsync(
                        "SAP-csomag sémaellenőrzése",
                        item.invoiceId,
                        (draft) => {
                          const current = draft.outbox.find(
                            (row) => row.id === item.id,
                          )!;
                          const invoice = draft.invoices.find(
                            (row) => row.id === item.invoiceId,
                          );
                          current.attempts += 1;
                          current.status =
                            invoice && invoice.status === "Jóváhagyva"
                              ? "Tesztelve"
                              : "Hibás";
                          current.error =
                            current.status === "Hibás"
                              ? "Hiányzó vagy nem jóváhagyott számlaelőkészítés."
                              : "";
                        },
                      );
                      setBusy("");
                    }}
                  >
                    Sémaellenőrzés
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty
            title="Még nincs átadásra előkészített csomag."
            text="A számlaelőkészítés jóváhagyása hozza létre az első csomagot."
          />
        )}
      </Panel>
      {selected ? (
        <Modal
          wide
          title={selected.name}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="modal-body stack">
            <p>{selected.description}</p>
            <div className="connection-detail">
              <strong>Kapcsolat állapota</strong>
              <p>
                {selected.configured
                  ? "A szerver beállításai rendelkezésre állnak ehhez a munkatérhez."
                  : selected.status === "contract_required"
                    ? "Ehhez a kapcsolathoz szolgáltatói API-dokumentáció, hozzáférés és ügyfélspecifikus mezőtérkép szükséges."
                    : "A szolgáltatói hozzáférés még nincs beállítva."}
              </p>
              {selected.requiredEnv.length ? (
                <>
                  <br />
                  <strong>Szerveroldali beállítások</strong>
                  <p>
                    <code>TMS_INTEGRATION_WORKSPACE_ID={user.workspaceId}</code>
                  </p>
                  {selected.requiredEnv
                    .filter((key) => key !== "TMS_INTEGRATION_WORKSPACE_ID")
                    .map((key) => (
                      <p key={key}>
                        <code>{key}</code>
                      </p>
                    ))}
                </>
              ) : null}
            </div>
            {result ? (
              <Notice tone={result.ok ? "info" : "warning"}>
                {result.message} ·{" "}
                {new Date(result.checkedAt).toLocaleString("hu-HU")}
              </Notice>
            ) : null}
            {["here", "google"].includes(selected.id) && selected.configured ? (
              <form
                className="stack"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const values = new FormData(event.currentTarget);
                  setBusy("route");
                  try {
                    const data = await api<NonNullable<typeof route>>(
                      "/api/integrations/route",
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          provider: selected.id,
                          origin: {
                            lat: Number(values.get("fromLat")),
                            lng: Number(values.get("fromLng")),
                          },
                          destination: {
                            lat: Number(values.get("toLat")),
                            lng: Number(values.get("toLng")),
                          },
                          ...(selected.id === "here"
                            ? {
                                truck: Object.fromEntries(
                                  [
                                    "grossWeightKg",
                                    "heightCm",
                                    "widthCm",
                                    "lengthCm",
                                  ]
                                    .filter((key) => values.get(key) !== "")
                                    .map((key) => [
                                      key,
                                      Number(values.get(key)),
                                    ]),
                                ),
                              }
                            : {}),
                        }),
                      },
                    );
                    setRoute({
                      ...data,
                      from: String(values.get("fromName")),
                      to: String(values.get("toName")),
                    });
                  } catch (failure) {
                    notify(String(failure), true);
                  } finally {
                    setBusy("");
                  }
                }}
              >
                <h3>Útvonal számítása</h3>
                <div className="form-grid">
                  <Field label="Indulási hely neve">
                    <input
                      name="fromName"
                      required
                      maxLength={160}
                      defaultValue="Budapest"
                    />
                  </Field>
                  <Field label="Érkezési hely neve">
                    <input
                      name="toName"
                      required
                      maxLength={160}
                      defaultValue="Győr"
                    />
                  </Field>
                </div>
                <div className="form-grid">
                  {[
                    ["fromLat", "Indulás · szélesség", "47.4979"],
                    ["fromLng", "Indulás · hosszúság", "19.0402"],
                    ["toLat", "Érkezés · szélesség", "47.6875"],
                    ["toLng", "Érkezés · hosszúság", "17.6504"],
                  ].map(([name, label, value]) => (
                    <Field key={name} label={label}>
                      <input
                        name={name}
                        type="number"
                        step="any"
                        required
                        defaultValue={value}
                      />
                    </Field>
                  ))}
                </div>
                {selected.id === "here" ? (
                  <>
                    <h3>Járműparaméterek</h3>
                    <div className="form-grid">
                      {[
                        ["grossWeightKg", "Teljes össztömeg (kg)"],
                        ["heightCm", "Magasság (cm)"],
                        ["widthCm", "Szélesség (cm)"],
                        ["lengthCm", "Teljes hossz (cm)"],
                      ].map(([name, label]) => (
                        <Field key={name} label={label}>
                          <input
                            name={name}
                            type="number"
                            min="1"
                            step="any"
                            placeholder="Opcionális"
                          />
                        </Field>
                      ))}
                    </div>
                    <p className="muted">
                      A teljes járműszerelvény méreteit és össztömegét add meg.
                      Az ADR- és AETR-ellenőrzés külön folyamat.
                    </p>
                  </>
                ) : null}
                <button
                  className="button primary"
                  disabled={
                    busy !== "" || !["admin", "dispatcher"].includes(user.role)
                  }
                >
                  Útvonal lekérése
                </button>
                {route ? (
                  <div className="connection-detail">
                    <strong>
                      {route.kilometers.toFixed(1)} km ·{" "}
                      {Math.round(route.minutes)} perc
                    </strong>
                    <p>
                      {route.from} → {route.to}
                    </p>
                    <p>{route.notice}</p>
                    <button
                      type="button"
                      className="text-link"
                      onClick={async () => {
                        await mutateAsync(
                          "Szolgáltatói útvonal mentve",
                          selected.name,
                          (draft) =>
                            draft.routes.unshift({
                              id: uid(),
                              name: `${route.from} → ${route.to} · ${selected.name}`,
                              from: route.from,
                              to: route.to,
                              km: route.kilometers,
                              minutes: route.minutes,
                              toll: 0,
                            }),
                        );
                      }}
                    >
                      Mentés útvonaltervként
                    </button>
                  </div>
                ) : null}
              </form>
            ) : null}
          </div>
          <footer className="modal-actions">
            <button
              className="button"
              disabled={busy !== ""}
              onClick={() => setSelected(null)}
            >
              Bezárás
            </button>
            <button
              className="button primary"
              disabled={
                !selected.configured || busy !== "" || user.role !== "admin"
              }
              onClick={() => void test(selected.id)}
            >
              {busy === selected.id ? "Ellenőrzés…" : "Kapcsolat ellenőrzése"}
            </button>
          </footer>
        </Modal>
      ) : null}
    </>
  );
}
