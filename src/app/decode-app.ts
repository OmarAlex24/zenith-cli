import { ZenithError } from "../cli/json-output";
import { createId, nowIso } from "../domain/ids";
import {
  AddRoadmapItemInputSchema,
  ConcludeSpikeInputSchema,
  CaptureSessionInputSchema,
  type CompactContext,
  type ContextSnapshot,
  CreatePlanFromRoadmapInputSchema,
  CreateRoadmapInputSchema,
  CreatePlanInputSchema,
  CreateSpikeInputSchema,
  EndSessionInputSchema,
  ImportPlanToRoadmapInputSchema,
  type PhaseDetail,
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
  next: PlanNextResult;
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
      name: this.git.projectNameFromPath(git.rootPath),
      rootPath: git.rootPath,
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
        next: {
          recommendation: "Run zenith init",
          reason: "Project is not registered in Zenith yet.",
          evidence: [detection.git.rootPath],
        },
      };
    }

    const activePlan = this.repository.getActivePlan(detection.project.id);
    const currentBrief = this.repository.getCurrentProjectBrief(detection.project.id);
    const recentRoadmaps = this.repository.listRoadmaps(detection.project.id, 5);
    const openSpikes = this.repository.listOpenSpikes(detection.project.id);
    const recentSessions = this.repository.listRecentSessions(detection.project.id, 5);
    const recentDecisions = this.repository.listDecisions(detection.project.id, 5);
    const openFindings = this.repository.listOpenFindings(detection.project.id);
    const next = computeNext(activePlan, recentSessions, openFindings, recentRoadmaps);

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
      next,
    };
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
      this.assertNoOtherActivePlan(project.id);
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

    return this.repository.createPlan({
      projectId: project.id,
      title: input.title ?? item.title,
      description: input.description ?? item.description ?? `Executable plan created from roadmap item ${item.id}.`,
      status: input.status,
      ...(input.priority ? { priority: input.priority } : {}),
      sourceRoadmapId: roadmap.id,
      sourceRoadmapItemId: item.id,
      phases,
    });
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
      this.assertNoOtherActivePlan(project.id);
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
      this.assertNoOtherActivePlan(project.id, plan.id);
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
      },
    );
  }

  async nextPlanStep(): Promise<PlanNextResult> {
    const project = await this.requireProject();
    const activePlan = this.repository.getActivePlan(project.id);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id);
    const recentRoadmaps = this.repository.listRoadmaps(project.id, 5);
    return computeNext(activePlan, recentSessions, openFindings, recentRoadmaps);
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

  async timeline(options: { limit?: number } = {}): Promise<Event[]> {
    const project = await this.requireProject();
    return this.repository.listEvents(project.id, { ...(options.limit ? { limit: options.limit } : {}) });
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

  private assertNoOtherActivePlan(projectId: string, planId?: string): void {
    const activePlan = this.repository
      .listPlans(projectId)
      .find((candidate) => candidate.status === "active" && candidate.id !== planId);

    if (!activePlan) {
      return;
    }

    throw new ZenithError(
      "Active plan already exists. Pause, complete, or archive it before activating another plan.",
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

export { ZenithApp as DecodeApp };
