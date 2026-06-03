import { ZenithError } from "../cli/json-output";
import {
  CompactContextSchema,
  ContextSnapshotSchema,
  GitContextSchema,
  ResumeContextSchema,
  type CompactContext,
  type ContextSnapshot,
  type Decision,
  type DecisionCompact,
  type FindingSummary,
  type PhaseDetail,
  type Plan,
  type PlanSummary,
  type Project,
  type ProjectBrief,
  type ProjectBriefSummary,
  type ProjectSummary,
  type ResumeContext,
  type Roadmap,
  type RoadmapSummary,
  type Session,
  type SessionCompact,
  type Spike,
  type SpikeSummary,
} from "../domain/schemas";
import { GitAdapter } from "../integrations/git/git-adapter";
import type { ZenithRepository } from "../storage/repository";
import { computeNext, findCurrentPhase } from "./plan-next";

export type ContextOptions = {
  phaseId?: string;
};

type ContextParts = Omit<ContextSnapshot, "markdown">;

export class ContextEngine {
  constructor(
    private readonly repository: ZenithRepository,
    private readonly git = new GitAdapter(),
    private readonly cwd = process.cwd(),
  ) {}

  async getContext(options: ContextOptions = {}): Promise<ContextSnapshot> {
    const parts = await this.collectContext(options);
    return ContextSnapshotSchema.parse({
      ...parts,
      markdown: renderContextMarkdown(parts),
    });
  }

  async compactContext(options: ContextOptions = {}): Promise<CompactContext> {
    const snapshot = await this.getContext(options);
    return CompactContextSchema.parse({
      project: snapshot.project ? toProjectSummary(snapshot.project) : null,
      git: snapshot.git,
      currentBrief: snapshot.currentBrief ? toProjectBriefSummary(snapshot.currentBrief) : null,
      recentRoadmaps: snapshot.recentRoadmaps.slice(0, 5).map(toRoadmapSummary),
      openSpikes: snapshot.openSpikes.slice(0, 5).map(toSpikeSummary),
      activePlan: snapshot.activePlan ? toPlanSummary(snapshot.activePlan) : null,
      currentPhase: snapshot.currentPhase,
      selectedPhase: snapshot.selectedPhase,
      recentSessions: snapshot.recentSessions.slice(0, 3).map(toSessionCompact),
      recentDecisions: snapshot.recentDecisions.slice(0, 5).map(toDecisionCompact),
      openFindings: snapshot.openFindings,
      next: snapshot.next,
      markdown: renderCompactMarkdown(snapshot),
    });
  }

  async resume(): Promise<ResumeContext> {
    const snapshot = await this.getContext();
    return ResumeContextSchema.parse({
      project: snapshot.project ? toProjectSummary(snapshot.project) : null,
      git: snapshot.git,
      currentBrief: snapshot.currentBrief ? toProjectBriefSummary(snapshot.currentBrief) : null,
      recentRoadmaps: snapshot.recentRoadmaps.slice(0, 5).map(toRoadmapSummary),
      openSpikes: snapshot.openSpikes.slice(0, 5).map(toSpikeSummary),
      activePlan: snapshot.activePlan ? toPlanSummary(snapshot.activePlan) : null,
      currentPhase: snapshot.currentPhase,
      latestSession: snapshot.recentSessions[0] ?? null,
      recentDecisions: snapshot.recentDecisions.slice(0, 5).map(toDecisionCompact),
      openFindings: snapshot.openFindings,
      next: snapshot.next,
      markdown: renderResumeMarkdown(snapshot),
    });
  }

  async showPhase(phaseId: string): Promise<PhaseDetail> {
    const { project, git } = await this.detectProject();
    if (!project) {
      throw new ZenithError("Project is not registered. Run `zenith init` first.", {
        code: "project_not_registered",
        details: { rootPath: git.rootPath },
      });
    }

    return this.resolvePhase(project, phaseId);
  }

  private async collectContext(options: ContextOptions): Promise<ContextParts> {
    const { project, git, registered } = await this.detectProject();

    if (!project) {
      if (options.phaseId) {
        throw new ZenithError("Project is not registered. Run `zenith init` first.", {
          code: "project_not_registered",
          details: { rootPath: git.rootPath },
        });
      }

      return {
        project: null,
        git,
        registered,
        activePlan: null,
        currentPhase: null,
        currentBrief: null,
        recentRoadmaps: [],
        openSpikes: [],
        selectedPhase: null,
        recentSessions: [],
        recentDecisions: [],
        openFindings: [],
        next: {
          recommendation: "Run zenith init",
          reason: "Project is not registered in Zenith yet.",
          evidence: [git.rootPath],
        },
      };
    }

    const activePlan = this.repository.getActivePlan(project.id);
    const currentBrief = this.repository.getCurrentProjectBrief(project.id);
    const recentRoadmaps = this.repository.listRoadmaps(project.id, 5);
    const openSpikes = this.repository.listOpenSpikes(project.id);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const recentDecisions = this.repository.listDecisions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id).map(toFindingSummary);
    const selectedPhase = options.phaseId ? this.resolvePhase(project, options.phaseId) : null;

    return {
      project,
      git,
      registered,
      activePlan,
      currentPhase: findCurrentPhase(activePlan),
      currentBrief,
      recentRoadmaps,
      openSpikes,
      selectedPhase,
      recentSessions,
      recentDecisions,
      openFindings,
      next: computeNext(activePlan, recentSessions, openFindings, recentRoadmaps),
    };
  }

  private async detectProject(): Promise<{ project: Project | null; git: ContextParts["git"]; registered: boolean }> {
    const git = GitContextSchema.parse(await this.git.inspect(this.cwd));
    const project = this.repository.findProjectByRootPath(git.rootPath);
    return { project, git, registered: Boolean(project) };
  }

  private resolvePhase(project: Project, phaseId: string): PhaseDetail {
    const result = this.repository.getPlanByPhaseId(phaseId);
    if (!result || result.plan.projectId !== project.id) {
      throw new ZenithError(`Phase not found: ${phaseId}`, {
        code: "phase_not_found",
        details: { phaseId },
      });
    }

    return {
      planId: result.plan.id,
      planTitle: result.plan.title,
      phase: result.phase,
    };
  }
}

function renderContextMarkdown(context: ContextParts): string {
  const lines = renderBaseMarkdown(context, "Zenith Context");
  appendRoadmaps(lines, context.recentRoadmaps);
  appendOpenSpikes(lines, context.openSpikes);
  appendPhaseDetails(lines, focusPhaseDetail(context));
  appendRecentSessions(lines, context.recentSessions);
  appendRecentDecisions(lines, context.recentDecisions);
  appendOpenFindings(lines, context.openFindings);
  return lines.join("\n");
}

function renderCompactMarkdown(snapshot: ContextSnapshot): string {
  const lines = renderBaseMarkdown(snapshot, "Zenith Compact Context");
  appendRoadmaps(lines, snapshot.recentRoadmaps);
  appendOpenSpikes(lines, snapshot.openSpikes);
  appendPhaseDetails(lines, focusPhaseDetail(snapshot));
  appendOpenFindings(lines, snapshot.openFindings);
  return lines.join("\n");
}

function renderResumeMarkdown(snapshot: ContextSnapshot): string {
  const lines = renderBaseMarkdown(snapshot, "Zenith Resume");
  appendRoadmaps(lines, snapshot.recentRoadmaps);
  appendOpenSpikes(lines, snapshot.openSpikes);
  appendPhaseDetails(lines, focusPhaseDetail(snapshot));
  lines.push("", "## Latest session");
  const latest = snapshot.recentSessions[0];
  if (latest) {
    lines.push(`- ${truncate(latest.summary ?? latest.id, 180)}`);
    if (latest.nextSteps.length > 0) {
      lines.push(`- Session next: ${truncate(latest.nextSteps[0]!, 180)}`);
    }
  } else {
    lines.push("- No sessions recorded.");
  }
  appendRecentDecisions(lines, snapshot.recentDecisions);
  appendOpenFindings(lines, snapshot.openFindings);
  return lines.join("\n");
}

function renderBaseMarkdown(context: ContextParts, title: string): string[] {
  const activePlan = context.activePlan ? `${context.activePlan.title} (${context.activePlan.status})` : "none";
  const currentPhase = context.currentPhase ? `${context.currentPhase.title} (${context.currentPhase.status})` : "none";
  const focusPhase = focusPhaseDetail(context);
  const focusPhaseLabel = focusPhase ? `${focusPhase.phase.title} (${focusPhase.phase.status})` : "none";
  const brief = context.currentBrief ? `${context.currentBrief.title}: ${context.currentBrief.summary}` : "none";

  return [
    `# ${title}`,
    "",
    "## Project",
    `- Name: ${context.project?.name ?? "unregistered"}`,
    `- Root: ${context.git.rootPath}`,
    `- Registered: ${context.registered ? "yes" : "no"}`,
    `- Git: ${formatGit(context.git)}`,
    `- Changed files: ${formatList(context.git.changedFiles, 8)}`,
    `- Brief: ${truncate(brief, 180)}`,
    "",
    "## Plan",
    `- Active plan: ${activePlan}`,
    `- Current phase: ${currentPhase}`,
    `- Focus phase: ${focusPhaseLabel}`,
    "",
    "## Next",
    `- Recommendation: ${context.next.recommendation ?? "none"}`,
    `- Reason: ${context.next.reason}`,
  ];
}

function appendRoadmaps(lines: string[], roadmaps: Roadmap[]): void {
  lines.push("", "## Roadmaps");
  if (roadmaps.length === 0) {
    lines.push("- No roadmaps recorded.");
    return;
  }

  for (const roadmap of roadmaps.slice(0, 5)) {
    const visibleItems = roadmap.items.slice(0, 3).map((item) => `${item.status}: ${item.title}`);
    const suffix = visibleItems.length > 0 ? ` Items: ${visibleItems.join("; ")}` : "";
    lines.push(`- ${roadmap.status}: ${truncate(`${roadmap.title}.${suffix}`, 220)}`);
  }
}

function appendOpenSpikes(lines: string[], spikes: Spike[]): void {
  lines.push("", "## Open spikes");
  if (spikes.length === 0) {
    lines.push("- No open spikes.");
    return;
  }

  for (const spike of spikes.slice(0, 5)) {
    lines.push(`- ${truncate(`${spike.title}: ${spike.question}`, 220)}`);
  }
}

function appendPhaseDetails(lines: string[], phaseDetail: PhaseDetail | null): void {
  if (!phaseDetail) {
    return;
  }

  lines.push("", "## Phase details");
  lines.push(`- Plan: ${phaseDetail.planTitle}`);
  lines.push(`- Phase id: ${phaseDetail.phase.id}`);
  if (phaseDetail.phase.description) {
    lines.push(`- Description: ${truncate(phaseDetail.phase.description, 240)}`);
  }

  if (phaseDetail.phase.acceptanceCriteria.length > 0) {
    lines.push("- Acceptance criteria:");
    for (const item of phaseDetail.phase.acceptanceCriteria.slice(0, 8)) {
      lines.push(`  - ${truncate(item, 180)}`);
    }
  }

  if (phaseDetail.phase.evidence.length > 0) {
    lines.push("- Evidence:");
    for (const item of phaseDetail.phase.evidence.slice(0, 5)) {
      lines.push(`  - ${item.kind}: ${truncate(item.value, 180)}`);
    }
  }
}

function focusPhaseDetail(context: Pick<ContextParts, "activePlan" | "currentPhase" | "selectedPhase">): PhaseDetail | null {
  if (context.selectedPhase) {
    return context.selectedPhase;
  }

  if (!context.activePlan || !context.currentPhase) {
    return null;
  }

  return {
    planId: context.activePlan.id,
    planTitle: context.activePlan.title,
    phase: context.currentPhase,
  };
}

function appendRecentSessions(lines: string[], sessions: Session[]): void {
  lines.push("", "## Recent sessions");
  if (sessions.length === 0) {
    lines.push("- No sessions recorded.");
    return;
  }

  for (const session of sessions.slice(0, 3)) {
    const summary = session.summary ?? session.id;
    const next = session.nextSteps[0] ? ` Next: ${session.nextSteps[0]}` : "";
    lines.push(`- ${truncate(`${summary}${next}`, 220)}`);
  }
}

function appendRecentDecisions(lines: string[], decisions: Decision[]): void {
  lines.push("", "## Recent decisions");
  if (decisions.length === 0) {
    lines.push("- No decisions recorded.");
    return;
  }

  for (const decision of decisions.slice(0, 5)) {
    lines.push(`- ${truncate(decision.title, 180)}`);
  }
}

function appendOpenFindings(lines: string[], findings: FindingSummary[]): void {
  lines.push("", "## Open findings");
  if (findings.length === 0) {
    lines.push("- No open findings.");
    return;
  }

  for (const finding of findings.slice(0, 5)) {
    lines.push(`- ${finding.severity}: ${truncate(finding.title, 180)}`);
  }
}

function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    rootPath: project.rootPath,
  };
}

function toPlanSummary(plan: Plan): PlanSummary {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    ...(plan.priority ? { priority: plan.priority } : {}),
  };
}

function toProjectBriefSummary(brief: ProjectBrief): ProjectBriefSummary {
  return {
    id: brief.id,
    title: brief.title,
    summary: brief.summary,
    ...(brief.source ? { source: brief.source } : {}),
    version: brief.version,
    status: brief.status,
    updatedAt: brief.updatedAt,
  };
}

function toRoadmapSummary(roadmap: Roadmap): RoadmapSummary {
  return {
    id: roadmap.id,
    title: roadmap.title,
    status: roadmap.status,
    ...(roadmap.sourcePlanId ? { sourcePlanId: roadmap.sourcePlanId } : {}),
    updatedAt: roadmap.updatedAt,
  };
}

function toSpikeSummary(spike: Spike): SpikeSummary {
  return {
    id: spike.id,
    title: spike.title,
    question: spike.question,
    status: spike.status,
    ...(spike.recommendation ? { recommendation: spike.recommendation } : {}),
    updatedAt: spike.updatedAt,
  };
}

function toFindingSummary(finding: FindingSummary): FindingSummary {
  return {
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
  };
}

function toSessionCompact(session: Session): SessionCompact {
  return {
    id: session.id,
    startedAt: session.startedAt,
    ...(session.endedAt ? { endedAt: session.endedAt } : {}),
    ...(session.branch ? { branch: session.branch } : {}),
    ...(session.summary ? { summary: session.summary } : {}),
    changedFiles: session.changedFiles,
    ...(session.relatedPlanId ? { relatedPlanId: session.relatedPlanId } : {}),
    nextSteps: session.nextSteps,
  };
}

function toDecisionCompact(decision: Decision): DecisionCompact {
  return {
    id: decision.id,
    title: decision.title,
    relatedPlanIds: decision.relatedPlanIds,
    createdAt: decision.createdAt,
  };
}

function formatGit(git: ContextParts["git"]): string {
  const parts = [
    git.isGitRepo ? "git repo" : "not a git repo",
    `branch ${git.branch ?? "none"}`,
    `dirty ${git.dirty ? "yes" : "no"}`,
  ];
  if (git.headCommit) {
    parts.push(`head ${git.headCommit.slice(0, 12)}`);
  }
  return parts.join(", ");
}

function formatList(values: string[], max: number): string {
  if (values.length === 0) {
    return "none";
  }

  const visible = values.slice(0, max);
  const suffix = values.length > max ? `, and ${values.length - max} more` : "";
  return `${visible.join(", ")}${suffix}`;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}
