import { existsSync, readFileSync, statSync } from "node:fs";
import { hostname } from "node:os";
import { basename, extname, relative, resolve } from "node:path";
import { ZenithError } from "../cli/json-output";
import { createId, nowIso } from "../domain/ids";
import {
  AddRoadmapItemInputSchema,
  AdvancePlanInputSchema,
  AgentStageSchema,
  ActionBriefingSchema,
  BlockedInputSchema,
  CheckpointFromGitResultSchema,
  ClaimInputSchema,
  ConcludeSpikeInputSchema,
  CaptureSessionInputSchema,
  CheckpointInputSchema,
  ContextDocSuggestionSchema,
  CreateTagAliasInputSchema,
  CreateTagInputSchema,
  DecideInputSchema,
  DoctorReportSchema,
  DocsTaskSchema,
  DoneInputSchema,
  DoneResultSchema,
  type AgentStage,
  type AgentStageState,
  type ActionBriefing,
  type AdvanceResult,
  BlockedResultSchema,
  type BlockedResult,
  type CompactContext,
  ContinueResultSchema,
  type ContextDoc,
  type ContextDocSuggestion,
  type ContextSnapshot,
  CreatePlanFromRoadmapInputSchema,
  CreateRoadmapInputSchema,
  CreatePlanInputSchema,
  CreateSpikeInputSchema,
  EndSessionInputSchema,
  ImportPlanToRoadmapInputSchema,
  MEMORY_ENTITY_TYPES,
  MemoryEntityTypeSchema,
  NoteInputSchema,
  type PhaseDetail,
  type PlanPath,
  PromptFormatSchema,
  PromptRoleSchema,
  PromptResultSchema,
  ReadyInputSchema,
  ReadyResultSchema,
  RecordFindingInputSchema,
  RecordDecisionInputSchema,
  RefreshClaimInputSchema,
  RecordSpikeInputSchema,
  type ResumeContext,
  ResumeContextSchema,
  SessionSummaryInputSchema,
  SetBriefInputSchema,
  SetMemoryTagsInputSchema,
  SetStageInputSchema,
  StartSessionInputSchema,
  UpdateFindingInputSchema,
  UpdatePhaseInputSchema,
  UpdatePlanInputSchema,
  UpdateRoadmapInputSchema,
  UpdateRoadmapItemInputSchema,
  type Decision,
  type DoneResult,
  type Event,
  type Finding,
  type MemoryEntityType,
  type MemorySearchResult,
  type MemoryTag,
  type MemoryClaim,
  type RawMemoryEntity,
  type TagAlias,
  type TagCatalogEntry,
  type ContinueResult,
  type ContinuityReadiness,
  type ContextRoiReport,
  type CheckpointFromGitResult,
  type Evidence,
  type NextStep,
  type Plan,
  type PlanPhase,
  type ProjectBrief,
  type Project,
  type PromptFormat,
  type PromptRole,
  type PromptResult,
  type ReadyResult,
  type Roadmap,
  type RoadmapItem,
  type Session,
  type Spike,
  type DoctorIssue,
  type DoctorReport,
  type DispatchablesResult,
  type DispatchPlanResult,
  type DispatchHandoff,
} from "../domain/schemas";
import type { GitSummary } from "../integrations/git/git-adapter";
import { GitAdapter } from "../integrations/git/git-adapter";
import type { EventWindowSummary, ZenithRepository, SearchableMemoryEntity } from "../storage/repository";
import type { FindingListStatus } from "../storage/repository";
import { ContextEngine, type ContextOptions } from "./context-engine";
import { computeNext, findCurrentPhase, type PlanNextResult } from "./plan-next";
import { computePlanPath, validatePhaseDependencies } from "./plan-graph";
import { resolveActivePlan, type FocusCandidate, type FocusResolution } from "./focus";
import {
  buildImplementerHandoff,
  buildReviewerHandoff,
  computeDispatchables,
} from "./dispatch";
import { buildRoadmapWorkspace, type RoadmapWorkspace } from "./roadmap-workspace";
import { guardMemoryWrite, memoryGuardErrorForText, requireEvidenceForAction } from "./memory-guard";
import {
  activePlanSummary,
  activityWindow,
  buildActivityReport,
  completionMetrics,
  eventStatsFromSummary,
  findingSignals,
  roadmapProgress,
  windowFromDays,
  type ActivityReport,
  type CompletionMetrics,
  type EventStats,
  type FindingSignals,
  type RoadmapProgress,
  type TelemetryWindow,
} from "./telemetry";

export type ProjectDetection = {
  project: Project | null;
  git: GitSummary;
  registered: boolean;
};

export type ContinueOptions = {
  startSession?: boolean;
  closeOpenSession?: boolean;
  autoCapture?: boolean;
};

export type PromptOptions = {
  format?: PromptFormat;
  role?: PromptRole;
  maxTokens?: number;
  includeMetadata?: boolean;
};

export type HandoffOptions = {
  to: "planner" | "implementer" | "reviewer";
  compact?: boolean;
  maxTokens?: number;
};

export type DoctorOptions = {
  compact?: boolean;
  since?: string;
};

export type SearchMemoryOptions = {
  query?: string;
  tag?: string;
  entityType?: string;
  limit?: number;
  since?: string;
};

export type ProjectStatus = {
  project: Project | null;
  git: GitSummary;
  registered: boolean;
  activePlan: Plan | null;
  currentPhase: PlanPhase | null;
  currentBrief: ProjectBrief | null;
  recentRoadmaps: Roadmap[];
  openSpikes: Spike[];
  recentSessions: Session[];
  recentDecisions: Decision[];
  openFindings: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    relatedFiles: string[];
    relatedPlanId?: string;
    relatedPhaseId?: string;
  }>;
  contextDocs: ContextDoc[];
  focus: FocusInfo | null;
  focusAmbiguous: boolean;
  next: PlanNextResult;
};

export type FocusInfo = { roadmapId: string; roadmapTitle: string; branch: string | null };

export type FocusStatus = {
  worktreeKey: string;
  branch: string | null;
  focus: { roadmapId: string; roadmapTitle: string } | null;
  ambiguous: boolean;
  candidates: FocusCandidate[];
  activePlan: { id: string; title: string } | null;
};

export type WatchPredicate = {
  raw: string;
  stage: AgentStage;
  planId?: string;
  phaseId?: string;
};

export type WatchResult = {
  matched: true;
  predicate: WatchPredicate;
  stage: AgentStageState;
  checkedAt: string;
  elapsedMs: number;
};

export type StandupDigest = {
  window: TelemetryWindow;
  next: PlanNextResult;
  activePlan: { id: string; title: string; phase?: string } | null;
  events: EventStats;
  completions: CompletionMetrics;
  roadmaps: RoadmapProgress[];
  findings: FindingSignals;
};

export type DiffDigest = {
  window: TelemetryWindow;
  cursor: { value: string; source: TelemetryWindow["source"] };
  events: Event[];
  eventStats: EventStats;
  completions: CompletionMetrics;
  latestEndedSession: Session | null;
};

export type DriftIssue = {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  evidence: string[];
};

export type DriftReport = {
  generatedAt: string;
  activePlan: PlanSummaryForTelemetry | null;
  sourceRoadmap: RoadmapProgress | null;
  sourceRoadmapItem: { id: string; title: string; status: RoadmapItem["status"] } | null;
  next: PlanNextResult;
  aligned: boolean;
  issues: DriftIssue[];
};

export type AdherenceReport = {
  window: TelemetryWindow;
  events: EventStats;
  completions: CompletionMetrics;
  activeDayCount: number;
  eventsPerDay: number;
  completionEventsPerDay: number;
};

export type { ActivityReport };

type PlanSummaryForTelemetry = {
  id: string;
  title: string;
  status: Plan["status"];
  sourceRoadmapId?: string;
  sourceRoadmapItemId?: string;
};

type ResolvedEventSince = {
  since: { createdAt: string; id?: string };
  value: string;
  source: TelemetryWindow["source"];
};

export type { PlanNextResult } from "./plan-next";

export class ZenithApp {
  private readonly contextEngine: ContextEngine;

  constructor(
    private readonly repository: ZenithRepository,
    private readonly git = new GitAdapter(),
    private readonly cwd = process.cwd(),
  ) {
    this.contextEngine = new ContextEngine(repository, git, cwd);
  }

  async registerProject(): Promise<ProjectDetection> {
    const git = await this.git.inspect(this.cwd);
    const project = this.repository.registerProject({
      name: this.git.projectNameFromPath(git.repoRoot),
      rootPath: git.repoRoot,
      worktreeRoot: git.worktreeRoot,
      ...(git.repositoryUrl ? { repositoryUrl: git.repositoryUrl } : {}),
      ...(git.branch ? { branch: git.branch } : {}),
    });

    return { project, git, registered: true };
  }

  async detectProject(): Promise<ProjectDetection> {
    const git = await this.git.inspect(this.cwd);
    const project = this.repository.findProjectByRootPath(git.rootPath);
    return { project, git, registered: Boolean(project) };
  }

  async getProjectStatus(): Promise<ProjectStatus> {
    const detection = await this.detectProject();

    if (!detection.project) {
      return {
        ...detection,
        activePlan: null,
        currentPhase: null,
        currentBrief: null,
        recentRoadmaps: [],
        openSpikes: [],
        recentSessions: [],
        recentDecisions: [],
        openFindings: [],
        contextDocs: [],
        focus: null,
        focusAmbiguous: false,
        next: {
          recommendation: "Run zenith init",
          reason: "Project is not registered in Zenith yet.",
          evidence: [detection.git.rootPath],
        },
      };
    }

    const currentBrief = this.repository.getCurrentProjectBrief(detection.project.id);
    const recentRoadmaps = this.repository.listRoadmaps(detection.project.id, 5);
    const openSpikes = this.repository.listOpenSpikes(detection.project.id);
    const recentSessions = this.repository.listRecentSessions(detection.project.id, 5);
    const recentDecisions = this.repository.listDecisions(detection.project.id, 5);
    const openFindings = this.repository.listOpenFindings(detection.project.id);
    const contextDocs = this.repository.listContextDocs(detection.project.id);

    const { resolution, focus } = this.resolveFocus(detection.project.id, detection.git.worktreeRoot);
    const activePlan = resolution.activePlan;
    const next = computeNext(activePlan, recentSessions, openFindings, recentRoadmaps, {}, {
      ambiguous: resolution.ambiguous,
      candidates: resolution.candidates,
    });

    return {
      ...detection,
      activePlan,
      currentPhase: findCurrentPhase(activePlan),
      currentBrief,
      recentRoadmaps,
      openSpikes,
      recentSessions,
      recentDecisions,
      openFindings: openFindings.map((finding) => ({
        id: finding.id,
        type: finding.type,
        severity: finding.severity,
        title: finding.title,
        relatedFiles: finding.relatedFiles,
        ...(finding.relatedPlanId ? { relatedPlanId: finding.relatedPlanId } : {}),
        ...(finding.relatedPhaseId ? { relatedPhaseId: finding.relatedPhaseId } : {}),
      })),
      contextDocs,
      focus,
      focusAmbiguous: resolution.ambiguous,
      next,
    };
  }

  private resolveFocus(
    projectId: string,
    worktreeKey: string,
  ): { resolution: FocusResolution; focus: FocusInfo | null } {
    const roadmaps = this.repository.listRoadmaps(projectId);
    const activePlans = this.repository.listActivePlans(projectId);
    const focusRow = this.repository.getFocus(projectId, worktreeKey);
    const resolution = resolveActivePlan({
      roadmaps,
      activePlans,
      focusRoadmapId: focusRow?.roadmapId ?? null,
    });

    let focus: FocusInfo | null = null;
    if (focusRow) {
      const roadmap = roadmaps.find((entry) => entry.id === focusRow.roadmapId);
      focus = {
        roadmapId: focusRow.roadmapId,
        roadmapTitle: roadmap?.title ?? focusRow.roadmapId,
        branch: focusRow.branch ?? null,
      };
    }

    return { resolution, focus };
  }

  async roadmapWorkspace(): Promise<RoadmapWorkspace> {
    const project = await this.requireProject();
    const roadmaps = this.repository.listRoadmaps(project.id);
    const plans = this.repository.listPlans(project.id);
    const git = await this.git.inspect(this.cwd);
    const focusRow = this.repository.getFocus(project.id, git.worktreeRoot);
    return buildRoadmapWorkspace(roadmaps, plans, focusRow?.roadmapId ?? null);
  }

  async focusStatus(): Promise<FocusStatus> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    const roadmaps = this.repository.listRoadmaps(project.id);
    const activePlans = this.repository.listActivePlans(project.id);
    const focusRow = this.repository.getFocus(project.id, git.worktreeRoot);
    const resolution = resolveActivePlan({
      roadmaps,
      activePlans,
      focusRoadmapId: focusRow?.roadmapId ?? null,
    });
    const roadmap = focusRow ? roadmaps.find((entry) => entry.id === focusRow.roadmapId) : undefined;

    return {
      worktreeKey: git.worktreeRoot,
      branch: git.branch ?? null,
      focus: focusRow ? { roadmapId: focusRow.roadmapId, roadmapTitle: roadmap?.title ?? focusRow.roadmapId } : null,
      ambiguous: resolution.ambiguous,
      candidates: resolution.candidates,
      activePlan: resolution.activePlan ? { id: resolution.activePlan.id, title: resolution.activePlan.title } : null,
    };
  }

  async setFocus(roadmapId: string): Promise<FocusStatus> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    this.repository.setFocus({
      projectId: project.id,
      worktreeKey: git.worktreeRoot,
      roadmapId,
      ...(git.branch ? { branch: git.branch } : {}),
    });
    return this.focusStatus();
  }

  async clearFocus(): Promise<FocusStatus> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    this.repository.clearFocus(project.id, git.worktreeRoot);
    return this.focusStatus();
  }

  async setStage(rawInput: unknown): Promise<AgentStageState> {
    const project = await this.requireProject();
    const input = SetStageInputSchema.parse(rawInput);
    const scope = await this.resolveStageScope(project.id, {
      ...(input.planId ? { planId: input.planId } : {}),
      ...(input.phaseId ? { phaseId: input.phaseId } : {}),
    });

    return this.repository.setAgentStage({
      projectId: project.id,
      stage: input.stage,
      ...(scope.planId ? { planId: scope.planId } : {}),
      ...(scope.phaseId ? { phaseId: scope.phaseId } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.note ? { note: input.note } : {}),
    });
  }

  async watch(options: { until: string; timeoutMs?: number; pollIntervalMs?: number }): Promise<WatchResult> {
    const project = await this.requireProject();
    const parsed = parseWatchPredicate(options.until);
    const scope = await this.resolveStageScope(project.id, {
      ...(parsed.planId ? { planId: parsed.planId } : {}),
      ...(parsed.phaseId ? { phaseId: parsed.phaseId } : {}),
    });
    const predicate = {
      raw: parsed.raw,
      stage: parsed.stage,
      ...(scope.planId ? { planId: scope.planId } : {}),
      ...(scope.phaseId ? { phaseId: scope.phaseId } : {}),
    };
    const startedAt = Date.now();
    const pollIntervalMs = options.pollIntervalMs ?? 1000;
    const deadline = options.timeoutMs === undefined ? null : startedAt + options.timeoutMs;

    for (;;) {
      const stage = this.repository.getAgentStage(project.id, scope);
      if (stage?.stage === predicate.stage) {
        return {
          matched: true,
          predicate,
          stage,
          checkedAt: nowIso(),
          elapsedMs: Date.now() - startedAt,
        };
      }

      const now = Date.now();
      if (deadline !== null && now >= deadline) {
        throw new ZenithError(`Watch timed out waiting for ${predicate.raw}.`, {
          code: "watch_timeout",
          details: {
            predicate,
            timeoutMs: options.timeoutMs,
            elapsedMs: now - startedAt,
          },
          exitCode: 2,
        });
      }

      const nextDelay = deadline === null ? pollIntervalMs : Math.max(1, Math.min(pollIntervalMs, deadline - now));
      await sleep(nextDelay);
    }
  }

  async setBrief(rawInput: unknown): Promise<ProjectBrief> {
    const project = await this.requireProject();
    const input = SetBriefInputSchema.parse(rawInput);

    return this.repository.setProjectBrief({
      projectId: project.id,
      title: input.title,
      summary: input.summary,
      body: input.body,
      ...(input.source ? { source: input.source } : {}),
    });
  }

  async showBrief(): Promise<ProjectBrief | null> {
    const project = await this.requireProject();
    return this.repository.getCurrentProjectBrief(project.id);
  }

  async listBriefs(): Promise<ProjectBrief[]> {
    const project = await this.requireProject();
    return this.repository.listProjectBriefs(project.id);
  }

  async createRoadmap(rawInput: unknown): Promise<Roadmap> {
    const project = await this.requireProject();
    const input = CreateRoadmapInputSchema.parse(rawInput);

    return this.repository.createRoadmap({
      projectId: project.id,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      status: input.status,
      items: input.items.map((item) => ({
        title: item.title,
        ...(item.description ? { description: item.description } : {}),
        ...(item.justification ? { justification: item.justification } : {}),
        status: item.status,
        evidence: item.evidence.map(normalizeEvidence),
      })),
    });
  }

  async listRoadmaps(): Promise<Roadmap[]> {
    const project = await this.requireProject();
    return this.repository.listRoadmaps(project.id);
  }

  async showRoadmap(roadmapId: string): Promise<Roadmap> {
    const project = await this.requireProject();
    const roadmap = this.repository.getRoadmapById(roadmapId);

    if (!roadmap || roadmap.projectId !== project.id) {
      throw new ZenithError(`Roadmap not found: ${roadmapId}`, {
        code: "roadmap_not_found",
        details: { roadmapId },
      });
    }

    return roadmap;
  }

  async updateRoadmap(roadmapId: string, rawInput: unknown): Promise<Roadmap> {
    const input = UpdateRoadmapInputSchema.parse(rawInput);
    await this.showRoadmap(roadmapId);

    return this.repository.updateRoadmap(roadmapId, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
    });
  }

  async addRoadmapItem(roadmapId: string, rawInput: unknown): Promise<Roadmap> {
    const input = AddRoadmapItemInputSchema.parse(rawInput);
    await this.showRoadmap(roadmapId);

    return this.repository.addRoadmapItem(roadmapId, {
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.justification ? { justification: input.justification } : {}),
      status: input.status,
      evidence: input.evidence.map(normalizeEvidence),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.afterItemId ? { afterItemId: input.afterItemId } : {}),
      ...(input.afterItemTitle ? { afterItemTitle: input.afterItemTitle } : {}),
    });
  }

  async updateRoadmapItem(roadmapId: string, rawInput: unknown): Promise<Roadmap> {
    const input = UpdateRoadmapItemInputSchema.parse(rawInput);
    await this.showRoadmap(roadmapId);

    return this.repository.updateRoadmapItem(
      roadmapId,
      {
        ...(input.itemId ? { itemId: input.itemId } : {}),
        ...(input.itemTitle ? { itemTitle: input.itemTitle } : {}),
      },
      {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.justification !== undefined ? { justification: input.justification } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.evidence ? { evidence: input.evidence.map(normalizeEvidence) } : {}),
      },
    );
  }

  async importPlanToRoadmap(planId: string, rawInput: unknown): Promise<Roadmap> {
    const input = ImportPlanToRoadmapInputSchema.parse(rawInput);
    const plan = await this.showPlan(planId);

    return this.repository.importPlanAsRoadmap(plan, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      status: input.status,
      archivePlan: input.archivePlan,
    });
  }

  async createPlanFromRoadmap(roadmapId: string, rawInput: unknown): Promise<Plan> {
    const project = await this.requireProject();
    const input = CreatePlanFromRoadmapInputSchema.parse(rawInput);
    const roadmap = await this.showRoadmap(roadmapId);
    const item = this.resolveRoadmapItem(roadmap, {
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.itemTitle ? { itemTitle: input.itemTitle } : {}),
    });

    if (item.status === "discarded") {
      throw new ZenithError("Cannot create a plan from a discarded roadmap item.", {
        code: "roadmap_item_discarded",
        details: { roadmapId: roadmap.id, itemId: item.id, status: item.status },
      });
    }

    if (input.status === "active") {
      this.assertNoOtherActivePlan(project.id, { sourceRoadmapId: roadmap.id });
    }

    const sourceEvidence = normalizeEvidence({
      kind: "note",
      value: `Created from roadmap ${roadmap.id} item ${item.id}: ${roadmap.title} / ${item.title}`,
    });
    const phases =
      input.phases?.map((phase, index) => ({
        title: phase.title,
        ...(phase.description ? { description: phase.description } : {}),
        status: phase.status,
        acceptanceCriteria: phase.acceptanceCriteria,
        evidence: [...(index === 0 ? [sourceEvidence, ...item.evidence] : []), ...phase.evidence.map(normalizeEvidence)],
      })) ?? [
        {
          title: item.title,
          ...(item.description ? { description: item.description } : {}),
          status: "todo" as const,
          acceptanceCriteria: [],
          evidence: [sourceEvidence, ...item.evidence],
        },
      ];

    const plan = this.repository.createPlan({
      projectId: project.id,
      title: input.title ?? item.title,
      description: input.description ?? item.description ?? `Executable plan created from roadmap item ${item.id}.`,
      status: input.status,
      ...(input.priority ? { priority: input.priority } : {}),
      sourceRoadmapId: roadmap.id,
      sourceRoadmapItemId: item.id,
      phases,
    });

    // Companion fix: flip roadmap item from todo → in_progress when plan is active
    if (input.status === "active" && item.status === "todo") {
      this.repository.activateRoadmapItemTransaction(project.id, roadmap.id, item.id);
    }

    return plan;
  }

  async completePlan(planId: string): Promise<{ plan: Plan; roadmapItemAdvanced: { roadmapId: string; itemId: string } | null }> {
    const plan = await this.showPlan(planId);

    // Idempotency guard: already completed, no-op
    if (plan.status === "completed") {
      return { plan, roadmapItemAdvanced: null };
    }

    const openPhases = plan.phases.filter((phase) => phase.status !== "done");
    if (openPhases.length > 0) {
      throw new ZenithError(
        `Cannot complete plan: ${openPhases.length} phase(s) are not done.`,
        {
          code: "plan_has_open_phases",
          details: { openPhaseIds: openPhases.map((p) => p.id) },
        },
      );
    }

    const { completedPlan, roadmapItemAdvanced } = this.repository.completePlanTransaction(planId, plan);
    return { plan: completedPlan, roadmapItemAdvanced };
  }

  async advancePlan(rawInput: unknown): Promise<AdvanceResult> {
    const project = await this.requireProject();
    const input = AdvancePlanInputSchema.parse(rawInput);
    const plan = await this.showPlan(input.planId);

    if (plan.projectId !== project.id) {
      throw new ZenithError(`Plan not found: ${input.planId}`, { code: "plan_not_found" });
    }

    let completedPhaseResult: { phaseId: string; status: Plan["phases"][number]["status"] } | null = null;

    if (input.completedPhaseId) {
      requireEvidenceForAction(input.evidence, "plan advance");
      const phase = plan.phases.find((p) => p.id === input.completedPhaseId);
      if (!phase) {
        throw new ZenithError(`Phase not found: ${input.completedPhaseId}`, {
          code: "phase_not_found",
          details: { planId: input.planId, phaseId: input.completedPhaseId },
        });
      }

      const targetStatus = input.status ?? "done";
      await this.repository.updatePhase(
        input.planId,
        { phaseId: input.completedPhaseId },
        {
          status: targetStatus,
          ...(input.evidence.length > 0 ? { evidence: input.evidence.map(normalizeEvidence) } : {}),
        },
      );
      completedPhaseResult = { phaseId: input.completedPhaseId, status: targetStatus };
    }

    // Re-fetch the plan after the phase update to get fresh state
    const updatedPlan = await this.showPlan(input.planId);

    // Check if all phases are now done — auto-complete the plan
    // Guard: vacuous truth on zero-phase plans must not trigger auto-completion
    const allDone = updatedPlan.phases.length > 0 && updatedPlan.phases.every((p) => p.status === "done");
    let planCompleted = false;
    let roadmapItemAdvanced: { roadmapId: string; itemId: string } | null = null;

    if (allDone) {
      const { roadmapItemAdvanced: advanced } = await this.completePlan(input.planId);
      planCompleted = true;
      roadmapItemAdvanced = advanced;
    }

    // Recompute next step on the latest plan state
    const git = await this.git.inspect(this.cwd);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id);
    const recentRoadmaps = this.repository.listRoadmaps(project.id, 5);
    const { resolution } = this.resolveFocus(project.id, git.worktreeRoot);
    const next = computeNext(resolution.activePlan, recentSessions, openFindings, recentRoadmaps, {}, {
      ambiguous: resolution.ambiguous,
      candidates: resolution.candidates,
    });

    return {
      completed: completedPhaseResult,
      planCompleted,
      roadmapItemAdvanced,
      next,
    };
  }

  async planPath(planId: string): Promise<PlanPath> {
    const plan = await this.showPlan(planId);
    return computePlanPath(plan);
  }

  async planDispatchables(planId?: string): Promise<DispatchablesResult> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    const { resolution } = this.resolveFocus(project.id, git.worktreeRoot ?? "");

    let plan: Plan | null = null;
    if (planId) {
      plan = await this.showPlan(planId);
    } else if (resolution.ambiguous) {
      const openFindings = this.repository.listOpenFindings(project.id);
      const activeClaims = (await this.listClaims()).filter((c) => c.status === "active");
      return computeDispatchables(null, openFindings, activeClaims, {
        ambiguous: true,
        candidates: resolution.candidates,
      });
    } else if (resolution.activePlan) {
      plan = resolution.activePlan;
    } else {
      throw new ZenithError("No active plan found", { code: "no_active_plan" });
    }

    const openFindings = this.repository.listOpenFindings(project.id);
    const activeClaims = (await this.listClaims()).filter((c) => c.status === "active");

    return computeDispatchables(plan, openFindings, activeClaims, {
      ambiguous: false,
      candidates: [],
    });
  }

  async dispatch(options: {
    planId?: string;
    claim?: boolean;
    format?: "markdown" | "codex" | "conductor";
  }): Promise<DispatchPlanResult> {
    const dispatchables = await this.planDispatchables(options.planId);
    const format = options.format ?? "markdown";

    let plan: Plan | null = null;
    if (dispatchables.planId) {
      plan = await this.showPlan(dispatchables.planId);
    }

    const handoffs: DispatchHandoff[] = [];
    const claimsCreated: string[] = [];

    if (plan) {
      for (const item of dispatchables.parallelGroups) {
        handoffs.push(buildImplementerHandoff(plan, item));
      }
      for (const item of dispatchables.needsReview) {
        handoffs.push(buildReviewerHandoff(plan, item));
      }

      if (options.claim) {
        for (const handoff of handoffs) {
          const created = await this.claim({
            entityId: handoff.phaseId,
            scope: ".",
            role: handoff.role,
            ttl: "2h",
          });
          claimsCreated.push(created.id);
        }
      }
    }

    return {
      planId: dispatchables.planId,
      format,
      ambiguous: dispatchables.ambiguous,
      handoffs,
      claimsCreated,
      warnings: dispatchables.warnings,
    };
  }

  async createSpike(rawInput: unknown): Promise<Spike> {
    const project = await this.requireProject();
    const input = CreateSpikeInputSchema.parse(rawInput);

    return this.repository.createSpike({
      projectId: project.id,
      title: input.title ?? input.question,
      question: input.question,
      ...(input.hypothesis ? { hypothesis: input.hypothesis } : {}),
      options: input.options,
      evidence: input.evidence.map(normalizeEvidence),
      status: input.status,
    });
  }

  async recordSpike(rawInput: unknown): Promise<Spike> {
    const project = await this.requireProject();
    const input = RecordSpikeInputSchema.parse(rawInput);

    return this.repository.createSpike({
      projectId: project.id,
      title: input.title ?? input.question,
      question: input.question,
      ...(input.hypothesis ? { hypothesis: input.hypothesis } : {}),
      options: input.options,
      result: input.result,
      recommendation: input.recommendation,
      evidence: input.evidence.map(normalizeEvidence),
      status: input.status,
    });
  }

  async listSpikes(): Promise<Spike[]> {
    const project = await this.requireProject();
    return this.repository.listSpikes(project.id);
  }

  async showSpike(spikeId: string): Promise<Spike> {
    const project = await this.requireProject();
    const spike = this.repository.getSpikeById(spikeId);

    if (!spike || spike.projectId !== project.id) {
      throw new ZenithError(`Spike not found: ${spikeId}`, {
        code: "spike_not_found",
        details: { spikeId },
      });
    }

    return spike;
  }

  async concludeSpike(spikeId: string, rawInput: unknown): Promise<Spike> {
    const input = ConcludeSpikeInputSchema.parse(rawInput);
    await this.showSpike(spikeId);

    return this.repository.concludeSpike(spikeId, {
      status: input.status,
      ...(input.result ? { result: input.result } : {}),
      ...(input.recommendation ? { recommendation: input.recommendation } : {}),
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async createPlan(rawInput: unknown): Promise<Plan> {
    const project = await this.requireProject();
    const input = CreatePlanInputSchema.parse(rawInput);

    if (input.status === "active") {
      this.assertNoOtherActivePlan(project.id, { sourceRoadmapId: null });
    }

    return this.repository.createPlan({
      projectId: project.id,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      status: input.status,
      ...(input.priority ? { priority: input.priority } : {}),
      phases: input.phases.map((phase) => ({
        title: phase.title,
        ...(phase.description ? { description: phase.description } : {}),
        status: phase.status,
        acceptanceCriteria: phase.acceptanceCriteria,
        evidence: phase.evidence.map(normalizeEvidence),
      })),
    });
  }

  async listPlans(): Promise<Plan[]> {
    const project = await this.requireProject();
    return this.repository.listPlans(project.id);
  }

  async showPlan(planId: string): Promise<Plan> {
    const project = await this.requireProject();
    const plan = this.repository.getPlanById(planId);

    if (!plan || plan.projectId !== project.id) {
      throw new ZenithError(`Plan not found: ${planId}`, { code: "plan_not_found" });
    }

    return plan;
  }

  async updatePlan(planId: string, rawInput: unknown): Promise<Plan> {
    const project = await this.requireProject();
    const input = UpdatePlanInputSchema.parse(rawInput);
    const plan = await this.showPlan(planId);

    if (plan.projectId !== project.id) {
      throw new ZenithError(`Plan not found: ${planId}`, { code: "plan_not_found" });
    }

    if (input.status === "active") {
      this.assertNoOtherActivePlan(project.id, { sourceRoadmapId: plan.sourceRoadmapId ?? null, planId: plan.id });
    }

    return this.repository.updatePlan(planId, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    });
  }

  async updatePhase(planId: string, rawInput: unknown): Promise<Plan> {
    const project = await this.requireProject();
    const input = UpdatePhaseInputSchema.parse(rawInput);
    const plan = await this.showPlan(planId);

    if (plan.projectId !== project.id) {
      throw new ZenithError(`Plan not found: ${planId}`, { code: "plan_not_found" });
    }

    if (input.dependsOn !== undefined) {
      const targetPhase = input.phaseId
        ? plan.phases.find((p) => p.id === input.phaseId)
        : plan.phases.find((p) => p.title === input.phaseTitle);
      if (targetPhase) {
        validatePhaseDependencies(plan.phases, targetPhase.id, input.dependsOn);
      }
    }

    return this.repository.updatePhase(
      planId,
      {
        ...(input.phaseId ? { phaseId: input.phaseId } : {}),
        ...(input.phaseTitle ? { phaseTitle: input.phaseTitle } : {}),
      },
      {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.acceptanceCriteria ? { acceptanceCriteria: input.acceptanceCriteria } : {}),
        ...(input.evidence ? { evidence: input.evidence.map(normalizeEvidence) } : {}),
        ...(input.dependsOn !== undefined ? { dependsOn: input.dependsOn } : {}),
      },
    );
  }

  async nextPlanStep(options: { staleAfterDays?: number } = {}): Promise<PlanNextResult> {
    const project = await this.requireProject();
    return this.computeNextForProject(project, options);
  }

  async standup(options: { days?: number } = {}): Promise<StandupDigest> {
    const project = await this.requireProject();
    const now = nowIso();
    const days = options.days ?? 1;
    const window = windowFromDays(days, now);
    const since = { createdAt: window.since };
    const events = this.repository.listEvents(project.id, { since, limit: 500 });
    const eventSummary = this.repository.summarizeEvents(project.id, { since });
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id);
    const roadmaps = this.repository.listRoadmaps(project.id, 5);
    const { resolution } = this.resolveFocus(project.id, (await this.git.inspect(this.cwd)).worktreeRoot);

    return {
      window,
      next: computeNext(resolution.activePlan, recentSessions, openFindings, roadmaps),
      activePlan: activePlanSummary(resolution.activePlan),
      events: eventStatsFromSummary(eventSummary),
      completions: completionMetrics(events),
      roadmaps: roadmapProgress(roadmaps),
      findings: findingSignals(openFindings),
    };
  }

  async diff(options: { since?: string; limit?: number } = {}): Promise<DiffDigest> {
    const project = await this.requireProject();
    const now = nowIso();
    const latestEndedSession = this.repository.getLatestEndedSession(project.id);
    const resolved = options.since
      ? this.resolveEventSince(project.id, options.since)
      : this.defaultDiffSince(latestEndedSession, now);
    const events = this.repository.listEvents(project.id, { since: resolved.since, limit: options.limit ?? 50 });
    const eventSummary = this.repository.summarizeEvents(project.id, { since: resolved.since });

    return {
      window: {
        since: resolved.since.createdAt,
        until: now,
        source: resolved.source,
      },
      cursor: {
        value: resolved.value,
        source: resolved.source,
      },
      events,
      eventStats: eventStatsFromSummary(eventSummary),
      completions: completionMetrics(events),
      latestEndedSession,
    };
  }

  async drift(options: { staleAfterDays?: number } = {}): Promise<DriftReport> {
    const project = await this.requireProject();
    const now = nowIso();
    const git = await this.git.inspect(this.cwd);
    const roadmaps = this.repository.listRoadmaps(project.id);
    const recentRoadmaps = roadmaps.slice(0, 5);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id);
    const { resolution } = this.resolveFocus(project.id, git.worktreeRoot);
    const activePlan = resolution.activePlan;
    const next = computeNext(
      activePlan,
      recentSessions,
      openFindings,
      recentRoadmaps,
      { now, staleAfterDays: options.staleAfterDays ?? 7 },
      { ambiguous: resolution.ambiguous, candidates: resolution.candidates },
    );
    const sourceRoadmap = activePlan?.sourceRoadmapId
      ? roadmaps.find((roadmap) => roadmap.id === activePlan.sourceRoadmapId) ?? null
      : null;
    const sourceItem =
      sourceRoadmap && activePlan?.sourceRoadmapItemId
        ? sourceRoadmap.items.find((item) => item.id === activePlan.sourceRoadmapItemId) ?? null
        : null;
    const issues = driftIssues(activePlan, sourceRoadmap, sourceItem);
    const sourceProgress = sourceRoadmap ? roadmapProgress([sourceRoadmap])[0] ?? null : null;

    return {
      generatedAt: now,
      activePlan: activePlan ? planSummaryForTelemetry(activePlan) : null,
      sourceRoadmap: sourceProgress,
      sourceRoadmapItem: sourceItem
        ? {
            id: sourceItem.id,
            title: sourceItem.title,
            status: sourceItem.status,
          }
        : null,
      next,
      aligned: issues.length === 0,
      issues,
    };
  }

  async doctor(options: DoctorOptions = {}): Promise<DoctorReport> {
    const context = await this.compactContext();
    const detection = await this.detectProject();
    const issues: DoctorIssue[] = [];
    const now = nowIso();

    if (!detection.project) {
      issues.push({
        id: "project_not_registered",
        severity: "error",
        title: "Project is not registered",
        detail: "Run `zenith init` before relying on continuity memory.",
        evidence: [detection.git.rootPath],
      });
      return buildDoctorReport(now, issues);
    }

    const project = detection.project;
    const since = options.since ? this.resolveEventSince(project.id, options.since).since : null;
    const records = this.repository
      .listSearchableMemoryEntities(project.id)
      .filter((record) => !since || record.updatedAt > since.createdAt);
    const activeClaims = this.repository.listClaims(project.id, { status: "active" });
    const allClaims = this.repository.listClaims(project.id, { includeExpired: true });
    const tags = this.repository.listMemoryTags(project.id);
    const catalog = this.repository.listTagCatalog(project.id);
    const catalogTags = new Set(catalog.map((tag) => tag.tag));
    const plans = this.repository.listPlans(project.id);
    const findings = this.repository.listFindings(project.id, "all");
    const docs = this.repository.listContextDocs(project.id);

    if (context.git.dirty) {
      issues.push({
        id: "dirty_worktree",
        severity: "warning",
        title: "Working tree is dirty",
        detail: `${context.git.changedFiles.length} changed file(s) are present.`,
        evidence: context.git.changedFiles.slice(0, 10),
      });
    }
    if (project.branch && context.git.branch && project.branch !== context.git.branch) {
      issues.push({
        id: "branch_changed",
        severity: "warning",
        title: "Project branch differs from current branch",
        detail: `Registered branch ${project.branch}, current branch ${context.git.branch}.`,
        evidence: [project.branch, context.git.branch],
      });
    }

    for (const plan of plans) {
      for (const phase of plan.phases) {
        if (phase.acceptanceCriteria.length === 0 && phase.status !== "done") {
          issues.push({
            id: `missing_acceptance:${phase.id}`,
            severity: "warning",
            title: "Phase has no acceptance criteria",
            detail: phase.title,
            entityType: "phase",
            entityId: phase.id,
          });
        }
        if ((phase.status === "done" || phase.status === "needs_review" || phase.status === "blocked") && phase.evidence.length === 0) {
          issues.push({
            id: `weak_phase_evidence:${phase.id}`,
            severity: "error",
            title: "Phase state lacks evidence",
            detail: `${phase.title} is ${phase.status} without evidence.`,
            entityType: "phase",
            entityId: phase.id,
          });
        }
      }
    }
    for (const finding of findings) {
      if (finding.status === "closed" && finding.evidence.length === 0) {
        issues.push({
          id: `closed_finding_without_evidence:${finding.id}`,
          severity: "error",
          title: "Closed finding lacks evidence",
          detail: finding.title,
          entityType: "finding",
          entityId: finding.id,
        });
      }
    }
    for (const doc of docs.filter((doc) => doc.status === "pinned")) {
      const absolutePath = resolve(contextWorkspaceRoot(context), doc.path);
      if (!existsSync(absolutePath)) {
        issues.push({
          id: `missing_doc:${doc.id}`,
          severity: "warning",
          title: "Pinned context doc is missing",
          detail: doc.path,
          entityType: "context_doc",
          entityId: doc.id,
        });
        continue;
      }
      const mtime = statSync(absolutePath).mtime.toISOString();
      if ((doc.observedMtime && doc.observedMtime !== mtime) || (doc.readCommit && context.git.headCommit && doc.readCommit !== context.git.headCommit)) {
        issues.push({
          id: `stale_doc:${doc.id}`,
          severity: "warning",
          title: "Pinned context doc may be stale",
          detail: doc.path,
          entityType: "context_doc",
          entityId: doc.id,
        });
      }
    }
    for (const claim of allClaims.filter((claim) => claim.status === "expired")) {
      issues.push({
        id: `expired_claim:${claim.id}`,
        severity: "info",
        title: "Claim is expired",
        detail: `${claim.role} claim on ${claim.scope}`,
        evidence: [claim.id],
      });
    }
    if (activeClaims.length > 0) {
      issues.push({
        id: "active_claims",
        severity: "info",
        title: "Active claims exist",
        detail: `${activeClaims.length} active claim(s) are coordinating work.`,
        evidence: activeClaims.map((claim) => claim.scope).slice(0, 10),
      });
    }
    for (const tag of new Set(tags.map((tag) => tag.tag))) {
      if (!catalogTags.has(tag) && !hasReservedTagPrefix(tag)) {
        issues.push({
          id: `ambiguous_tag:${tag}`,
          severity: "warning",
          title: "Free-form tag is not cataloged",
          detail: tag,
        });
      }
    }
    for (const record of records) {
      const guardError = memoryGuardErrorForText(record.text, `${record.entityType}:${record.entityId}`);
      if (guardError) {
        issues.push({
          id: `legacy_guard:${record.entityType}:${record.entityId}`,
          severity: "error",
          title: "Legacy memory violates guard policy",
          detail: guardError.message,
          entityType: record.entityType,
          entityId: record.entityId,
        });
      }
    }

    return buildDoctorReport(now, issues);
  }

  async adherence(options: { days?: number } = {}): Promise<AdherenceReport> {
    const project = await this.requireProject();
    const now = nowIso();
    const days = options.days ?? 14;
    const window = windowFromDays(days, now);
    const since = { createdAt: window.since };
    const events = this.repository.listEvents(project.id, { since, limit: 500 });
    const eventSummary = this.repository.summarizeEvents(project.id, { since });
    const stats = eventStatsFromSummary(eventSummary);
    const completions = completionMetrics(events);
    const completionEvents = completions.plansCompleted + completions.phasesCompleted + completions.roadmapItemsAdvanced;

    return {
      window,
      events: stats,
      completions,
      activeDayCount: stats.activeDays.length,
      eventsPerDay: roundMetric(stats.total / days),
      completionEventsPerDay: roundMetric(completionEvents / days),
    };
  }

  async activity(options: { weeks?: number } = {}): Promise<ActivityReport> {
    const project = await this.requireProject();
    const now = nowIso();
    const window = activityWindow(now, options.weeks);
    const dayCounts = this.repository.countEventsByDay(project.id, {
      sinceDate: window.startDate,
      untilDate: window.endDate,
    });
    return buildActivityReport(dayCounts, {
      now,
      ...(options.weeks ? { weeks: options.weeks } : {}),
    });
  }

  async setMemoryTags(entityTypeRaw: string, entityId: string, rawInput: unknown): Promise<MemoryTag[]> {
    const project = await this.requireProject();
    const entityType = parseMemoryEntityType(entityTypeRaw);
    this.requireMemoryEntity(project.id, entityType, entityId);
    const input = SetMemoryTagsInputSchema.parse(rawInput);
    const tags = [...new Set(normalizeMemoryTags(input.tags).map((tag) => this.repository.resolveTagAlias(project.id, tag)))];

    return this.repository.setMemoryTags({
      projectId: project.id,
      entityType,
      entityId,
      tags,
    });
  }

  async listMemoryTags(options: { tag?: string; entityType?: string; entityId?: string } = {}): Promise<MemoryTag[]> {
    const project = await this.requireProject();
    const entityType = options.entityType ? parseMemoryEntityType(options.entityType) : undefined;
    const tag = options.tag ? normalizeMemoryTag(options.tag) : undefined;

    if (options.entityId && entityType) {
      this.requireMemoryEntity(project.id, entityType, options.entityId);
    }

    return this.repository.listMemoryTags(project.id, {
      ...(tag ? { tag } : {}),
      ...(entityType ? { entityType } : {}),
      ...(options.entityId ? { entityId: options.entityId } : {}),
    });
  }

  async createTag(rawInput: unknown): Promise<TagCatalogEntry> {
    const project = await this.requireProject();
    const input = CreateTagInputSchema.parse(rawInput);
    return this.repository.upsertTagCatalog({
      projectId: project.id,
      tag: normalizeMemoryTag(input.tag),
      ...(input.description ? { description: input.description } : {}),
    });
  }

  async createTagAlias(rawInput: unknown): Promise<TagAlias> {
    const project = await this.requireProject();
    const input = CreateTagAliasInputSchema.parse(rawInput);
    return this.repository.upsertTagAlias({
      projectId: project.id,
      alias: normalizeMemoryTag(input.alias),
      tag: normalizeMemoryTag(input.tag),
    });
  }

  async listTagCatalog(options: { unused?: boolean } = {}): Promise<TagCatalogEntry[]> {
    const project = await this.requireProject();
    return this.repository.listTagCatalog(project.id, options);
  }

  async claim(rawInput: unknown): Promise<MemoryClaim> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    const input = ClaimInputSchema.parse(rawInput);
    return this.repository.createClaim({
      projectId: project.id,
      entityId: input.entityId,
      scope: input.scope,
      role: input.role,
      ttlMs: parseTtlMs(input.ttl),
      owner: "codex",
      worktree: git.worktreeRoot,
      ...(git.branch ? { branch: git.branch } : {}),
      hostname: hostname(),
    });
  }

  async listClaims(): Promise<MemoryClaim[]> {
    const project = await this.requireProject();
    return this.repository.listClaims(project.id, { includeExpired: true });
  }

  async refreshClaim(rawInput: unknown): Promise<MemoryClaim> {
    const project = await this.requireProject();
    const input = RefreshClaimInputSchema.parse(rawInput);
    return this.repository.refreshClaim({
      projectId: project.id,
      claimId: input.claimId,
      ttlMs: parseTtlMs(input.ttl),
    });
  }

  async release(claimIdOrEntityId: string): Promise<MemoryClaim[]> {
    const project = await this.requireProject();
    return this.repository.releaseClaim(project.id, claimIdOrEntityId);
  }

  async inspectRaw(entityTypeRaw: string, entityId: string): Promise<RawMemoryEntity> {
    const project = await this.requireProject();
    const entityType = parseMemoryEntityType(entityTypeRaw);
    return this.repository.inspectRawEntity(project.id, entityType, entityId);
  }

  async purge(rawInput: { kind: string; entityType?: string; entityId?: string; tag?: string; projectId?: string; reason?: string; confirm?: boolean }): Promise<{ purged: boolean; entityType: string; entityId: string }> {
    if (!rawInput.confirm) {
      throw new ZenithError("Purge requires --confirm.", {
        code: "purge_confirmation_required",
        details: { kind: rawInput.kind },
      });
    }
    const project = await this.requireProject();
    if (rawInput.kind === "tag") {
      const tag = rawInput.tag ? normalizeMemoryTag(rawInput.tag) : "";
      return this.repository.purge({ kind: "tag", projectId: project.id, tag, ...(rawInput.reason ? { reason: rawInput.reason } : {}) });
    }
    if (rawInput.kind === "project") {
      const projectId = rawInput.projectId && rawInput.projectId !== "current" ? rawInput.projectId : project.id;
      return this.repository.purge({ kind: "project", projectId, ...(rawInput.reason ? { reason: rawInput.reason } : {}) });
    }
    const entityType = parseMemoryEntityType(rawInput.entityType ?? "");
    if (!rawInput.entityId) {
      throw new ZenithError("Purge entity requires an entity id.", {
        code: "invalid_purge_target",
        details: { kind: rawInput.kind },
      });
    }
    this.requireMemoryEntity(project.id, entityType, rawInput.entityId);
    return this.repository.purge({
      kind: "entity",
      projectId: project.id,
      entityType,
      entityId: rawInput.entityId,
      ...(rawInput.reason ? { reason: rawInput.reason } : {}),
    });
  }

  async handoff(options: HandoffOptions): Promise<PromptResult> {
    const role = options.to;
    return this.prompt({
      role,
      format: "codex",
      ...((options.maxTokens ?? (options.compact ? 800 : undefined)) !== undefined
        ? { maxTokens: (options.maxTokens ?? (options.compact ? 800 : undefined))! }
        : {}),
      includeMetadata: true,
    });
  }

  async searchMemory(options: SearchMemoryOptions = {}): Promise<MemorySearchResult[]> {
    const project = await this.requireProject();
    const entityType = options.entityType ? parseMemoryEntityType(options.entityType) : undefined;
    const tag = options.tag ? normalizeMemoryTag(options.tag) : undefined;
    const query = (options.query ?? "").trim();
    const queryTokens = tokenizeSearchText(query);
    const queryText = normalizeSearchText(query);
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
    const tagsByEntity = groupMemoryTags(this.repository.listMemoryTags(project.id));
    const since = options.since ? this.resolveEventSince(project.id, options.since).since : null;
    const records = this.repository.listSearchableMemoryEntities(project.id);
    const results: MemorySearchResult[] = [];

    for (const record of records) {
      if (since && record.updatedAt <= since.createdAt) {
        continue;
      }
      if (entityType && record.entityType !== entityType) {
        continue;
      }
      const tags = tagsByEntity.get(memoryEntityKey(record.entityType, record.entityId)) ?? [];
      if (tag && !tags.includes(tag)) {
        continue;
      }

      const score = scoreMemoryRecord(record, queryTokens, queryText);
      if (score === null) {
        continue;
      }

      results.push({
        entityType: record.entityType,
        entityId: record.entityId,
        title: record.title,
        snippet: memorySnippet(record, queryTokens),
        tags,
        ...(record.lifecycle ? { lifecycle: record.lifecycle } : {}),
        score,
        updatedAt: record.updatedAt,
      });
    }

    return results
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.updatedAt !== a.updatedAt) return b.updatedAt.localeCompare(a.updatedAt);
        if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType);
        return a.entityId.localeCompare(b.entityId);
      })
      .slice(0, limit);
  }

  async suggestDocs(options: { task?: string } = {}): Promise<ContextDocSuggestion[]> {
    DocsTaskSchema.parse(options.task ?? "current");
    const context = await this.compactContext();
    if (!context.project) {
      return [];
    }
    return suggestContextDocs(context);
  }

  async listContextDocs(options: { task?: string } = {}): Promise<ContextDoc[]> {
    DocsTaskSchema.parse(options.task ?? "current");
    const project = await this.requireProject();
    return this.repository.listContextDocs(project.id);
  }

  async pinContextDoc(path: string, options: { task?: string } = {}): Promise<ContextDoc> {
    DocsTaskSchema.parse(options.task ?? "current");
    return this.upsertContextDoc(path, "pinned");
  }

  async ignoreContextDoc(path: string, options: { task?: string } = {}): Promise<ContextDoc> {
    DocsTaskSchema.parse(options.task ?? "current");
    return this.upsertContextDoc(path, "ignored");
  }

  private async upsertContextDoc(path: string, status: "pinned" | "ignored"): Promise<ContextDoc> {
    const context = await this.compactContext();
    if (!context.project) {
      throw new ZenithError("Project is not registered. Run `zenith init` first.", {
        code: "project_not_registered",
        details: { rootPath: context.git.rootPath },
      });
    }

    const normalizedPath = normalizeDocPath(contextWorkspaceRoot(context), path);
    const suggestion =
      suggestContextDocs(context).find((candidate) => candidate.path === normalizedPath) ??
      buildContextDocSuggestion(context, normalizedPath, "Manually selected context document.", "medium");

    return this.repository.upsertContextDoc({
      projectId: context.project.id,
      scope: suggestion.scope,
      ...(suggestion.planId ? { planId: suggestion.planId } : {}),
      ...(suggestion.phaseId ? { phaseId: suggestion.phaseId } : {}),
      path: suggestion.path,
      reason: suggestion.reason,
      summary: suggestion.summary,
      assumptions: suggestion.assumptions,
      confidence: suggestion.confidence,
      status,
      readAt: suggestion.readAt,
      ...(suggestion.readCommit ? { readCommit: suggestion.readCommit } : {}),
      ...(suggestion.observedMtime ? { observedMtime: suggestion.observedMtime } : {}),
    });
  }

  private async computeNextForProject(project: Project, options: { staleAfterDays?: number } = {}): Promise<PlanNextResult> {
    const git = await this.git.inspect(this.cwd);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id);
    const recentRoadmaps = this.repository.listRoadmaps(project.id, 5);
    const { resolution } = this.resolveFocus(project.id, git.worktreeRoot);
    return computeNext(
      resolution.activePlan,
      recentSessions,
      openFindings,
      recentRoadmaps,
      options.staleAfterDays ? { now: nowIso(), staleAfterDays: options.staleAfterDays } : {},
      {
        ambiguous: resolution.ambiguous,
        candidates: resolution.candidates,
      },
    );
  }

  private roadmapItemForNext(projectId: string, next: NextStep): RoadmapItem | null {
    if (next.kind !== "create_plan" && next.kind !== "review_deferred") {
      return null;
    }

    const [roadmapId, itemId] = next.evidence;
    if (!roadmapId || !itemId) {
      return null;
    }

    const roadmap = this.repository.getRoadmapById(roadmapId);
    if (!roadmap || roadmap.projectId !== projectId) {
      return null;
    }

    return roadmap.items.find((item) => item.id === itemId) ?? null;
  }

  private singleOpenSessionForMutation(openSessions: Session[], flag: string): Session | null {
    if (openSessions.length > 1) {
      throw new ZenithError(`Multiple open sessions exist; ${flag} requires exactly one open session.`, {
        code: "ambiguous_open_session",
        details: { flag, sessionIds: openSessions.map((session) => session.id) },
      });
    }

    return openSessions[0] ?? null;
  }

  private resolveEventSince(projectId: string, since: string): ResolvedEventSince {
    const isIso = /^\d{4}-\d{2}-\d{2}T/.test(since);
    if (isIso) {
      return {
        since: { createdAt: since },
        value: since,
        source: "iso",
      };
    }

    const event = this.repository.getEventById(since);
    if (!event || event.projectId !== projectId) {
      throw new ZenithError(`Event not found: ${since}`, {
        code: "event_not_found",
        details: { eventId: since },
      });
    }

    return {
      since: { createdAt: event.createdAt, id: event.id },
      value: event.id,
      source: "event_id",
    };
  }

  private defaultDiffSince(latestEndedSession: Session | null, now: string): ResolvedEventSince {
    if (latestEndedSession?.endedAt) {
      return {
        since: { createdAt: latestEndedSession.endedAt },
        value: latestEndedSession.endedAt,
        source: "latest_session",
      };
    }

    const window = windowFromDays(1, now, "fallback");
    return {
      since: { createdAt: window.since },
      value: window.since,
      source: "fallback",
    };
  }

  async getContext(options: ContextOptions = {}): Promise<ContextSnapshot> {
    return this.contextEngine.getContext(options);
  }

  async compactContext(options: ContextOptions & { budget?: number } = {}): Promise<CompactContext> {
    const context = await this.contextEngine.compactContext(options);
    if (!options.budget) return context;
    return { ...context, markdown: truncateToApproxTokens(context.markdown, options.budget) };
  }

  async resume(): Promise<ResumeContext> {
    const resume = await this.contextEngine.resume();
    const context = await this.compactContext();
    const detection = await this.detectProject();
    const openSessionCount = detection.project ? this.repository.listOpenSessions(detection.project.id, 20).length : 0;
    const readiness = buildContinuityReadiness(context, openSessionCount);
    const roi = detection.project ? await this.contextRoi() : emptyContextRoiReport(context);

    return ResumeContextSchema.parse({
      ...resume,
      readiness,
      roi,
    });
  }

  async contextRoi(options: { since?: string } = {}): Promise<ContextRoiReport> {
    const project = await this.requireProject();
    const context = await this.compactContext();
    const resolved = options.since ? this.resolveEventSince(project.id, options.since).since : undefined;
    const eventSummary = this.repository.summarizeEvents(project.id, resolved ? { since: resolved } : {});
    const records = this.repository
      .listSearchableMemoryEntities(project.id)
      .filter((record) => !resolved || record.updatedAt > resolved.createdAt);

    return buildContextRoiReport(records, eventSummary, context);
  }

  async continueWork(options: ContinueOptions = {}): Promise<ContinueResult> {
    const context = await this.compactContext();
    const detection = await this.detectProject();
    const project = detection.project;
    const warnings = continueWarnings(context);
    let phase: PhaseDetail | null = null;
    let roadmapItem: RoadmapItem | null = null;
    let latestSession: Session | null = null;
    let openSession: Session | null = null;
    let newSession: Session | null = null;
    let closedSession: Session | null = null;
    let openSessionCount = 0;
    let roi = emptyContextRoiReport(context);

    if (!project) {
      pushUnique(warnings, "Project is not registered. Run `zenith init` before relying on continuity memory.");
      const readiness = buildContinuityReadiness(context, 0);
      const actionBriefing = buildActionBriefing(context, {
        latestSession,
        phase,
        roadmapItem,
        contextDocs: context.contextDocs,
      });
      return ContinueResultSchema.parse({
        context,
        next: context.next,
        phase,
        roadmapItem,
        contextDocs: context.contextDocs,
        actionBriefing,
        latestSession,
        openSession,
        newSession,
        closedSession,
        warnings,
        readiness,
        roi,
        markdown: renderContinueMarkdown({
          context,
          phase,
          roadmapItem,
          contextDocs: context.contextDocs,
          actionBriefing,
          latestSession,
          openSession,
          newSession,
          closedSession,
          warnings,
          readiness,
          roi,
        }),
      });
    }

    roi = await this.contextRoi();
    const initialOpenSessions = this.repository.listOpenSessions(project.id, 20);
    openSessionCount = initialOpenSessions.length;
    if (initialOpenSessions.length > 1) {
      pushUnique(
        warnings,
        `Multiple open sessions found (${initialOpenSessions.length}); close or update one explicitly before using session mutation flags.`,
      );
    }
    openSession = initialOpenSessions.length === 1 ? initialOpenSessions[0]! : null;
    latestSession = this.repository.listRecentSessions(project.id, 1)[0] ?? null;
    phase = context.next.phaseId ? await this.showPhase(context.next.phaseId) : null;
    roadmapItem = this.roadmapItemForNext(project.id, context.next);

    if (options.closeOpenSession) {
      const session = this.singleOpenSessionForMutation(initialOpenSessions, "--close-open-session");
      if (session) {
        closedSession = await this.endSession(session.id, {
          summary: "Closed by zenith continue --close-open-session.",
          changedFiles: detection.git.changedFiles,
          nextSteps: nextStepList(context.next),
          ...(context.next.planId ? { relatedPlanId: context.next.planId } : {}),
        });
      } else {
        pushUnique(warnings, "--close-open-session was requested but no session is open.");
      }
    }

    const afterCloseOpenSessions = this.repository.listOpenSessions(project.id, 20);
    if (options.startSession) {
      if (afterCloseOpenSessions.length > 1) {
        this.singleOpenSessionForMutation(afterCloseOpenSessions, "--start-session");
      } else if (afterCloseOpenSessions.length === 0) {
        newSession = await this.startSession({
          summary: "Started by zenith continue --start-session.",
          changedFiles: detection.git.changedFiles,
          nextSteps: nextStepList(context.next),
          ...(context.next.planId ? { relatedPlanId: context.next.planId } : {}),
        });
      } else {
        pushUnique(warnings, "--start-session was requested but an open session already exists.");
      }
    }

    if (options.autoCapture) {
      const captureOpenSessions = this.repository.listOpenSessions(project.id, 20);
      const session = this.singleOpenSessionForMutation(captureOpenSessions, "--auto-capture");
      if (session) {
        const captured = await this.captureSession(session.id, {
          summary: "Captured by zenith continue --auto-capture.",
          changedFiles: detection.git.changedFiles,
          nextSteps: nextStepList(context.next),
          ...(context.next.planId ? { relatedPlanId: context.next.planId } : {}),
        });
        if (newSession?.id === captured.id) {
          newSession = captured;
        }
      } else {
        pushUnique(warnings, "--auto-capture was requested but no session is open.");
      }
    }

    const finalOpenSessions = this.repository.listOpenSessions(project.id, 20);
    openSessionCount = finalOpenSessions.length;
    if (finalOpenSessions.length > 1) {
      pushUnique(
        warnings,
        `Multiple open sessions found (${finalOpenSessions.length}); close or update one explicitly before using session mutation flags.`,
      );
    }
    openSession = finalOpenSessions.length === 1 ? finalOpenSessions[0]! : null;
    latestSession = this.repository.listRecentSessions(project.id, 1)[0] ?? latestSession;

    const readiness = buildContinuityReadiness(context, openSessionCount);
    const actionBriefing = buildActionBriefing(context, {
      latestSession,
      phase,
      roadmapItem,
      contextDocs: context.contextDocs,
    });
    return ContinueResultSchema.parse({
      context,
      next: context.next,
      phase,
      roadmapItem,
      contextDocs: context.contextDocs,
      actionBriefing,
      latestSession,
      openSession,
      newSession,
      closedSession,
      warnings,
      readiness,
      roi,
      markdown: renderContinueMarkdown({
        context,
        phase,
        roadmapItem,
        contextDocs: context.contextDocs,
        actionBriefing,
        latestSession,
        openSession,
        newSession,
        closedSession,
        warnings,
        readiness,
        roi,
      }),
    });
  }

  async prompt(options: PromptOptions = {}): Promise<PromptResult> {
    const format = PromptFormatSchema.parse(options.format ?? "markdown");
    const role = options.role === undefined ? undefined : PromptRoleSchema.parse(options.role);
    if (options.maxTokens !== undefined && (!Number.isInteger(options.maxTokens) || options.maxTokens <= 0)) {
      throw new ZenithError("--max-tokens must be a positive integer.", {
        code: "invalid_option",
        details: { optionName: "max-tokens", value: String(options.maxTokens) },
      });
    }

    return renderPromptResult(await this.continueWork(), {
      format,
      ...(role ? { role } : {}),
      ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
      ...(options.includeMetadata ? { includeMetadata: true } : {}),
    });
  }

  async timeline(options: { limit?: number; since?: string } = {}): Promise<Event[]> {
    const project = await this.requireProject();

    let sinceOption: { createdAt: string; id?: string } | undefined;
    if (options.since) {
      // Detect whether it's an event id or an ISO timestamp
      const isIso = /^\d{4}-\d{2}-\d{2}T/.test(options.since);
      if (isIso) {
        sinceOption = { createdAt: options.since };
      } else {
        // Treat as event id: resolve to its created_at
        const event = this.repository.getEventById(options.since);
        if (!event) {
          throw new ZenithError(`Event not found: ${options.since}`, {
            code: "event_not_found",
            details: { eventId: options.since },
          });
        }
        sinceOption = { createdAt: event.createdAt, id: event.id };
      }
    }

    return this.repository.listEvents(project.id, {
      ...(options.limit ? { limit: options.limit } : {}),
      ...(sinceOption ? { since: sinceOption } : {}),
    });
  }

  async showPhase(phaseId: string): Promise<PhaseDetail> {
    return this.contextEngine.showPhase(phaseId);
  }

  async recordDecision(rawInput: unknown): Promise<Decision> {
    const project = await this.requireProject();
    const input = RecordDecisionInputSchema.parse(rawInput);

    return this.repository.recordDecision({
      projectId: project.id,
      title: input.title,
      context: input.context,
      decision: input.decision,
      ...(input.consequences ? { consequences: input.consequences } : {}),
      alternatives: input.alternatives,
      relatedPlanIds: input.relatedPlanIds,
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async listDecisions(): Promise<Decision[]> {
    const project = await this.requireProject();
    return this.repository.listDecisions(project.id);
  }

  async showDecision(decisionId: string): Promise<Decision> {
    const project = await this.requireProject();
    const decision = this.repository.getDecisionById(decisionId);

    if (!decision || decision.projectId !== project.id) {
      throw new ZenithError(`Decision not found: ${decisionId}`, {
        code: "decision_not_found",
        details: { decisionId },
      });
    }

    return decision;
  }

  async recordFinding(rawInput: unknown): Promise<Finding> {
    const project = await this.requireProject();
    const input = RecordFindingInputSchema.parse(rawInput);

    if (input.relatedPlanId) {
      const plan = this.repository.getPlanById(input.relatedPlanId);
      if (!plan || plan.projectId !== project.id) {
        throw new ZenithError(`Plan not found: ${input.relatedPlanId}`, {
          code: "plan_not_found",
          details: { planId: input.relatedPlanId },
        });
      }
    }

    if (input.relatedPhaseId) {
      const result = this.repository.getPlanByPhaseId(input.relatedPhaseId);
      if (!result || result.plan.projectId !== project.id) {
        throw new ZenithError(`Phase not found: ${input.relatedPhaseId}`, {
          code: "phase_not_found",
          details: { phaseId: input.relatedPhaseId },
        });
      }
      if (input.relatedPlanId && result.plan.id !== input.relatedPlanId) {
        throw new ZenithError(
          `Phase ${input.relatedPhaseId} does not belong to plan ${input.relatedPlanId}`,
          {
            code: "phase_not_in_plan",
            details: { planId: input.relatedPlanId, phaseId: input.relatedPhaseId },
          },
        );
      }
    }

    return this.repository.recordFinding({
      projectId: project.id,
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description,
      relatedFiles: input.relatedFiles,
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      ...(input.relatedPhaseId ? { relatedPhaseId: input.relatedPhaseId } : {}),
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async listFindings(status: FindingListStatus = "open"): Promise<Finding[]> {
    const project = await this.requireProject();
    return this.repository.listFindings(project.id, status);
  }

  async showFinding(findingId: string): Promise<Finding> {
    const project = await this.requireProject();
    return this.requireProjectFinding(findingId, project.id);
  }

  async updateFinding(findingId: string, rawInput: unknown): Promise<Finding> {
    const project = await this.requireProject();
    this.requireProjectFinding(findingId, project.id);
    const input = UpdateFindingInputSchema.parse(rawInput);

    if (input.relatedPlanId) {
      const plan = this.repository.getPlanById(input.relatedPlanId);
      if (!plan || plan.projectId !== project.id) {
        throw new ZenithError(`Plan not found: ${input.relatedPlanId}`, {
          code: "plan_not_found",
          details: { planId: input.relatedPlanId },
        });
      }
    }

    if (input.relatedPhaseId) {
      const result = this.repository.getPlanByPhaseId(input.relatedPhaseId);
      if (!result || result.plan.projectId !== project.id) {
        throw new ZenithError(`Phase not found: ${input.relatedPhaseId}`, {
          code: "phase_not_found",
          details: { phaseId: input.relatedPhaseId },
        });
      }
      if (input.relatedPlanId && result.plan.id !== input.relatedPlanId) {
        throw new ZenithError(
          `Phase ${input.relatedPhaseId} does not belong to plan ${input.relatedPlanId}`,
          {
            code: "phase_not_in_plan",
            details: { planId: input.relatedPlanId, phaseId: input.relatedPhaseId },
          },
        );
      }
    }

    return this.repository.updateFinding(findingId, {
      ...(input.type ? { type: input.type } : {}),
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.relatedFiles !== undefined ? { relatedFiles: input.relatedFiles } : {}),
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      ...(input.relatedPhaseId ? { relatedPhaseId: input.relatedPhaseId } : {}),
      ...(input.evidence !== undefined ? { evidence: input.evidence.map(normalizeEvidence) } : {}),
    });
  }

  async closeFinding(findingId: string, evidence: Evidence[] = []): Promise<Finding> {
    const project = await this.requireProject();
    this.requireProjectFinding(findingId, project.id);
    requireEvidenceForAction(evidence, "finding close");

    return this.repository.closeFinding(findingId, evidence.map(normalizeEvidence));
  }

  async startSession(rawInput: unknown): Promise<Session> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    const input = StartSessionInputSchema.parse(rawInput);
    const branch = input.branch ?? git.branch;

    return this.repository.startSession({
      projectId: project.id,
      startedAt: input.startedAt ?? nowIso(),
      ...(branch ? { branch } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      changedFiles: input.changedFiles ?? git.changedFiles,
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      nextSteps: input.nextSteps,
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async listSessions(): Promise<Session[]> {
    const project = await this.requireProject();
    return this.repository.listSessions(project.id);
  }

  async showSession(sessionId: string): Promise<Session> {
    const project = await this.requireProject();
    return this.requireProjectSession(sessionId, project.id);
  }

  async captureSession(sessionId: string, rawInput: unknown): Promise<Session> {
    const project = await this.requireProject();
    this.requireProjectSession(sessionId, project.id);
    const input = CaptureSessionInputSchema.parse(rawInput);

    return this.repository.captureSession(sessionId, {
      ...(input.summary ? { summary: input.summary } : {}),
      ...(input.changedFiles !== undefined ? { changedFiles: input.changedFiles } : {}),
      ...(input.nextSteps !== undefined ? { nextSteps: input.nextSteps } : {}),
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.evidence !== undefined ? { evidence: input.evidence.map(normalizeEvidence) } : {}),
    });
  }

  async endSession(sessionId: string, rawInput: unknown): Promise<Session> {
    const project = await this.requireProject();
    this.requireProjectSession(sessionId, project.id);
    const git = await this.git.inspect(this.cwd);
    const input = EndSessionInputSchema.parse(rawInput);
    const branch = input.branch ?? git.branch;

    return this.repository.endSession(sessionId, {
      endedAt: input.endedAt ?? nowIso(),
      ...(branch ? { branch } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      changedFiles: input.changedFiles ?? git.changedFiles,
      ...(input.nextSteps !== undefined ? { nextSteps: input.nextSteps } : {}),
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async summarizeSession(rawInput: unknown): Promise<Session> {
    const project = await this.requireProject();
    const git = await this.git.inspect(this.cwd);
    const input = SessionSummaryInputSchema.parse(rawInput);
    const timestamp = nowIso();

    return this.repository.recordSessionSummary({
      projectId: project.id,
      startedAt: input.startedAt ?? timestamp,
      endedAt: input.endedAt ?? timestamp,
      branch: input.branch ?? git.branch,
      summary: input.summary,
      changedFiles: input.changedFiles ?? git.changedFiles,
      relatedPlanId: input.relatedPlanId,
      nextSteps: input.nextSteps,
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async checkpoint(rawInput: unknown): Promise<Session> {
    const input = CheckpointInputSchema.parse(rawInput);
    return this.summarizeSession(input);
  }

  async checkpointFromGit(options: { save?: boolean; summary?: string; nextSteps?: string[] } = {}): Promise<CheckpointFromGitResult> {
    const context = await this.compactContext();
    const git = await this.git.inspect(this.cwd);
    const draft = buildGitCheckpointDraft(context, git, options);

    if (!options.save) {
      return CheckpointFromGitResultSchema.parse({ kind: "draft", draft });
    }

    requireEvidenceForAction(draft.evidence, "session checkpoint --from-git --save");
    const session = await this.summarizeSession({
      summary: draft.summary,
      changedFiles: draft.changedFiles,
      nextSteps: draft.nextSteps,
      ...(draft.relatedPlanId ? { relatedPlanId: draft.relatedPlanId } : {}),
      ...(draft.branch ? { branch: draft.branch } : {}),
      evidence: draft.evidence,
    });

    return CheckpointFromGitResultSchema.parse({ kind: "session", session, draft });
  }

  async note(rawInput: unknown): Promise<Session> {
    const input = NoteInputSchema.parse(rawInput);
    return this.summarizeSession({
      summary: input.text,
      ...(input.changedFiles !== undefined ? { changedFiles: input.changedFiles } : {}),
      nextSteps: input.nextSteps,
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      evidence: input.evidence.map(normalizeEvidence),
    });
  }

  async decide(rawInput: unknown): Promise<Decision> {
    const input = DecideInputSchema.parse(rawInput);
    return this.recordDecision(input);
  }

  async ready(rawInput: unknown): Promise<ReadyResult> {
    const input = ReadyInputSchema.parse(rawInput);
    const project = await this.requireProject();
    const { plan, phase } = await this.resolvePhaseForMutation(
      {
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.phaseId ? { phaseId: input.phaseId } : {}),
      },
      {
        commandName: "ready",
        explicitCommand: (candidatePlan, candidatePhase) => `zenith plan ready --plan ${candidatePlan.id} --phase ${candidatePhase.id}`,
      },
    );
    requireEvidenceForAction(input.evidence, "ready");
    const evidence = input.evidence;

    await this.repository.updatePhase(plan.id, { phaseId: phase.id }, {
      status: "needs_review",
      evidence: evidence.map(normalizeEvidence),
    });
    const stage = await this.repository.setAgentStage({
      projectId: project.id,
      planId: plan.id,
      phaseId: phase.id,
      stage: "review",
      role: input.role ?? "reviewer",
      note: "Phase marked needs_review by zenith plan ready.",
    });
    const next = await this.computeNextForProject(project);
    const phaseDetail = await this.showPhase(phase.id);

    return ReadyResultSchema.parse({
      phase: phaseDetail,
      stage,
      next,
    });
  }

  async done(rawInput: unknown): Promise<DoneResult> {
    const input = DoneInputSchema.parse(rawInput);

    if (input.findingId) {
      requireEvidenceForAction(input.evidence, "done finding");
      return DoneResultSchema.parse({ kind: "finding", finding: await this.closeFinding(input.findingId, input.evidence) });
    }

    const { plan, phase } = await this.resolvePhaseForMutation(
      {
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.phaseId ? { phaseId: input.phaseId } : {}),
      },
      {
        commandName: "done",
        explicitCommand: (candidatePlan, candidatePhase) => `zenith plan done --plan ${candidatePlan.id} --phase ${candidatePhase.id}`,
      },
    );

    requireEvidenceForAction(input.evidence, "done");
    const result = await this.advancePlan({
      planId: plan.id,
      completedPhaseId: phase.id,
      evidence: input.evidence,
    });

    return DoneResultSchema.parse({ kind: "phase", result });
  }

  async blocked(rawInput: unknown): Promise<BlockedResult> {
    const input = BlockedInputSchema.parse(rawInput);

    if (input.markPhaseId) {
      const { plan, phase } = await this.resolvePhaseForMutation(
        {
          ...(input.relatedPlanId ? { planId: input.relatedPlanId } : {}),
          phaseId: input.markPhaseId,
        },
        {
          commandName: "blocked",
          explicitCommand: (candidatePlan, candidatePhase) =>
            `zenith plan block --phase ${candidatePhase.id} --plan ${candidatePlan.id}`,
        },
      );
      requireEvidenceForAction(input.evidence, "blocked --mark-phase");
      const evidence = input.evidence;
      const result = await this.advancePlan({
        planId: plan.id,
        completedPhaseId: phase.id,
        status: "blocked",
        evidence,
      });

      return BlockedResultSchema.parse({ kind: "phase", result });
    }

    const finding = await this.recordFinding({
      type: input.type,
      severity: input.severity,
      title: input.title!,
      description: input.description!,
      relatedFiles: input.relatedFiles,
      ...(input.relatedPlanId ? { relatedPlanId: input.relatedPlanId } : {}),
      ...(input.relatedPhaseId ? { relatedPhaseId: input.relatedPhaseId } : {}),
      evidence: input.evidence.map(normalizeEvidence),
    });

    return BlockedResultSchema.parse({ kind: "finding", finding });
  }

  private requireProjectSession(sessionId: string, projectId: string): Session {
    const session = this.repository.getSessionById(sessionId);

    if (!session || session.projectId !== projectId) {
      throw new ZenithError(`Session not found: ${sessionId}`, {
        code: "session_not_found",
        details: { sessionId },
      });
    }

    return session;
  }

  private requireProjectFinding(findingId: string, projectId: string): Finding {
    const finding = this.repository.getFindingById(findingId);

    if (!finding || finding.projectId !== projectId) {
      throw new ZenithError(`Finding not found: ${findingId}`, {
        code: "finding_not_found",
        details: { findingId },
      });
    }

    return finding;
  }

  private async resolvePhaseForMutation(
    scope: { planId?: string; phaseId?: string },
    command: { commandName: string; explicitCommand: (plan: Plan, phase: PlanPhase) => string },
  ): Promise<{ plan: Plan; phase: PlanPhase }> {
    const project = await this.requireProject();

    if (scope.phaseId) {
      const result = scope.planId
        ? { plan: await this.showPlan(scope.planId) }
        : this.repository.getPlanByPhaseId(scope.phaseId);
      const plan = result?.plan;

      if (!plan || plan.projectId !== project.id) {
        throw new ZenithError(`Phase not found: ${scope.phaseId}`, {
          code: "phase_not_found",
          details: { phaseId: scope.phaseId },
        });
      }

      const phase = plan.phases.find((candidate) => candidate.id === scope.phaseId);
      if (!phase) {
        throw new ZenithError(`Phase ${scope.phaseId} does not belong to plan ${plan.id}.`, {
          code: "phase_plan_mismatch",
          details: { planId: plan.id, phaseId: scope.phaseId },
        });
      }

      return { plan, phase };
    }

    if (scope.planId) {
      const plan = await this.showPlan(scope.planId);
      if (plan.projectId !== project.id) {
        throw new ZenithError(`Plan not found: ${scope.planId}`, {
          code: "plan_not_found",
          details: { planId: scope.planId },
        });
      }
      const phase = findCurrentPhase(plan);
      if (!phase) {
        throw new ZenithError(`Plan has no current phase: ${scope.planId}`, {
          code: "current_phase_not_found",
          details: { planId: scope.planId },
        });
      }
      return { plan, phase };
    }

    const git = await this.git.inspect(this.cwd);
    const { resolution } = this.resolveFocus(project.id, git.worktreeRoot);

    if (resolution.ambiguous) {
      throw new ZenithError(`Cannot infer phase for zenith ${command.commandName}: multiple active plans are available.`, {
        code: "ambiguous_current_phase",
        details: {
          candidates: resolution.candidates,
          suggestedCommands: this.suggestMutationCommands(resolution.candidates, command.explicitCommand),
        },
      });
    }

    if (!resolution.activePlan) {
      throw new ZenithError(`Cannot infer phase for zenith ${command.commandName}: no active plan is available.`, {
        code: "active_plan_not_found",
        details: { suggestedCommands: ["zenith plan next --json"] },
      });
    }

    const phase = findCurrentPhase(resolution.activePlan);
    if (!phase) {
      throw new ZenithError(`Active plan has no current phase: ${resolution.activePlan.id}`, {
        code: "current_phase_not_found",
        details: { planId: resolution.activePlan.id },
      });
    }

    return { plan: resolution.activePlan, phase };
  }

  private suggestMutationCommands(
    candidates: FocusCandidate[],
    explicitCommand: (plan: Plan, phase: PlanPhase) => string,
  ): string[] {
    return candidates.flatMap((candidate) => {
      const plan = this.repository.getPlanById(candidate.planId);
      if (!plan) return [];
      const phase = findCurrentPhase(plan);
      const suggestions = candidate.roadmapId ? [`zenith agent focus set ${candidate.roadmapId}`] : [];
      if (phase) {
        suggestions.push(explicitCommand(plan, phase));
      }
      return suggestions;
    });
  }

  private requireMemoryEntity(projectId: string, entityType: MemoryEntityType, entityId: string): void {
    let exists = false;

    if (entityType === "brief") {
      exists = this.repository.listProjectBriefs(projectId, 1000).some((brief) => brief.id === entityId);
    } else if (entityType === "roadmap") {
      const roadmap = this.repository.getRoadmapById(entityId);
      exists = Boolean(roadmap && roadmap.projectId === projectId);
    } else if (entityType === "roadmap_item") {
      exists = this.repository
        .listRoadmaps(projectId, 1000)
        .some((roadmap) => roadmap.items.some((item) => item.id === entityId));
    } else if (entityType === "plan") {
      const plan = this.repository.getPlanById(entityId);
      exists = Boolean(plan && plan.projectId === projectId);
    } else if (entityType === "phase") {
      const result = this.repository.getPlanByPhaseId(entityId);
      exists = Boolean(result && result.plan.projectId === projectId);
    } else if (entityType === "spike") {
      const spike = this.repository.getSpikeById(entityId);
      exists = Boolean(spike && spike.projectId === projectId);
    } else if (entityType === "decision") {
      const decision = this.repository.getDecisionById(entityId);
      exists = Boolean(decision && decision.projectId === projectId);
    } else if (entityType === "finding") {
      const finding = this.repository.getFindingById(entityId);
      exists = Boolean(finding && finding.projectId === projectId);
    } else if (entityType === "session") {
      const session = this.repository.getSessionById(entityId);
      exists = Boolean(session && session.projectId === projectId);
    } else if (entityType === "context_doc") {
      exists = this.repository.listContextDocs(projectId).some((doc) => doc.id === entityId);
    }

    if (!exists) {
      throw new ZenithError(`Memory entity not found: ${entityType}:${entityId}`, {
        code: "memory_entity_not_found",
        details: { entityType, entityId },
      });
    }
  }

  private resolveRoadmapItem(roadmap: Roadmap, itemIdOrTitle: { itemId?: string; itemTitle?: string }): RoadmapItem {
    if (itemIdOrTitle.itemId) {
      const item = roadmap.items.find((candidate) => candidate.id === itemIdOrTitle.itemId);
      if (!item) {
        throw new ZenithError(`Roadmap item not found: ${itemIdOrTitle.itemId}`, {
          code: "roadmap_item_not_found",
          details: { roadmapId: roadmap.id, itemId: itemIdOrTitle.itemId },
        });
      }
      return item;
    }

    const matches = roadmap.items.filter((candidate) => candidate.title === itemIdOrTitle.itemTitle);
    if (matches.length === 0) {
      throw new ZenithError(`Roadmap item not found: ${itemIdOrTitle.itemTitle}`, {
        code: "roadmap_item_not_found",
        details: { roadmapId: roadmap.id, itemTitle: itemIdOrTitle.itemTitle },
      });
    }
    if (matches.length > 1) {
      throw new ZenithError(`Roadmap item title is ambiguous: ${itemIdOrTitle.itemTitle}`, {
        code: "roadmap_item_ambiguous",
        details: { roadmapId: roadmap.id, itemTitle: itemIdOrTitle.itemTitle },
      });
    }
    return matches[0]!;
  }

  private async requireProject(): Promise<Project> {
    const detection = await this.detectProject();

    if (!detection.project) {
      throw new ZenithError("Project is not registered. Run `zenith init` first.", {
        code: "project_not_registered",
        details: { rootPath: detection.git.rootPath },
      });
    }

    return detection.project;
  }

  private async resolveStageScope(projectId: string, scope: { planId?: string; phaseId?: string }): Promise<{ planId?: string; phaseId?: string }> {
    if (scope.phaseId) {
      const phaseResult = this.repository.getPlanByPhaseId(scope.phaseId);
      if (!phaseResult || phaseResult.plan.projectId !== projectId) {
        throw new ZenithError(`Phase not found: ${scope.phaseId}`, {
          code: "phase_not_found",
          details: { phaseId: scope.phaseId },
        });
      }

      if (scope.planId && phaseResult.plan.id !== scope.planId) {
        throw new ZenithError(`Phase ${scope.phaseId} does not belong to plan ${scope.planId}.`, {
          code: "phase_plan_mismatch",
          details: { planId: scope.planId, phaseId: scope.phaseId },
        });
      }

      return { planId: phaseResult.plan.id, phaseId: scope.phaseId };
    }

    if (scope.planId) {
      const plan = this.repository.getPlanById(scope.planId);
      if (!plan || plan.projectId !== projectId) {
        throw new ZenithError(`Plan not found: ${scope.planId}`, {
          code: "plan_not_found",
          details: { planId: scope.planId },
        });
      }

      return { planId: scope.planId };
    }

    return {};
  }

  private assertNoOtherActivePlan(
    projectId: string,
    scope: { sourceRoadmapId: string | null; planId?: string },
  ): void {
    const activePlan = this.repository
      .listPlans(projectId)
      .find(
        (candidate) =>
          candidate.status === "active" &&
          candidate.id !== scope.planId &&
          (candidate.sourceRoadmapId ?? null) === scope.sourceRoadmapId,
      );

    if (!activePlan) {
      return;
    }

    throw new ZenithError(
      "Active plan already exists for this roadmap. Pause, complete, or archive it before activating another plan.",
      {
        code: "active_plan_exists",
        details: {
          activePlanId: activePlan.id,
          activePlanTitle: activePlan.title,
        },
      },
    );
  }
}

function normalizeEvidence(evidence: {
  id?: string | undefined;
  kind: "note" | "commit" | "file" | "pr" | "issue" | "command" | "test" | "link" | "adr" | "branch";
  value: string;
  path?: string | undefined;
  line?: number | undefined;
  endLine?: number | undefined;
  label?: string | undefined;
  checkedAt?: string | undefined;
  stale?: boolean | undefined;
  supersededBy?: string | undefined;
  createdAt?: string | undefined;
}) {
  return {
    id: evidence.id ?? createId("ev"),
    kind: evidence.kind,
    value: evidence.value,
    ...(evidence.path ? { path: evidence.path } : {}),
    ...(evidence.line ? { line: evidence.line } : {}),
    ...(evidence.endLine ? { endLine: evidence.endLine } : {}),
    ...(evidence.label ? { label: evidence.label } : {}),
    ...(evidence.checkedAt ? { checkedAt: evidence.checkedAt } : {}),
    ...(evidence.stale !== undefined ? { stale: evidence.stale } : {}),
    ...(evidence.supersededBy ? { supersededBy: evidence.supersededBy } : {}),
    createdAt: evidence.createdAt ?? nowIso(),
  };
}

function continueWarnings(context: CompactContext): string[] {
  const warnings: string[] = [];
  if (context.git.dirty) {
    pushUnique(warnings, `Working tree is dirty with ${context.git.changedFiles.length} changed file(s).`);
  }
  if (context.next.kind === "ambiguous_focus") {
    pushUnique(warnings, "Multiple active roadmap plans are available; set roadmap focus before implementing.");
  }
  if (context.next.kind === "blocked_dependency") {
    pushUnique(warnings, "The next phase is blocked by unfinished dependencies.");
  }
  if (context.next.kind === "review_deferred") {
    pushUnique(warnings, "Roadmap work is deferred; reactivate a roadmap item before creating an executable plan.");
  }

  const severeFindings = context.openFindings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
  if (severeFindings.length > 0) {
    pushUnique(warnings, `${severeFindings.length} high or critical finding(s) should be handled before advancing.`);
  }

  return warnings;
}

function buildContinuityReadiness(context: CompactContext, openSessionCount: number): ContinuityReadiness {
  const strengths: string[] = [];
  const gaps: string[] = [];
  let score = 100;

  if (context.project) {
    strengths.push("Project is registered.");
  } else {
    gaps.push("Project is not registered.");
    score -= 100;
  }

  if (context.git.dirty) {
    gaps.push("Working tree has uncommitted changes.");
    score -= 20;
  } else {
    strengths.push("Working tree is clean.");
  }

  if (context.activePlan) {
    strengths.push("Active plan is selected.");
  } else {
    gaps.push("No active executable plan is selected.");
    score -= 25;
  }

  if (context.currentPhase) {
    strengths.push("Current phase is available.");
  } else if (context.activePlan) {
    gaps.push("Active plan has no current phase.");
    score -= 10;
  }

  const severeFindings = context.openFindings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
  if (severeFindings.length > 0) {
    gaps.push("Open high or critical findings are blocking.");
    score -= 30;
  } else {
    strengths.push("No high or critical findings are open.");
  }

  if (context.next.kind === "ambiguous_focus") {
    gaps.push("Roadmap focus is ambiguous.");
    score -= 30;
  }
  if (context.next.kind === "blocked_dependency") {
    gaps.push("Next phase is blocked by dependencies.");
    score -= 25;
  }
  if (context.next.kind === "review_deferred") {
    gaps.push("Next roadmap work is deferred.");
    score -= 20;
  }
  if (context.next.kind === "create_plan_empty") {
    gaps.push("No plan, roadmap, finding, or session next step exists.");
    score -= 25;
  }

  if (context.recentSessions.length > 0) {
    strengths.push("Recent session history is available.");
  } else {
    gaps.push("No recent session history is available.");
    score -= 5;
  }

  if (openSessionCount === 1) {
    strengths.push("One open session is available.");
  } else if (openSessionCount > 1) {
    gaps.push("Multiple open sessions need manual cleanup.");
    score -= 10;
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  return {
    score: clampedScore,
    status: readinessStatus(context, gaps),
    strengths,
    gaps,
  };
}

function buildActionBriefing(
  context: CompactContext,
  input: {
    latestSession: Session | null;
    phase: PhaseDetail | null;
    roadmapItem: RoadmapItem | null;
    contextDocs: ContextDoc[];
  },
): ActionBriefing {
  const goal =
    context.activePlan?.title ??
    input.roadmapItem?.title ??
    context.currentBrief?.summary ??
    (context.project ? "Select executable Zenith work" : "Register this project in Zenith");
  const remainingWork =
    context.activePlan
      ? [
          ...(context.currentPhase ? [`Current phase: ${context.currentPhase.title} (${context.currentPhase.status})`] : []),
          ...(input.phase?.phase.acceptanceCriteria.slice(0, 6).map((item) => `Acceptance: ${item}`) ?? []),
        ]
      : context.recentSessions.flatMap((session) => session.nextSteps).slice(0, 6);
  const blockers = [
    ...context.openFindings
      .filter((finding) => finding.severity === "critical" || finding.severity === "high")
      .map((finding) => `${finding.severity} finding: ${finding.title}`),
    ...(context.next.kind === "blocked_dependency" ? [`Blocked: ${context.next.reason}`] : []),
    ...(context.next.kind === "ambiguous_focus" ? ["Roadmap focus is ambiguous for this worktree."] : []),
  ];
  const freshness = [
    ...(context.next.staleness
      ? [
          `Next step updated ${context.next.staleness.ageDays} day(s) ago (${context.next.staleness.stale ? "stale" : "fresh"}).`,
        ]
      : ["Next step freshness: not measured."]),
    context.git.headCommit ? `Linked to HEAD ${shortCommit(context.git.headCommit)}${context.git.headSubject ? ` (${context.git.headSubject})` : ""}.` : "No HEAD commit detected.",
    context.git.dirty ? `Working tree dirty with ${context.git.changedFiles.length} changed file(s).` : "Working tree clean.",
    ...contextDocFreshness(input.contextDocs, context),
  ];
  const suggestedCommands = suggestedCommandsForNext(context);

  return ActionBriefingSchema.parse({
    goal,
    lastSession: input.latestSession ? truncateText(input.latestSession.summary ?? input.latestSession.id, 160) : null,
    remainingWork,
    nextAction: context.next.recommendation ?? "No next action available.",
    blockers,
    freshness,
    suggestedCommands,
  });
}

function contextDocFreshness(docs: ContextDoc[], context: CompactContext): string[] {
  const root = contextWorkspaceRoot(context);
  return docs
    .filter((doc) => doc.status === "pinned")
    .slice(0, 5)
    .map((doc) => {
      const absolutePath = resolve(root, doc.path);
      if (!existsSync(absolutePath)) {
        return `Context doc missing: ${doc.path}`;
      }
      const stat = statSync(absolutePath);
      const mtime = stat.mtime.toISOString();
      if (doc.observedMtime && doc.observedMtime !== mtime) {
        return `Context doc may be stale: ${doc.path}`;
      }
      if (doc.readCommit && context.git.headCommit && doc.readCommit !== context.git.headCommit) {
        return `Context doc not confirmed since ${shortCommit(context.git.headCommit)}: ${doc.path}`;
      }
      return `Context doc fresh: ${doc.path}`;
    });
}

function suggestedCommandsForNext(context: CompactContext): string[] {
  if (!context.project) {
    return ["zenith init"];
  }
  if (context.next.kind === "implement_phase" && context.next.phaseId) {
    return [
      `zenith plan phase show ${context.next.phaseId} --json`,
      "zenith handoff --to implementer --compact",
      "zenith plan ready --evidence \"Verification passed\"",
    ];
  }
  if (context.next.kind === "review_phase" && context.next.phaseId) {
    return [
      `zenith plan phase show ${context.next.phaseId} --json`,
      "zenith handoff --to reviewer --compact",
      `zenith plan done --phase ${context.next.phaseId} --evidence \"Review passed\"`,
    ];
  }
  if (context.next.kind === "create_plan") {
    return ["zenith plan next --json", "zenith roadmap create-plan <roadmap-id> --json --input -"];
  }
  if (context.next.kind === "ambiguous_focus") {
    return ["zenith agent focus show --json", "zenith agent focus set <roadmap-id>"];
  }
  if (context.next.kind === "blocked_dependency" || context.next.kind === "blocking_finding") {
    return ["zenith finding list --status open --json", "zenith finding record --json --input -"];
  }
  return ["zenith plan next --json", "zenith session checkpoint --from-git"];
}

function buildGitCheckpointDraft(
  context: CompactContext,
  git: GitSummary,
  options: { summary?: string; nextSteps?: string[] },
) {
  const changedFiles = uniqueStrings([...git.changedFiles, ...git.changedSinceBase]);
  const summary =
    options.summary ??
    [
      `Git checkpoint on ${git.branch ?? "detached HEAD"}`,
      git.headCommit ? `at ${shortCommit(git.headCommit)}` : null,
      git.headSubject ? `(${git.headSubject})` : null,
      changedFiles.length > 0 ? `with ${changedFiles.length} changed file(s)` : "with no changed files",
    ]
      .filter(Boolean)
      .join(" ");
  const evidence: Evidence[] = [
    ...(git.headCommit ? [{ kind: "commit" as const, value: git.headCommit }] : []),
    { kind: "command" as const, value: "zenith session checkpoint --from-git" },
    ...(git.baseBranch ? [{ kind: "note" as const, value: `Base branch: ${git.baseBranch}` }] : []),
    ...changedFiles.slice(0, 8).map((file) => ({ kind: "file" as const, value: file })),
  ];
  const relatedPlanId = context.next.planId ?? context.activePlan?.id;

  return {
    summary,
    changedFiles,
    nextSteps: options.nextSteps && options.nextSteps.length > 0 ? options.nextSteps : nextStepList(context.next),
    ...(relatedPlanId ? { relatedPlanId } : {}),
    ...(git.branch ? { branch: git.branch } : {}),
    evidence,
    git,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function suggestContextDocs(context: CompactContext): ContextDocSuggestion[] {
  const root = contextWorkspaceRoot(context);
  const candidates: Array<{ path: string; reason: string; confidence: "low" | "medium" | "high" }> = [
    { path: "AGENTS.md", reason: "Repository-level agent instructions define required workflow.", confidence: "high" },
    { path: "README.md", reason: "Project overview and supported user-facing commands.", confidence: "high" },
    { path: "docs/INDEX.md", reason: "Documentation index may point to subsystem docs.", confidence: "medium" },
  ];

  if (context.activePlan || context.currentPhase) {
    candidates.push({ path: "docs/reference.md", reason: "Current executable work changes CLI/API behavior.", confidence: "high" });
  }

  for (const file of uniqueStrings([...context.git.changedFiles, ...context.git.changedSinceBase])) {
    if (file.endsWith(".md")) {
      candidates.push({ path: file, reason: "Documentation file is touched by current git state.", confidence: "high" });
    }
    if (file.startsWith("src/storage/")) {
      candidates.push({ path: "docs/storage-policy.md", reason: "Storage changes should follow local persistence policy.", confidence: "high" });
    }
    if (file.startsWith("src/cli/") || file.startsWith("src/app/")) {
      candidates.push({ path: "docs/reference.md", reason: "CLI or application behavior is changing.", confidence: "high" });
    }
    if (file.startsWith("src/agents/") || file.includes(".codex/skills")) {
      candidates.push({ path: "AGENTS.md", reason: "Agent instruction templates are changing.", confidence: "medium" });
    }
  }

  const ignored = new Set(context.contextDocs.filter((doc) => doc.status === "ignored").map((doc) => doc.path));
  const seen = new Set<string>();
  const suggestions: ContextDocSuggestion[] = [];
  for (const candidate of candidates) {
    const normalizedPath = normalizeDocPath(root, candidate.path);
    if (seen.has(normalizedPath) || ignored.has(normalizedPath)) {
      continue;
    }
    seen.add(normalizedPath);
    if (!existsSync(resolve(root, normalizedPath))) {
      continue;
    }
    suggestions.push(buildContextDocSuggestion(context, normalizedPath, candidate.reason, candidate.confidence));
  }

  return suggestions;
}

function buildContextDocSuggestion(
  context: CompactContext,
  docPath: string,
  reason: string,
  confidence: "low" | "medium" | "high",
): ContextDocSuggestion {
  const scope = currentDocScope(context);
  const absolutePath = resolve(contextWorkspaceRoot(context), docPath);
  const stat = existsSync(absolutePath) ? statSync(absolutePath) : null;
  const observedMtime = stat ? stat.mtime.toISOString() : undefined;
  const existing = context.contextDocs.find((doc) => doc.path === docPath && doc.status === "pinned");
  const stale = Boolean(
    (existing?.readCommit && context.git.headCommit && existing.readCommit !== context.git.headCommit) ||
      (existing?.observedMtime && observedMtime && existing.observedMtime !== observedMtime),
  );

  return ContextDocSuggestionSchema.parse({
    ...scope,
    path: docPath,
    reason,
    summary: summarizeDocFile(absolutePath),
    assumptions: [`Assumed relevant to ${scope.scope} context.`],
    confidence,
    readAt: nowIso(),
    ...(context.git.headCommit ? { readCommit: context.git.headCommit } : {}),
    ...(observedMtime ? { observedMtime } : {}),
    stale,
  });
}

function currentDocScope(context: CompactContext): { scope: "project" | "plan" | "phase"; planId?: string; phaseId?: string } {
  if (context.currentPhase && context.activePlan) {
    return { scope: "phase", planId: context.activePlan.id, phaseId: context.currentPhase.id };
  }
  if (context.activePlan) {
    return { scope: "plan", planId: context.activePlan.id };
  }
  return { scope: "project" };
}

function normalizeDocPath(root: string, docPath: string): string {
  const trimmed = docPath.trim();
  const normalized = trimmed.startsWith(root) ? relative(root, trimmed) : trimmed;
  return normalized.replace(/^\.\//, "");
}

function contextWorkspaceRoot(context: CompactContext): string {
  return context.git.worktreeRoot ?? context.git.rootPath;
}

function summarizeDocFile(absolutePath: string): string {
  if (!existsSync(absolutePath)) {
    return `Document not found: ${basename(absolutePath)}`;
  }

  const ext = extname(absolutePath).toLowerCase();
  const raw = readFileSync(absolutePath, "utf8").slice(0, 4000);
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) => line.startsWith("#"));
  const firstText = lines.find((line) => !line.startsWith("<!--") && !line.startsWith("#"));
  const summary = heading ?? firstText ?? `${ext || "text"} document`;
  return truncateText(summary.replace(/^#+\s*/, ""), 180);
}

function buildContextRoiReport(
  records: SearchableMemoryEntity[],
  eventSummary: EventWindowSummary,
  context: CompactContext,
): ContextRoiReport {
  const estimatedRawTokens = estimateTokens(records.map((record) => `${record.title}\n${record.text}`).join("\n\n"));
  const compactTokens = estimateTokens(context.markdown);
  const compressionRatio = compactTokens === 0 ? 0 : roundMetric(estimatedRawTokens / compactTokens);

  return {
    sourceEvents: eventSummary.total,
    sourceSessions: countRecords(records, "session"),
    sourceDecisions: countRecords(records, "decision"),
    sourceFindings: countRecords(records, "finding"),
    sourcePhases: countRecords(records, "phase"),
    estimatedRawTokens,
    compactTokens,
    compressionRatio,
    continuitySignals: continuitySignals(context, records, eventSummary),
    missingSignals: missingContinuitySignals(context, records, eventSummary),
  };
}

function emptyContextRoiReport(context: CompactContext): ContextRoiReport {
  return buildContextRoiReport(
    [],
    { total: 0, byType: [], byEntityType: [], activeDays: [] },
    context,
  );
}

function countRecords(records: SearchableMemoryEntity[], entityType: MemoryEntityType): number {
  return records.filter((record) => record.entityType === entityType).length;
}

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) return 0;
  return Math.ceil(normalized.length / 4);
}

function shortCommit(commit: string): string {
  return commit.slice(0, 12);
}

function formatCommit(commit: string | undefined, subject: string | undefined): string {
  if (!commit) {
    return "none";
  }
  return subject ? `${shortCommit(commit)} (${subject})` : shortCommit(commit);
}

function continuitySignals(
  context: CompactContext,
  records: SearchableMemoryEntity[],
  eventSummary: EventWindowSummary,
): string[] {
  const signals: string[] = [];
  if (context.currentBrief) signals.push("brief");
  if (context.activePlan) signals.push("active_plan");
  if (context.currentPhase) signals.push("current_phase");
  if (context.next.recommendation) signals.push("next_step");
  if (context.recentSessions.length > 0 || countRecords(records, "session") > 0) signals.push("sessions");
  if (context.recentDecisions.length > 0 || countRecords(records, "decision") > 0) signals.push("decisions");
  if (context.openFindings.length > 0 || countRecords(records, "finding") > 0) signals.push("findings");
  if (eventSummary.total > 0) signals.push("event_history");
  return signals;
}

function missingContinuitySignals(
  context: CompactContext,
  records: SearchableMemoryEntity[],
  eventSummary: EventWindowSummary,
): string[] {
  const missing: string[] = [];
  if (!context.currentBrief) missing.push("brief");
  if (!context.activePlan) missing.push("active_plan");
  if (!context.currentPhase) missing.push("current_phase");
  if (!context.next.recommendation) missing.push("next_step");
  if (context.recentSessions.length === 0 && countRecords(records, "session") === 0) missing.push("sessions");
  if (context.recentDecisions.length === 0 && countRecords(records, "decision") === 0) missing.push("decisions");
  if (eventSummary.total === 0) missing.push("event_history");
  return missing;
}

function readinessStatus(context: CompactContext, gaps: string[]): ContinuityReadiness["status"] {
  if (!context.project || context.git.dirty) {
    return "needs_cleanup";
  }
  if (context.next.kind === "ambiguous_focus") {
    return "ambiguous";
  }
  if (
    context.next.kind === "blocking_finding" ||
    context.next.kind === "blocked_dependency" ||
    context.openFindings.some((finding) => finding.severity === "critical" || finding.severity === "high")
  ) {
    return "blocked";
  }
  if (
    !context.activePlan ||
    context.next.kind === "create_plan" ||
    context.next.kind === "review_deferred" ||
    context.next.kind === "create_plan_empty"
  ) {
    return "needs_plan";
  }
  return "ready";
}

function renderContinueMarkdown(input: {
  context: CompactContext;
  phase: PhaseDetail | null;
  roadmapItem: RoadmapItem | null;
  contextDocs: ContextDoc[];
  actionBriefing: ActionBriefing;
  latestSession: Session | null;
  openSession: Session | null;
  newSession: Session | null;
  closedSession: Session | null;
  warnings: string[];
  readiness: ContinuityReadiness;
  roi: ContextRoiReport;
}): string {
  const lines = [
    "# Zenith Continue",
    "",
    "## Where We Are",
    `- Goal: ${input.actionBriefing.goal}`,
    `- Active plan: ${input.context.activePlan ? input.context.activePlan.title : "none"}`,
    `- Current phase: ${input.context.currentPhase ? `${input.context.currentPhase.title} (${input.context.currentPhase.status})` : "none"}`,
    `- Readiness: ${input.readiness.status} (${input.readiness.score}/100)`,
    "",
    "## What Changed Last",
    `- Latest session: ${input.actionBriefing.lastSession ?? "none"}`,
    `- Changed files: ${formatList(input.context.git.changedFiles, 8)}`,
    `- Last commit: ${formatCommit(input.context.git.headCommit, input.context.git.headSubject)}`,
    "",
    "## What Remains",
    ...(input.actionBriefing.remainingWork.length > 0 ? input.actionBriefing.remainingWork.slice(0, 8).map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Next Action",
    `- ${input.actionBriefing.nextAction}`,
    `- Reason: ${input.context.next.reason}`,
    `- Kind: ${input.context.next.kind ?? "session_next_step"}`,
    ...(input.actionBriefing.suggestedCommands.length > 0
      ? ["- Suggested commands:", ...input.actionBriefing.suggestedCommands.slice(0, 5).map((command) => `  - ${command}`)]
      : []),
    "",
    "## Risk Radar",
    ...(input.actionBriefing.blockers.length > 0 ? input.actionBriefing.blockers.slice(0, 8).map((item) => `- ${item}`) : ["- none"]),
    ...(input.warnings.length > 0 ? input.warnings.slice(0, 8).map((warning) => `- warning: ${warning}`) : []),
    "",
    "## Freshness",
    ...(input.actionBriefing.freshness.length > 0 ? input.actionBriefing.freshness.slice(0, 8).map((item) => `- ${item}`) : ["- no freshness signals"]),
    "",
    "## Worktree",
    `- Repo root: ${input.context.git.rootPath}`,
    `- Worktree: ${input.context.git.worktreeRoot ?? input.context.git.rootPath}`,
    `- Branch: ${input.context.git.branch ?? "none"}`,
    `- Base branch: ${input.context.git.baseBranch ?? "none"}`,
    `- Dirty: ${input.context.git.dirty ? "yes" : "no"}`,
    `- Changed since base: ${formatList(input.context.git.changedSinceBase, 8)}`,
    "",
    "## Details",
    `- Phase detail: ${input.phase ? `${input.phase.phase.title} (${input.phase.phase.status})` : "none"}`,
    `- Roadmap item: ${input.roadmapItem ? `${input.roadmapItem.title} (${input.roadmapItem.status})` : "none"}`,
    `- Latest: ${input.latestSession ? truncateText(input.latestSession.summary ?? input.latestSession.id, 160) : "none"}`,
    `- Open: ${input.openSession ? input.openSession.id : "none"}`,
    `- New: ${input.newSession ? input.newSession.id : "none"}`,
    `- Closed: ${input.closedSession ? input.closedSession.id : "none"}`,
    `- Context docs: ${formatList(input.contextDocs.filter((doc) => doc.status === "pinned").map((doc) => doc.path), 6)}`,
    "",
    "## ROI",
    `- Source events: ${input.roi.sourceEvents}`,
    `- Estimated raw tokens: ${input.roi.estimatedRawTokens}`,
    `- Compact tokens: ${input.roi.compactTokens}`,
    `- Compression ratio: ${input.roi.compressionRatio}x`,
    `- Signals: ${formatList(input.roi.continuitySignals, 8)}`,
  ];

  return lines.join("\n");
}

type PromptSectionDraft = {
  id: string;
  title: string;
  priority: number;
  body: string;
};

function renderPromptResult(
  continuation: ContinueResult,
  options: { format: PromptFormat; role?: PromptRole; maxTokens?: number; includeMetadata?: boolean },
): PromptResult {
  const sections = buildPromptSections(continuation, options.format, options.role, Boolean(options.includeMetadata));
  const included = selectPromptSections(sections, options.maxTokens);
  const includedIds = new Set(included.map((section) => section.id));
  const content = included.map((section) => section.body).join("\n\n");
  const estimatedTokens = estimateTokens(content);

  return PromptResultSchema.parse({
    format: options.format,
    ...(options.role ? { role: options.role } : {}),
    content,
    estimatedTokens,
    ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
    truncated: included.length < sections.length,
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title,
      priority: section.priority,
      estimatedTokens: estimateTokens(section.body),
      included: includedIds.has(section.id),
    })),
    ...(options.includeMetadata
      ? {
          metadata: {
            ...(continuation.context.project ? { projectId: continuation.context.project.id } : {}),
            ...(continuation.context.activePlan ? { planId: continuation.context.activePlan.id } : {}),
            ...(continuation.context.currentPhase ? { phaseId: continuation.context.currentPhase.id } : {}),
            ...(continuation.context.next.kind ? { nextKind: continuation.context.next.kind } : {}),
            readinessStatus: continuation.readiness.status,
          },
        }
      : {}),
  });
}

function buildPromptSections(
  continuation: ContinueResult,
  format: PromptFormat,
  role: PromptRole | undefined,
  includeMetadata: boolean,
): PromptSectionDraft[] {
  const context = continuation.context;
  const intro = promptIntro(format);
  const sections: PromptSectionDraft[] = [
    {
      id: "next",
      title: "Next Step",
      priority: rolePriority(role, "next", 100),
      body: [
        `# Zenith Prompt (${format})`,
        intro,
        ...(role ? [`Role: ${role}`, ""] : [""]),
        "",
        "## Next Step",
        `- Recommendation: ${context.next.recommendation ?? "none"}`,
        `- Reason: ${context.next.reason}`,
        `- Kind: ${context.next.kind ?? "session_next_step"}`,
      ].join("\n"),
    },
    {
      id: "phase",
      title: "Phase",
      priority: rolePriority(role, "phase", 90),
      body: [
        "## Phase",
        `- Active plan: ${context.activePlan ? context.activePlan.title : "none"}`,
        `- Current phase: ${context.currentPhase ? `${context.currentPhase.title} (${context.currentPhase.status})` : "none"}`,
        `- Phase detail: ${continuation.phase ? continuation.phase.phase.description ?? continuation.phase.phase.title : "none"}`,
        ...(continuation.phase && continuation.phase.phase.acceptanceCriteria.length > 0
          ? ["- Acceptance criteria:", ...continuation.phase.phase.acceptanceCriteria.slice(0, 6).map((item) => `  - ${item}`)]
          : []),
      ].join("\n"),
    },
    {
      id: "readiness",
      title: "Readiness",
      priority: rolePriority(role, "readiness", 80),
      body: [
        "## Readiness",
        `- Status: ${continuation.readiness.status}`,
        `- Score: ${continuation.readiness.score}/100`,
        `- Strengths: ${formatList(continuation.readiness.strengths, 5)}`,
        `- Gaps: ${formatList(continuation.readiness.gaps, 5)}`,
      ].join("\n"),
    },
    {
      id: "warnings",
      title: "Warnings",
      priority: rolePriority(role, "warnings", 75),
      body: [
        "## Warnings",
        ...(continuation.warnings.length > 0 ? continuation.warnings.slice(0, 8).map((warning) => `- ${warning}`) : ["- none"]),
      ].join("\n"),
    },
    {
      id: "worktree",
      title: "Worktree",
      priority: rolePriority(role, "worktree", 65),
      body: [
        "## Worktree",
        `- Branch: ${context.git.branch ?? "none"}`,
        `- Dirty: ${context.git.dirty ? "yes" : "no"}`,
        `- Changed files: ${formatList(context.git.changedFiles, 8)}`,
      ].join("\n"),
    },
    {
      id: "roi",
      title: "ROI",
      priority: rolePriority(role, "roi", 40),
      body: [
        "## ROI",
        `- Source events: ${continuation.roi.sourceEvents}`,
        `- Estimated raw tokens: ${continuation.roi.estimatedRawTokens}`,
        `- Compact tokens: ${continuation.roi.compactTokens}`,
        `- Compression ratio: ${continuation.roi.compressionRatio}x`,
        `- Signals: ${formatList(continuation.roi.continuitySignals, 8)}`,
      ].join("\n"),
    },
    {
      id: "recent-memory",
      title: "Recent Memory",
      priority: rolePriority(role, "recent-memory", 35),
      body: [
        "## Recent Memory",
        `- Latest session: ${continuation.latestSession ? truncateText(continuation.latestSession.summary ?? continuation.latestSession.id, 160) : "none"}`,
        `- Recent decisions: ${formatList(context.recentDecisions.map((decision) => decision.title), 5)}`,
        `- Open findings: ${formatList(context.openFindings.map((finding) => `${finding.severity}: ${finding.title}`), 5)}`,
      ].join("\n"),
    },
    {
      id: "context-docs",
      title: "Context Docs",
      priority: rolePriority(role, "context-docs", 30),
      body: [
        "## Context Docs",
        ...(continuation.contextDocs.length > 0
          ? continuation.contextDocs.slice(0, 8).map((doc) => `- ${doc.status}: ${doc.path} (${doc.confidence}) - ${doc.reason}`)
          : ["- none"]),
      ].join("\n"),
    },
    {
      id: "compact-context",
      title: "Compact Context",
      priority: rolePriority(role, "compact-context", 20),
      body: ["## Compact Context", context.markdown].join("\n"),
    },
  ];

  if (includeMetadata) {
    sections.push({
      id: "metadata",
      title: "Metadata",
      priority: rolePriority(role, "metadata", 10),
      body: [
        "## Metadata",
        `- Project ID: ${context.project?.id ?? "none"}`,
        `- Plan ID: ${context.activePlan?.id ?? "none"}`,
        `- Phase ID: ${context.currentPhase?.id ?? "none"}`,
        `- Next kind: ${context.next.kind ?? "session_next_step"}`,
        `- Readiness: ${continuation.readiness.status}`,
      ].join("\n"),
    });
  }

  return sections;
}

function rolePriority(role: PromptRole | undefined, sectionId: string, base: number): number {
  if (!role) {
    return base;
  }

  const boosts: Record<PromptRole, Record<string, number>> = {
    planner: {
      next: 25,
      readiness: 20,
      "recent-memory": 20,
      "context-docs": 15,
      "compact-context": 10,
    },
    implementer: {
      phase: 35,
      next: 25,
      "context-docs": 20,
      worktree: 15,
      warnings: 10,
    },
    reviewer: {
      next: 35,
      phase: 30,
      "recent-memory": 25,
      worktree: 20,
      warnings: 20,
    },
    handoff: {
      next: 30,
      phase: 25,
      readiness: 25,
      "recent-memory": 20,
      "context-docs": 20,
      worktree: 15,
    },
  };

  return base + (boosts[role][sectionId] ?? 0);
}

function promptIntro(format: PromptFormat): string {
  if (format === "codex") {
    return "You are Codex working in this repository. Use the local files and Zenith context below to continue the requested task.";
  }
  if (format === "claude") {
    return "You are Claude Code working in this repository. Use the local files and Zenith context below to continue the requested task.";
  }
  if (format === "agent") {
    return "You are an implementation agent. Use the Zenith continuity context below to resume work without re-reading unrelated history.";
  }
  return "Use this markdown continuity prompt to resume the Zenith project from local memory.";
}

function selectPromptSections(sections: PromptSectionDraft[], maxTokens: number | undefined): PromptSectionDraft[] {
  if (maxTokens === undefined) return sections;

  const selected: PromptSectionDraft[] = [];
  let used = 0;
  for (const section of [...sections].sort((a, b) => b.priority - a.priority)) {
    const tokens = estimateTokens(section.body);
    if (used + tokens <= maxTokens || selected.length === 0) {
      selected.push(section);
      used += tokens;
    }
  }

  const order = new Map(sections.map((section, index) => [section.id, index]));
  return selected.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

function nextStepList(next: NextStep): string[] {
  return next.recommendation ? [next.recommendation] : [];
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function parseTtlMs(value: string): number {
  const match = value.trim().match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) {
    throw new ZenithError("TTL must be a positive duration such as 30m, 2h, or 1d.", {
      code: "invalid_ttl",
      details: { ttl: value },
    });
  }
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ZenithError("TTL must be positive.", {
      code: "invalid_ttl",
      details: { ttl: value },
    });
  }
  const unit = match[2] ?? "ms";
  const multipliers: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * multipliers[unit]!;
}

function buildDoctorReport(generatedAt: string, issues: DoctorIssue[]): DoctorReport {
  const summary = {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
  const markdown = [
    "# Zenith Doctor",
    "",
    `- Status: ${summary.errors === 0 ? "ok" : "attention"}`,
    `- Errors: ${summary.errors}`,
    `- Warnings: ${summary.warnings}`,
    `- Info: ${summary.info}`,
    "",
    "## Issues",
    ...(issues.length === 0
      ? ["- none"]
      : issues.map((issue) => `- ${issue.severity}: ${issue.title} (${issue.id}) - ${issue.detail}`)),
  ].join("\n");
  return DoctorReportSchema.parse({
    generatedAt,
    ok: summary.errors === 0,
    summary,
    issues,
    markdown,
  });
}

function hasReservedTagPrefix(tag: string): boolean {
  return /^(area|epic|risk|service):[a-z0-9][a-z0-9-]*$/.test(tag);
}

function truncateToApproxTokens(value: string, maxTokens: number): string {
  const maxChars = Math.max(1, maxTokens * 4);
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 14))}\n[truncated]`;
}

function formatList(values: string[], max: number): string {
  if (values.length === 0) return "none";
  const visible = values.slice(0, max);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} (+${remaining} more)` : visible.join(", ");
}

function parseMemoryEntityType(raw: string): MemoryEntityType {
  const parsed = MemoryEntityTypeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ZenithError("Unsupported memory entity type.", {
      code: "invalid_memory_entity_type",
      details: { entityType: raw, supported: MEMORY_ENTITY_TYPES },
    });
  }
  return parsed.data;
}

function normalizeMemoryTags(tags: string[]): string[] {
  return [...new Set(tags.map(normalizeMemoryTag))];
}

function normalizeMemoryTag(raw: string): string {
  const lower = raw.trim().toLowerCase();
  const reserved = lower.match(/^(area|epic|risk|service):(.+)$/);
  if (reserved) {
    const suffix = slugifyTag(reserved[2]!);
    const tag = `${reserved[1]}:${suffix}`;
    if (!/^(area|epic|risk|service):[a-z0-9][a-z0-9-]*$/.test(tag)) {
      throw new ZenithError("Reserved memory tag prefixes require a slug value.", {
        code: "invalid_memory_tag",
        details: { tag: raw },
      });
    }
    return tag;
  }
  if (lower.includes(":")) {
    throw new ZenithError("Only reserved tag prefixes may use ':'.", {
      code: "invalid_memory_tag",
      details: { tag: raw },
    });
  }
  const tag = slugifyTag(raw);

  if (!/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
    throw new ZenithError("Memory tag must contain at least one ASCII letter or number.", {
      code: "invalid_memory_tag",
      details: { tag: raw },
    });
  }

  return tag;
}

function slugifyTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function groupMemoryTags(tags: MemoryTag[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const tag of tags) {
    const key = memoryEntityKey(tag.entityType, tag.entityId);
    const existing = grouped.get(key) ?? [];
    existing.push(tag.tag);
    grouped.set(key, existing);
  }
  for (const [key, values] of grouped) {
    grouped.set(key, [...new Set(values)].sort((a, b) => a.localeCompare(b)));
  }
  return grouped;
}

function memoryEntityKey(entityType: MemoryEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase();
}

function tokenizeSearchText(value: string): string[] {
  return [...new Set(normalizeSearchText(value).split(/[^a-z0-9_./:-]+/).filter(Boolean))];
}

function scoreMemoryRecord(record: SearchableMemoryEntity, tokens: string[], normalizedQuery: string): number | null {
  if (tokens.length === 0) {
    return 0;
  }

  const title = normalizeSearchText(record.title);
  const text = normalizeSearchText(record.text);
  let score = normalizedQuery.length > 0 && title.includes(normalizedQuery) ? 12 : 0;
  if (normalizedQuery.length > 0 && text.includes(normalizedQuery)) {
    score += 4;
  }

  for (const token of tokens) {
    if (title.includes(token)) {
      score += 5;
    } else if (text.includes(token)) {
      score += 1;
    } else {
      return null;
    }
  }

  return score;
}

function memorySnippet(record: SearchableMemoryEntity, tokens: string[]): string {
  const text = record.text.trim() || record.title;
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const matching = tokens.length > 0
    ? lines.find((line) => {
        const normalized = normalizeSearchText(line);
        return tokens.some((token) => normalized.includes(token));
      })
    : undefined;
  return truncateText(matching ?? lines[0] ?? record.title, 180);
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function parseWatchPredicate(raw: string): WatchPredicate {
  const clauses = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const values = new Map<string, string>();

  for (const clause of clauses) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*)=(.+)$/.exec(clause);
    if (!match) {
      throw invalidWatchPredicate(raw, "Use comma-separated key=value clauses.");
    }

    const key = normalizeWatchPredicateKey(match[1]!);
    const value = match[2]!.trim();
    if (values.has(key)) {
      throw invalidWatchPredicate(raw, `Duplicate predicate key: ${key}.`);
    }
    if (value.length === 0) {
      throw invalidWatchPredicate(raw, `Empty predicate value: ${key}.`);
    }
    values.set(key, value);
  }

  const allowedKeys = new Set(["stage", "plan", "phase"]);
  for (const key of values.keys()) {
    if (!allowedKeys.has(key)) {
      throw invalidWatchPredicate(raw, `Unsupported predicate key: ${key}.`);
    }
  }

  const stageValue = values.get("stage");
  const parsedStage = AgentStageSchema.safeParse(stageValue);
  if (!parsedStage.success) {
    throw invalidWatchPredicate(raw, "Predicate must include stage=plan|implement|review|done.");
  }

  return {
    raw,
    stage: parsedStage.data,
    ...(values.get("plan") ? { planId: values.get("plan")! } : {}),
    ...(values.get("phase") ? { phaseId: values.get("phase")! } : {}),
  };
}

function normalizeWatchPredicateKey(key: string): string {
  if (key === "planId") return "plan";
  if (key === "phaseId") return "phase";
  return key;
}

function invalidWatchPredicate(raw: string, reason: string): ZenithError {
  return new ZenithError(`Invalid watch predicate: ${reason}`, {
    code: "invalid_watch_predicate",
    details: { predicate: raw },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function driftIssues(
  activePlan: Plan | null,
  sourceRoadmap: Roadmap | null,
  sourceItem: RoadmapItem | null,
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  if (!activePlan) {
    return [
      {
        severity: "high",
        title: "No active plan",
        detail: "The active roadmap has no executable plan selected for this worktree.",
        evidence: [],
      },
    ];
  }

  if (!activePlan.sourceRoadmapId) {
    issues.push({
      severity: "medium",
      title: "Active plan is not linked to a roadmap",
      detail: "Roadmap-driven work should preserve sourceRoadmapId so progress can be reconciled.",
      evidence: [activePlan.id],
    });
    return issues;
  }

  if (!sourceRoadmap) {
    issues.push({
      severity: "high",
      title: "Source roadmap is missing",
      detail: "The active plan references a roadmap that is not present in project memory.",
      evidence: [activePlan.sourceRoadmapId],
    });
    return issues;
  }

  if (!activePlan.sourceRoadmapItemId || !sourceItem) {
    issues.push({
      severity: "high",
      title: "Source roadmap item is missing",
      detail: "The active plan cannot be reconciled to a concrete roadmap item.",
      evidence: [activePlan.id, sourceRoadmap.id],
    });
    return issues;
  }

  if (sourceItem.status !== "in_progress") {
    issues.push({
      severity: sourceItem.status === "done" ? "high" : "medium",
      title: "Roadmap item status does not match active plan",
      detail: `Expected source roadmap item to be in_progress while its plan is active; found ${sourceItem.status}.`,
      evidence: [sourceItem.id],
    });
  }

  const expectedItem = sourceRoadmap.items.find((item) => item.status === "in_progress") ?? sourceRoadmap.items.find((item) => item.status === "todo");
  if (expectedItem && expectedItem.id !== activePlan.sourceRoadmapItemId) {
    issues.push({
      severity: "medium",
      title: "Active plan is not the roadmap's next actionable item",
      detail: `Roadmap next item is ${expectedItem.title}; active plan is linked to ${sourceItem.title}.`,
      evidence: [expectedItem.id, activePlan.sourceRoadmapItemId],
    });
  }

  return issues;
}

function planSummaryForTelemetry(plan: Plan): PlanSummaryForTelemetry {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    ...(plan.sourceRoadmapId ? { sourceRoadmapId: plan.sourceRoadmapId } : {}),
    ...(plan.sourceRoadmapItemId ? { sourceRoadmapItemId: plan.sourceRoadmapItemId } : {}),
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

export { ZenithApp as DecodeApp };
