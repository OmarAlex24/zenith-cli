import type { Database } from "bun:sqlite";
import { ZenithError } from "../cli/json-output";
import { guardMemoryWrite, sanitizeEventPayload } from "../app/memory-guard";
import { createId, nowIso } from "../domain/ids";
import {
  AgentStageStateSchema,
  ContextDocSchema,
  DecisionSchema,
  EventSchema,
  FindingSchema,
  MemoryClaimSchema,
  MemoryEvidenceRecordSchema,
  MemoryLifecycleSchema,
  MemoryTagSchema,
  PlanSchema,
  ProjectBriefSchema,
  RawMemoryEntitySchema,
  ProjectSchema,
  RoadmapSchema,
  SessionSchema,
  SpikeSchema,
  TagAliasSchema,
  TagCatalogEntrySchema,
  type AgentStage,
  type AgentStageState,
  type ContextDoc,
  type ContextDocConfidence,
  type ContextDocScope,
  type ContextDocStatus,
  type Decision,
  type Event,
  type Evidence,
  type Finding,
  type MemoryClaim,
  type MemoryEvidenceRecord,
  type MemoryEntityType,
  type MemoryLifecycle,
  type MemoryTag,
  type Plan,
  type PlanPhase,
  type PlanStatus,
  type ProjectBrief,
  type Project,
  type Roadmap,
  type RoadmapItem,
  type RoadmapItemStatus,
  type RoadmapStatus,
  type Session,
  type Spike,
  type SpikeStatus,
  type RawMemoryEntity,
  type TagAlias,
  type TagCatalogEntry,
} from "../domain/schemas";

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  repository_url: string | null;
  branch: string | null;
  created_at: string;
  updated_at: string;
};

type PlanRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: PlanStatus;
  priority: "low" | "medium" | "high" | null;
  source_roadmap_id: string | null;
  source_roadmap_item_id: string | null;
  created_at: string;
  updated_at: string;
};

type PhaseRow = {
  id: string;
  plan_id: string;
  position: number;
  title: string;
  description: string | null;
  status: PlanPhase["status"];
  acceptance_criteria_json: string;
  evidence_json: string;
  depends_on_json: string;
  created_at: string;
  updated_at: string;
};

type DecisionRow = {
  id: string;
  project_id: string;
  title: string;
  context: string;
  decision: string;
  consequences: string | null;
  alternatives_json: string;
  related_plan_ids_json: string;
  evidence_json: string;
  created_at: string;
};

type FindingRow = {
  id: string;
  project_id: string;
  type: Finding["type"];
  severity: Finding["severity"];
  title: string;
  description: string;
  status: Finding["status"];
  related_files_json: string;
  evidence_json: string;
  created_at: string;
  closed_at: string | null;
  related_plan_id: string | null;
  related_phase_id: string | null;
};

type SessionRow = {
  id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  branch: string | null;
  summary: string | null;
  changed_files_json: string;
  related_plan_id: string | null;
  next_steps_json: string;
  evidence_json: string;
  created_at: string;
};

type ProjectBriefRow = {
  id: string;
  project_id: string;
  version: number;
  title: string;
  summary: string;
  body: string;
  source: string | null;
  status: ProjectBrief["status"];
  created_at: string;
  updated_at: string;
};

type RoadmapRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: RoadmapStatus;
  source_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

type RoadmapItemRow = {
  id: string;
  roadmap_id: string;
  position: number;
  title: string;
  description: string | null;
  justification: string | null;
  status: RoadmapItemStatus;
  evidence_json: string;
  source_phase_id: string | null;
  created_at: string;
  updated_at: string;
};

type SpikeRow = {
  id: string;
  project_id: string;
  title: string;
  question: string;
  hypothesis: string | null;
  options_json: string;
  result: string | null;
  recommendation: string | null;
  evidence_json: string;
  status: SpikeStatus;
  created_at: string;
  updated_at: string;
  concluded_at: string | null;
};

type EventRow = {
  id: string;
  project_id: string | null;
  type: string;
  entity_type: string;
  entity_id: string;
  payload_json: string;
  created_at: string;
};

type RoadmapFocusRow = {
  id: string;
  project_id: string;
  worktree_key: string;
  branch: string | null;
  roadmap_id: string;
  created_at: string;
  updated_at: string;
};

type AgentStageRow = {
  id: string;
  project_id: string;
  scope_key: string;
  plan_id: string | null;
  phase_id: string | null;
  stage: AgentStage;
  role: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryTagRow = {
  id: string;
  project_id: string;
  entity_type: MemoryEntityType;
  entity_id: string;
  tag: string;
  created_at: string;
  updated_at: string;
};

type ContextDocRow = {
  id: string;
  project_id: string;
  scope: ContextDocScope;
  plan_id: string | null;
  phase_id: string | null;
  path: string;
  reason: string;
  summary: string;
  assumptions_json: string;
  confidence: ContextDocConfidence;
  status: ContextDocStatus;
  read_at: string;
  read_commit: string | null;
  observed_mtime: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryEvidenceRow = {
  id: string;
  project_id: string;
  entity_type: MemoryEntityType;
  entity_id: string;
  kind: Evidence["kind"];
  value: string;
  path: string | null;
  line: number | null;
  end_line: number | null;
  label: string | null;
  checked_at: string | null;
  stale: number;
  superseded_by: string | null;
  created_at: string;
};

type MemoryLifecycleRow = {
  id: string;
  project_id: string;
  entity_type: MemoryEntityType;
  entity_id: string;
  lifecycle: MemoryLifecycle;
  reason: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

type MemoryClaimRow = {
  id: string;
  project_id: string;
  entity_id: string;
  scope: string;
  role: string;
  owner: string | null;
  worktree: string | null;
  branch: string | null;
  hostname: string | null;
  status: MemoryClaim["status"];
  created_at: string;
  expires_at: string;
  released_at: string | null;
  updated_at: string;
};

type TagCatalogRow = {
  id: string;
  project_id: string;
  tag: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  usage_count?: number;
};

type TagAliasRow = {
  id: string;
  project_id: string;
  alias: string;
  tag: string;
  created_at: string;
  updated_at: string;
};

export type RegisterProjectInput = {
  name: string;
  rootPath: string;
  worktreeRoot?: string;
  repositoryUrl?: string;
  branch?: string;
};

export type RoadmapFocus = {
  id: string;
  projectId: string;
  worktreeKey: string;
  branch?: string;
  roadmapId: string;
  createdAt: string;
  updatedAt: string;
};

export type EventGroupCount = {
  key: string;
  count: number;
};

export type EventWindowSummary = {
  total: number;
  byType: EventGroupCount[];
  byEntityType: EventGroupCount[];
  activeDays: EventGroupCount[];
  firstEventAt?: string;
  lastEventAt?: string;
};

export type EventDayCount = {
  date: string;
  count: number;
};

export type AgentStageScope = {
  planId?: string;
  phaseId?: string;
};

export type MemoryTagFilters = {
  tag?: string;
  entityType?: MemoryEntityType;
  entityId?: string;
};

export type SearchableMemoryEntity = {
  entityType: MemoryEntityType;
  entityId: string;
  title: string;
  text: string;
  updatedAt: string;
  lifecycle?: MemoryLifecycle | undefined;
};

export type CreateClaimInput = {
  projectId: string;
  entityId: string;
  scope: string;
  role: string;
  ttlMs: number;
  owner?: string;
  worktree?: string;
  branch?: string;
  hostname?: string;
};

export type RefreshClaimInput = {
  projectId: string;
  claimId: string;
  ttlMs: number;
};

export type CreateTagCatalogInput = {
  projectId: string;
  tag: string;
  description?: string;
};

export type CreateTagAliasInput = {
  projectId: string;
  alias: string;
  tag: string;
};

export type PurgeTarget =
  | { kind: "entity"; projectId: string; entityType: MemoryEntityType; entityId: string; reason?: string }
  | { kind: "tag"; projectId: string; tag: string; reason?: string }
  | { kind: "project"; projectId: string; reason?: string };

export type InsertPlanInput = {
  projectId: string;
  title: string;
  description?: string;
  status: PlanStatus;
  priority?: "low" | "medium" | "high";
  sourceRoadmapId?: string;
  sourceRoadmapItemId?: string;
  phases: Array<Omit<PlanPhase, "id" | "dependsOn"> & { id?: string; dependsOn?: string[] }>;
};

export type UpdatePhasePatch = {
  title?: string;
  description?: string;
  status?: PlanPhase["status"];
  acceptanceCriteria?: string[];
  evidence?: Evidence[];
  dependsOn?: string[];
};

export type UpdatePlanPatch = {
  title?: string;
  description?: string;
  status?: PlanStatus;
  priority?: "low" | "medium" | "high";
};

export type SetProjectBriefInput = {
  projectId: string;
  title: string;
  summary: string;
  body: string;
  source?: string;
};

export type InsertRoadmapInput = {
  projectId: string;
  title: string;
  description?: string;
  status: RoadmapStatus;
  sourcePlanId?: string;
  items: Array<Omit<RoadmapItem, "id" | "roadmapId"> & { id?: string }>;
};

export type AddRoadmapItemInput = Omit<RoadmapItem, "id" | "roadmapId"> & {
  id?: string;
  position?: number;
  afterItemId?: string;
  afterItemTitle?: string;
};

export type UpdateRoadmapPatch = {
  title?: string;
  description?: string;
  status?: RoadmapStatus;
};

export type UpdateRoadmapItemPatch = {
  title?: string;
  description?: string;
  justification?: string;
  status?: RoadmapItemStatus;
  evidence?: Evidence[];
};

export type InsertSpikeInput = {
  projectId: string;
  title: string;
  question: string;
  hypothesis?: string;
  options: string[];
  result?: string;
  recommendation?: string;
  evidence: Evidence[];
  status: SpikeStatus;
};

export type ConcludeSpikePatch = {
  status: "concluded" | "abandoned";
  result?: string;
  recommendation?: string;
  evidence?: Evidence[];
};

export type InsertFindingInput = Omit<Finding, "id" | "createdAt" | "closedAt" | "status" | "evidence"> & {
  evidence?: Evidence[];
};

export type FindingListStatus = Finding["status"] | "all";

export type UpdateFindingPatch = {
  type?: Finding["type"];
  severity?: Finding["severity"];
  title?: string;
  description?: string;
  relatedFiles?: string[];
  relatedPlanId?: string;
  relatedPhaseId?: string;
  evidence?: Evidence[];
};

export type UpdateSessionPatch = {
  endedAt?: string;
  branch?: string;
  summary?: string;
  changedFiles?: string[];
  relatedPlanId?: string;
  nextSteps?: string[];
  evidence?: Evidence[];
};

export type InsertSessionInput = Omit<Session, "id" | "evidence"> & { evidence?: Evidence[] };

export type UpsertContextDocInput = {
  projectId: string;
  scope: ContextDocScope;
  planId?: string;
  phaseId?: string;
  path: string;
  reason: string;
  summary: string;
  assumptions: string[];
  confidence: ContextDocConfidence;
  status: ContextDocStatus;
  readAt: string;
  readCommit?: string;
  observedMtime?: string;
};

export class ZenithRepository {
  constructor(private readonly db: Database) {}

  close(): void {
    this.db.close();
  }

  listMemoryEvidence(
    projectId: string,
    filters: { entityType?: MemoryEntityType; entityId?: string } = {},
  ): MemoryEvidenceRecord[] {
    const params: string[] = [projectId];
    let sql = "SELECT * FROM memory_evidence WHERE project_id = ?";
    if (filters.entityType) {
      sql += " AND entity_type = ?";
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      sql += " AND entity_id = ?";
      params.push(filters.entityId);
    }
    sql += " ORDER BY created_at ASC, id ASC";
    return this.db.query<MemoryEvidenceRow, string[]>(sql).all(...params).map(mapMemoryEvidence);
  }

  getLifecycle(projectId: string, entityType: MemoryEntityType, entityId: string): MemoryLifecycle | null {
    const row = this.db
      .query<MemoryLifecycleRow, [string, string, string]>(
        "SELECT * FROM memory_lifecycle WHERE project_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .get(projectId, entityType, entityId);
    return row?.lifecycle ?? null;
  }

  setLifecycle(input: {
    projectId: string;
    entityType: MemoryEntityType;
    entityId: string;
    lifecycle: MemoryLifecycle;
    reason?: string;
    supersededBy?: string;
  }): MemoryLifecycle {
    guardMemoryWrite(input, "lifecycle");
    const timestamp = nowIso();
    const existing = this.getLifecycle(input.projectId, input.entityType, input.entityId);
    this.db.transaction(() => {
      if (existing) {
        this.db
          .query(
            `UPDATE memory_lifecycle
             SET lifecycle = ?, reason = ?, superseded_by = ?, updated_at = ?
             WHERE project_id = ? AND entity_type = ? AND entity_id = ?`,
          )
          .run(
            input.lifecycle,
            input.reason ?? null,
            input.supersededBy ?? null,
            timestamp,
            input.projectId,
            input.entityType,
            input.entityId,
          );
      } else {
        this.db
          .query(
            `INSERT INTO memory_lifecycle (
              id, project_id, entity_type, entity_id, lifecycle, reason, superseded_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            createId("life"),
            input.projectId,
            input.entityType,
            input.entityId,
            input.lifecycle,
            input.reason ?? null,
            input.supersededBy ?? null,
            timestamp,
            timestamp,
          );
      }
      this.recordEvent(input.projectId, "memory.lifecycle_set", input.entityType, input.entityId, {
        lifecycle: input.lifecycle,
      });
    })();
    return input.lifecycle;
  }

  // Project identity
  registerProject(input: RegisterProjectInput): Project {
    const existing = this.findProjectByRootPath(input.rootPath);
    const timestamp = nowIso();

    if (existing) {
      this.db
        .query(
          `
          UPDATE projects
          SET name = ?, repository_url = ?, branch = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(input.name, input.repositoryUrl ?? null, input.branch ?? null, timestamp, existing.id);

      this.recordProjectPath(existing.id, input.rootPath, timestamp);
      if (input.worktreeRoot && input.worktreeRoot !== input.rootPath) {
        this.recordProjectPath(existing.id, input.worktreeRoot, timestamp);
      }

      return this.getProjectById(existing.id)!;
    }

    const id = createId("proj");
    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO projects (id, name, root_path, repository_url, branch, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(id, input.name, input.rootPath, input.repositoryUrl ?? null, input.branch ?? null, timestamp, timestamp);

      this.recordProjectPath(id, input.rootPath, timestamp);
      if (input.worktreeRoot && input.worktreeRoot !== input.rootPath) {
        this.recordProjectPath(id, input.worktreeRoot, timestamp);
      }

      this.recordEvent(id, "project.registered", "project", id, { rootPath: input.rootPath });
    })();

    return this.getProjectById(id)!;
  }

  private recordProjectPath(projectId: string, rootPath: string, timestamp: string): void {
    const updated = this.db
      .query("UPDATE project_paths SET last_seen_at = ? WHERE project_id = ? AND root_path = ?")
      .run(timestamp, projectId, rootPath);
    if (updated.changes === 0) {
      this.db
        .query(
          `
          INSERT OR IGNORE INTO project_paths (id, project_id, root_path, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run(createId("path"), projectId, rootPath, timestamp, timestamp);
    }
  }

  findProjectByRootPath(rootPath: string): Project | null {
    const direct = this.db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE root_path = ?").get(rootPath);
    if (direct) {
      return mapProject(direct);
    }

    const viaPath = this.db
      .query<ProjectRow, [string]>(
        `SELECT p.* FROM projects p
         JOIN project_paths pp ON pp.project_id = p.id
         WHERE pp.root_path = ?
         LIMIT 1`,
      )
      .get(rootPath);
    return viaPath ? mapProject(viaPath) : null;
  }

  getProjectById(projectId: string): Project | null {
    const row = this.db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?").get(projectId);
    return row ? mapProject(row) : null;
  }

  listProjects(): Project[] {
    return this.db
      .query<ProjectRow, []>("SELECT * FROM projects ORDER BY updated_at DESC")
      .all()
      .map(mapProject);
  }

  // Brief memory
  setProjectBrief(input: SetProjectBriefInput): ProjectBrief {
    guardMemoryWrite(input, "brief");
    const timestamp = nowIso();
    const row = this.db
      .query<{ version: number | null }, [string]>("SELECT MAX(version) AS version FROM project_briefs WHERE project_id = ?")
      .get(input.projectId);
    const version = (row?.version ?? 0) + 1;
    const id = createId("brief");

    this.db.transaction(() => {
      this.db
        .query("UPDATE project_briefs SET status = 'archived', updated_at = ? WHERE project_id = ? AND status = 'current'")
        .run(timestamp, input.projectId);

      this.db
        .query(
          `
          INSERT INTO project_briefs (
            id, project_id, version, title, summary, body, source,
            status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'current', ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          version,
          input.title,
          input.summary,
          input.body,
          input.source ?? null,
          timestamp,
          timestamp,
        );

      this.recordEvent(input.projectId, "brief.set", "brief", id, { title: input.title, version });
      this.syncLifecycle(input.projectId, "brief", id, "active", timestamp);
    })();

    const brief = this.getProjectBriefById(id);
    if (!brief) {
      throw new Error(`Brief not found after insert: ${id}`);
    }
    return brief;
  }

  getCurrentProjectBrief(projectId: string): ProjectBrief | null {
    const row = this.db
      .query<ProjectBriefRow, [string]>(
        "SELECT * FROM project_briefs WHERE project_id = ? AND status = 'current' ORDER BY version DESC LIMIT 1",
      )
      .get(projectId);
    return row ? mapProjectBrief(row) : null;
  }

  listProjectBriefs(projectId: string, limit = 10): ProjectBrief[] {
    return this.db
      .query<ProjectBriefRow, [string, number]>(
        "SELECT * FROM project_briefs WHERE project_id = ? ORDER BY version DESC LIMIT ?",
      )
      .all(projectId, limit)
      .map(mapProjectBrief);
  }

  getProjectBriefById(briefId: string): ProjectBrief | null {
    const row = this.db.query<ProjectBriefRow, [string]>("SELECT * FROM project_briefs WHERE id = ?").get(briefId);
    return row ? mapProjectBrief(row) : null;
  }

  // Roadmap memory
  createRoadmap(input: InsertRoadmapInput): Roadmap {
    guardMemoryWrite(input, "roadmap");
    const id = createId("roadmap");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.insertRoadmapRows(id, input, timestamp);
      this.syncLifecycle(input.projectId, "roadmap", id, lifecycleForRoadmapStatus(input.status), timestamp);
      this.recordEvent(input.projectId, "roadmap.created", "roadmap", id, { title: input.title });
    })();

    const roadmap = this.getRoadmapById(id);
    if (!roadmap) {
      throw new Error(`Roadmap not found after insert: ${id}`);
    }
    return roadmap;
  }

  importPlanAsRoadmap(
    plan: Plan,
    input: { title?: string; description?: string; status: RoadmapStatus; archivePlan: boolean },
  ): Roadmap {
    const id = createId("roadmap");
    const timestamp = nowIso();
    const roadmapInput: InsertRoadmapInput = {
      projectId: plan.projectId,
      title: input.title ?? plan.title,
      ...((input.description ?? plan.description) ? { description: (input.description ?? plan.description)! } : {}),
      status: input.status,
      sourcePlanId: plan.id,
      items: plan.phases.map((phase) => ({
        title: phase.title,
        ...(phase.description ? { description: phase.description } : {}),
        status: phaseStatusToRoadmapItemStatus(phase.status),
        evidence: phase.evidence,
        sourcePhaseId: phase.id,
      })),
    };

    this.db.transaction(() => {
      this.insertRoadmapRows(id, roadmapInput, timestamp);
      this.syncLifecycle(plan.projectId, "roadmap", id, lifecycleForRoadmapStatus(input.status), timestamp);
      this.recordEvent(plan.projectId, "roadmap.created", "roadmap", id, { title: roadmapInput.title });

      if (input.archivePlan) {
        this.db
          .query("UPDATE plans SET status = 'archived', updated_at = ? WHERE id = ?")
          .run(timestamp, plan.id);
        this.recordEvent(plan.projectId, "plan.updated", "plan", plan.id, { status: "archived" });
      }
    })();

    return this.getRoadmapById(id)!;
  }

  listRoadmaps(projectId: string, limit = 10): Roadmap[] {
    return this.db
      .query<RoadmapRow, [string, number]>("SELECT * FROM roadmaps WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?")
      .all(projectId, limit)
      .map((row) => this.mapRoadmap(row));
  }

  getRoadmapById(roadmapId: string): Roadmap | null {
    const row = this.db.query<RoadmapRow, [string]>("SELECT * FROM roadmaps WHERE id = ?").get(roadmapId);
    return row ? this.mapRoadmap(row) : null;
  }

  addRoadmapItem(roadmapId: string, input: AddRoadmapItemInput): Roadmap {
    guardMemoryWrite(input, "roadmap_item");
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${roadmapId}`);
    }

    const position = resolveRoadmapInsertPosition(roadmap.items, input);
    const timestamp = nowIso();
    const itemId = input.id ?? createId("rmi");
    const itemsToShift = roadmap.items
      .map((item, index) => ({ id: item.id, nextPosition: index + 1, currentPosition: index }))
      .filter((item) => item.currentPosition >= position)
      .reverse();

    this.db.transaction(() => {
      for (const item of itemsToShift) {
        this.db
          .query("UPDATE roadmap_items SET position = ?, updated_at = ? WHERE id = ?")
          .run(item.nextPosition, timestamp, item.id);
      }

      this.db
        .query(
          `
          INSERT INTO roadmap_items (
            id, roadmap_id, position, title, description, status,
            justification, evidence_json, source_phase_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          itemId,
          roadmapId,
          position,
          input.title,
          input.description ?? null,
          input.status,
          input.justification ?? null,
          JSON.stringify(normalizeStoredEvidence(input.evidence)),
          input.sourcePhaseId ?? null,
          timestamp,
          timestamp,
        );

      this.db.query("UPDATE roadmaps SET updated_at = ? WHERE id = ?").run(timestamp, roadmapId);
      this.insertEvidenceRecords(roadmap.projectId, "roadmap_item", itemId, input.evidence, timestamp);
      this.syncLifecycle(roadmap.projectId, "roadmap_item", itemId, lifecycleForRoadmapItemStatus(input.status), timestamp);
      this.recordEvent(roadmap.projectId, "roadmap.item_added", "roadmap_item", itemId, {
        title: input.title,
        position,
      });
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  updateRoadmap(roadmapId: string, patch: UpdateRoadmapPatch): Roadmap {
    guardMemoryWrite(patch, "roadmap");
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${roadmapId}`);
    }

    const timestamp = nowIso();
    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE roadmaps
          SET title = ?, description = ?, status = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.title ?? roadmap.title,
          patch.description ?? roadmap.description ?? null,
          patch.status ?? roadmap.status,
          timestamp,
          roadmapId,
      );

      if (patch.status) {
        this.syncLifecycle(roadmap.projectId, "roadmap", roadmap.id, lifecycleForRoadmapStatus(patch.status), timestamp);
      }
      this.recordEvent(roadmap.projectId, "roadmap.updated", "roadmap", roadmap.id, patch);
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  updateRoadmapItem(
    roadmapId: string,
    itemIdOrTitle: { itemId?: string; itemTitle?: string },
    patch: UpdateRoadmapItemPatch,
  ): Roadmap {
    guardMemoryWrite(patch, "roadmap_item");
    const roadmap = this.getRoadmapById(roadmapId);
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${roadmapId}`);
    }

    const item = itemIdOrTitle.itemId
      ? roadmap.items.find((candidate) => candidate.id === itemIdOrTitle.itemId)
      : roadmap.items.find((candidate) => candidate.title === itemIdOrTitle.itemTitle);

    if (!item) {
      throw new Error("Roadmap item not found");
    }

    const timestamp = nowIso();
    const nextEvidence =
      patch.evidence === undefined ? item.evidence : [...item.evidence, ...normalizeStoredEvidence(patch.evidence)];

    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE roadmap_items
          SET title = ?, description = ?, justification = ?, status = ?, evidence_json = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.title ?? item.title,
          patch.description ?? item.description ?? null,
          patch.justification ?? item.justification ?? null,
          patch.status ?? item.status,
          JSON.stringify(nextEvidence),
          timestamp,
          item.id,
        );

      this.db.query("UPDATE roadmaps SET updated_at = ? WHERE id = ?").run(timestamp, roadmapId);
      if (patch.evidence) {
        this.insertEvidenceRecords(roadmap.projectId, "roadmap_item", item.id, patch.evidence, timestamp);
      }
      if (patch.status) {
        this.syncLifecycle(roadmap.projectId, "roadmap_item", item.id, lifecycleForRoadmapItemStatus(patch.status), timestamp);
      }
      this.recordEvent(roadmap.projectId, "roadmap.item_updated", "roadmap_item", item.id, patch);
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  // Spike memory
  createSpike(input: InsertSpikeInput): Spike {
    guardMemoryWrite(input, "spike");
    const id = createId("spike");
    const timestamp = nowIso();
    const concludedAt = input.status === "open" ? null : timestamp;

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO spikes (
            id, project_id, title, question, hypothesis, options_json,
            result, recommendation, evidence_json, status,
            created_at, updated_at, concluded_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.title,
          input.question,
          input.hypothesis ?? null,
          JSON.stringify(input.options),
          input.result ?? null,
          input.recommendation ?? null,
          JSON.stringify(normalizeStoredEvidence(input.evidence)),
          input.status,
          timestamp,
          timestamp,
          concludedAt,
        );

      this.insertEvidenceRecords(input.projectId, "spike", id, input.evidence, timestamp);
      this.syncLifecycle(input.projectId, "spike", id, lifecycleForSpikeStatus(input.status), timestamp);
      this.recordEvent(input.projectId, "spike.created", "spike", id, { title: input.title, status: input.status });
    })();

    const spike = this.getSpikeById(id);
    if (!spike) {
      throw new Error(`Spike not found after insert: ${id}`);
    }
    return spike;
  }

  listSpikes(projectId: string, limit = 10): Spike[] {
    return this.db
      .query<SpikeRow, [string, number]>("SELECT * FROM spikes WHERE project_id = ? ORDER BY updated_at DESC LIMIT ?")
      .all(projectId, limit)
      .map(mapSpike);
  }

  listOpenSpikes(projectId: string): Spike[] {
    return this.db
      .query<SpikeRow, [string]>("SELECT * FROM spikes WHERE project_id = ? AND status = 'open' ORDER BY updated_at DESC")
      .all(projectId)
      .map(mapSpike);
  }

  getSpikeById(spikeId: string): Spike | null {
    const row = this.db.query<SpikeRow, [string]>("SELECT * FROM spikes WHERE id = ?").get(spikeId);
    return row ? mapSpike(row) : null;
  }

  concludeSpike(spikeId: string, patch: ConcludeSpikePatch): Spike {
    guardMemoryWrite(patch, "spike");
    const spike = this.getSpikeById(spikeId);
    if (!spike) {
      throw new Error(`Spike not found: ${spikeId}`);
    }

    const timestamp = nowIso();
    const nextEvidence =
      patch.evidence === undefined ? spike.evidence : [...spike.evidence, ...normalizeStoredEvidence(patch.evidence)];

    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE spikes
          SET result = ?, recommendation = ?, evidence_json = ?, status = ?, updated_at = ?, concluded_at = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.result ?? spike.result ?? null,
          patch.recommendation ?? spike.recommendation ?? null,
          JSON.stringify(nextEvidence),
          patch.status,
          timestamp,
          timestamp,
          spikeId,
        );

      if (patch.evidence) {
        this.insertEvidenceRecords(spike.projectId, "spike", spike.id, patch.evidence, timestamp);
      }
      this.syncLifecycle(spike.projectId, "spike", spike.id, lifecycleForSpikeStatus(patch.status), timestamp);
      this.recordEvent(spike.projectId, "spike.concluded", "spike", spike.id, patch);
    })();

    return this.getSpikeById(spikeId)!;
  }

  // Plan memory
  createPlan(input: InsertPlanInput): Plan {
    guardMemoryWrite(input, "plan");
    const id = createId("plan");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO plans (
            id, project_id, title, description, status, priority,
            source_roadmap_id, source_roadmap_item_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.title,
          input.description ?? null,
          input.status,
          input.priority ?? null,
          input.sourceRoadmapId ?? null,
          input.sourceRoadmapItemId ?? null,
          timestamp,
          timestamp,
        );

      input.phases.forEach((phase, index) => {
        const phaseId = phase.id ?? createId("phase");
        this.db
          .query(
            `
            INSERT INTO plan_phases (
              id, plan_id, position, title, description, status,
              acceptance_criteria_json, evidence_json, depends_on_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            phaseId,
            id,
            index,
            phase.title,
            phase.description ?? null,
            phase.status,
            JSON.stringify(phase.acceptanceCriteria),
            JSON.stringify(normalizeStoredEvidence(phase.evidence)),
            JSON.stringify(phase.dependsOn ?? []),
            timestamp,
            timestamp,
          );
        this.insertEvidenceRecords(input.projectId, "phase", phaseId, phase.evidence, timestamp);
        this.syncLifecycle(input.projectId, "phase", phaseId, lifecycleForPhaseStatus(phase.status), timestamp);
      });

      this.syncLifecycle(input.projectId, "plan", id, lifecycleForPlanStatus(input.status), timestamp);
      this.recordEvent(input.projectId, "plan.created", "plan", id, {
        title: input.title,
        sourceRoadmapId: input.sourceRoadmapId,
        sourceRoadmapItemId: input.sourceRoadmapItemId,
      });
    })();

    return this.getPlanById(id)!;
  }

  listPlans(projectId: string): Plan[] {
    return this.db
      .query<PlanRow, [string]>("SELECT * FROM plans WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId)
      .map((row) => this.mapPlan(row));
  }

  getPlanById(planId: string): Plan | null {
    const row = this.db.query<PlanRow, [string]>("SELECT * FROM plans WHERE id = ?").get(planId);
    return row ? this.mapPlan(row) : null;
  }

  getPlanByPhaseId(phaseId: string): { plan: Plan; phase: PlanPhase } | null {
    const row = this.db
      .query<{ plan_id: string }, [string]>("SELECT plan_id FROM plan_phases WHERE id = ?")
      .get(phaseId);

    if (!row) {
      return null;
    }

    const plan = this.getPlanById(row.plan_id);
    const phase = plan?.phases.find((candidate) => candidate.id === phaseId);
    return plan && phase ? { plan, phase } : null;
  }

  getActivePlan(projectId: string): Plan | null {
    const row = this.db
      .query<PlanRow, [string]>(
        "SELECT * FROM plans WHERE project_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(projectId);

    return row ? this.mapPlan(row) : null;
  }

  listActivePlans(projectId: string): Plan[] {
    return this.db
      .query<PlanRow, [string]>(
        "SELECT * FROM plans WHERE project_id = ? AND status = 'active' ORDER BY updated_at DESC",
      )
      .all(projectId)
      .map((row) => this.mapPlan(row));
  }

  getActivePlanForRoadmap(projectId: string, roadmapId: string): Plan | null {
    const row = this.db
      .query<PlanRow, [string, string]>(
        "SELECT * FROM plans WHERE project_id = ? AND source_roadmap_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(projectId, roadmapId);

    return row ? this.mapPlan(row) : null;
  }

  // Roadmap focus (worktree/branch -> roadmap binding)
  getFocus(projectId: string, worktreeKey: string): RoadmapFocus | null {
    const row = this.db
      .query<RoadmapFocusRow, [string, string]>(
        "SELECT * FROM roadmap_focus WHERE project_id = ? AND worktree_key = ?",
      )
      .get(projectId, worktreeKey);
    return row ? mapRoadmapFocus(row) : null;
  }

  listFocus(projectId: string): RoadmapFocus[] {
    return this.db
      .query<RoadmapFocusRow, [string]>("SELECT * FROM roadmap_focus WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId)
      .map(mapRoadmapFocus);
  }

  setFocus(input: { projectId: string; worktreeKey: string; roadmapId: string; branch?: string }): RoadmapFocus {
    const roadmap = this.db
      .query<{ id: string }, [string, string]>("SELECT id FROM roadmaps WHERE id = ? AND project_id = ?")
      .get(input.roadmapId, input.projectId);
    if (!roadmap) {
      throw new Error(`Roadmap not found: ${input.roadmapId}`);
    }

    const timestamp = nowIso();
    const existing = this.getFocus(input.projectId, input.worktreeKey);

    if (existing) {
      this.db
        .query("UPDATE roadmap_focus SET roadmap_id = ?, branch = ?, updated_at = ? WHERE id = ?")
        .run(input.roadmapId, input.branch ?? null, timestamp, existing.id);
    } else {
      this.db
        .query(
          `INSERT INTO roadmap_focus (id, project_id, worktree_key, branch, roadmap_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(createId("focus"), input.projectId, input.worktreeKey, input.branch ?? null, input.roadmapId, timestamp, timestamp);
    }

    this.recordEvent(input.projectId, "focus.set", "roadmap", input.roadmapId, {
      worktreeKey: input.worktreeKey,
      branch: input.branch ?? null,
    });

    return this.getFocus(input.projectId, input.worktreeKey)!;
  }

  clearFocus(projectId: string, worktreeKey: string): boolean {
    const result = this.db
      .query("DELETE FROM roadmap_focus WHERE project_id = ? AND worktree_key = ?")
      .run(projectId, worktreeKey);
    return result.changes > 0;
  }

  // Agent choreography stage state
  getAgentStage(projectId: string, scope: AgentStageScope = {}): AgentStageState | null {
    const row = this.db
      .query<AgentStageRow, [string, string]>(
        "SELECT * FROM agent_stages WHERE project_id = ? AND scope_key = ?",
      )
      .get(projectId, agentStageScopeKey(scope));

    return row ? mapAgentStage(row) : null;
  }

  listAgentStages(projectId: string): AgentStageState[] {
    return this.db
      .query<AgentStageRow, [string]>("SELECT * FROM agent_stages WHERE project_id = ? ORDER BY updated_at DESC")
      .all(projectId)
      .map(mapAgentStage);
  }

  setAgentStage(input: {
    projectId: string;
    stage: AgentStage;
    planId?: string;
    phaseId?: string;
    role?: string;
    note?: string;
  }): AgentStageState {
    guardMemoryWrite(input, "stage");
    const scope = { ...(input.planId ? { planId: input.planId } : {}), ...(input.phaseId ? { phaseId: input.phaseId } : {}) };
    const scopeKey = agentStageScopeKey(scope);
    const timestamp = nowIso();
    const existing = this.getAgentStage(input.projectId, scope);

    this.db.transaction(() => {
      if (existing) {
        this.db
          .query(
            `
            UPDATE agent_stages
            SET stage = ?, role = ?, note = ?, updated_at = ?
            WHERE id = ?
          `,
          )
          .run(input.stage, input.role ?? null, input.note ?? null, timestamp, existing.id);
      } else {
        this.db
          .query(
            `
            INSERT INTO agent_stages (
              id, project_id, scope_key, plan_id, phase_id, stage,
              role, note, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            createId("stage"),
            input.projectId,
            scopeKey,
            input.planId ?? null,
            input.phaseId ?? null,
            input.stage,
            input.role ?? null,
            input.note ?? null,
            timestamp,
            timestamp,
          );
      }

      this.recordEvent(input.projectId, "stage.changed", "agent_stage", scopeKey, {
        stage: input.stage,
        scopeKey,
        planId: input.planId,
        phaseId: input.phaseId,
        role: input.role,
      });
    })();

    return this.getAgentStage(input.projectId, scope)!;
  }

  // Memory discovery tags
  setMemoryTags(input: {
    projectId: string;
    entityType: MemoryEntityType;
    entityId: string;
    tags: string[];
  }): MemoryTag[] {
    guardMemoryWrite(input, "memory_tags");
    const timestamp = nowIso();
    const uniqueTags = [...new Set(input.tags)];

    this.db.transaction(() => {
      this.db
        .query("DELETE FROM memory_tags WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
        .run(input.projectId, input.entityType, input.entityId);

      for (const tag of uniqueTags) {
        this.db
          .query(
            `
            INSERT INTO memory_tags (
              id, project_id, entity_type, entity_id, tag, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(createId("tag"), input.projectId, input.entityType, input.entityId, tag, timestamp, timestamp);
      }

      this.recordEvent(input.projectId, "memory.tags_set", "memory_tag", `${input.entityType}:${input.entityId}`, {
        entityType: input.entityType,
        entityId: input.entityId,
        tags: uniqueTags,
      });
    })();

    return this.listMemoryTags(input.projectId, {
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }

  upsertTagCatalog(input: CreateTagCatalogInput): TagCatalogEntry {
    guardMemoryWrite(input, "tag_catalog");
    const timestamp = nowIso();
    const existing = this.getTagCatalogEntry(input.projectId, input.tag);
    this.db.transaction(() => {
      if (existing) {
        this.db
          .query("UPDATE tag_catalog SET description = ?, updated_at = ? WHERE id = ?")
          .run(input.description ?? existing.description ?? null, timestamp, existing.id);
      } else {
        this.db
          .query(
            "INSERT INTO tag_catalog (id, project_id, tag, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .run(createId("tagcat"), input.projectId, input.tag, input.description ?? null, timestamp, timestamp);
      }
      this.recordEvent(input.projectId, "tag.catalog_upserted", "tag_catalog", input.tag, {
        tag: input.tag,
      });
    })();
    return this.getTagCatalogEntry(input.projectId, input.tag)!;
  }

  upsertTagAlias(input: CreateTagAliasInput): TagAlias {
    guardMemoryWrite(input, "tag_alias");
    const timestamp = nowIso();
    const target = this.getTagCatalogEntry(input.projectId, input.tag);
    if (!target) {
      throw new ZenithError(`Tag not found: ${input.tag}`, {
        code: "tag_not_found",
        details: { tag: input.tag },
      });
    }
    const existing = this.getTagAlias(input.projectId, input.alias);
    this.db.transaction(() => {
      if (existing) {
        this.db.query("UPDATE tag_aliases SET tag = ?, updated_at = ? WHERE id = ?").run(input.tag, timestamp, existing.id);
      } else {
        this.db
          .query("INSERT INTO tag_aliases (id, project_id, alias, tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(createId("tagalias"), input.projectId, input.alias, input.tag, timestamp, timestamp);
      }
      this.recordEvent(input.projectId, "tag.alias_upserted", "tag_alias", input.alias, {
        alias: input.alias,
        tag: input.tag,
      });
    })();
    return this.getTagAlias(input.projectId, input.alias)!;
  }

  getTagCatalogEntry(projectId: string, tag: string): TagCatalogEntry | null {
    const row = this.db
      .query<TagCatalogRow, [string, string]>(
        `SELECT c.*, COUNT(t.id) AS usage_count
         FROM tag_catalog c
         LEFT JOIN memory_tags t ON t.project_id = c.project_id AND t.tag = c.tag
         WHERE c.project_id = ? AND c.tag = ?
         GROUP BY c.id`,
      )
      .get(projectId, tag);
    return row ? mapTagCatalogEntry(row) : null;
  }

  getTagAlias(projectId: string, alias: string): TagAlias | null {
    const row = this.db
      .query<TagAliasRow, [string, string]>("SELECT * FROM tag_aliases WHERE project_id = ? AND alias = ?")
      .get(projectId, alias);
    return row ? mapTagAlias(row) : null;
  }

  resolveTagAlias(projectId: string, tag: string): string {
    return this.getTagAlias(projectId, tag)?.tag ?? tag;
  }

  listTagCatalog(projectId: string, options: { unused?: boolean } = {}): TagCatalogEntry[] {
    const params: string[] = [projectId];
    let sql = `
      SELECT c.*, COUNT(t.id) AS usage_count
      FROM tag_catalog c
      LEFT JOIN memory_tags t ON t.project_id = c.project_id AND t.tag = c.tag
      WHERE c.project_id = ?
      GROUP BY c.id
    `;
    if (options.unused) {
      sql += " HAVING COUNT(t.id) = 0";
    }
    sql += " ORDER BY c.tag ASC";
    return this.db.query<TagCatalogRow, string[]>(sql).all(...params).map(mapTagCatalogEntry);
  }

  listMemoryTags(projectId: string, filters: MemoryTagFilters = {}): MemoryTag[] {
    const params: string[] = [projectId];
    let sql = "SELECT * FROM memory_tags WHERE project_id = ?";

    if (filters.tag) {
      sql += " AND tag = ?";
      params.push(filters.tag);
    }
    if (filters.entityType) {
      sql += " AND entity_type = ?";
      params.push(filters.entityType);
    }
    if (filters.entityId) {
      sql += " AND entity_id = ?";
      params.push(filters.entityId);
    }

    sql += " ORDER BY tag ASC, entity_type ASC, entity_id ASC";

    return this.db.query<MemoryTagRow, string[]>(sql).all(...params).map(mapMemoryTag);
  }

  createClaim(input: CreateClaimInput): MemoryClaim {
    guardMemoryWrite(input, "claim");
    const timestamp = nowIso();
    this.expireClaims(input.projectId, timestamp);
    const expiresAt = new Date(Date.parse(timestamp) + input.ttlMs).toISOString();
    const activeClaims = this.listClaims(input.projectId, { status: "active", includeExpired: false });
    const conflict = activeClaims.find((claim) => claim.id !== input.entityId && scopesOverlap(claim.scope, input.scope));
    if (conflict) {
      throw new ZenithError(`Claim conflicts with active claim ${conflict.id}.`, {
        code: "claim_conflict",
        details: { claimId: conflict.id, scope: conflict.scope },
      });
    }

    const id = createId("claim");
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO memory_claims (
            id, project_id, entity_id, scope, role, owner, worktree, branch, hostname,
            status, created_at, expires_at, released_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.entityId,
          normalizeScope(input.scope),
          input.role,
          input.owner ?? null,
          input.worktree ?? null,
          input.branch ?? null,
          input.hostname ?? null,
          timestamp,
          expiresAt,
          timestamp,
        );
      this.recordEvent(input.projectId, "claim.created", "claim", id, {
        entityId: input.entityId,
        scope: normalizeScope(input.scope),
        role: input.role,
        expiresAt,
      });
    })();
    return this.getClaimById(id)!;
  }

  getClaimById(claimId: string): MemoryClaim | null {
    const row = this.db.query<MemoryClaimRow, [string]>("SELECT * FROM memory_claims WHERE id = ?").get(claimId);
    return row ? mapMemoryClaim(row) : null;
  }

  listClaims(
    projectId: string,
    options: { status?: MemoryClaim["status"]; includeExpired?: boolean } = {},
  ): MemoryClaim[] {
    const now = nowIso();
    this.expireClaims(projectId, now);
    const params: string[] = [projectId];
    let sql = "SELECT * FROM memory_claims WHERE project_id = ?";
    if (options.status) {
      sql += " AND status = ?";
      params.push(options.status);
    }
    if (!options.includeExpired) {
      sql += " AND NOT (status = 'expired')";
    }
    sql += " ORDER BY updated_at DESC, id DESC";
    return this.db.query<MemoryClaimRow, string[]>(sql).all(...params).map(mapMemoryClaim);
  }

  refreshClaim(input: RefreshClaimInput): MemoryClaim {
    const timestamp = nowIso();
    this.expireClaims(input.projectId, timestamp);
    const claim = this.getClaimById(input.claimId);
    if (!claim || claim.projectId !== input.projectId) {
      throw new ZenithError(`Claim not found: ${input.claimId}`, {
        code: "claim_not_found",
        details: { claimId: input.claimId },
      });
    }
    if (claim.status !== "active") {
      throw new ZenithError(`Claim is not active: ${input.claimId}`, {
        code: "claim_not_active",
        details: { claimId: input.claimId, status: claim.status },
      });
    }
    const expiresAt = new Date(Date.parse(timestamp) + input.ttlMs).toISOString();
    this.db.transaction(() => {
      this.db.query("UPDATE memory_claims SET expires_at = ?, updated_at = ? WHERE id = ?").run(expiresAt, timestamp, input.claimId);
      this.recordEvent(input.projectId, "claim.refreshed", "claim", input.claimId, { expiresAt });
    })();
    return this.getClaimById(input.claimId)!;
  }

  releaseClaim(projectId: string, claimIdOrEntityId: string): MemoryClaim[] {
    const timestamp = nowIso();
    this.expireClaims(projectId, timestamp);
    const claims = this.db
      .query<MemoryClaimRow, [string, string, string]>(
        "SELECT * FROM memory_claims WHERE project_id = ? AND status = 'active' AND (id = ? OR entity_id = ?)",
      )
      .all(projectId, claimIdOrEntityId, claimIdOrEntityId)
      .map(mapMemoryClaim);
    if (claims.length === 0) {
      throw new ZenithError(`Claim not found: ${claimIdOrEntityId}`, {
        code: "claim_not_found",
        details: { claimIdOrEntityId },
      });
    }
    this.db.transaction(() => {
      for (const claim of claims) {
        this.db
          .query("UPDATE memory_claims SET status = 'released', released_at = ?, updated_at = ? WHERE id = ?")
          .run(timestamp, timestamp, claim.id);
        this.recordEvent(projectId, "claim.released", "claim", claim.id, {
          entityId: claim.entityId,
          scope: claim.scope,
        });
      }
    })();
    return claims.map((claim) => this.getClaimById(claim.id)!).filter(Boolean);
  }

  inspectRawEntity(projectId: string, entityType: MemoryEntityType, entityId: string): RawMemoryEntity {
    const raw = this.getMemoryEntity(projectId, entityType, entityId);
    if (!raw) {
      throw new ZenithError(`Memory entity not found: ${entityType}:${entityId}`, {
        code: "memory_entity_not_found",
        details: { entityType, entityId },
      });
    }
    return RawMemoryEntitySchema.parse({
      entityType,
      entityId,
      raw,
      evidence: this.listMemoryEvidence(projectId, { entityType, entityId }),
      lifecycle: this.getLifecycle(projectId, entityType, entityId) ?? lifecycleForEntity(raw),
      tags: this.listMemoryTags(projectId, { entityType, entityId }).map((tag) => tag.tag),
    });
  }

  purge(target: PurgeTarget): { purged: boolean; entityType: string; entityId: string } {
    const timestamp = nowIso();
    if (target.kind === "tag") {
      this.db.transaction(() => {
        this.db.query("DELETE FROM memory_tags WHERE project_id = ? AND tag = ?").run(target.projectId, target.tag);
        this.db.query("DELETE FROM tag_aliases WHERE project_id = ? AND (tag = ? OR alias = ?)").run(target.projectId, target.tag, target.tag);
        this.db.query("DELETE FROM tag_catalog WHERE project_id = ? AND tag = ?").run(target.projectId, target.tag);
        this.recordTombstone(target.projectId, "tag", target.tag, target.reason, timestamp);
        this.recordEvent(target.projectId, "memory.purged", "tag", target.tag, { entityType: "tag" });
      })();
      return { purged: true, entityType: "tag", entityId: target.tag };
    }

    if (target.kind === "project") {
      this.db.transaction(() => {
        this.recordTombstone(target.projectId, "project", target.projectId, target.reason, timestamp);
        this.recordEvent(null, "memory.purged", "project", target.projectId, { entityType: "project" });
        this.db.query("DELETE FROM projects WHERE id = ?").run(target.projectId);
      })();
      return { purged: true, entityType: "project", entityId: target.projectId };
    }

    this.db.transaction(() => {
      this.deleteMemoryEntity(target.entityType, target.entityId);
      this.db
        .query("DELETE FROM memory_tags WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
        .run(target.projectId, target.entityType, target.entityId);
      this.db
        .query("DELETE FROM memory_evidence WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
        .run(target.projectId, target.entityType, target.entityId);
      this.db
        .query("DELETE FROM memory_lifecycle WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
        .run(target.projectId, target.entityType, target.entityId);
      this.recordTombstone(target.projectId, target.entityType, target.entityId, target.reason, timestamp);
      this.recordEvent(target.projectId, "memory.purged", target.entityType, target.entityId, { entityType: target.entityType });
    })();
    return { purged: true, entityType: target.entityType, entityId: target.entityId };
  }

  listSearchableMemoryEntities(projectId: string): SearchableMemoryEntity[] {
    const records: SearchableMemoryEntity[] = [];
    const briefs = this.listProjectBriefs(projectId, 1000);
    const roadmaps = this.listRoadmaps(projectId, 1000);
    const plans = this.listPlans(projectId);
    const spikes = this.listSpikes(projectId, 1000);
    const decisions = this.listDecisions(projectId, 1000);
    const findings = this.listFindings(projectId, "all");
    const sessions = this.listSessions(projectId, 1000);
    const contextDocs = this.listContextDocs(projectId);

    for (const brief of briefs) {
      records.push({
        entityType: "brief",
        entityId: brief.id,
        title: brief.title,
        text: joinSearchText([brief.title, brief.summary, brief.body, brief.source, brief.status]),
        updatedAt: brief.updatedAt,
        lifecycle: brief.lifecycle,
      });
    }

    for (const roadmap of roadmaps) {
      records.push({
        entityType: "roadmap",
        entityId: roadmap.id,
        title: roadmap.title,
        text: joinSearchText([roadmap.title, roadmap.description, roadmap.status]),
        updatedAt: roadmap.updatedAt,
        lifecycle: roadmap.lifecycle,
      });
      for (const item of roadmap.items) {
        records.push({
          entityType: "roadmap_item",
          entityId: item.id,
          title: item.title,
          text: joinSearchText([
            item.title,
            item.description,
            item.justification,
            item.status,
            ...item.evidence.map((evidence) => evidence.value),
          ]),
          updatedAt: roadmap.updatedAt,
          lifecycle: item.lifecycle,
        });
      }
    }

    for (const plan of plans) {
      records.push({
        entityType: "plan",
        entityId: plan.id,
        title: plan.title,
        text: joinSearchText([plan.title, plan.description, plan.status, plan.priority, plan.sourceRoadmapId, plan.sourceRoadmapItemId]),
        updatedAt: plan.updatedAt,
        lifecycle: plan.lifecycle,
      });
      for (const phase of plan.phases) {
        records.push({
          entityType: "phase",
          entityId: phase.id,
          title: phase.title,
          text: joinSearchText([
            phase.title,
            phase.description,
            phase.status,
            ...phase.acceptanceCriteria,
            ...phase.dependsOn,
            ...phase.evidence.map((evidence) => evidence.value),
          ]),
          updatedAt: plan.updatedAt,
          lifecycle: phase.lifecycle,
        });
      }
    }

    for (const spike of spikes) {
      records.push({
        entityType: "spike",
        entityId: spike.id,
        title: spike.title,
        text: joinSearchText([
          spike.title,
          spike.question,
          spike.hypothesis,
          ...spike.options,
          spike.result,
          spike.recommendation,
          spike.status,
          ...spike.evidence.map((evidence) => evidence.value),
        ]),
        updatedAt: spike.updatedAt,
        lifecycle: spike.lifecycle,
      });
    }

    for (const decision of decisions) {
      records.push({
        entityType: "decision",
        entityId: decision.id,
        title: decision.title,
        text: joinSearchText([
          decision.title,
          decision.context,
          decision.decision,
          decision.consequences,
          ...decision.alternatives,
          ...decision.relatedPlanIds,
          ...decision.evidence.map((evidence) => evidence.value),
        ]),
        updatedAt: decision.createdAt,
        lifecycle: decision.lifecycle,
      });
    }

    for (const finding of findings) {
      records.push({
        entityType: "finding",
        entityId: finding.id,
        title: finding.title,
        text: joinSearchText([
          finding.title,
          finding.description,
          finding.type,
          finding.severity,
          finding.status,
          ...finding.relatedFiles,
          finding.relatedPlanId,
          finding.relatedPhaseId,
          ...finding.evidence.map((evidence) => evidence.value),
        ]),
        updatedAt: finding.closedAt ?? finding.createdAt,
        lifecycle: finding.lifecycle,
      });
    }

    for (const session of sessions) {
      records.push({
        entityType: "session",
        entityId: session.id,
        title: session.summary ?? session.id,
        text: joinSearchText([
          session.id,
          session.summary,
          session.branch,
          session.relatedPlanId,
          ...session.changedFiles,
          ...session.nextSteps,
          ...session.evidence.map((evidence) => evidence.value),
        ]),
        updatedAt: session.endedAt ?? session.startedAt,
        lifecycle: session.lifecycle,
      });
    }

    for (const doc of contextDocs) {
      records.push({
        entityType: "context_doc",
        entityId: doc.id,
        title: doc.path,
        text: joinSearchText([
          doc.path,
          doc.scope,
          doc.reason,
          doc.summary,
          doc.confidence,
          doc.status,
          doc.readCommit,
          ...doc.assumptions,
        ]),
        updatedAt: doc.updatedAt,
        lifecycle: doc.lifecycle,
      });
    }

    return records;
  }

  // Context docs: lightweight anchors, not copied docs
  listContextDocs(projectId: string, filters: { status?: ContextDocStatus; scope?: ContextDocScope } = {}): ContextDoc[] {
    const params: string[] = [projectId];
    let sql = "SELECT * FROM context_docs WHERE project_id = ?";

    if (filters.status) {
      sql += " AND status = ?";
      params.push(filters.status);
    }
    if (filters.scope) {
      sql += " AND scope = ?";
      params.push(filters.scope);
    }

    sql += " ORDER BY status ASC, updated_at DESC, path ASC";
    return this.db.query<ContextDocRow, string[]>(sql).all(...params).map(mapContextDoc);
  }

  getContextDocByPath(input: {
    projectId: string;
    scope: ContextDocScope;
    planId?: string;
    phaseId?: string;
    path: string;
  }): ContextDoc | null {
    const row = this.db
      .query<ContextDocRow, [string, string, string, string, string]>(
        `
        SELECT * FROM context_docs
        WHERE project_id = ?
          AND scope = ?
          AND IFNULL(plan_id, '') = ?
          AND IFNULL(phase_id, '') = ?
          AND path = ?
        LIMIT 1
      `,
      )
      .get(input.projectId, input.scope, input.planId ?? "", input.phaseId ?? "", input.path);
    return row ? mapContextDoc(row) : null;
  }

  upsertContextDoc(input: UpsertContextDocInput): ContextDoc {
    guardMemoryWrite(input, "context_doc");
    const timestamp = nowIso();
    const existing = this.getContextDocByPath(input);
    const id = existing?.id ?? createId("ctxdoc");

    this.db.transaction(() => {
      if (existing) {
        this.db
          .query(
            `
            UPDATE context_docs
            SET reason = ?, summary = ?, assumptions_json = ?, confidence = ?, status = ?,
                read_at = ?, read_commit = ?, observed_mtime = ?, updated_at = ?
            WHERE id = ?
          `,
          )
          .run(
            input.reason,
            input.summary,
            JSON.stringify(input.assumptions),
            input.confidence,
            input.status,
            input.readAt,
            input.readCommit ?? null,
            input.observedMtime ?? null,
            timestamp,
            existing.id,
          );
      } else {
        this.db
          .query(
            `
            INSERT INTO context_docs (
              id, project_id, scope, plan_id, phase_id, path, reason, summary,
              assumptions_json, confidence, status, read_at, read_commit,
              observed_mtime, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            id,
            input.projectId,
            input.scope,
            input.planId ?? null,
            input.phaseId ?? null,
            input.path,
            input.reason,
            input.summary,
            JSON.stringify(input.assumptions),
            input.confidence,
            input.status,
            input.readAt,
            input.readCommit ?? null,
            input.observedMtime ?? null,
            timestamp,
            timestamp,
          );
      }

      this.recordEvent(input.projectId, "context_doc.upserted", "context_doc", id, {
        path: input.path,
        scope: input.scope,
        status: input.status,
      });
      this.syncLifecycle(input.projectId, "context_doc", id, input.status === "ignored" ? "archived" : "active", timestamp);
    })();

    const doc = this.getContextDocByPath(input);
    if (!doc) {
      throw new Error(`Context doc not found after upsert: ${input.path}`);
    }
    return doc;
  }

  updatePlan(planId: string, patch: UpdatePlanPatch): Plan {
    guardMemoryWrite(patch, "plan");
    const plan = this.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const timestamp = nowIso();
    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE plans
          SET title = ?, description = ?, status = ?, priority = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.title ?? plan.title,
          patch.description ?? plan.description ?? null,
          patch.status ?? plan.status,
          patch.priority ?? plan.priority ?? null,
          timestamp,
          planId,
        );

      if (patch.status) {
        this.syncLifecycle(plan.projectId, "plan", plan.id, lifecycleForPlanStatus(patch.status), timestamp);
      }
      this.recordEvent(plan.projectId, "plan.updated", "plan", plan.id, patch);
    })();

    return this.getPlanById(planId)!;
  }

  updatePhase(planId: string, phaseIdOrTitle: { phaseId?: string; phaseTitle?: string }, patch: UpdatePhasePatch): Plan {
    guardMemoryWrite(patch, "phase");
    const plan = this.getPlanById(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const phase = phaseIdOrTitle.phaseId
      ? plan.phases.find((candidate) => candidate.id === phaseIdOrTitle.phaseId)
      : plan.phases.find((candidate) => candidate.title === phaseIdOrTitle.phaseTitle);

    if (!phase) {
      throw new Error("Phase not found");
    }

    const timestamp = nowIso();
    const nextEvidence =
      patch.evidence === undefined ? phase.evidence : [...phase.evidence, ...normalizeStoredEvidence(patch.evidence)];
    const nextAcceptance =
      patch.acceptanceCriteria === undefined ? phase.acceptanceCriteria : patch.acceptanceCriteria;
    const nextDependsOn = patch.dependsOn === undefined ? phase.dependsOn : patch.dependsOn;

    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE plan_phases
          SET title = ?, description = ?, status = ?, acceptance_criteria_json = ?, evidence_json = ?, depends_on_json = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.title ?? phase.title,
          patch.description ?? phase.description ?? null,
          patch.status ?? phase.status,
          JSON.stringify(nextAcceptance),
          JSON.stringify(nextEvidence),
          JSON.stringify(nextDependsOn),
          timestamp,
          phase.id,
        );

      this.db.query("UPDATE plans SET updated_at = ? WHERE id = ?").run(timestamp, planId);
      if (patch.evidence) {
        this.insertEvidenceRecords(plan.projectId, "phase", phase.id, patch.evidence, timestamp);
      }
      if (patch.status) {
        this.syncLifecycle(plan.projectId, "phase", phase.id, lifecycleForPhaseStatus(patch.status), timestamp);
      }
      this.recordEvent(plan.projectId, "plan.phase_updated", "phase", phase.id, patch);
    })();

    return this.getPlanById(planId)!;
  }

  // Decision memory
  recordDecision(input: Omit<Decision, "id" | "createdAt" | "evidence"> & { evidence?: Evidence[] }): Decision {
    guardMemoryWrite(input, "decision");
    const id = createId("dec");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO decisions (
            id, project_id, title, context, decision, consequences,
            alternatives_json, related_plan_ids_json, evidence_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.title,
          input.context,
          input.decision,
          input.consequences ?? null,
          JSON.stringify(input.alternatives),
          JSON.stringify(input.relatedPlanIds),
          JSON.stringify(normalizeStoredEvidence(input.evidence ?? [])),
          timestamp,
        );

      this.insertEvidenceRecords(input.projectId, "decision", id, input.evidence ?? [], timestamp);
      this.syncLifecycle(input.projectId, "decision", id, "active", timestamp);
      this.recordEvent(input.projectId, "decision.recorded", "decision", id, { title: input.title });
    })();

    const decision = this.getDecisionById(id);
    if (!decision) {
      throw new Error(`Decision not found after insert: ${id}`);
    }
    return decision;
  }

  listDecisions(projectId: string, limit = 10): Decision[] {
    return this.db
      .query<DecisionRow, [string, number]>(
        "SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(projectId, limit)
      .map(mapDecision);
  }

  getDecisionById(decisionId: string): Decision | null {
    const row = this.db.query<DecisionRow, [string]>("SELECT * FROM decisions WHERE id = ?").get(decisionId);
    return row ? mapDecision(row) : null;
  }

  // Finding memory
  recordFinding(input: InsertFindingInput): Finding {
    guardMemoryWrite(input, "finding");
    const id = createId("finding");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO findings (
            id, project_id, type, severity, title, description,
            status, related_files_json, evidence_json, created_at, closed_at,
            related_plan_id, related_phase_id
          )
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NULL, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.type,
          input.severity,
          input.title,
          input.description,
          JSON.stringify(input.relatedFiles),
          JSON.stringify(normalizeStoredEvidence(input.evidence ?? [])),
          timestamp,
          input.relatedPlanId ?? null,
          input.relatedPhaseId ?? null,
        );

      this.insertEvidenceRecords(input.projectId, "finding", id, input.evidence ?? [], timestamp);
      this.syncLifecycle(input.projectId, "finding", id, "active", timestamp);
      this.recordEvent(input.projectId, "finding.recorded", "finding", id, {
        type: input.type,
        severity: input.severity,
        title: input.title,
      });
    })();

    const finding = this.getFindingById(id);
    if (!finding) {
      throw new Error(`Finding not found after insert: ${id}`);
    }
    return finding;
  }

  listFindings(projectId: string, status: FindingListStatus = "open"): Finding[] {
    if (status === "all") {
      return this.db
        .query<FindingRow, [string]>("SELECT * FROM findings WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId)
        .map(mapFinding);
    }

    return this.db
      .query<FindingRow, [string, Finding["status"]]>(
        "SELECT * FROM findings WHERE project_id = ? AND status = ? ORDER BY created_at DESC",
      )
      .all(projectId, status)
      .map(mapFinding);
  }

  listOpenFindings(projectId: string): Finding[] {
    return this.listFindings(projectId, "open");
  }

  getFindingById(findingId: string): Finding | null {
    const row = this.db.query<FindingRow, [string]>("SELECT * FROM findings WHERE id = ?").get(findingId);
    return row ? mapFinding(row) : null;
  }

  updateFinding(findingId: string, patch: UpdateFindingPatch): Finding {
    guardMemoryWrite(patch, "finding");
    const finding = this.getFindingById(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    const nextEvidence =
      patch.evidence === undefined ? finding.evidence : [...finding.evidence, ...normalizeStoredEvidence(patch.evidence)];

    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE findings
          SET type = ?, severity = ?, title = ?, description = ?, related_files_json = ?, evidence_json = ?,
              related_plan_id = ?, related_phase_id = ?
          WHERE id = ?
        `,
        )
        .run(
          patch.type ?? finding.type,
          patch.severity ?? finding.severity,
          patch.title ?? finding.title,
          patch.description ?? finding.description,
          JSON.stringify(patch.relatedFiles ?? finding.relatedFiles),
          JSON.stringify(nextEvidence),
          patch.relatedPlanId !== undefined ? patch.relatedPlanId : (finding.relatedPlanId ?? null),
          patch.relatedPhaseId !== undefined ? patch.relatedPhaseId : (finding.relatedPhaseId ?? null),
          findingId,
        );

      if (patch.evidence) {
        this.insertEvidenceRecords(finding.projectId, "finding", finding.id, patch.evidence, nowIso());
      }
      this.recordEvent(finding.projectId, "finding.updated", "finding", finding.id, patch);
    })();

    return this.getFindingById(findingId)!;
  }

  closeFinding(findingId: string, evidence: Evidence[] = []): Finding {
    const finding = this.getFindingById(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    if (finding.status === "closed") {
      return finding;
    }

    const timestamp = nowIso();
    this.db.transaction(() => {
      const nextEvidence = [...finding.evidence, ...normalizeStoredEvidence(evidence)];
      this.db
        .query("UPDATE findings SET status = 'closed', closed_at = ?, evidence_json = ? WHERE id = ?")
        .run(timestamp, JSON.stringify(nextEvidence), findingId);
      this.insertEvidenceRecords(finding.projectId, "finding", finding.id, evidence, timestamp);
      this.syncLifecycle(finding.projectId, "finding", finding.id, "done", timestamp);
      this.recordEvent(finding.projectId, "finding.closed", "finding", finding.id, {
        title: finding.title,
        severity: finding.severity,
      });
    })();

    return this.getFindingById(findingId)!;
  }

  // Session memory
  startSession(input: InsertSessionInput): Session {
    guardMemoryWrite(input, "session");
    const id = createId("sess");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO sessions (
            id, project_id, started_at, ended_at, branch, summary,
            changed_files_json, related_plan_id, next_steps_json, evidence_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.startedAt,
          input.endedAt ?? null,
          input.branch ?? null,
          input.summary ?? null,
          JSON.stringify(input.changedFiles),
          input.relatedPlanId ?? null,
          JSON.stringify(input.nextSteps),
          JSON.stringify(normalizeStoredEvidence(input.evidence ?? [])),
          timestamp,
        );

      this.insertEvidenceRecords(input.projectId, "session", id, input.evidence ?? [], timestamp);
      this.syncLifecycle(input.projectId, "session", id, input.endedAt ? "done" : "active", timestamp);
      this.recordEvent(input.projectId, input.endedAt ? "session.ended" : "session.started", "session", id, {
        summary: input.summary,
        nextSteps: input.nextSteps,
      });
    })();

    const session = this.getSessionById(id);
    if (!session) {
      throw new Error(`Session not found after insert: ${id}`);
    }
    return session;
  }

  recordSessionSummary(input: InsertSessionInput): Session {
    guardMemoryWrite(input, "session");
    const id = createId("sess");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO sessions (
            id, project_id, started_at, ended_at, branch, summary,
            changed_files_json, related_plan_id, next_steps_json, evidence_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          id,
          input.projectId,
          input.startedAt,
          input.endedAt ?? null,
          input.branch ?? null,
          input.summary ?? null,
          JSON.stringify(input.changedFiles),
          input.relatedPlanId ?? null,
          JSON.stringify(input.nextSteps),
          JSON.stringify(normalizeStoredEvidence(input.evidence ?? [])),
          timestamp,
        );

      this.insertEvidenceRecords(input.projectId, "session", id, input.evidence ?? [], timestamp);
      this.syncLifecycle(input.projectId, "session", id, input.endedAt ? "done" : "active", timestamp);
      this.recordEvent(input.projectId, "session.summarized", "session", id, {
        summary: input.summary,
        nextSteps: input.nextSteps,
      });
    })();

    const session = this.getSessionById(id);
    if (!session) {
      throw new Error(`Session not found after insert: ${id}`);
    }
    return session;
  }

  captureSession(sessionId: string, patch: UpdateSessionPatch): Session {
    guardMemoryWrite(patch, "session");
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let updated: Session | null = null;
    this.db.transaction(() => {
      updated = this.updateSession(session, patch);
      if (patch.evidence) {
        this.insertEvidenceRecords(session.projectId, "session", session.id, patch.evidence, nowIso());
      }
      this.recordEvent(session.projectId, "session.captured", "session", session.id, {
        summary: patch.summary,
        nextSteps: patch.nextSteps,
      });
    })();

    if (!updated) {
      throw new Error(`Session not found after capture: ${sessionId}`);
    }
    return updated;
  }

  endSession(sessionId: string, patch: UpdateSessionPatch): Session {
    guardMemoryWrite(patch, "session");
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let updated: Session | null = null;
    this.db.transaction(() => {
      updated = this.updateSession(session, {
        ...patch,
        endedAt: patch.endedAt ?? nowIso(),
      });
      if (patch.evidence) {
        this.insertEvidenceRecords(session.projectId, "session", session.id, patch.evidence, nowIso());
      }
      this.syncLifecycle(session.projectId, "session", session.id, "done", nowIso());
      this.recordEvent(session.projectId, "session.ended", "session", session.id, {
        summary: updated.summary,
        nextSteps: updated.nextSteps,
      });
    })();

    if (!updated) {
      throw new Error(`Session not found after end: ${sessionId}`);
    }
    return updated;
  }

  listRecentSessions(projectId: string, limit = 5): Session[] {
    return this.db
      .query<SessionRow, [string, number]>("SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(projectId, limit)
      .map(mapSession);
  }

  listSessions(projectId: string, limit = 20): Session[] {
    return this.listRecentSessions(projectId, limit);
  }

  listOpenSessions(projectId: string, limit = 20): Session[] {
    return this.db
      .query<SessionRow, [string, number]>(
        "SELECT * FROM sessions WHERE project_id = ? AND ended_at IS NULL ORDER BY created_at DESC LIMIT ?",
      )
      .all(projectId, limit)
      .map(mapSession);
  }

  getLatestEndedSession(projectId: string): Session | null {
    const row = this.db
      .query<SessionRow, [string]>(
        `
        SELECT * FROM sessions
        WHERE project_id = ? AND ended_at IS NOT NULL
        ORDER BY ended_at DESC, created_at DESC
        LIMIT 1
      `,
      )
      .get(projectId);
    return row ? mapSession(row) : null;
  }

  getSessionById(sessionId: string): Session | null {
    const row = this.db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    return row ? mapSession(row) : null;
  }

  private updateSession(session: Session, patch: UpdateSessionPatch): Session {
    const nextEvidence =
      patch.evidence === undefined ? session.evidence : [...session.evidence, ...normalizeStoredEvidence(patch.evidence)];
    this.db
      .query(
        `
        UPDATE sessions
        SET ended_at = ?, branch = ?, summary = ?, changed_files_json = ?, related_plan_id = ?, next_steps_json = ?, evidence_json = ?
        WHERE id = ?
      `,
      )
      .run(
        patch.endedAt ?? session.endedAt ?? null,
        patch.branch ?? session.branch ?? null,
        patch.summary ?? session.summary ?? null,
        JSON.stringify(patch.changedFiles ?? session.changedFiles),
        patch.relatedPlanId ?? session.relatedPlanId ?? null,
        JSON.stringify(patch.nextSteps ?? session.nextSteps),
        JSON.stringify(nextEvidence),
        session.id,
      );

    const updated = this.getSessionById(session.id);
    if (!updated) {
      throw new Error(`Session not found after update: ${session.id}`);
    }
    return updated;
  }

  // Internal read models and shared helpers
  private getPhases(planId: string): PlanPhase[] {
    return this.db
      .query<PhaseRow, [string]>("SELECT * FROM plan_phases WHERE plan_id = ? ORDER BY position ASC")
      .all(planId)
      .map(mapPhase);
  }

  private mapPlan(row: PlanRow): Plan {
    return PlanSchema.parse({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      ...(row.description === null ? {} : { description: row.description }),
      status: row.status,
      lifecycle: lifecycleForPlanStatus(row.status),
      ...(row.priority === null ? {} : { priority: row.priority }),
      ...(row.source_roadmap_id === null ? {} : { sourceRoadmapId: row.source_roadmap_id }),
      ...(row.source_roadmap_item_id === null ? {} : { sourceRoadmapItemId: row.source_roadmap_item_id }),
      phases: this.getPhases(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private getRoadmapItems(roadmapId: string): RoadmapItem[] {
    return this.db
      .query<RoadmapItemRow, [string]>("SELECT * FROM roadmap_items WHERE roadmap_id = ? ORDER BY position ASC")
      .all(roadmapId)
      .map(mapRoadmapItem);
  }

  private mapRoadmap(row: RoadmapRow): Roadmap {
    return RoadmapSchema.parse({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      ...(row.description === null ? {} : { description: row.description }),
      status: row.status,
      lifecycle: lifecycleForRoadmapStatus(row.status),
      ...(row.source_plan_id === null ? {} : { sourcePlanId: row.source_plan_id }),
      items: this.getRoadmapItems(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private insertRoadmapRows(roadmapId: string, input: InsertRoadmapInput, timestamp: string): void {
    this.db
      .query(
        `
        INSERT INTO roadmaps (id, project_id, title, description, status, source_plan_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        roadmapId,
        input.projectId,
        input.title,
        input.description ?? null,
        input.status,
        input.sourcePlanId ?? null,
        timestamp,
        timestamp,
      );

    input.items.forEach((item, index) => {
      const itemId = item.id ?? createId("rmi");
      this.db
        .query(
          `
          INSERT INTO roadmap_items (
            id, roadmap_id, position, title, description, status,
            justification, evidence_json, source_phase_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          itemId,
          roadmapId,
          index,
          item.title,
          item.description ?? null,
          item.status,
          item.justification ?? null,
          JSON.stringify(normalizeStoredEvidence(item.evidence)),
          item.sourcePhaseId ?? null,
          timestamp,
          timestamp,
        );
      this.insertEvidenceRecords(input.projectId, "roadmap_item", itemId, item.evidence, timestamp);
      this.syncLifecycle(input.projectId, "roadmap_item", itemId, lifecycleForRoadmapItemStatus(item.status), timestamp);
    });
  }

  /**
   * Atomically completes a plan:
   * 1. Sets plan status to "completed".
   * 2. If the plan has a sourceRoadmapItemId, sets that roadmap item status to "done".
   * 3. Emits "plan.completed" and (if applicable) "roadmap.item_advanced" events.
   *
   * Does NOT check whether all phases are done — that precondition is the caller's responsibility.
   */
  completePlanTransaction(
    planId: string,
    plan: Plan,
  ): { completedPlan: Plan; roadmapItemAdvanced: { roadmapId: string; itemId: string } | null } {
    const timestamp = nowIso();
    let advancedItem: { roadmapId: string; itemId: string } | null = null;

    this.db.transaction(() => {
      // 1. Mark plan completed
      this.db
        .query("UPDATE plans SET status = 'completed', updated_at = ? WHERE id = ?")
        .run(timestamp, planId);
      this.syncLifecycle(plan.projectId, "plan", planId, "done", timestamp);
      this.recordEvent(plan.projectId, "plan.completed", "plan", planId, {
        title: plan.title,
        sourceRoadmapId: plan.sourceRoadmapId,
        sourceRoadmapItemId: plan.sourceRoadmapItemId,
      });

      // 2. If linked to a roadmap item, advance it to "done"
      if (plan.sourceRoadmapId && plan.sourceRoadmapItemId) {
        this.db
          .query("UPDATE roadmap_items SET status = 'done', updated_at = ? WHERE id = ?")
          .run(timestamp, plan.sourceRoadmapItemId);
        this.syncLifecycle(plan.projectId, "roadmap_item", plan.sourceRoadmapItemId, "done", timestamp);
        this.db
          .query("UPDATE roadmaps SET updated_at = ? WHERE id = ?")
          .run(timestamp, plan.sourceRoadmapId);
        this.recordEvent(plan.projectId, "roadmap.item_advanced", "roadmap_item", plan.sourceRoadmapItemId, {
          roadmapId: plan.sourceRoadmapId,
          status: "done",
        });
        advancedItem = { roadmapId: plan.sourceRoadmapId, itemId: plan.sourceRoadmapItemId };
      }
    })();

    return {
      completedPlan: this.getPlanById(planId)!,
      roadmapItemAdvanced: advancedItem,
    };
  }

  /**
   * Atomically advances the source roadmap item from "todo" to "in_progress" for a new plan.
   * Used by createPlanFromRoadmap when the plan status is "active".
   */
  activateRoadmapItemTransaction(
    projectId: string,
    roadmapId: string,
    itemId: string,
  ): void {
    const timestamp = nowIso();
    this.db.transaction(() => {
      this.db
        .query("UPDATE roadmap_items SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'todo'")
        .run(timestamp, itemId);
      this.syncLifecycle(projectId, "roadmap_item", itemId, "active", timestamp);
      this.db
        .query("UPDATE roadmaps SET updated_at = ? WHERE id = ?")
        .run(timestamp, roadmapId);
      this.recordEvent(projectId, "roadmap.item_advanced", "roadmap_item", itemId, {
        roadmapId,
        status: "in_progress",
      });
    })();
  }

  getEventById(eventId: string): Event | null {
    const row = this.db.query<EventRow, [string]>("SELECT * FROM events WHERE id = ?").get(eventId);
    return row ? mapEvent(row) : null;
  }

  listEvents(
    projectId: string,
    options: {
      types?: string[];
      limit?: number;
      before?: { createdAt: string; id: string };
      /** Return only events strictly after this cursor. When `id` is provided, uses a
       * compound `(created_at, id) > (?, ?)` predicate so same-millisecond events are
       * not silently dropped. Plain ISO string uses `created_at > ?` (no id). */
      since?: { createdAt: string; id?: string };
    } = {},
  ): Event[] {
    const MAX_LIMIT = 500;
    const limit = Math.min(options.limit ?? 50, MAX_LIMIT);
    const params: (string | number)[] = [projectId];
    let sql = "SELECT * FROM events WHERE project_id = ?";

    if (options.types && options.types.length > 0) {
      sql += ` AND type IN (${options.types.map(() => "?").join(", ")})`;
      params.push(...options.types);
    }

    if (options.before) {
      sql += " AND (created_at, id) < (?, ?)";
      params.push(options.before.createdAt, options.before.id);
    }

    if (options.since) {
      if (options.since.id) {
        // Compound cursor: same millisecond events with later ids are included
        sql += " AND (created_at, id) > (?, ?)";
        params.push(options.since.createdAt, options.since.id);
      } else {
        // Plain ISO timestamp: events strictly after that second
        sql += " AND created_at > ?";
        params.push(options.since.createdAt);
      }
    }

    sql += " ORDER BY created_at DESC, id DESC LIMIT ?";
    params.push(limit);

    return this.db.query<EventRow, (string | number)[]>(sql).all(...params).map(mapEvent);
  }

  summarizeEvents(
    projectId: string,
    options: {
      since?: { createdAt: string; id?: string };
    } = {},
  ): EventWindowSummary {
    const { where, params } = buildEventWindowWhere(projectId, options.since);
    const summary = this.db
      .query<{ total: number; first_event_at: string | null; last_event_at: string | null }, (string | number)[]>(
        `
        SELECT COUNT(*) AS total, MIN(created_at) AS first_event_at, MAX(created_at) AS last_event_at
        FROM events
        ${where}
      `,
      )
      .get(...params);
    const byType = this.db
      .query<EventGroupCount, (string | number)[]>(
        `
        SELECT type AS key, COUNT(*) AS count
        FROM events
        ${where}
        GROUP BY type
        ORDER BY count DESC, key ASC
      `,
      )
      .all(...params);
    const byEntityType = this.db
      .query<EventGroupCount, (string | number)[]>(
        `
        SELECT entity_type AS key, COUNT(*) AS count
        FROM events
        ${where}
        GROUP BY entity_type
        ORDER BY count DESC, key ASC
      `,
      )
      .all(...params);
    const activeDays = this.db
      .query<EventGroupCount, (string | number)[]>(
        `
        SELECT substr(created_at, 1, 10) AS key, COUNT(*) AS count
        FROM events
        ${where}
        GROUP BY substr(created_at, 1, 10)
        ORDER BY key DESC
      `,
      )
      .all(...params);

    return {
      total: summary?.total ?? 0,
      byType,
      byEntityType,
      activeDays,
      ...(summary?.first_event_at ? { firstEventAt: summary.first_event_at } : {}),
      ...(summary?.last_event_at ? { lastEventAt: summary.last_event_at } : {}),
    };
  }

  countEventsByDay(projectId: string, options: { sinceDate?: string; untilDate?: string } = {}): EventDayCount[] {
    const params: string[] = [projectId];
    let sql = `
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
      FROM events
      WHERE project_id = ?
    `;

    if (options.sinceDate) {
      sql += " AND substr(created_at, 1, 10) >= ?";
      params.push(options.sinceDate);
    }

    if (options.untilDate) {
      sql += " AND substr(created_at, 1, 10) <= ?";
      params.push(options.untilDate);
    }

    sql += `
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date ASC
    `;

    return this.db.query<EventDayCount, string[]>(sql).all(...params);
  }

  private expireClaims(projectId: string, timestamp: string): void {
    this.db
      .query("UPDATE memory_claims SET status = 'expired', updated_at = ? WHERE project_id = ? AND status = 'active' AND expires_at <= ?")
      .run(timestamp, projectId, timestamp);
  }

  private getMemoryEntity(projectId: string, entityType: MemoryEntityType, entityId: string): unknown | null {
    if (entityType === "brief") {
      const entity = this.getProjectBriefById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "roadmap") {
      const entity = this.getRoadmapById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "roadmap_item") {
      return this.listRoadmaps(projectId, 1000).flatMap((roadmap) => roadmap.items).find((item) => item.id === entityId) ?? null;
    }
    if (entityType === "plan") {
      const entity = this.getPlanById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "phase") {
      const result = this.getPlanByPhaseId(entityId);
      return result?.plan.projectId === projectId ? result.phase : null;
    }
    if (entityType === "spike") {
      const entity = this.getSpikeById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "decision") {
      const entity = this.getDecisionById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "finding") {
      const entity = this.getFindingById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "session") {
      const entity = this.getSessionById(entityId);
      return entity?.projectId === projectId ? entity : null;
    }
    if (entityType === "context_doc") {
      return this.listContextDocs(projectId).find((doc) => doc.id === entityId) ?? null;
    }
    return null;
  }

  private deleteMemoryEntity(entityType: MemoryEntityType, entityId: string): void {
    const tableByEntity: Record<MemoryEntityType, string> = {
      brief: "project_briefs",
      roadmap: "roadmaps",
      roadmap_item: "roadmap_items",
      plan: "plans",
      phase: "plan_phases",
      spike: "spikes",
      decision: "decisions",
      finding: "findings",
      session: "sessions",
      context_doc: "context_docs",
    };
    this.db.query(`DELETE FROM ${tableByEntity[entityType]} WHERE id = ?`).run(entityId);
  }

  private recordTombstone(projectId: string | null, entityType: string, entityId: string, reason: string | undefined, timestamp: string): void {
    this.db
      .query("INSERT INTO memory_tombstones (id, project_id, entity_type, entity_id, reason, purged_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(createId("tomb"), projectId, entityType, entityId, reason ?? null, timestamp);
  }

  private insertEvidenceRecords(
    projectId: string,
    entityType: MemoryEntityType,
    entityId: string,
    evidence: Evidence[],
    timestamp: string,
  ): void {
    const insert = this.db.query(
      `INSERT OR IGNORE INTO memory_evidence (
        id, project_id, entity_type, entity_id, kind, value, path, line, end_line,
        label, checked_at, stale, superseded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const item of normalizeStoredEvidence(evidence)) {
      insert.run(
        item.id,
        projectId,
        entityType,
        entityId,
        item.kind,
        item.value,
        item.path ?? null,
        item.line ?? null,
        item.endLine ?? null,
        item.label ?? null,
        item.checkedAt ?? null,
        item.stale ? 1 : 0,
        item.supersededBy ?? null,
        item.createdAt ?? timestamp,
      );
    }
  }

  private syncLifecycle(
    projectId: string,
    entityType: MemoryEntityType,
    entityId: string,
    lifecycle: MemoryLifecycle,
    timestamp: string,
  ): void {
    const existing = this.getLifecycle(projectId, entityType, entityId);
    if (existing) {
      this.db
        .query("UPDATE memory_lifecycle SET lifecycle = ?, updated_at = ? WHERE project_id = ? AND entity_type = ? AND entity_id = ?")
        .run(lifecycle, timestamp, projectId, entityType, entityId);
    } else {
      this.db
        .query(
          `INSERT INTO memory_lifecycle (
            id, project_id, entity_type, entity_id, lifecycle, reason, superseded_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        )
        .run(createId("life"), projectId, entityType, entityId, lifecycle, timestamp, timestamp);
    }
  }

  private recordEvent(
    projectId: string | null,
    type: string,
    entityType: string,
    entityId: string,
    payload: unknown,
  ): void {
    this.db
      .query(
        `
        INSERT INTO events (id, project_id, type, entity_type, entity_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(createId("evt"), projectId, type, entityType, entityId, JSON.stringify(sanitizeEventPayload(payload)), nowIso());
  }
}

function buildEventWindowWhere(
  projectId: string,
  since?: { createdAt: string; id?: string },
): { where: string; params: (string | number)[] } {
  const params: (string | number)[] = [projectId];
  let where = "WHERE project_id = ?";

  if (since) {
    if (since.id) {
      where += " AND (created_at, id) > (?, ?)";
      params.push(since.createdAt, since.id);
    } else {
      where += " AND created_at > ?";
      params.push(since.createdAt);
    }
  }

  return { where, params };
}

function mapProject(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    ...(row.repository_url === null ? {} : { repositoryUrl: row.repository_url }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapRoadmapFocus(row: RoadmapFocusRow): RoadmapFocus {
  return {
    id: row.id,
    projectId: row.project_id,
    worktreeKey: row.worktree_key,
    ...(row.branch === null ? {} : { branch: row.branch }),
    roadmapId: row.roadmap_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAgentStage(row: AgentStageRow): AgentStageState {
  return AgentStageStateSchema.parse({
    id: row.id,
    projectId: row.project_id,
    ...(row.plan_id === null ? {} : { planId: row.plan_id }),
    ...(row.phase_id === null ? {} : { phaseId: row.phase_id }),
    stage: row.stage,
    ...(row.role === null ? {} : { role: row.role }),
    ...(row.note === null ? {} : { note: row.note }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMemoryTag(row: MemoryTagRow): MemoryTag {
  return MemoryTagSchema.parse({
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    tag: row.tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapMemoryEvidence(row: MemoryEvidenceRow): MemoryEvidenceRecord {
  return MemoryEvidenceRecordSchema.parse({
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    kind: row.kind,
    value: row.value,
    ...(row.path === null ? {} : { path: row.path }),
    ...(row.line === null ? {} : { line: row.line }),
    ...(row.end_line === null ? {} : { endLine: row.end_line }),
    ...(row.label === null ? {} : { label: row.label }),
    ...(row.checked_at === null ? {} : { checkedAt: row.checked_at }),
    stale: Boolean(row.stale),
    ...(row.superseded_by === null ? {} : { supersededBy: row.superseded_by }),
    createdAt: row.created_at,
  });
}

function mapMemoryClaim(row: MemoryClaimRow): MemoryClaim {
  return MemoryClaimSchema.parse({
    id: row.id,
    projectId: row.project_id,
    entityId: row.entity_id,
    scope: row.scope,
    role: row.role,
    ...(row.owner === null ? {} : { owner: row.owner }),
    ...(row.worktree === null ? {} : { worktree: row.worktree }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.hostname === null ? {} : { hostname: row.hostname }),
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    ...(row.released_at === null ? {} : { releasedAt: row.released_at }),
    updatedAt: row.updated_at,
  });
}

function mapTagCatalogEntry(row: TagCatalogRow): TagCatalogEntry {
  return TagCatalogEntrySchema.parse({
    id: row.id,
    projectId: row.project_id,
    tag: row.tag,
    ...(row.description === null ? {} : { description: row.description }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: row.usage_count ?? 0,
  });
}

function mapTagAlias(row: TagAliasRow): TagAlias {
  return TagAliasSchema.parse({
    id: row.id,
    projectId: row.project_id,
    alias: row.alias,
    tag: row.tag,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapContextDoc(row: ContextDocRow): ContextDoc {
  return ContextDocSchema.parse({
    id: row.id,
    projectId: row.project_id,
    scope: row.scope,
    ...(row.plan_id === null ? {} : { planId: row.plan_id }),
    ...(row.phase_id === null ? {} : { phaseId: row.phase_id }),
    path: row.path,
    reason: row.reason,
    summary: row.summary,
    assumptions: parseJsonArray<string>(row.assumptions_json),
    confidence: row.confidence,
    status: row.status,
    lifecycle: row.status === "ignored" ? "archived" : "active",
    readAt: row.read_at,
    ...(row.read_commit === null ? {} : { readCommit: row.read_commit }),
    ...(row.observed_mtime === null ? {} : { observedMtime: row.observed_mtime }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function agentStageScopeKey(scope: AgentStageScope): string {
  if (scope.phaseId) {
    return `phase:${scope.phaseId}`;
  }
  if (scope.planId) {
    return `plan:${scope.planId}`;
  }
  return "project";
}

function mapPhase(row: PhaseRow): PlanPhase {
  return {
    id: row.id,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    status: row.status,
    lifecycle: lifecycleForPhaseStatus(row.status),
    acceptanceCriteria: parseJsonArray<string>(row.acceptance_criteria_json),
    evidence: parseJsonArray<PlanPhase["evidence"][number]>(row.evidence_json),
    dependsOn: parseJsonArray<string>(row.depends_on_json),
  };
}

function mapDecision(row: DecisionRow): Decision {
  return DecisionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    context: row.context,
    decision: row.decision,
    ...(row.consequences === null ? {} : { consequences: row.consequences }),
    alternatives: parseJsonArray<string>(row.alternatives_json),
    relatedPlanIds: parseJsonArray<string>(row.related_plan_ids_json),
    evidence: parseJsonArray<Decision["evidence"][number]>(row.evidence_json),
    lifecycle: "active",
    createdAt: row.created_at,
  });
}

function mapProjectBrief(row: ProjectBriefRow): ProjectBrief {
  return ProjectBriefSchema.parse({
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    body: row.body,
    ...(row.source === null ? {} : { source: row.source }),
    status: row.status,
    lifecycle: row.status === "archived" ? "archived" : "active",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapRoadmapItem(row: RoadmapItemRow): RoadmapItem {
  return {
    id: row.id,
    roadmapId: row.roadmap_id,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.justification === null ? {} : { justification: row.justification }),
    status: row.status,
    lifecycle: lifecycleForRoadmapItemStatus(row.status),
    evidence: parseJsonArray<RoadmapItem["evidence"][number]>(row.evidence_json),
    ...(row.source_phase_id === null ? {} : { sourcePhaseId: row.source_phase_id }),
  };
}

function mapSpike(row: SpikeRow): Spike {
  return SpikeSchema.parse({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    question: row.question,
    ...(row.hypothesis === null ? {} : { hypothesis: row.hypothesis }),
    options: parseJsonArray<string>(row.options_json),
    ...(row.result === null ? {} : { result: row.result }),
    ...(row.recommendation === null ? {} : { recommendation: row.recommendation }),
    evidence: parseJsonArray<Spike["evidence"][number]>(row.evidence_json),
    status: row.status,
    lifecycle: lifecycleForSpikeStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.concluded_at === null ? {} : { concludedAt: row.concluded_at }),
  });
}

function mapFinding(row: FindingRow): Finding {
  return FindingSchema.parse({
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    status: row.status,
    relatedFiles: parseJsonArray<string>(row.related_files_json),
    evidence: parseJsonArray<Finding["evidence"][number]>(row.evidence_json),
    lifecycle: row.status === "closed" ? "done" : "active",
    createdAt: row.created_at,
    ...(row.closed_at === null ? {} : { closedAt: row.closed_at }),
    ...(row.related_plan_id === null ? {} : { relatedPlanId: row.related_plan_id }),
    ...(row.related_phase_id === null ? {} : { relatedPhaseId: row.related_phase_id }),
  });
}

function mapSession(row: SessionRow): Session {
  return SessionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    ...(row.ended_at === null ? {} : { endedAt: row.ended_at }),
    ...(row.branch === null ? {} : { branch: row.branch }),
    ...(row.summary === null ? {} : { summary: row.summary }),
    changedFiles: parseJsonArray<string>(row.changed_files_json),
    ...(row.related_plan_id === null ? {} : { relatedPlanId: row.related_plan_id }),
    nextSteps: parseJsonArray<string>(row.next_steps_json),
    evidence: parseJsonArray<Session["evidence"][number]>(row.evidence_json),
    lifecycle: row.ended_at === null ? "active" : "done",
  });
}

function mapEvent(row: EventRow): Event {
  return EventSchema.parse({
    id: row.id,
    // EventRow.project_id is string | null, but listEvents always filters
    // WHERE project_id = ?, so every row reaching here is project-scoped and
    // project_id is non-null.
    projectId: row.project_id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at,
  });
}

function parseJsonArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function normalizeStoredEvidence(evidence: Evidence[]): Array<PlanPhase["evidence"][number]> {
  return evidence.map((item) => ({
    id: item.id ?? createId("ev"),
    kind: item.kind ?? "note",
    value: item.value,
    ...(item.path ? { path: item.path } : {}),
    ...(item.line ? { line: item.line } : {}),
    ...(item.endLine ? { endLine: item.endLine } : {}),
    ...(item.label ? { label: item.label } : {}),
    ...(item.checkedAt ? { checkedAt: item.checkedAt } : {}),
    ...(item.stale !== undefined ? { stale: item.stale } : {}),
    ...(item.supersededBy ? { supersededBy: item.supersededBy } : {}),
    createdAt: item.createdAt ?? nowIso(),
  }));
}

function lifecycleForPlanStatus(status: PlanStatus): MemoryLifecycle {
  if (status === "completed") return "done";
  if (status === "archived") return "archived";
  if (status === "paused") return "stale";
  return "active";
}

function lifecycleForRoadmapStatus(status: RoadmapStatus): MemoryLifecycle {
  if (status === "completed") return "done";
  if (status === "archived") return "archived";
  if (status === "paused") return "stale";
  return "active";
}

function lifecycleForRoadmapItemStatus(status: RoadmapItemStatus): MemoryLifecycle {
  if (status === "done") return "done";
  if (status === "deferred") return "stale";
  if (status === "discarded") return "archived";
  return "active";
}

function lifecycleForPhaseStatus(status: PlanPhase["status"]): MemoryLifecycle {
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "active";
}

function lifecycleForSpikeStatus(status: SpikeStatus): MemoryLifecycle {
  if (status === "concluded") return "done";
  if (status === "abandoned") return "archived";
  return "active";
}

function lifecycleForEntity(raw: unknown): MemoryLifecycle {
  const status = typeof raw === "object" && raw ? (raw as { status?: unknown }).status : undefined;
  if (status && typeof status === "string") {
    const parsed = MemoryLifecycleSchema.safeParse(status);
    if (parsed.success) return parsed.data;
    if (status === "completed" || status === "concluded" || status === "closed") return "done";
    if (status === "blocked") return "blocked";
    if (status === "archived" || status === "discarded" || status === "abandoned" || status === "ignored") return "archived";
    if (status === "paused" || status === "deferred") return "stale";
  }
  return "active";
}

function normalizeScope(scope: string): string {
  return scope.trim().replace(/\/+$/, "") || ".";
}

function scopesOverlap(a: string, b: string): boolean {
  const left = normalizeScope(a);
  const right = normalizeScope(b);
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function joinSearchText(parts: Array<string | undefined>): string {
  return parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join("\n");
}

function resolveRoadmapInsertPosition(items: RoadmapItem[], input: AddRoadmapItemInput): number {
  if (input.position !== undefined) {
    return Math.min(input.position, items.length);
  }

  if (input.afterItemId) {
    const index = items.findIndex((item) => item.id === input.afterItemId);
    if (index === -1) {
      throw new Error(`Roadmap item not found: ${input.afterItemId}`);
    }
    return index + 1;
  }

  if (input.afterItemTitle) {
    const matching = items.filter((item) => item.title === input.afterItemTitle);
    if (matching.length === 0) {
      throw new Error(`Roadmap item not found: ${input.afterItemTitle}`);
    }
    if (matching.length > 1) {
      throw new Error(`Roadmap item title is ambiguous: ${input.afterItemTitle}`);
    }
    return items.findIndex((item) => item.id === matching[0]!.id) + 1;
  }

  return items.length;
}

function phaseStatusToRoadmapItemStatus(status: PlanPhase["status"]): RoadmapItemStatus {
  if (status === "done") {
    return "done";
  }

  if (status === "in_progress") {
    return "in_progress";
  }

  if (status === "needs_review") {
    return "in_progress";
  }

  if (status === "blocked") {
    return "deferred";
  }

  return "todo";
}

export { ZenithRepository as DecodeRepository };
