"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "./ui/icon";

export function AuthScreen({
  needsSetup,
  onAuthenticated,
}: {
  needsSetup: boolean;
  onAuthenticated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const payload = {
        email: String(form.get("email")),
        password: String(form.get("password")),
        ...(needsSetup
          ? {
              name: String(form.get("name")),
              workspaceName: String(form.get("workspaceName")),
              sampleData: form.get("sampleData") === "on",
            }
          : {}),
      };
      const response = await fetch(
        needsSetup ? "/api/auth/setup" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "A bejelentkezés nem sikerült.");
      await onAuthenticated();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Nem érhető el a szerver.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a
          className="auth-brand"
          href="https://www.tesotter.com"
          target="_blank"
          rel="noreferrer"
        >
          TESOTTER<span>®</span>
        </a>
        <div className="auth-story-body">
          <p className="auth-eyebrow">A LOGISZTIKA KÖVETKEZŐ LÉPÉSE</p>
          <h1>
            Minden út.
            <br />
            Egy kézben<span>.</span>
          </h1>
          <p>
            Fuvarok, emberek és döntések.
            <br />
            Egy összekapcsolt munkatérben.
          </p>
          <div className="auth-route">
            <span>
              <i /> Megbízás
            </span>
            <span className="auth-route-line" />
            <Icon name="truck" size={25} />
            <span className="auth-route-line" />
            <span>
              <i /> Teljesítés
            </span>
          </div>
          <div className="auth-features">
            <span>
              <Icon name="orders" size={18} /> Átlátható operáció
            </span>
            <span>
              <Icon name="shield" size={18} /> Szerepköralapú hozzáférés
            </span>
            <span>
              <Icon name="building" size={18} /> Cégcsoportszintű nézet
            </span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>tessTMS · Transportation Management</span>
          <span>Built for the road. Designed for you.</span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-product">
            tess<span>TMS</span>
            <b>WORKSPACE</b>
          </div>
          <p className="auth-form-eyebrow">
            {needsSetup ? "INDULJUNK EL" : "ÜDV ÚJRA A FEDÉLZETEN"}
          </p>
          <h2>
            {needsSetup ? "A munkatered itt kezdődik." : "Jó újra itt látni."}
          </h2>
          <p className="auth-description">
            {needsSetup
              ? "Hozd létre az első adminisztrátori fiókot és állítsd be a saját tessTMS környezetedet."
              : "Jelentkezz be, és folytasd ott, ahol a csapatod tart."}
          </p>
          <form onSubmit={submit} className="auth-form">
            {needsSetup ? (
              <>
                <label>
                  Teljes név
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Hogyan szólíthatunk?"
                  />
                </label>
                <label>
                  Munkatér neve
                  <input
                    name="workspaceName"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Vállalkozásod neve"
                  />
                </label>
              </>
            ) : null}
            <label>
              E-mail-cím
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                placeholder="nev@vallalkozas.hu"
              />
            </label>
            <label>
              Jelszó
              <input
                name="password"
                type="password"
                autoComplete={needsSetup ? "new-password" : "current-password"}
                required
                minLength={needsSetup ? 12 : 1}
                maxLength={128}
                placeholder={
                  needsSetup ? "Legalább 12 karakter" : "A fiókod jelszava"
                }
              />
            </label>
            {needsSetup ? (
              <label className="auth-checkbox">
                <input type="checkbox" name="sampleData" defaultChecked />
                <span>
                  Mintaadatokkal indítom a munkateret
                  <small>
                    Bemutató fuvarok és erőforrások a kipróbáláshoz.
                  </small>
                </span>
              </label>
            ) : null}
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="auth-submit" disabled={busy}>
              {busy
                ? "Kapcsolódás…"
                : needsSetup
                  ? "Munkatér létrehozása"
                  : "Belépés a munkatérbe"}
              <Icon name="arrow" size={19} />
            </button>
          </form>
          <p className="auth-security">
            <Icon name="shield" size={15} /> Védett hozzáférés · Saját vállalati
            környezet
          </p>
          <a
            className="auth-home-link"
            href="https://www.tesotter.com"
            target="_blank"
            rel="noreferrer"
          >
            Ismerd meg a Tesotter ökoszisztémát <Icon name="arrow" size={14} />
          </a>
        </div>
        <footer>
          © {new Date().getFullYear()} Tesotter. Minden kilométer számít.
        </footer>
      </section>
    </main>
  );
}
