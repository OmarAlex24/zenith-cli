import type {
  Finding,
  NextStep,
  NextStepKind,
  NextStepStaleness,
  Plan,
  PlanPhase,
  Roadmap,
  Session,
} from "../domain/schemas";
import type { FocusCandidate } from "./focus";

export type PlanNextResult = NextStep;

// Reserved groundwork for staleness/top-N ranking (planned later) — intentionally unused for now.
// IMPORTANT: never call a clock (Date.now(), new Date()) inside computeNext — options.now is the injection point.
export type ComputeNextOptions = { now?: string; staleAfterDays?: number; top?: number };

export type FocusState = { ambiguous: boolean; candidates: FocusCandidate[] };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeNext(
  activePlan: Plan | null,
  recentSessions: Session[],
  openFindings: Array<Pick<Finding, "id" | "severity" | "title">>,
  recentRoadmaps: Roadmap[] = [],
  options: ComputeNextOptions = {},
  focus?: FocusState,
): PlanNextResult {
  const blockingFinding = openFindings.find((finding) => finding.severity === "critical" || finding.severity === "high");
  if (blockingFinding) {
    return {
      recommendation: `Review finding: ${blockingFinding.title}`,
      reason: "Open high-severity finding should be handled before advancing the plan.",
      evidence: [blockingFinding.id],
      kind: "blocking_finding" satisfies NextStepKind,
    };
  }

  if (!activePlan && focus?.ambiguous) {
    const titles = focus.candidates.map((candidate) => candidate.roadmapTitle).join(", ");
    return {
      recommendation: "Set roadmap focus for this worktree: zenith focus set <roadmap-id>",
      reason: `Multiple roadmaps have an active plan (${titles}); bind this worktree to one roadmap to continue.`,
      evidence: focus.candidates.map((candidate) => candidate.roadmapId).filter((id) => id.length > 0),
      kind: "ambiguous_focus" satisfies NextStepKind,
    };
  }

  const inProgress = activePlan?.phases.find((phase) => phase.status === "in_progress");
  if (activePlan && inProgress) {
    return withStaleness({
      recommendation: inProgress.title,
      reason: "Active plan has an in-progress phase.",
      planId: activePlan.id,
      phaseId: inProgress.id,
      evidence: [activePlan.title],
      kind: "implement_phase" satisfies NextStepKind,
    }, activePlan.updatedAt, options);
  }

  const blocked = activePlan?.phases.find((phase) => phase.status === "blocked");
  if (activePlan && blocked) {
    return withStaleness({
      recommendation: `Unblock phase: ${blocked.title}`,
      reason: "Active plan has a blocked phase.",
      planId: activePlan.id,
      phaseId: blocked.id,
      evidence: [activePlan.title],
      kind: "blocked_dependency" satisfies NextStepKind,
    }, activePlan.updatedAt, options);
  }

  if (activePlan) {
    const todoPhasesInOrder = activePlan.phases.filter((phase) => phase.status === "todo");
    const readyPhase = todoPhasesInOrder.find((phase) => isPhaseReady(phase, activePlan));
    if (readyPhase) {
      return withStaleness({
        recommendation: readyPhase.title,
        reason: "First ready todo phase in the active plan.",
        planId: activePlan.id,
        phaseId: readyPhase.id,
        evidence: [activePlan.title],
        kind: "implement_phase" satisfies NextStepKind,
      }, activePlan.updatedAt, options);
    }
    const firstTodo = todoPhasesInOrder[0];
    if (firstTodo) {
      // All todo phases are gated by unmet dependencies
      const unmetDepIds = firstTodo.dependsOn.filter((depId) => {
        const depPhase = activePlan.phases.find((p) => p.id === depId);
        return depPhase === undefined || depPhase.status !== "done";
      });
      const unmetDepTitles = unmetDepIds.map((depId) => {
        const depPhase = activePlan.phases.find((p) => p.id === depId);
        return depPhase ? depPhase.title : depId;
      });
      return withStaleness({
        recommendation: `Blocked by dependency: ${firstTodo.title}`,
        reason: `Unmet prerequisites: ${unmetDepTitles.join(", ")}`,
        planId: activePlan.id,
        phaseId: firstTodo.id,
        evidence: unmetDepIds,
        blockedBy: unmetDepIds,
        kind: "blocked_dependency" satisfies NextStepKind,
      }, activePlan.updatedAt, options);
    }
  }

  if (!activePlan) {
    const roadmapTarget = findRoadmapTarget(recentRoadmaps);
    if (roadmapTarget) {
      return withStaleness({
        recommendation: `Create plan from roadmap: ${roadmapTarget.item.title}`,
        reason: "No active plan exists; active roadmap has the next product direction.",
        evidence: [roadmapTarget.roadmap.id, roadmapTarget.item.id],
        kind: "create_plan" satisfies NextStepKind,
      }, roadmapTarget.roadmap.updatedAt, options);
    }

    const deferredTarget = findDeferredRoadmapTarget(recentRoadmaps);
    if (deferredTarget) {
      return withStaleness({
        recommendation: `Review deferred roadmap work: ${deferredTarget.item.title}`,
        reason: "No active plan exists and active roadmap work is deferred; reactivate a roadmap item before creating a plan.",
        evidence: [deferredTarget.roadmap.id, deferredTarget.item.id],
        kind: "review_deferred" satisfies NextStepKind,
      }, deferredTarget.roadmap.updatedAt, options);
    }

    const openFinding = openFindings[0];
    if (openFinding) {
      return {
        recommendation: `Review finding: ${openFinding.title}`,
        reason: "No active plan exists; open findings remain before new work is selected.",
        evidence: [openFinding.id],
        kind: "review_finding" satisfies NextStepKind,
      };
    }
  }

  const sessionStep = recentSessions.flatMap((session) => session.nextSteps).find(Boolean);
  if (sessionStep) {
    const latestSession = recentSessions[0];
    return withStaleness({
      recommendation: sessionStep,
      reason: "Latest session included an explicit next step.",
      evidence: [recentSessions[0]?.id ?? "latest_session"],
      // kind intentionally omitted: freeform guidance with no plan/roadmap/finding context
    }, latestSession?.endedAt ?? latestSession?.startedAt, options);
  }

  return withStaleness({
    recommendation: activePlan ? "Review completed active plan" : "Create an active plan",
    reason: activePlan ? "No pending, blocked, or in-progress phases remain." : "No active plan exists.",
    evidence: activePlan ? [activePlan.id] : [],
    kind: (activePlan ? "review_completed" : "create_plan_empty") satisfies NextStepKind,
  }, activePlan?.updatedAt, options);
}

function withStaleness<T extends NextStep>(step: T, lastUpdatedAt: string | undefined, options: ComputeNextOptions): T {
  if (!lastUpdatedAt || !options.now || !options.staleAfterDays) {
    return step;
  }

  const ageDays = roundedAgeDays(options.now, lastUpdatedAt);
  if (ageDays === null) {
    return step;
  }

  const staleness: NextStepStaleness = {
    stale: ageDays >= options.staleAfterDays,
    ageDays,
    staleAfterDays: options.staleAfterDays,
    lastUpdatedAt,
  };

  return { ...step, staleness };
}

function roundedAgeDays(now: string, lastUpdatedAt: string): number | null {
  const nowMs = Date.parse(now);
  const lastMs = Date.parse(lastUpdatedAt);
  if (Number.isNaN(nowMs) || Number.isNaN(lastMs)) {
    return null;
  }

  const ageDays = Math.max(0, (nowMs - lastMs) / MS_PER_DAY);
  return Math.round(ageDays * 100) / 100;
}

/**
 * Returns true if every dependency of the given phase is satisfied (status "done").
 * A phase with no dependencies is always ready.
 */
function isPhaseReady(phase: PlanPhase, plan: Plan): boolean {
  for (const depId of phase.dependsOn) {
    const depPhase = plan.phases.find((p) => p.id === depId);
    if (depPhase === undefined || depPhase.status !== "done") {
      return false;
    }
  }
  return true;
}

function findRoadmapTarget(roadmaps: Roadmap[]): { roadmap: Roadmap; item: Roadmap["items"][number] } | null {
  const activeRoadmaps = roadmaps.filter((roadmap) => roadmap.status === "active");
  const statuses: Array<Roadmap["items"][number]["status"]> = ["in_progress", "todo"];

  for (const status of statuses) {
    for (const roadmap of activeRoadmaps) {
      const item = roadmap.items.find((candidate) => candidate.status === status);
      if (item) {
        return { roadmap, item };
      }
    }
  }

  return null;
}

function findDeferredRoadmapTarget(roadmaps: Roadmap[]): { roadmap: Roadmap; item: Roadmap["items"][number] } | null {
  const activeRoadmaps = roadmaps.filter((roadmap) => roadmap.status === "active");

  for (const roadmap of activeRoadmaps) {
    const item = roadmap.items.find((candidate) => candidate.status === "deferred");
    if (item) {
      return { roadmap, item };
    }
  }

  return null;
}

export function findCurrentPhase(plan: Plan | null): PlanPhase | null {
  return (
    plan?.phases.find((phase) => phase.status === "in_progress") ??
    plan?.phases.find((phase) => phase.status === "blocked") ??
    plan?.phases.find((phase) => phase.status === "todo") ??
    null
  );
}
