import type { Finding, NextStep, Plan, PlanPhase, Roadmap, Session } from "../domain/schemas";

export type PlanNextResult = NextStep;

// Reserved groundwork for staleness/top-N ranking (planned later) — intentionally unused for now.
// IMPORTANT: never call a clock (Date.now(), new Date()) inside computeNext — options.now is the injection point.
export type ComputeNextOptions = { now?: string; staleAfterDays?: number; top?: number };

export function computeNext(
  activePlan: Plan | null,
  recentSessions: Session[],
  openFindings: Array<Pick<Finding, "id" | "severity" | "title">>,
  recentRoadmaps: Roadmap[] = [],
  options: ComputeNextOptions = {},
): PlanNextResult {
  const blockingFinding = openFindings.find((finding) => finding.severity === "critical" || finding.severity === "high");
  if (blockingFinding) {
    return {
      recommendation: `Review finding: ${blockingFinding.title}`,
      reason: "Open high-severity finding should be handled before advancing the plan.",
      evidence: [blockingFinding.id],
    };
  }

  const inProgress = activePlan?.phases.find((phase) => phase.status === "in_progress");
  if (activePlan && inProgress) {
    return {
      recommendation: inProgress.title,
      reason: "Active plan has an in-progress phase.",
      planId: activePlan.id,
      phaseId: inProgress.id,
      evidence: [activePlan.title],
    };
  }

  const blocked = activePlan?.phases.find((phase) => phase.status === "blocked");
  if (activePlan && blocked) {
    return {
      recommendation: `Unblock phase: ${blocked.title}`,
      reason: "Active plan has a blocked phase.",
      planId: activePlan.id,
      phaseId: blocked.id,
      evidence: [activePlan.title],
    };
  }

  if (activePlan) {
    const todoPhasesInOrder = activePlan.phases.filter((phase) => phase.status === "todo");
    const readyPhase = todoPhasesInOrder.find((phase) => isPhaseReady(phase, activePlan));
    if (readyPhase) {
      return {
        recommendation: readyPhase.title,
        reason: "First ready todo phase in the active plan.",
        planId: activePlan.id,
        phaseId: readyPhase.id,
        evidence: [activePlan.title],
      };
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
      return {
        recommendation: `Blocked by dependency: ${firstTodo.title}`,
        reason: `Unmet prerequisites: ${unmetDepTitles.join(", ")}`,
        planId: activePlan.id,
        phaseId: firstTodo.id,
        evidence: unmetDepIds,
        blockedBy: unmetDepIds,
      };
    }
  }

  if (!activePlan) {
    const roadmapTarget = findRoadmapTarget(recentRoadmaps);
    if (roadmapTarget) {
      return {
        recommendation: `Create plan from roadmap: ${roadmapTarget.item.title}`,
        reason: "No active plan exists; active roadmap has the next product direction.",
        evidence: [roadmapTarget.roadmap.id, roadmapTarget.item.id],
      };
    }

    const deferredTarget = findDeferredRoadmapTarget(recentRoadmaps);
    if (deferredTarget) {
      return {
        recommendation: `Review deferred roadmap work: ${deferredTarget.item.title}`,
        reason: "No active plan exists and active roadmap work is deferred; reactivate a roadmap item before creating a plan.",
        evidence: [deferredTarget.roadmap.id, deferredTarget.item.id],
      };
    }

    const openFinding = openFindings[0];
    if (openFinding) {
      return {
        recommendation: `Review finding: ${openFinding.title}`,
        reason: "No active plan exists; open findings remain before new work is selected.",
        evidence: [openFinding.id],
      };
    }
  }

  const sessionStep = recentSessions.flatMap((session) => session.nextSteps).find(Boolean);
  if (sessionStep) {
    return {
      recommendation: sessionStep,
      reason: "Latest session included an explicit next step.",
      evidence: [recentSessions[0]?.id ?? "latest_session"],
    };
  }

  return {
    recommendation: activePlan ? "Review completed active plan" : "Create an active plan",
    reason: activePlan ? "No pending, blocked, or in-progress phases remain." : "No active plan exists.",
    evidence: activePlan ? [activePlan.id] : [],
  };
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
