"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  type TmsState,
  type CompanyId,
  type Company,
  type Order,
  type Status,
  uid,
  companies as defaultCompanies,
} from "../../lib/tms/model";
import {
  assignmentError,
  transitionError,
  validateOrder,
} from "../../lib/tms/rules";
import { AuthScreen } from "./auth-screen";
import { createClientStore, type Workspace } from "../../lib/tms/client-store";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "dispatcher" | "finance" | "viewer";
  workspaceId: string;
  workspaceName: string;
}
export const roleLabels = {
  admin: "Adminisztrátor",
  dispatcher: "Diszpécser",
  finance: "Pénzügy",
  viewer: "Megtekintő",
};
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      !url.startsWith("/api/auth/") &&
      typeof window !== "undefined"
    )
      window.dispatchEvent(new Event("tms-session-expired"));
    throw new RequestError(
      data.error || `A kérés sikertelen (${response.status}).`,
      response.status,
    );
  }
  return data as T;
}
async function fetchSession() {
  const result = await api<{ user: SessionUser | null; needsSetup: boolean }>(
    "/api/session",
  );
  let workspace: Workspace | undefined;
  try {
    workspace = result.user
      ? await api<Workspace>("/api/workspace")
      : undefined;
  } catch (error) {
    if (error instanceof RequestError && error.status === 401)
      return { user: null, needsSetup: false, workspace: undefined };
    throw error;
  }
  return { ...result, workspace };
}
const makeStore = (initial: Workspace) => createClientStore(initial, api);

type Update = (draft: TmsState) => void;
interface TmsContextValue {
  companies: Company[];
  state: TmsState;
  user: SessionUser;
  revision: number;
  isSaving: boolean;
  lastSynced: string;
  companyId: CompanyId | "all";
  setCompanyId: (value: CompanyId | "all") => void;
  orders: Order[];
  mutate: (action: string, entity: string, update: Update) => boolean;
  mutateAsync: (
    action: string,
    entity: string,
    update: Update,
  ) => Promise<boolean>;
  notify: (text: string, error?: boolean) => void;
  saveOrder: (order: Order) => boolean;
  saveOrderAsync: (order: Order) => Promise<boolean>;
  assign: (id: string, vehicleId: string) => boolean;
  transition: (id: string, next: Status) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const Context = createContext<TmsContextValue | null>(null);
function ConnectedProvider({
  initial,
  user,
  onLogout,
  children,
}: {
  initial: Workspace;
  user: SessionUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [store] = useState(() => makeStore(initial));
  const view = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot,
  );
  const { state } = view;
  const [companyId, setCompanyId] = useState<CompanyId | "all">("all");
  const [toast, setToast] = useState<{
    text: string;
    error: boolean;
    id: string;
  } | null>(null);
  function notify(text: string, error = false) {
    const id = uid();
    setToast({ text, error, id });
    setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      6500,
    );
  }
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        void store.refresh().catch(() => {});
    };
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [store]);
  useEffect(() => {
    if (!view.saving) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [view.saving]);
  function start(action: string, entity: string, update: Update) {
    if (user.role === "viewer")
      throw new Error(
        "Megtekintőként az adatok olvashatók. Módosításhoz kérj másik szerepkört.",
      );
    return store.commit(action, entity, update);
  }
  async function mutateAsync(action: string, entity: string, update: Update) {
    try {
      await start(action, entity, update);
      notify(action);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "A módosítást nem sikerült menteni.",
        true,
      );
      return false;
    }
  }
  function mutate(action: string, entity: string, update: Update) {
    try {
      void start(action, entity, update)
        .then(() => notify(action))
        .catch((error: unknown) =>
          notify(
            error instanceof Error ? error.message : "Mentési hiba.",
            true,
          ),
        );
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Mentési hiba.", true);
      return false;
    }
  }
  function orderUpdate(order: Order): Update {
    return (draft) => {
      const errors = validateOrder(draft, order);
      if (errors.length) throw new Error(errors[0]);
      const old = draft.orders.find((item) => item.id === order.id);
      if (old) Object.assign(old, order);
      else draft.orders.unshift(order);
    };
  }
  function assign(id: string, vehicleId: string) {
    return mutate("Erőforrás kiosztva", id, (draft) => {
      const order = draft.orders.find((item) => item.id === id);
      if (!order) throw new Error("A fuvar nem található.");
      if (!["Új", "Tervezett", "Kiosztva"].includes(order.status))
        throw new Error("A folyamatban lévő fuvar nem osztható át itt.");
      const error = assignmentError(draft, order, vehicleId);
      if (error) throw new Error(error);
      const vehicle = draft.vehicles.find((item) => item.id === vehicleId)!;
      Object.assign(order, {
        vehicleId,
        driverId: vehicle.driverId,
        trailer: vehicle.trailer,
        status: "Kiosztva",
      });
    });
  }
  function transition(id: string, next: Status) {
    return mutate("Fuvarstátusz frissítve", id, (draft) => {
      const order = draft.orders.find((item) => item.id === id);
      if (!order) throw new Error("A fuvar nem található.");
      const error = transitionError(draft, order, next);
      if (error) throw new Error(error);
      order.status = next;
    });
  }
  async function logout() {
    if (view.saving) {
      notify("A kijelentkezés előtt várd meg a mentést.", true);
      return;
    }
    try {
      await api("/api/auth/logout", { method: "POST" });
      onLogout();
    } catch (error) {
      notify(String(error), true);
    }
  }
  return (
    <Context.Provider
      value={{
        companies: state.companies ?? defaultCompanies,
        state,
        user,
        revision: view.revision,
        isSaving: view.saving,
        lastSynced: view.lastSynced,
        companyId,
        setCompanyId,
        orders: state.orders.filter(
          (order) => companyId === "all" || order.companyId === companyId,
        ),
        mutate,
        mutateAsync,
        notify,
        saveOrder: (order) =>
          mutate("Fuvarmegbízás mentve", order.reference, orderUpdate(order)),
        saveOrderAsync: (order) =>
          mutateAsync(
            "Fuvarmegbízás mentve",
            order.reference,
            orderUpdate(order),
          ),
        assign,
        transition,
        refresh: store.refresh,
        logout,
      }}
    >
      {children}
      {toast ? (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          <span>{toast.error ? "!" : "✓"}</span>
          {toast.text}
          <button
            aria-label="Értesítés bezárása"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </Context.Provider>
  );
}
export function TmsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{
    user: SessionUser | null;
    needsSetup: boolean;
    workspace?: Workspace;
  } | null>(null);
  const [error, setError] = useState("");
  async function load() {
    try {
      setSession(await fetchSession());
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Nem érhető el a szerver.",
      );
    }
  }
  useEffect(() => {
    let mounted = true;
    const expired = () => {
      setError("");
      setSession({ user: null, needsSetup: false });
    };
    window.addEventListener("tms-session-expired", expired);
    void fetchSession()
      .then((result) => {
        if (mounted) setSession(result);
      })
      .catch((failure: unknown) => {
        if (mounted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Nem érhető el a szerver.",
          );
      });
    return () => {
      mounted = false;
      window.removeEventListener("tms-session-expired", expired);
    };
  }, []);
  if (error)
    return (
      <div className="auth-loading">
        <strong>A munkatér nem tölthető be</strong>
        <p role="alert">{error}</p>
        <button
          className="button primary"
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Újrapróbálás
        </button>
      </div>
    );
  if (!session)
    return (
      <div className="auth-loading">
        <span className="auth-loader" />
        <strong>tessTMS</strong>
        <p>A munkatér betöltése…</p>
      </div>
    );
  if (!session.user || !session.workspace)
    return (
      <AuthScreen needsSetup={session.needsSetup} onAuthenticated={load} />
    );
  return (
    <ConnectedProvider
      key={session.user.id}
      initial={session.workspace}
      user={session.user}
      onLogout={() => setSession({ user: null, needsSetup: false })}
    >
      {children}
    </ConnectedProvider>
  );
}
export function useTms() {
  const context = useContext(Context);
  if (!context) throw new Error("A TMS szolgáltató hiányzik.");
  return context;
}
