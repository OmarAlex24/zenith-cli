import type { Finding, MemoryClaim, Plan, PlanPhase } from "../domain/schemas";
import type { DispatchableWorkItem, DispatchablesResult, DispatchHandoff } from "../domain/schemas";
import { computePlanPath } from "./plan-graph";
import type { FocusState } from "./plan-next";

/**
 * Compute which phases can run in parallel right now, which are blocked,
 * which need review, and whether there are blocking findings.
 *
 * Pure function — no I/O, no Date.now().
 */
export function computeDispatchables(
  plan: Plan | null,
  openFindings: Finding[],
  activeClaims: MemoryClaim[],
  focusState: FocusState,
): DispatchablesResult {
  if (focusState.ambiguous && plan === null) {
    const warnings = focusState.candidates.map(
      (c) => `Ambiguous focus: roadmap "${c.roadmapTitle}" has plan "${c.planTitle}"`,
    );
    return {
      planId: null,
      ambiguous: true,
      parallelGroups: [],
      blocked: [],
      needsReview: [],
      blockingFindings: [],
      warnings,
    };
  }

  if (plan === null) {
    return {
      planId: null,
      ambiguous: false,
      parallelGroups: [],
      blocked: [],
      needsReview: [],
      blockingFindings: [],
      warnings: ["No active plan found."],
    };
  }

  const roadmapId = plan.sourceRoadmapId;
  const blockingFindings = openFindings
    .filter((f) => f.severity === "high" || f.severity === "critical")
    .map((f) => ({ id: f.id, severity: f.severity, title: f.title }));

  const warnings: string[] = [];
  if (blockingFindings.length > 0) {
    warnings.push("Resolve blocking findings before dispatching implementation");
  }

  const { orderedPhases } = computePlanPath(plan);
  const phaseMap = new Map<string, PlanPhase>(plan.phases.map((p) => [p.id, p]));

  const activeClaimsByEntity = new Map<string, MemoryClaim>();
  for (const claim of activeClaims) {
    if (claim.status === "active") {
      activeClaimsByEntity.set(claim.entityId, claim);
    }
  }

  const parallelGroups: DispatchableWorkItem[] = [];
  const blocked: DispatchableWorkItem[] = [];
  const needsReview: DispatchableWorkItem[] = [];

  for (const pathPhase of orderedPhases) {
    const phase = phaseMap.get(pathPhase.phaseId);
    if (!phase) continue;

    if (phase.status === "done") continue;

    if (phase.status === "needs_review") {
      const reviewClaim = activeClaimsByEntity.get(phase.id);
      if (reviewClaim) {
        warnings.push(`Phase ${phase.id} already claimed by ${reviewClaim.owner ?? "unknown"}`);
        continue;
      }
      needsReview.push({
        kind: "review_phase",
        ...(roadmapId ? { roadmapId } : {}),
        planId: plan.id,
        phaseId: phase.id,
        title: phase.title,
        status: phase.status,
        blockedBy: [],
        acceptanceCriteria: phase.acceptanceCriteria.slice(),
      });
      continue;
    }

    const isReady = pathPhase.ready;
    const isInProgress = phase.status === "in_progress";
    const isTodoAndReady = phase.status === "todo" && isReady;

    if (isInProgress || isTodoAndReady) {
      // Check if already claimed
      const existingClaim = activeClaimsByEntity.get(phase.id);
      if (existingClaim) {
        warnings.push(`Phase ${phase.id} already claimed by ${existingClaim.owner ?? "unknown"}`);
        continue;
      }
      parallelGroups.push({
        kind: "implement_phase",
        ...(roadmapId ? { roadmapId } : {}),
        planId: plan.id,
        phaseId: phase.id,
        title: phase.title,
        status: phase.status,
        blockedBy: [],
        acceptanceCriteria: phase.acceptanceCriteria.slice(),
      });
      continue;
    }

    // blocked: status === "blocked" OR (status === "todo" AND !ready)
    const unmetDeps = phase.dependsOn.filter((depId) => {
      const dep = phaseMap.get(depId);
      return dep === undefined || dep.status !== "done";
    });

    blocked.push({
      kind: "blocked_dependency",
      ...(roadmapId ? { roadmapId } : {}),
      planId: plan.id,
      phaseId: phase.id,
      title: phase.title,
      status: phase.status,
      blockedBy: unmetDeps,
      acceptanceCriteria: phase.acceptanceCriteria.slice(),
    });
  }

  return {
    planId: plan.id,
    ambiguous: false,
    parallelGroups,
    blocked,
    needsReview,
    blockingFindings,
    warnings,
  };
}

/**
 * Build an implementer prompt for a specific phase.
 * Pure function — reads only from plan and phase args.
 */
export function buildImplementerPrompt(plan: Plan, phase: PlanPhase): string {
  const lines: string[] = [
    `# Implementer Prompt`,
    ``,
    `**Role:** implementer`,
    ``,
    `## Plan`,
    `- Title: ${plan.title}`,
    `- Plan ID: ${plan.id}`,
    ``,
    `## Phase`,
    `- Phase ID: ${phase.id}`,
    `- Title: ${phase.title}`,
  ];

  if (phase.description) {
    lines.push(`- Description: ${phase.description}`);
  }

  lines.push(`- Status: ${phase.status}`);

  if (phase.dependsOn.length > 0) {
    lines.push(`- Depends on: ${phase.dependsOn.join(", ")}`);
  }

  if (phase.acceptanceCriteria.length > 0) {
    lines.push(``, `## Acceptance Criteria`);
    for (const criterion of phase.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
  }

  lines.push(
    ``,
    `## When Done`,
    `Verify the acceptance criteria above, then run:`,
    `  zenith agent stage set --input - <<< '{"stage":"review","planId":"${plan.id}","phaseId":"${phase.id}"}'`,
    `to hand off this phase to the reviewer.`,
  );

  return lines.join("\n");
}

/**
 * Build a reviewer prompt for a specific phase.
 * Pure function — reads only from plan and phase args.
 */
export function buildReviewerPrompt(plan: Plan, phase: PlanPhase): string {
  const lines: string[] = [
    `# Reviewer Prompt`,
    ``,
    `**Role:** reviewer`,
    ``,
    `## Plan`,
    `- Title: ${plan.title}`,
    `- Plan ID: ${plan.id}`,
    ``,
    `## Phase`,
    `- Phase ID: ${phase.id}`,
    `- Title: ${phase.title}`,
  ];

  if (phase.description) {
    lines.push(`- Description: ${phase.description}`);
  }

  lines.push(`- Status: ${phase.status}`);

  if (phase.dependsOn.length > 0) {
    lines.push(`- Depends on: ${phase.dependsOn.join(", ")}`);
  }

  if (phase.acceptanceCriteria.length > 0) {
    lines.push(``, `## Acceptance Criteria`);
    for (const criterion of phase.acceptanceCriteria) {
      lines.push(`- ${criterion}`);
    }
  }

  lines.push(
    ``,
    `## When Done`,
    `Review the diff for this phase. If the implementation is clean and all acceptance criteria pass, advance the plan:`,
    `  zenith plan advance --json --input - <<< '{"planId":"${plan.id}","completedPhaseId":"${phase.id}"}'`,
  );

  return lines.join("\n");
}

/**
 * Produce a deterministic branch-name suggestion from a phase.
 * Pure function.
 */
export function slugifyPhase(phase: PlanPhase): string {
  const slug = phase.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const normalized = slug.startsWith("phase-") ? slug.slice(6) : slug;
  return `phase-${normalized}`;
}

/**
 * Build a single implementer DispatchHandoff from a work item.
 */
export function buildImplementerHandoff(plan: Plan, item: DispatchableWorkItem): DispatchHandoff {
  const phase = plan.phases.find((p) => p.id === item.phaseId);
  if (!phase) {
    throw new Error(`Phase not found in plan: ${item.phaseId}`);
  }
  const prompt = buildImplementerPrompt(plan, phase);
  const branch = slugifyPhase(phase);
  const suggestedClaim = `phase:${phase.id}`;

  return {
    kind: item.kind,
    ...(item.roadmapId ? { roadmapId: item.roadmapId } : {}),
    planId: plan.id,
    phaseId: phase.id,
    title: phase.title,
    role: "implementer",
    scope: ".",
    suggestedClaim,
    prompt,
    suggestedCommands: [
      `zenith agent claim create ${phase.id} --scope . --role implementer`,
      `zenith phase show ${phase.id} --json`,
      `bun x tsc --noEmit`,
      `bun test`,
      `zenith agent stage set --input - <<< '{"stage":"review","planId":"${plan.id}","phaseId":"${phase.id}"}'`,
    ],
    acceptanceCriteria: item.acceptanceCriteria.slice(),
    branchSuggestion: branch,
  };
}

/**
 * Build a single reviewer DispatchHandoff from a work item.
 */
export function buildReviewerHandoff(plan: Plan, item: DispatchableWorkItem): DispatchHandoff {
  const phase = plan.phases.find((p) => p.id === item.phaseId);
  if (!phase) {
    throw new Error(`Phase not found in plan: ${item.phaseId}`);
  }
  const prompt = buildReviewerPrompt(plan, phase);
  const branch = slugifyPhase(phase);
  const suggestedClaim = `phase:${phase.id}`;

  return {
    kind: item.kind,
    ...(item.roadmapId ? { roadmapId: item.roadmapId } : {}),
    planId: plan.id,
    phaseId: phase.id,
    title: phase.title,
    role: "reviewer",
    scope: ".",
    suggestedClaim,
    prompt,
    suggestedCommands: [
      `zenith agent claim create ${phase.id} --scope . --role reviewer`,
      `zenith phase show ${phase.id} --json`,
      `zenith plan advance --json --input - <<< '{"planId":"${plan.id}","completedPhaseId":"${phase.id}"}'`,
    ],
    acceptanceCriteria: item.acceptanceCriteria.slice(),
    branchSuggestion: branch,
  };
}
