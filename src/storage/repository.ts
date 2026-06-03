import type { Database } from "bun:sqlite";
import { createId, nowIso } from "../domain/ids";
import {
  DecisionSchema,
  EventSchema,
  FindingSchema,
  PlanSchema,
  ProjectBriefSchema,
  ProjectSchema,
  RoadmapSchema,
  SessionSchema,
  SpikeSchema,
  type Decision,
  type Event,
  type Evidence,
  type Finding,
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

export type InsertFindingInput = Omit<Finding, "id" | "createdAt" | "closedAt" | "status">;

export type FindingListStatus = Finding["status"] | "all";

export type UpdateFindingPatch = {
  type?: Finding["type"];
  severity?: Finding["severity"];
  title?: string;
  description?: string;
  relatedFiles?: string[];
  relatedPlanId?: string;
  relatedPhaseId?: string;
};

export type UpdateSessionPatch = {
  endedAt?: string;
  branch?: string;
  summary?: string;
  changedFiles?: string[];
  relatedPlanId?: string;
  nextSteps?: string[];
};

export class ZenithRepository {
  constructor(private readonly db: Database) {}

  close(): void {
    this.db.close();
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
    const id = createId("roadmap");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.insertRoadmapRows(id, input, timestamp);
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
          JSON.stringify(input.evidence),
          input.sourcePhaseId ?? null,
          timestamp,
          timestamp,
        );

      this.db.query("UPDATE roadmaps SET updated_at = ? WHERE id = ?").run(timestamp, roadmapId);
      this.recordEvent(roadmap.projectId, "roadmap.item_added", "roadmap_item", itemId, {
        title: input.title,
        position,
      });
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  updateRoadmap(roadmapId: string, patch: UpdateRoadmapPatch): Roadmap {
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

      this.recordEvent(roadmap.projectId, "roadmap.updated", "roadmap", roadmap.id, patch);
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  updateRoadmapItem(
    roadmapId: string,
    itemIdOrTitle: { itemId?: string; itemTitle?: string },
    patch: UpdateRoadmapItemPatch,
  ): Roadmap {
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
    const nextEvidence = patch.evidence === undefined ? item.evidence : [...item.evidence, ...patch.evidence];

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
      this.recordEvent(roadmap.projectId, "roadmap.item_updated", "roadmap_item", item.id, patch);
    })();

    return this.getRoadmapById(roadmapId)!;
  }

  // Spike memory
  createSpike(input: InsertSpikeInput): Spike {
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
          JSON.stringify(input.evidence),
          input.status,
          timestamp,
          timestamp,
          concludedAt,
        );

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
    const spike = this.getSpikeById(spikeId);
    if (!spike) {
      throw new Error(`Spike not found: ${spikeId}`);
    }

    const timestamp = nowIso();
    const nextEvidence = patch.evidence === undefined ? spike.evidence : [...spike.evidence, ...patch.evidence];

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

      this.recordEvent(spike.projectId, "spike.concluded", "spike", spike.id, patch);
    })();

    return this.getSpikeById(spikeId)!;
  }

  // Plan memory
  createPlan(input: InsertPlanInput): Plan {
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
            phase.id ?? createId("phase"),
            id,
            index,
            phase.title,
            phase.description ?? null,
            phase.status,
            JSON.stringify(phase.acceptanceCriteria),
            JSON.stringify(phase.evidence),
            JSON.stringify(phase.dependsOn ?? []),
            timestamp,
            timestamp,
          );
      });

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

  updatePlan(planId: string, patch: UpdatePlanPatch): Plan {
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

      this.recordEvent(plan.projectId, "plan.updated", "plan", plan.id, patch);
    })();

    return this.getPlanById(planId)!;
  }

  updatePhase(planId: string, phaseIdOrTitle: { phaseId?: string; phaseTitle?: string }, patch: UpdatePhasePatch): Plan {
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
    const nextEvidence = patch.evidence === undefined ? phase.evidence : [...phase.evidence, ...patch.evidence];
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
      this.recordEvent(plan.projectId, "plan.phase_updated", "phase", phase.id, patch);
    })();

    return this.getPlanById(planId)!;
  }

  // Decision memory
  recordDecision(input: Omit<Decision, "id" | "createdAt">): Decision {
    const id = createId("dec");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO decisions (
            id, project_id, title, context, decision, consequences,
            alternatives_json, related_plan_ids_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          timestamp,
        );

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
    const id = createId("finding");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO findings (
            id, project_id, type, severity, title, description,
            status, related_files_json, created_at, closed_at,
            related_plan_id, related_phase_id
          )
          VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, ?, ?)
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
          timestamp,
          input.relatedPlanId ?? null,
          input.relatedPhaseId ?? null,
        );

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
    const finding = this.getFindingById(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    this.db.transaction(() => {
      this.db
        .query(
          `
          UPDATE findings
          SET type = ?, severity = ?, title = ?, description = ?, related_files_json = ?,
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
          patch.relatedPlanId !== undefined ? patch.relatedPlanId : (finding.relatedPlanId ?? null),
          patch.relatedPhaseId !== undefined ? patch.relatedPhaseId : (finding.relatedPhaseId ?? null),
          findingId,
        );

      this.recordEvent(finding.projectId, "finding.updated", "finding", finding.id, patch);
    })();

    return this.getFindingById(findingId)!;
  }

  closeFinding(findingId: string): Finding {
    const finding = this.getFindingById(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    if (finding.status === "closed") {
      return finding;
    }

    const timestamp = nowIso();
    this.db.transaction(() => {
      this.db.query("UPDATE findings SET status = 'closed', closed_at = ? WHERE id = ?").run(timestamp, findingId);
      this.recordEvent(finding.projectId, "finding.closed", "finding", finding.id, {
        title: finding.title,
        severity: finding.severity,
      });
    })();

    return this.getFindingById(findingId)!;
  }

  // Session memory
  startSession(input: Omit<Session, "id">): Session {
    const id = createId("sess");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO sessions (
            id, project_id, started_at, ended_at, branch, summary,
            changed_files_json, related_plan_id, next_steps_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          timestamp,
        );

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

  recordSessionSummary(input: Omit<Session, "id">): Session {
    const id = createId("sess");
    const timestamp = nowIso();

    this.db.transaction(() => {
      this.db
        .query(
          `
          INSERT INTO sessions (
            id, project_id, started_at, ended_at, branch, summary,
            changed_files_json, related_plan_id, next_steps_json, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          timestamp,
        );

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
    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    let updated: Session | null = null;
    this.db.transaction(() => {
      updated = this.updateSession(session, patch);
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

  getSessionById(sessionId: string): Session | null {
    const row = this.db.query<SessionRow, [string]>("SELECT * FROM sessions WHERE id = ?").get(sessionId);
    return row ? mapSession(row) : null;
  }

  private updateSession(session: Session, patch: UpdateSessionPatch): Session {
    this.db
      .query(
        `
        UPDATE sessions
        SET ended_at = ?, branch = ?, summary = ?, changed_files_json = ?, related_plan_id = ?, next_steps_json = ?
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
          item.id ?? createId("rmi"),
          roadmapId,
          index,
          item.title,
          item.description ?? null,
          item.status,
          item.justification ?? null,
          JSON.stringify(item.evidence),
          item.sourcePhaseId ?? null,
          timestamp,
          timestamp,
        );
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
      .run(createId("evt"), projectId, type, entityType, entityId, JSON.stringify(payload), nowIso());
  }
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

function mapPhase(row: PhaseRow): PlanPhase {
  return {
    id: row.id,
    title: row.title,
    ...(row.description === null ? {} : { description: row.description }),
    status: row.status,
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

  if (status === "blocked") {
    return "deferred";
  }

  return "todo";
}

export { ZenithRepository as DecodeRepository };
