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
import { resolveActivePlan } from "./focus";

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

    const currentBrief = this.repository.getCurrentProjectBrief(project.id);
    const recentRoadmaps = this.repository.listRoadmaps(project.id, 5);
    const openSpikes = this.repository.listOpenSpikes(project.id);
    const recentSessions = this.repository.listRecentSessions(project.id, 5);
    const recentDecisions = this.repository.listDecisions(project.id, 5);
    const openFindings = this.repository.listOpenFindings(project.id).map(toFindingSummary);
    const selectedPhase = options.phaseId ? this.resolvePhase(project, options.phaseId) : null;

    const worktreeKey = git.worktreeRoot ?? git.rootPath;
    const allRoadmaps = this.repository.listRoadmaps(project.id);
    const activePlans = this.repository.listActivePlans(project.id);
    const focusRow = this.repository.getFocus(project.id, worktreeKey);
    const resolution = resolveActivePlan({
      roadmaps: allRoadmaps,
      activePlans,
      focusRoadmapId: focusRow?.roadmapId ?? null,
    });
    const activePlan = resolution.activePlan;

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
      next: computeNext(activePlan, recentSessions, openFindings, recentRoadmaps, {}, {
        ambiguous: resolution.ambiguous,
        candidates: resolution.candidates,
      }),
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
  appendLatestSession(lines, snapshot.recentSessions);
  appendOpenFindings(lines, snapshot.openFindings);
  return lines.join("\n");
}

function renderResumeMarkdown(snapshot: ContextSnapshot): string {
  const lines = renderBaseMarkdown(snapshot, "Zenith Resume");
  appendRoadmaps(lines, snapshot.recentRoadmaps);
  appendOpenSpikes(lines, snapshot.openSpikes);
  appendPhaseDetails(lines, focusPhaseDetail(snapshot));
  appendLatestSession(lines, snapshot.recentSessions);
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
    `- Working tree: ${context.git.dirty ? "dirty" : "clean"}`,
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
    lines.push(`- ${roadmap.status}: ${truncate(roadmap.title, 180)}`);
    lines.push(`  - actionable: ${formatRoadmapItems(actionableRoadmapItems(roadmap), 3)}`);
    const deferred = deferredRoadmapItems(roadmap);
    if (deferred.length > 0) {
      lines.push(`  - deferred backlog: ${formatRoadmapItems(deferred, 3)}`);
    }
    const discarded = discardedRoadmapItems(roadmap);
    if (discarded.length > 0) {
      lines.push(`  - discarded: ${formatRoadmapItems(discarded, 3)}`);
    }
  }
}

function actionableRoadmapItems(roadmap: Roadmap): Roadmap["items"] {
  return roadmap.items.filter((item) => item.status === "in_progress" || item.status === "todo");
}

function deferredRoadmapItems(roadmap: Roadmap): Roadmap["items"] {
  return roadmap.items.filter((item) => item.status === "deferred");
}

function discardedRoadmapItems(roadmap: Roadmap): Roadmap["items"] {
  return roadmap.items.filter((item) => item.status === "discarded");
}

function formatRoadmapItems(items: Roadmap["items"], max: number): string {
  if (items.length === 0) {
    return "none";
  }

  const visible = items.slice(0, max).map((item) => {
    const justification = item.justification ? ` why: ${item.justification}` : "";
    return `${item.status}: ${item.title}${justification}`;
  });
  const suffix = items.length > max ? `; and ${items.length - max} more` : "";
  return truncate(`${visible.join("; ")}${suffix}`, 220);
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

  if (phaseDetail.phase.dependsOn.length > 0) {
    lines.push(`- Depends on: ${phaseDetail.phase.dependsOn.join(", ")}`);
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

function appendLatestSession(lines: string[], sessions: Session[]): void {
  lines.push("", "## Latest session");
  const latest = sessions[0];
  if (!latest) {
    lines.push("- No sessions recorded.");
    return;
  }

  lines.push(`- ${truncate(latest.summary ?? latest.id, 180)}`);
  if (latest.nextSteps.length > 0) {
    lines.push(`- Session next: ${truncate(latest.nextSteps[0]!, 180)}`);
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
    const files = finding.relatedFiles.length > 0 ? ` files: ${finding.relatedFiles.join(", ")}` : "";
    const planSuffix = finding.relatedPlanId ? ` (plan: ${finding.relatedPlanId})` : "";
    const prefix = isBlockingSeverity(finding.severity) ? "blocking " : "";
    lines.push(`- ${prefix}${finding.severity} ${finding.type}: ${truncate(`${finding.title}${files}${planSuffix}`, 180)}`);
  }
}

function isBlockingSeverity(severity: string): boolean {
  return severity === "critical" || severity === "high";
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
    type: finding.type,
    severity: finding.severity,
    title: finding.title,
    relatedFiles: finding.relatedFiles,
    ...(finding.relatedPlanId ? { relatedPlanId: finding.relatedPlanId } : {}),
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
