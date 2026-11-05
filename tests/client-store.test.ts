import test from "node:test";
import assert from "node:assert/strict";
import {
  createClientStore,
  type Workspace,
  type WorkspaceRequest,
} from "../lib/tms/client-store";
import { seed } from "../lib/tms/seed";

function workspace(revision: number, marker: string): Workspace {
  const state = structuredClone(seed);
  state.orders[0].notes = marker;
  state.audit = [
    {
      id: `server-audit-${revision}`,
      action: marker,
      entity: "order-1",
      at: "2026-11-05T12:00:00Z",
      actor: "Hiteles szerverfelhasználó",
    },
  ];
  return { revision, state };
}
interface PendingRequest {
  url: string;
  init?: RequestInit;
  resolve: (value: Workspace) => void;
  reject: (error: Error) => void;
}
function network() {
  const pending: PendingRequest[] = [];
  const waiting: ((request: PendingRequest) => void)[] = [];
  const history: PendingRequest[] = [];
  const request: WorkspaceRequest = (url, init) =>
    new Promise<Workspace>((resolve, reject) => {
      const call = { url, init, resolve, reject };
      history.push(call);
      const receiver = waiting.shift();
      if (receiver) receiver(call);
      else pending.push(call);
    });
  const next = (): Promise<PendingRequest> => {
    const call = pending.shift();
    return call
      ? Promise.resolve(call)
      : new Promise((resolve) => waiting.push(resolve));
  };
  return { request, next, history };
}

test("a commit előtt indult késői GET nem írhatja felül a már mentett új állapotot", async () => {
  const remote = network();
  const store = createClientStore(workspace(1, "kezdeti"), remote.request);
  const refresh = store.refresh();
  const delayedGet = await remote.next();
  const commit = store.commit("Fuvar módosítva", "order-1", (draft) => {
    draft.orders[0].notes = "szerkesztett";
  });
  const put = await remote.next();
  assert.equal(put.init?.method, "PUT");
  assert.equal(JSON.parse(String(put.init?.body)).revision, 1);
  put.resolve(workspace(2, "szerver által mentett"));
  await commit;
  delayedGet.resolve(workspace(1, "régi GET"));
  await refresh;
  assert.equal(store.snapshot().revision, 2);
  assert.equal(store.snapshot().state.orders[0].notes, "szerver által mentett");
  assert.equal(store.snapshot().saving, false);
});

test("a fordított sorrendben érkező frissítések revíziója nem léphet vissza", async () => {
  const remote = network();
  const store = createClientStore(workspace(1, "kezdeti"), remote.request);
  const firstRefresh = store.refresh();
  const first = await remote.next();
  const secondRefresh = store.refresh();
  const second = await remote.next();
  second.resolve(workspace(3, "legújabb"));
  await secondRefresh;
  first.resolve(workspace(2, "korábbi"));
  await firstRefresh;
  assert.equal(store.snapshot().revision, 3);
  assert.equal(store.snapshot().state.orders[0].notes, "legújabb");
});

test("a sikertelen PUT utáni helyreállítás végéig zárolt a következő mentés", async () => {
  const remote = network();
  const store = createClientStore(workspace(5, "megerősített"), remote.request);
  const commit = store.commit("Módosítás", "order-1", (draft) => {
    draft.orders[0].notes = "optimista";
  });
  const rejected = assert.rejects(commit, /verzióütközés/);
  const put = await remote.next();
  put.reject(new Error("verzióütközés"));
  const recovery = await remote.next();
  assert.equal(recovery.init?.method, undefined);
  assert.equal(store.snapshot().saving, true);
  assert.throws(
    () => store.commit("Második mentés", "order-1", () => {}),
    /mentése folyamatban/,
  );
  const requestsBeforeRefresh = remote.history.length;
  await store.refresh();
  assert.equal(
    remote.history.length,
    requestsBeforeRefresh,
    "helyreállítás közben nem indulhat párhuzamos frissítés",
  );
  recovery.resolve(workspace(6, "másik felhasználó mentése"));
  await rejected;
  assert.equal(store.snapshot().saving, false);
  assert.equal(store.snapshot().revision, 6);
  assert.equal(
    store.snapshot().state.orders[0].notes,
    "másik felhasználó mentése",
  );
  const retry = store.commit("Újrapróbálás", "order-1", (draft) => {
    draft.orders[0].notes = "új kísérlet";
  });
  const retryPut = await remote.next();
  assert.equal(JSON.parse(String(retryPut.init?.body)).revision, 6);
  retryPut.resolve(workspace(7, "új kísérlet mentve"));
  await retry;
  assert.equal(store.snapshot().revision, 7);
});

test("a sikeres mentést és auditot a szerver megerősített válasza adja", async () => {
  const remote = network();
  const initial = workspace(8, "kezdeti audit");
  const store = createClientStore(initial, remote.request);
  const notifications: { saving: boolean; revision: number; action: string }[] =
    [];
  const unsubscribe = store.subscribe(() => {
    const view = store.snapshot();
    notifications.push({
      saving: view.saving,
      revision: view.revision,
      action: view.state.audit[0].action,
    });
  });
  const commit = store.commit("Kliens művelet", "order-1", (draft) => {
    draft.orders[0].notes = "optimista szöveg";
  });
  assert.equal(store.snapshot().saving, true);
  assert.deepEqual(
    store.snapshot().state.audit,
    initial.state.audit,
    "a kliens nem találhat ki sikeres szerverauditot",
  );
  const put = await remote.next();
  put.resolve(workspace(9, "szerver által auditált művelet"));
  await commit;
  assert.equal(store.snapshot().state.audit[0].id, "server-audit-9");
  assert.equal(
    store.snapshot().state.audit[0].actor,
    "Hiteles szerverfelhasználó",
  );
  assert.equal(
    store.snapshot().state.orders[0].notes,
    "szerver által auditált művelet",
  );
  assert.deepEqual(notifications, [
    { saving: true, revision: 8, action: "kezdeti audit" },
    { saving: false, revision: 9, action: "szerver által auditált művelet" },
  ]);
  unsubscribe();
});

test("ha a helyreállító GET is hibás, az utolsó megerősített állapot marad meg", async () => {
  const remote = network();
  const initial = workspace(10, "utolsó biztos adat");
  const store = createClientStore(initial, remote.request);
  const commit = store.commit("Nem menthető", "order-1", (draft) => {
    draft.orders[0].notes = "nem megerősített";
  });
  const rejected = assert.rejects(commit, /PUT hálózati hiba/);
  const put = await remote.next();
  put.reject(new Error("PUT hálózati hiba"));
  const recovery = await remote.next();
  recovery.reject(new Error("GET hálózati hiba"));
  await rejected;
  assert.equal(store.snapshot().saving, false);
  assert.equal(store.snapshot().revision, 10);
  assert.equal(store.snapshot().state.orders[0].notes, "utolsó biztos adat");
  assert.deepEqual(store.snapshot().state.audit, initial.state.audit);
});
