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
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_update
    BEFORE UPDATE OF status ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  ...ROADMAP_ITEM_STATUS_TRIGGERS,
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
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'blocked')
    BEGIN
      SELECT RAISE(ABORT, 'invalid plan_phases.status');
    END`,
  `CREATE TRIGGER IF NOT EXISTS trg_plan_phases_status_update
    BEFORE UPDATE OF status ON plan_phases
    WHEN NEW.status NOT IN ('todo', 'in_progress', 'done', 'blocked')
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
