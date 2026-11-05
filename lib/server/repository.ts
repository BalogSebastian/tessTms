import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { seed } from "../tms/seed";
import type { TmsState } from "../tms/model";
import { ApiError } from "./errors";
import { validateMutation } from "./validation";
import {
  type Role,
  stateSchema,
  setupSchema,
  userSchema,
  userUpdateSchema,
  passwordChangeSchema,
  workspaceSchema,
} from "./schema";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspaceId: string;
  workspaceName: string;
}
type Row = Record<string, string | number | Uint8Array | null>;
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(24).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64, {
    N: 65536,
    r: 8,
    p: 1,
    maxmem: 128 * 1024 * 1024,
  });
  const encoded = Buffer.from(expected, "hex");
  return encoded.length === actual.length && timingSafeEqual(encoded, actual);
}
const dummyHash = hashPassword("constant-time-unregistered-account");
export const SESSION_SECONDS = 60 * 60 * 12;

export class TmsRepository {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, state TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','dispatcher','finance','viewer')), active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL REFERENCES workspaces(id), actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, at TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS files (workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id));
      CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_workspace ON audit_events(workspace_id,sequence DESC);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
    `);
  }
  close() {
    this.db.close();
  }
  needsSetup() {
    return (
      (this.db.prepare("SELECT COUNT(*) AS n FROM users").get() as Row).n === 0
    );
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private event(
    user: SessionUser,
    action: string,
    entity: string,
    revision: number,
  ) {
    this.db
      .prepare(
        "INSERT INTO audit_events(id,workspace_id,actor,action,entity,at,revision) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        randomUUID(),
        user.workspaceId,
        `${user.name} <${user.email}>`,
        action,
        entity,
        new Date().toISOString(),
        revision,
      );
  }
  createWorkspace(input: unknown, firstOnly = false): SessionUser {
    const data = setupSchema.parse(input);
    const hash = hashPassword(data.password);
    return this.transaction(() => {
      if (firstOnly && !this.needsSetup())
        throw new ApiError(
          409,
          "Az első munkatér már létrejött. Jelentkezz be.",
        );
      if (this.db.prepare("SELECT id FROM users WHERE email=?").get(data.email))
        throw new ApiError(409, "Ez az e-mail-cím már foglalt.");
      const state = structuredClone(seed);
      if (!data.sampleData) {
        for (const key of Object.keys(state) as (keyof TmsState)[]) {
          if (key !== "schema" && key !== "companies")
            (state[key] as unknown[]) = [];
        }
        state.companies = [
          {
            id: "main",
            name: data.workspaceName,
            short: data.workspaceName
              .trim()
              .slice(0, 2)
              .toLocaleUpperCase("hu-HU"),
          },
        ];
      }
      state.audit = [];
      const user: SessionUser = {
        id: randomUUID(),
        name: data.name,
        email: data.email,
        role: "admin",
        workspaceId: randomUUID(),
        workspaceName: data.workspaceName,
      };
      this.db
        .prepare(
          "INSERT INTO workspaces(id,name,state,created_at) VALUES(?,?,?,?)",
        )
        .run(
          user.workspaceId,
          user.workspaceName,
          JSON.stringify(state),
          new Date().toISOString(),
        );
      this.db
        .prepare(
          "INSERT INTO users(id,workspace_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)",
        )
        .run(user.id, user.workspaceId, user.name, user.email, hash, user.role);
      this.event(
        user,
        "Munkatér létrehozva",
        data.sampleData ? "Bemutató mintaadatokkal" : "Üres munkatér",
        0,
      );
      return user;
    });
  }
  private readUser(row: Row): SessionUser {
    return {
      id: String(row.id),
      name: String(row.name),
      email: String(row.email),
      role: row.role as Role,
      workspaceId: String(row.workspace_id),
      workspaceName: String(row.workspace_name),
    };
  }
  login(email: string, password: string): SessionUser {
    const key = `login:${digest(email.toLowerCase())}`;
    const now = Date.now();
    const attempt = this.db
      .prepare("SELECT * FROM login_attempts WHERE key=?")
      .get(key) as Row | undefined;
    if (
      attempt &&
      Number(attempt.expires_at) > now &&
      Number(attempt.attempts) >= 8
    )
      throw new ApiError(
        429,
        "Túl sok sikertelen belépés. Próbáld újra 15 perc múlva.",
      );
    const row = this.db
      .prepare(
        "SELECT u.*,w.name AS workspace_name FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE u.email=? AND u.active=1",
      )
      .get(email.toLowerCase()) as Row | undefined;
    const valid = verifyPassword(
      password,
      row ? String(row.password_hash) : dummyHash,
    );
    if (!valid || !row) {
      this.db
        .prepare(
          "INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END",
        )
        .run(key, now + 15 * 60 * 1000, now, now);
      throw new ApiError(401, "Hibás e-mail-cím vagy jelszó.");
    }
    this.db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
    const user = this.readUser(row);
    this.event(
      user,
      "Sikeres bejelentkezés",
      "Munkamenet",
      this.readWorkspace(user).revision,
    );
    return user;
  }
  createSession(user: SessionUser) {
    const token = randomBytes(32).toString("base64url");
    this.db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
    this.db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)",
      )
      .run(digest(token), user.id, Date.now() + SESSION_SECONDS * 1000);
    return token;
  }
  session(token?: string): SessionUser | null {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = this.db
      .prepare(
        "SELECT u.*,w.name AS workspace_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN workspaces w ON w.id=u.workspace_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
      )
      .get(digest(token), Date.now()) as Row | undefined;
    return row ? this.readUser(row) : null;
  }
  logout(token?: string) {
    if (token)
      this.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(digest(token));
  }
  audit(user: SessionUser) {
    return (
      this.db
        .prepare(
          "SELECT id,actor,action,entity,at FROM audit_events WHERE workspace_id=? ORDER BY sequence DESC LIMIT 1000",
        )
        .all(user.workspaceId) as Row[]
    ).map((r) => ({
      id: String(r.id),
      actor: String(r.actor),
      action: String(r.action),
      entity: String(r.entity),
      at: String(r.at),
    }));
  }
  readWorkspace(user: SessionUser): { state: TmsState; revision: number } {
    const row = this.db
      .prepare("SELECT state,revision FROM workspaces WHERE id=?")
      .get(user.workspaceId) as Row | undefined;
    if (!row) throw new ApiError(404, "A munkatér nem található.");
    const state = JSON.parse(String(row.state)) as TmsState;
    state.audit = this.audit(user);
    return { state, revision: Number(row.revision) };
  }
  saveWorkspace(user: SessionUser, input: unknown) {
    const data = workspaceSchema.parse(input);
    return this.transaction(() => {
      const current = this.readWorkspace(user);
      if (current.revision !== data.revision)
        throw new ApiError(
          409,
          "Másik felhasználó már módosította az adatokat. A munkatér frissült; ellenőrizd és ismételd meg a műveletet.",
        );
      const next = data.state as TmsState;
      validateMutation(current.state, next, user.role, (id) =>
        Boolean(
          this.db
            .prepare("SELECT id FROM files WHERE workspace_id=? AND id=?")
            .get(user.workspaceId, id),
        ),
      );
      next.audit = [];
      this.db
        .prepare(
          "UPDATE workspaces SET state=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(JSON.stringify(next), user.workspaceId, data.revision);
      this.event(user, data.action, data.entity, data.revision + 1);
      return this.readWorkspace(user);
    });
  }
  users(user: SessionUser) {
    if (user.role !== "admin")
      throw new ApiError(
        403,
        "A felhasználókezeléshez adminisztrátori jog szükséges.",
      );
    return this.db
      .prepare(
        "SELECT id,name,email,role,active FROM users WHERE workspace_id=? ORDER BY name",
      )
      .all(user.workspaceId);
  }
  addUser(user: SessionUser, input: unknown) {
    if (user.role !== "admin")
      throw new ApiError(
        403,
        "A felhasználókezeléshez adminisztrátori jog szükséges.",
      );
    const data = userSchema.parse(input);
    const hash = hashPassword(data.password);
    return this.transaction(() => {
      if (this.db.prepare("SELECT id FROM users WHERE email=?").get(data.email))
        throw new ApiError(409, "Ez az e-mail-cím már foglalt.");
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO users(id,workspace_id,name,email,password_hash,role) VALUES(?,?,?,?,?,?)",
        )
        .run(id, user.workspaceId, data.name, data.email, hash, data.role);
      this.event(
        user,
        "Felhasználó létrehozva",
        `${data.name} · ${data.role}`,
        this.readWorkspace(user).revision,
      );
      return {
        id,
        name: data.name,
        email: data.email,
        role: data.role,
        active: 1,
      };
    });
  }
  updateUser(user: SessionUser, id: string, input: unknown) {
    if (user.role !== "admin")
      throw new ApiError(
        403,
        "A felhasználókezeléshez adminisztrátori jog szükséges.",
      );
    const data = userUpdateSchema.parse(input);
    return this.transaction(() => {
      const target = this.db
        .prepare(
          "SELECT id,name,email,role,active FROM users WHERE id=? AND workspace_id=?",
        )
        .get(id, user.workspaceId) as Row | undefined;
      if (!target)
        throw new ApiError(
          404,
          "A felhasználó nem található ebben a munkatérben.",
        );
      const role = data.role ?? (target.role as Role);
      const active =
        data.active === undefined ? Number(target.active) : data.active ? 1 : 0;
      if (
        target.role === "admin" &&
        target.active === 1 &&
        (role !== "admin" || active === 0)
      ) {
        const admins = this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM users WHERE workspace_id=? AND role='admin' AND active=1",
          )
          .get(user.workspaceId) as Row;
        if (Number(admins.n) <= 1)
          throw new ApiError(
            409,
            "Az utolsó aktív adminisztrátor nem tiltható le és nem sorolható más szerepkörbe.",
          );
      }
      this.db
        .prepare(
          "UPDATE users SET role=?,active=? WHERE id=? AND workspace_id=?",
        )
        .run(role, active, id, user.workspaceId);
      if (active === 0 || role !== target.role)
        this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      this.event(
        user,
        "Felhasználói jogosultság módosítva",
        `${target.name} · ${role} · ${active ? "aktív" : "letiltva"}`,
        this.readWorkspace(user).revision,
      );
      return {
        id: String(target.id),
        name: String(target.name),
        email: String(target.email),
        role,
        active,
      };
    });
  }
  changePassword(user: SessionUser, input: unknown) {
    const data = passwordChangeSchema.parse(input);
    if (data.currentPassword === data.newPassword)
      throw new ApiError(422, "Az új jelszó legyen eltérő a jelenlegitől.");
    const target = this.db
      .prepare(
        "SELECT password_hash FROM users WHERE id=? AND workspace_id=? AND active=1",
      )
      .get(user.id, user.workspaceId) as Row | undefined;
    if (
      !target ||
      !verifyPassword(data.currentPassword, String(target.password_hash))
    )
      throw new ApiError(401, "A jelenlegi jelszó nem megfelelő.");
    const passwordHash = hashPassword(data.newPassword);
    return this.transaction(() => {
      const updated = this.db
        .prepare(
          "UPDATE users SET password_hash=? WHERE id=? AND workspace_id=? AND password_hash=? AND active=1",
        )
        .run(
          passwordHash,
          user.id,
          user.workspaceId,
          String(target.password_hash),
        );
      if (updated.changes !== 1)
        throw new ApiError(
          409,
          "A fiók időközben megváltozott. Jelentkezz be újra.",
        );
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      this.event(
        user,
        "Jelszó megváltoztatva",
        "Minden korábbi munkamenet visszavonva",
        this.readWorkspace(user).revision,
      );
      const fresh = this.db
        .prepare(
          "SELECT u.*,w.name AS workspace_name FROM users u JOIN workspaces w ON w.id=u.workspace_id WHERE u.id=?",
        )
        .get(user.id) as Row;
      return this.readUser(fresh);
    });
  }
  putFile(
    user: SessionUser,
    id: string,
    name: string,
    mime: string,
    bytes: Uint8Array,
  ) {
    if (user.role === "viewer")
      throw new ApiError(403, "Megtekintő nem tölthet fel fájlt.");
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
      throw new ApiError(400, "Érvénytelen fájlazonosító.");
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024)
      throw new ApiError(413, "A fájl mérete 1 bájt és 20 MB között lehet.");
    if (
      ![
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ].includes(mime)
    )
      throw new ApiError(415, "Ez a fájltípus nem engedélyezett.");
    if (!name || name.length > 240 || /[\r\n\0]/.test(name))
      throw new ApiError(400, "Érvénytelen fájlnév.");
    const old = this.db
      .prepare("SELECT id FROM files WHERE workspace_id=? AND id=?")
      .get(user.workspaceId, id);
    if (old)
      throw new ApiError(
        409,
        "Ez a fájlverzió már létezik. Új azonosító szükséges.",
      );
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO files(workspace_id,id,name,mime,bytes,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(user.workspaceId, id, name, mime, bytes, new Date().toISOString());
      this.event(
        user,
        "Fájl feltöltve",
        name,
        this.readWorkspace(user).revision,
      );
    });
  }
  getFile(user: SessionUser, id: string) {
    const row = this.db
      .prepare(
        "SELECT name,mime,bytes FROM files WHERE workspace_id=? AND id=?",
      )
      .get(user.workspaceId, id) as Row | undefined;
    if (!row)
      throw new ApiError(404, "A fájl nem található ebben a munkatérben.");
    return {
      name: String(row.name),
      mime: String(row.mime),
      bytes: row.bytes as Uint8Array,
    };
  }
  validateState(value: unknown) {
    return stateSchema.parse(value);
  }
}

const globalStore = globalThis as typeof globalThis & {
  tmsRepository?: TmsRepository;
};
export function repository() {
  globalStore.tmsRepository ??= new TmsRepository(
    process.env.TMS_DATABASE_PATH ||
      resolve(process.cwd(), "data/tess-tms.sqlite"),
  );
  return globalStore.tmsRepository;
}
