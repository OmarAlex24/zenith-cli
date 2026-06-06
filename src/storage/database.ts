import { Database } from "bun:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { createId, nowIso } from "../domain/ids";
import { getDatabasePath, ensureZenithHome } from "./paths";

export type DatabaseOptions = {
  zenithHome?: string;
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
        justification TEXT,
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
  {
    version: 3,
    sql: "",
  },
  {
    version: 4,
    sql: "",
  },
  {
    version: 5,
    sql: "",
  },
  {
    version: 6,
    sql: "",
  },
  {
    version: 7,
    sql: "",
  },
  {
    version: 8,
    sql: "",
  },
  {
    version: 9,
    sql: "",
  },
  {
    version: 10,
    sql: "",
  },
  {
    version: 11,
    sql: "",
  },
  {
    version: 12,
    sql: "",
  },
  {
    version: 13,
    sql: "",
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
      if (migration.version === 3) {
        runIntegrityHardeningMigration(db);
      } else if (migration.version === 4) {
        runRoadmapItemJustificationMigration(db);
      } else if (migration.version === 5) {
        runStatusVocabularyMigration(db);
      } else if (migration.version === 6) {
        runFindingLinksMigration(db);
      } else if (migration.version === 7) {
        runPhaseDependsOnMigration(db);
      } else if (migration.version === 8) {
        runFocusAndMultiPlanMigration(db);
      } else if (migration.version === 9) {
        runAgentStagesMigration(db);
      } else if (migration.version === 10) {
        runRoadmapItemDiscardedStatusMigration(db);
      } else if (migration.version === 11) {
        runMemoryTagsMigration(db);
      } else if (migration.version === 12) {
        runActionableContinuityMigration(db);
      } else if (migration.version === 13) {
        runHardeningMigration(db);
      } else {
        db.run(migration.sql);
      }
      db.query("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
    })();
  }
}

function runHardeningMigration(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS memory_evidence (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      path TEXT,
      line INTEGER,
      end_line INTEGER,
      label TEXT,
      checked_at TEXT,
      stale INTEGER NOT NULL DEFAULT 0,
      superseded_by TEXT,
      created_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_memory_evidence_entity
      ON memory_evidence(project_id, entity_type, entity_id, created_at ASC)`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS memory_lifecycle (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      lifecycle TEXT NOT NULL,
      reason TEXT,
      superseded_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_lifecycle_entity
      ON memory_lifecycle(project_id, entity_type, entity_id)`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS memory_claims (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      role TEXT NOT NULL,
      owner TEXT,
      worktree TEXT,
      branch TEXT,
      hostname TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      released_at TEXT,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_memory_claims_project_status
      ON memory_claims(project_id, status, expires_at, scope)`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS tag_catalog (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_catalog_project_tag
      ON tag_catalog(project_id, tag)`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS tag_aliases (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_aliases_project_alias
      ON tag_aliases(project_id, alias)`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS memory_tombstones (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      reason TEXT,
      purged_at TEXT NOT NULL
    )`,
  );

  for (const statement of HARDENING_TRIGGERS) {
    db.run(statement);
  }

  backfillEvidence(db);
  backfillLifecycle(db);
}

function backfillEvidence(db: Database): void {
  const rows: Array<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }> = [
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT p.project_id, 'phase' AS entity_type, ph.id AS entity_id, ph.evidence_json
         FROM plan_phases ph JOIN plans p ON p.id = ph.plan_id`,
      )
      .all(),
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT r.project_id, 'roadmap_item' AS entity_type, ri.id AS entity_id, ri.evidence_json
         FROM roadmap_items ri JOIN roadmaps r ON r.id = ri.roadmap_id`,
      )
      .all(),
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT project_id, 'spike' AS entity_type, id AS entity_id, evidence_json FROM spikes`,
      )
      .all(),
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT project_id, 'decision' AS entity_type, id AS entity_id, evidence_json FROM decisions`,
      )
      .all(),
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT project_id, 'finding' AS entity_type, id AS entity_id, evidence_json FROM findings`,
      )
      .all(),
    ...db
      .query<{ project_id: string; entity_type: string; entity_id: string; evidence_json: string }, []>(
        `SELECT project_id, 'session' AS entity_type, id AS entity_id, evidence_json FROM sessions`,
      )
      .all(),
  ];

  const insert = db.query(
    `INSERT OR IGNORE INTO memory_evidence (
      id, project_id, entity_type, entity_id, kind, value, path, line, end_line,
      label, checked_at, stale, superseded_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const timestamp = nowIso();
  for (const row of rows) {
    for (const item of parseEvidence(row.evidence_json)) {
      insert.run(
        typeof item.id === "string" ? item.id : createId("ev"),
        row.project_id,
        row.entity_type,
        row.entity_id,
        typeof item.kind === "string" ? item.kind : "note",
        typeof item.value === "string" ? item.value : "",
        typeof item.path === "string" ? item.path : null,
        typeof item.line === "number" && Number.isInteger(item.line) ? item.line : null,
        typeof item.endLine === "number" && Number.isInteger(item.endLine) ? item.endLine : null,
        typeof item.label === "string" ? item.label : null,
        typeof item.checkedAt === "string" ? item.checkedAt : null,
        item.stale ? 1 : 0,
        typeof item.supersededBy === "string" ? item.supersededBy : null,
        typeof item.createdAt === "string" ? item.createdAt : timestamp,
      );
    }
  }
}

function backfillLifecycle(db: Database): void {
  const timestamp = nowIso();
  const insert = db.query(
    `INSERT OR IGNORE INTO memory_lifecycle (
      id, project_id, entity_type, entity_id, lifecycle, reason, superseded_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  );
  const rows: Array<{ project_id: string; entity_type: string; entity_id: string; status: string; ended_at?: string | null }> = [
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'brief' AS entity_type, id AS entity_id, status FROM project_briefs`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'roadmap' AS entity_type, id AS entity_id, status FROM roadmaps`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT r.project_id, 'roadmap_item' AS entity_type, ri.id AS entity_id, ri.status
       FROM roadmap_items ri JOIN roadmaps r ON r.id = ri.roadmap_id`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'plan' AS entity_type, id AS entity_id, status FROM plans`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT p.project_id, 'phase' AS entity_type, ph.id AS entity_id, ph.status
       FROM plan_phases ph JOIN plans p ON p.id = ph.plan_id`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'spike' AS entity_type, id AS entity_id, status FROM spikes`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'finding' AS entity_type, id AS entity_id, status FROM findings`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string; ended_at: string | null }, []>(
      `SELECT project_id, 'session' AS entity_type, id AS entity_id, CASE WHEN ended_at IS NULL THEN 'open' ELSE 'ended' END AS status, ended_at FROM sessions`,
    ).all(),
    ...db.query<{ project_id: string; entity_type: string; entity_id: string; status: string }, []>(
      `SELECT project_id, 'context_doc' AS entity_type, id AS entity_id, status FROM context_docs`,
    ).all(),
  ];

  for (const row of rows) {
    insert.run(createId("life"), row.project_id, row.entity_type, row.entity_id, lifecycleForStatus(row.entity_type, row.status), timestamp, timestamp);
  }
}

function parseEvidence(value: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>) : [];
}

function lifecycleForStatus(entityType: string, status: string): string {
  if (entityType === "phase" && status === "blocked") return "blocked";
  if (entityType === "phase" && status === "done") return "done";
  if (entityType === "roadmap_item" && status === "done") return "done";
  if (entityType === "roadmap_item" && status === "deferred") return "stale";
  if (entityType === "roadmap_item" && status === "discarded") return "archived";
  if (entityType === "plan" && status === "completed") return "done";
  if (entityType === "plan" && status === "archived") return "archived";
  if (entityType === "plan" && status === "paused") return "stale";
  if (entityType === "roadmap" && status === "completed") return "done";
  if (entityType === "roadmap" && status === "archived") return "archived";
  if (entityType === "roadmap" && status === "paused") return "stale";
  if (entityType === "brief" && status === "archived") return "archived";
  if (entityType === "spike" && status === "concluded") return "done";
  if (entityType === "spike" && status === "abandoned") return "archived";
  if (entityType === "finding" && status === "closed") return "done";
  if (entityType === "session" && status === "ended") return "done";
  if (entityType === "context_doc" && status === "ignored") return "archived";
  return "active";
}

function runActionableContinuityMigration(db: Database): void {
  if (!tableHasColumn(db, "decisions", "evidence_json")) {
    db.run("ALTER TABLE decisions ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!tableHasColumn(db, "findings", "evidence_json")) {
    db.run("ALTER TABLE findings ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!tableHasColumn(db, "sessions", "evidence_json")) {
    db.run("ALTER TABLE sessions ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]'");
  }

  db.run(
    `CREATE TABLE IF NOT EXISTS context_docs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scope TEXT NOT NULL,
      plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
      phase_id TEXT REFERENCES plan_phases(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      reason TEXT NOT NULL,
      summary TEXT NOT NULL,
      assumptions_json TEXT NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL,
      read_at TEXT NOT NULL,
      read_commit TEXT,
      observed_mtime TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_context_docs_scope_path
      ON context_docs(project_id, scope, IFNULL(plan_id, ''), IFNULL(phase_id, ''), path)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_context_docs_project_status
      ON context_docs(project_id, status, updated_at DESC)`,
  );

  db.run("DROP TRIGGER IF EXISTS trg_plan_phases_status_insert");
  db.run("DROP TRIGGER IF EXISTS trg_plan_phases_status_update");
  db.run("DROP TRIGGER IF EXISTS trg_memory_tags_entity_type_insert");
  db.run("DROP TRIGGER IF EXISTS trg_memory_tags_entity_type_update");

  for (const statement of ACTIONABLE_CONTINUITY_TRIGGERS) {
    db.run(statement);
  }
}

function runAgentStagesMigration(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS agent_stages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      scope_key TEXT NOT NULL,
      plan_id TEXT REFERENCES plans(id) ON DELETE CASCADE,
      phase_id TEXT REFERENCES plan_phases(id) ON DELETE CASCADE,
      stage TEXT NOT NULL,
      role TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_stages_scope
      ON agent_stages(project_id, scope_key)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_agent_stages_project_updated
      ON agent_stages(project_id, updated_at DESC)`,
  );
  db.run(
    `CREATE TRIGGER IF NOT EXISTS trg_agent_stages_stage_insert
      BEFORE INSERT ON agent_stages
      WHEN NEW.stage NOT IN ('plan', 'implement', 'review', 'done')
      BEGIN
        SELECT RAISE(ABORT, 'invalid agent_stages.stage');
      END`,
  );
  db.run(
    `CREATE TRIGGER IF NOT EXISTS trg_agent_stages_stage_update
      BEFORE UPDATE OF stage ON agent_stages
      WHEN NEW.stage NOT IN ('plan', 'implement', 'review', 'done')
      BEGIN
        SELECT RAISE(ABORT, 'invalid agent_stages.stage');
      END`,
  );
}

function runMemoryTagsMigration(db: Database): void {
  db.run(
    `CREATE TABLE IF NOT EXISTS memory_tags (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_tags_unique
      ON memory_tags(project_id, entity_type, entity_id, tag)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_memory_tags_project_tag
      ON memory_tags(project_id, tag, entity_type, entity_id)`,
  );
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_memory_tags_entity
      ON memory_tags(project_id, entity_type, entity_id)`,
  );
  db.run(
    `CREATE TRIGGER IF NOT EXISTS trg_memory_tags_entity_type_insert
      BEFORE INSERT ON memory_tags
      WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session')
      BEGIN
        SELECT RAISE(ABORT, 'invalid memory_tags.entity_type');
      END`,
  );
  db.run(
    `CREATE TRIGGER IF NOT EXISTS trg_memory_tags_entity_type_update
      BEFORE UPDATE OF entity_type ON memory_tags
      WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session')
      BEGIN
        SELECT RAISE(ABORT, 'invalid memory_tags.entity_type');
      END`,
  );
}

function runIntegrityHardeningMigration(db: Database): void {
  if (!tableHasColumn(db, "plans", "source_roadmap_id")) {
    db.run("ALTER TABLE plans ADD COLUMN source_roadmap_id TEXT REFERENCES roadmaps(id) ON DELETE SET NULL");
  }
  if (!tableHasColumn(db, "plans", "source_roadmap_item_id")) {
    db.run("ALTER TABLE plans ADD COLUMN source_roadmap_item_id TEXT REFERENCES roadmap_items(id) ON DELETE SET NULL");
  }

  for (const statement of INTEGRITY_HARDENING_STATEMENTS) {
    db.run(statement);
  }
}

function runPhaseDependsOnMigration(db: Database): void {
  if (!tableHasColumn(db, "plan_phases", "depends_on_json")) {
    db.run("ALTER TABLE plan_phases ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]'");
  }
}

function runFocusAndMultiPlanMigration(db: Database): void {
  // Allow one active plan per roadmap (plus one standalone) instead of one per project.
  db.run("DROP INDEX IF EXISTS idx_plans_one_active_per_project");
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_one_active_per_roadmap
      ON plans(project_id, IFNULL(source_roadmap_id, ''))
      WHERE status = 'active'`,
  );

  // Bind a worktree (and its branch) to the roadmap it is implementing.
  db.run(
    `CREATE TABLE IF NOT EXISTS roadmap_focus (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      worktree_key TEXT NOT NULL,
      branch TEXT,
      roadmap_id TEXT NOT NULL REFERENCES roadmaps(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  );
  db.run(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmap_focus_worktree_unique
      ON roadmap_focus(project_id, worktree_key)`,
  );
}

function runFindingLinksMigration(db: Database): void {
  if (!tableHasColumn(db, "findings", "related_plan_id")) {
    db.run("ALTER TABLE findings ADD COLUMN related_plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL");
  }
  if (!tableHasColumn(db, "findings", "related_phase_id")) {
    db.run("ALTER TABLE findings ADD COLUMN related_phase_id TEXT REFERENCES plan_phases(id) ON DELETE SET NULL");
  }
}

function runRoadmapItemJustificationMigration(db: Database): void {
  if (!tableHasColumn(db, "roadmap_items", "justification")) {
    db.run("ALTER TABLE roadmap_items ADD COLUMN justification TEXT");
  }
}

function runStatusVocabularyMigration(db: Database): void {
  db.run("DROP TRIGGER IF EXISTS trg_plan_phases_status_insert");
  db.run("DROP TRIGGER IF EXISTS trg_plan_phases_status_update");
  db.run("DROP TRIGGER IF EXISTS trg_roadmap_items_status_insert");
  db.run("DROP TRIGGER IF EXISTS trg_roadmap_items_status_update");

  db.run("UPDATE plan_phases SET status = 'todo' WHERE status = 'pending'");
  db.run("UPDATE plan_phases SET status = 'done' WHERE status = 'completed'");
  db.run("UPDATE roadmap_items SET status = 'todo' WHERE status = 'planned'");

  for (const statement of STATUS_VOCABULARY_TRIGGERS) {
    db.run(statement);
  }
}

function runRoadmapItemDiscardedStatusMigration(db: Database): void {
  db.run("DROP TRIGGER IF EXISTS trg_roadmap_items_status_insert");
  db.run("DROP TRIGGER IF EXISTS trg_roadmap_items_status_update");

  for (const statement of ROADMAP_ITEM_STATUS_TRIGGERS) {
    db.run(statement);
  }
}

const ROADMAP_ITEM_STATUS_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_roadmap_items_status_insert
    BEFORE INSERT ON roadmap_items
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'deferred', 'discarded')
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmap_items.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmap_items_status_update
    BEFORE UPDATE OF status ON roadmap_items
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'deferred', 'discarded')
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmap_items.status');
    END`,
];

const STATUS_VOCABULARY_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_insert
    BEFORE INSERT ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_update
    BEFORE UPDATE OF status ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  ...ROADMAP_ITEM_STATUS_TRIGGERS,
];

const ACTIONABLE_CONTINUITY_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_insert
    BEFORE INSERT ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_update
    BEFORE UPDATE OF status ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_scope_insert
    BEFORE INSERT ON context_docs
    WHEN NEW.scope NOT IN ('project', 'plan', 'phase')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.scope');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_scope_update
    BEFORE UPDATE OF scope ON context_docs
    WHEN NEW.scope NOT IN ('project', 'plan', 'phase')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.scope');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_confidence_insert
    BEFORE INSERT ON context_docs
    WHEN NEW.confidence NOT IN ('low', 'medium', 'high')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.confidence');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_confidence_update
    BEFORE UPDATE OF confidence ON context_docs
    WHEN NEW.confidence NOT IN ('low', 'medium', 'high')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.confidence');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_status_insert
    BEFORE INSERT ON context_docs
    WHEN NEW.status NOT IN ('pinned', 'ignored')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_context_docs_status_update
    BEFORE UPDATE OF status ON context_docs
    WHEN NEW.status NOT IN ('pinned', 'ignored')
    BEGIN
      SELECT RAISE(ABORT, 'invalid context_docs.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_tags_entity_type_insert
    BEFORE INSERT ON memory_tags
    WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session', 'context_doc')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_tags.entity_type');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_tags_entity_type_update
    BEFORE UPDATE OF entity_type ON memory_tags
    WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session', 'context_doc')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_tags.entity_type');
    END`,
];

const HARDENING_TRIGGERS = [
  `CREATE TRIGGER IF NOT EXISTS trg_memory_evidence_entity_type_insert
    BEFORE INSERT ON memory_evidence
    WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session', 'context_doc')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_evidence.entity_type');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_evidence_kind_insert
    BEFORE INSERT ON memory_evidence
    WHEN NEW.kind NOT IN ('note', 'commit', 'file', 'pr', 'issue', 'command', 'test', 'link', 'adr', 'branch')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_evidence.kind');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_lifecycle_entity_type_insert
    BEFORE INSERT ON memory_lifecycle
    WHEN NEW.entity_type NOT IN ('brief', 'roadmap', 'roadmap_item', 'plan', 'phase', 'spike', 'decision', 'finding', 'session', 'context_doc')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_lifecycle.entity_type');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_lifecycle_status_insert
    BEFORE INSERT ON memory_lifecycle
    WHEN NEW.lifecycle NOT IN ('active', 'done', 'blocked', 'stale', 'superseded', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_lifecycle.lifecycle');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_lifecycle_status_update
    BEFORE UPDATE OF lifecycle ON memory_lifecycle
    WHEN NEW.lifecycle NOT IN ('active', 'done', 'blocked', 'stale', 'superseded', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_lifecycle.lifecycle');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_claims_status_insert
    BEFORE INSERT ON memory_claims
    WHEN NEW.status NOT IN ('active', 'released', 'expired')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_claims.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_memory_claims_status_update
    BEFORE UPDATE OF status ON memory_claims
    WHEN NEW.status NOT IN ('active', 'released', 'expired')
    BEGIN
      SELECT RAISE(ABORT, 'invalid memory_claims.status');
    END`,
];

function tableHasColumn(db: Database, tableName: string, columnName: string): boolean {
  return db
    .query<{ name: string }, []>(`PRAGMA table_info(${tableName})`)
    .all()
    .some((column) => column.name === columnName);
}

const INTEGRITY_HARDENING_STATEMENTS = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_one_active_per_project
    ON plans(project_id)
    WHERE status = 'active'`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_phases_plan_position_unique
    ON plan_phases(plan_id, position)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_roadmap_items_roadmap_position_unique
    ON roadmap_items(roadmap_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_plans_source_roadmap
    ON plans(source_roadmap_id, source_roadmap_item_id)`,
  `CREATE TRIGGER IF NOT EXISTS trg_plans_status_insert
    BEFORE INSERT ON plans
    WHEN NEW.status NOT IN ('active', 'completed', 'paused', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plans.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plans_status_update
    BEFORE UPDATE OF status ON plans
    WHEN NEW.status NOT IN ('active', 'completed', 'paused', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plans.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plans_priority_insert
    BEFORE INSERT ON plans
    WHEN NEW.priority IS NOT NULL AND NEW.priority NOT IN ('low', 'medium', 'high')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plans.priority');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plans_priority_update
    BEFORE UPDATE OF priority ON plans
    WHEN NEW.priority IS NOT NULL AND NEW.priority NOT IN ('low', 'medium', 'high')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plans.priority');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_insert
    BEFORE INSERT ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_update
    BEFORE UPDATE OF status ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'needs_review', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_project_briefs_status_insert
    BEFORE INSERT ON project_briefs
    WHEN NEW.status NOT IN ('current', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid project_briefs.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_project_briefs_status_update
    BEFORE UPDATE OF status ON project_briefs
    WHEN NEW.status NOT IN ('current', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid project_briefs.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmaps_status_insert
    BEFORE INSERT ON roadmaps
    WHEN NEW.status NOT IN ('active', 'paused', 'completed', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmaps.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmaps_status_update
    BEFORE UPDATE OF status ON roadmaps
    WHEN NEW.status NOT IN ('active', 'paused', 'completed', 'archived')
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmaps.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmaps_source_plan_insert
    BEFORE INSERT ON roadmaps
    WHEN NEW.source_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = NEW.source_plan_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmaps.source_plan_id');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmaps_source_plan_update
    BEFORE UPDATE OF source_plan_id ON roadmaps
    WHEN NEW.source_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = NEW.source_plan_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmaps.source_plan_id');
    END`,
  ...ROADMAP_ITEM_STATUS_TRIGGERS,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmap_items_source_phase_insert
    BEFORE INSERT ON roadmap_items
    WHEN NEW.source_phase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plan_phases WHERE id = NEW.source_phase_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmap_items.source_phase_id');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_roadmap_items_source_phase_update
    BEFORE UPDATE OF source_phase_id ON roadmap_items
    WHEN NEW.source_phase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plan_phases WHERE id = NEW.source_phase_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid roadmap_items.source_phase_id');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_spikes_status_insert
    BEFORE INSERT ON spikes
    WHEN NEW.status NOT IN ('open', 'concluded', 'abandoned')
    BEGIN
      SELECT RAISE(ABORT, 'invalid spikes.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_spikes_status_update
    BEFORE UPDATE OF status ON spikes
    WHEN NEW.status NOT IN ('open', 'concluded', 'abandoned')
    BEGIN
      SELECT RAISE(ABORT, 'invalid spikes.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_type_insert
    BEFORE INSERT ON findings
    WHEN NEW.type NOT IN ('bug', 'risk', 'tech_debt', 'architecture', 'docs_gap', 'test_gap', 'simplification')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.type');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_type_update
    BEFORE UPDATE OF type ON findings
    WHEN NEW.type NOT IN ('bug', 'risk', 'tech_debt', 'architecture', 'docs_gap', 'test_gap', 'simplification')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.type');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_severity_insert
    BEFORE INSERT ON findings
    WHEN NEW.severity NOT IN ('low', 'medium', 'high', 'critical')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.severity');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_severity_update
    BEFORE UPDATE OF severity ON findings
    WHEN NEW.severity NOT IN ('low', 'medium', 'high', 'critical')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.severity');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_status_insert
    BEFORE INSERT ON findings
    WHEN NEW.status NOT IN ('open', 'closed')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_findings_status_update
    BEFORE UPDATE OF status ON findings
    WHEN NEW.status NOT IN ('open', 'closed')
    BEGIN
      SELECT RAISE(ABORT, 'invalid findings.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sessions_related_plan_insert
    BEFORE INSERT ON sessions
    WHEN NEW.related_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = NEW.related_plan_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid sessions.related_plan_id');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sessions_related_plan_update
    BEFORE UPDATE OF related_plan_id ON sessions
    WHEN NEW.related_plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM plans WHERE id = NEW.related_plan_id)
    BEGIN
      SELECT RAISE(ABORT, 'invalid sessions.related_plan_id');
    END`,
];
