import type { Finding, NextStep, Plan, PlanPhase, Session } from "../domain/schemas";

export type PlanNextResult = NextStep;

export function computeNext(
  activePlan: Plan | null,
  recentSessions: Session[],
  openFindings: Array<Pick<Finding, "id" | "severity" | "title">>,
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

  const pending = activePlan?.phases.find((phase) => phase.status === "pending");
  if (activePlan && pending) {
    return {
      recommendation: pending.title,
      reason: "First pending phase in the active plan.",
      planId: activePlan.id,
      phaseId: pending.id,
      evidence: [activePlan.title],
    };
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

export function findCurrentPhase(plan: Plan | null): PlanPhase | null {
  return (
    plan?.phases.find((phase) => phase.status === "in_progress") ??
    plan?.phases.find((phase) => phase.status === "blocked") ??
    plan?.phases.find((phase) => phase.status === "pending") ??
    null
  );
}
