import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { getDatabasePath, ensureZenithHome } from "./paths";

export type DatabaseOptions = {
  zenithHome?: string;
  decodeHome?: string;
  dbPath?: string;
  readonly?: boolean;
};

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL UNIQUE,
        repository_url TEXT,
        branch TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_paths (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        root_path TEXT NOT NULL UNIQUE,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        priority TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plan_phases (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        acceptance_criteria_json TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_plan_phases_plan_position ON plan_phases(plan_id, position);

      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        context TEXT NOT NULL,
        decision TEXT NOT NULL,
        consequences TEXT,
        alternatives_json TEXT NOT NULL,
        related_plan_ids_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_decisions_project_created ON decisions(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        related_files_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        closed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_findings_project_status ON findings(project_id, status, severity);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        branch TEXT,
        summary TEXT,
        changed_files_json TEXT NOT NULL,
        related_plan_id TEXT,
        next_steps_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project_created ON sessions(project_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_project_created ON events(project_id, created_at DESC);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS project_briefs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        body TEXT NOT NULL,
        source TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_briefs_current
        ON project_briefs(project_id)
        WHERE status = 'current';
      CREATE INDEX IF NOT EXISTS idx_project_briefs_project_updated
        ON project_briefs(project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS roadmaps (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        source_plan_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_roadmaps_project_updated
        ON roadmaps(project_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS roadmap_items (
        id TEXT PRIMARY KEY,
        roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        source_phase_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_roadmap_items_roadmap_position
        ON roadmap_items(roadmap_id, position);

      CREATE TABLE IF NOT EXISTS spikes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        question TEXT NOT NULL,
        hypothesis TEXT,
        options_json TEXT NOT NULL,
        result TEXT,
        recommendation TEXT,
        evidence_json TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        concluded_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_spikes_project_status_updated
        ON spikes(project_id, status, updated_at DESC);
    `,
  },
];

export function openZenithDatabase(options: DatabaseOptions = {}): Database {
  const dbPath = options.dbPath ?? getDatabasePath(options);

  if (!options.readonly) {
    if (options.dbPath) {
      mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    } else {
      ensureZenithHome(options);
    }
  }

  const db = new Database(dbPath, options.readonly ? { readonly: true } : { create: true, strict: true });
  db.run("PRAGMA foreign_keys = ON");

  if (!options.readonly) {
    runMigrations(db);
  }

  return db;
}

export function openDecodeDatabase(options: DatabaseOptions = {}): Database {
  return openZenithDatabase(options);
}

export function runMigrations(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of MIGRATIONS) {
    const existing = db.query<{ version: number }, [number]>("SELECT version FROM schema_migrations WHERE version = ?").get(
      migration.version,
    );

    if (existing) {
      continue;
    }

    db.transaction(() => {
      db.run(migration.sql);
      db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
    })();
  }
}
