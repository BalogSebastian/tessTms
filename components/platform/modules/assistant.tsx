"use client";
import Link from "next/link";
import { useState } from "react";
import { useTms } from "../store";
import { money, sumRevenue, sumCost } from "../../../lib/tms/model";
import { PageTitle } from "../ui/page-title";
import { Panel, Badge } from "../ui/primitives";
import { Icon } from "../ui/icon";
type Answer = { question: string; text: string; href: string; label: string };
export default function Assistant() {
  const { state, orders } = useTms();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Answer[]>([]);
  function ask(question: string) {
    const q = question.toLowerCase();
    let text =
      "A munkatér megbízásokra, fedezetre, dokumentumokra, flottára és incidensekre tud válaszolni. Válassz egy témát, vagy használd a bal oldali modulokat.";
    let href = "/orders",
      label = "Fuvarok megnyitása";
    if (/fedezet|profit|bevétel|eredmény/.test(q)) {
      text = `A nyilvántartott fuvarok árbevétele ${money(sumRevenue(orders))}, költségük ${money(sumCost(orders))}, fedezetük ${money(sumRevenue(orders) - sumCost(orders))}. Az EUR átváltás demóárfolyamon történik.`;
      href = "/finance";
      label = "Pénzügyi részletek";
    } else if (/cmr|dokumentum|papír/.test(q)) {
      const missing = orders.filter(
        (o) =>
          ["Dokumentáció", "Lezárva"].includes(o.status) &&
          !state.documents.some((d) => d.orderId === o.id && d.type === "CMR"),
      );
      text = missing.length
        ? `Hiányzó CMR: ${missing.map((o) => o.reference).join(", ")}. A CMR beérkezése szükséges a lezáráshoz.`
        : "A teljesítési szakaszban lévő fuvarokhoz minden CMR beérkezett.";
      href = "/documents";
      label = "Dokumentumok ellenőrzése";
    } else if (/sofőr|vezetés|flotta|jármű/.test(q)) {
      const drivers = state.drivers.filter((d) => d.drivingMinutes < 60);
      text = `${state.vehicles.length} jármű és ${state.drivers.length} sofőr szerepel a mintatörzsben. ${drivers.length ? drivers.map((d) => `${d.name}: ${d.drivingMinutes} perc vezetési tartalék`).join("; ") : "Minden sofőr vezetési tartaléka a demóküszöb felett van."}`;
      href = "/fleet";
      label = "Flottanézet";
    } else if (/kioszt|szabad|fuvar|feladat/.test(q)) {
      const list = orders.filter((o) => !o.vehicleId);
      text = `${list.length} fuvar vár kiosztásra: ${list.map((o) => o.reference).join(", ") || "nincs"}. A kapacitástáblában ellenőrizheted a járművek megfelelőségét.`;
      href = "/dispatch";
      label = "Diszponálás";
    } else if (/incidens|probléma|késés|riaszt/.test(q)) {
      text = `${state.incidents.filter((i) => i.status === "Nyitott").length} nyitott műveleti incidens szerepel a nyilvántartásban.`;
      href = "/damage";
      label = "Incidensek";
    }
    setHistory((h) => [...h, { question, text, href, label }]);
    setInput("");
  }
  return (
    <>
      <PageTitle
        title="Tess asszisztens"
        description="Közvetlen válaszok a helyi munkatér aktuális adataiból."
      >
        <Badge tone="blue">Szabályalapú demó · nincs LLM-kapcsolat</Badge>
      </PageTitle>
      <Panel title="Miben segíthetek?">
        <div className="assistant-intro">
          <span>
            <Icon name="sparkles" size={32} />
          </span>
          <h2>A működésed, érthetően.</h2>
          <p>
            Kérdezz a fuvarokról, fedezetről vagy a hiányzó dokumentumokról.
          </p>
          <div className="suggestion-chips">
            {[
              "Mennyi az összes fedezet?",
              "Mely fuvarok várnak kiosztásra?",
              "Hol hiányzik CMR?",
              "Mennyi a sofőrök vezetési tartaléka?",
            ].map((q) => (
              <button className="button" key={q} onClick={() => ask(q)}>
                {q}
                <Icon name="arrow" size={13} />
              </button>
            ))}
          </div>
        </div>
        <div className="assistant-conversation">
          {history.map((h, i) => (
            <div key={i}>
              <div className="user-question">{h.question}</div>
              <div className="assistant-answer">
                <Icon name="sparkles" />
                <div>
                  <p>{h.text}</p>
                  <Link className="text-link" href={h.href}>
                    {h.label} <Icon name="arrow" size={14} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        <form
          className="assistant-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) ask(input.trim());
          }}
        >
          <input
            aria-label="Kérdés az asszisztensnek"
            placeholder="Kérdezz a munkatér adatairól…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            className="button primary"
            disabled={!input.trim()}
            aria-label="Kérdés elküldése"
          >
            <Icon name="send" size={17} />
          </button>
        </form>
      </Panel>
    </>
  );
}
