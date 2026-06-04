import { ZenithError } from "../cli/json-output";
import { createId, nowIso } from "../domain/ids";
import {
  AddRoadmapItemInputSchema,
  AdvancePlanInputSchema,
  ConcludeSpikeInputSchema,
  CaptureSessionInputSchema,
  type AdvanceResult,
  type CompactContext,
  type ContextSnapshot,
  CreatePlanFromRoadmapInputSchema,
  CreateRoadmapInputSchema,
  CreatePlanInputSchema,
  CreateSpikeInputSchema,
  EndSessionInputSchema,
  ImportPlanToRoadmapInputSchema,
  type PhaseDetail,
  type PlanPath,
  RecordFindingInputSchema,
  RecordDecisionInputSchema,
  RecordSpikeInputSchema,
  type ResumeContext,
  SessionSummaryInputSchema,
  SetBriefInputSchema,
  StartSessionInputSchema,
  UpdateFindingInputSchema,
  UpdatePhaseInputSchema,
  UpdatePlanInputSchema,
  UpdateRoadmapInputSchema,
  UpdateRoadmapItemInputSchema,
  type Decision,
  type Event,
  type Finding,
  type Plan,
  type PlanPhase,
  type ProjectBrief,
  type Project,
  type Roadmap,
  type RoadmapItem,
  type Session,
  type Spike,
} from "../domain/schemas";
import type { GitSummary } from "../integrations/git/git-adapter";
import { GitAdapter } from "../integrations/git/git-adapter";
import type { ZenithRepository } from "../storage/repository";
import type { FindingListStatus } from "../storage/repository";
import { ContextEngine, type ContextOptions } from "./context-engine";
import { computeNext, findCurrentPhase, type PlanNextResult } from "./plan-next";
import { computePlanPath, validatePhaseDependencies } from "./plan-graph";
import { resolveActivePlan, type FocusCandidate, type FocusResolution } from "./focus";
import { buildRoadmapWorkspace, type RoadmapWorkspace } from "./roadmap-workspace";
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
  }>;
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
      })),
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

  async compactContext(options: ContextOptions = {}): Promise<CompactContext> {
    return this.contextEngine.compactContext(options);
  }

  async resume(): Promise<ResumeContext> {
    return this.contextEngine.resume();
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
    });
  }

  async closeFinding(findingId: string): Promise<Finding> {
    const project = await this.requireProject();
    this.requireProjectFinding(findingId, project.id);

    return this.repository.closeFinding(findingId);
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
    });
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
  kind: "note" | "commit" | "file" | "pr" | "command" | "link";
  value: string;
  createdAt?: string | undefined;
}) {
  return {
    id: evidence.id ?? createId("ev"),
    kind: evidence.kind,
    value: evidence.value,
    createdAt: evidence.createdAt ?? nowIso(),
  };
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
