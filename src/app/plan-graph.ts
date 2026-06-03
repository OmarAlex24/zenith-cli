import { ZenithError } from "../cli/json-output";
import type { Plan, PlanPath, PlanPathPhase, PlanPhase } from "../domain/schemas";

/**
 * Validates proposed dependency edges for a phase update.
 *
 * Throws a ZenithError on:
 *   - self-reference   (code: "dependency_self")
 *   - unknown phase id (code: "dependency_unknown_phase")
 *   - cycle detected   (code: "dependency_cycle")
 *
 * The cycle check builds the full adjacency map for the plan using each
 * phase's existing dependsOn, except the target phase whose dependsOn is
 * replaced by the proposed `dependsOn` array. A DFS topological sort then
 * detects any cycle in the resulting graph.
 */
export function validatePhaseDependencies(
  phases: ReadonlyArray<Pick<PlanPhase, "id" | "dependsOn">>,
  targetPhaseId: string,
  dependsOn: ReadonlyArray<string>,
): void {
  // 1. Self-reference check
  if (dependsOn.includes(targetPhaseId)) {
    throw new ZenithError(`Phase cannot depend on itself: ${targetPhaseId}`, {
      code: "dependency_self",
      details: { phaseId: targetPhaseId },
    });
  }

  // 2. Unknown phase check
  const phaseIds = new Set(phases.map((p) => p.id));
  const unknownDeps = dependsOn.filter((depId) => !phaseIds.has(depId));
  if (unknownDeps.length > 0) {
    throw new ZenithError(
      `Unknown phase dependencies: ${unknownDeps.join(", ")}`,
      {
        code: "dependency_unknown_phase",
        details: { unknownIds: unknownDeps },
      },
    );
  }

  // 3. Cycle detection via DFS topological sort
  // Build adjacency map: phase id -> set of phase ids it depends on.
  // For the target phase, use the proposed dependsOn; for all others use existing.
  const adj = new Map<string, string[]>();
  for (const phase of phases) {
    if (phase.id === targetPhaseId) {
      adj.set(phase.id, dependsOn.slice());
    } else {
      adj.set(phase.id, phase.dependsOn.slice());
    }
  }

  // DFS: 0 = unvisited, 1 = in-stack, 2 = done
  const state = new Map<string, 0 | 1 | 2>();
  for (const id of phaseIds) {
    state.set(id, 0);
  }

  function dfs(nodeId: string): boolean {
    const nodeState = state.get(nodeId);
    if (nodeState === 2) return false; // already fully explored
    if (nodeState === 1) return true;  // back-edge → cycle

    state.set(nodeId, 1);
    const neighbors = adj.get(nodeId) ?? [];
    for (const neighborId of neighbors) {
      if (dfs(neighborId)) {
        return true;
      }
    }
    state.set(nodeId, 2);
    return false;
  }

  for (const id of phaseIds) {
    if (state.get(id) === 0) {
      if (dfs(id)) {
        throw new ZenithError(
          `Phase dependency graph contains a cycle involving phase: ${targetPhaseId}`,
          {
            code: "dependency_cycle",
            details: { phaseId: targetPhaseId, proposedDependsOn: dependsOn.slice() },
          },
        );
      }
    }
  }
}

/**
 * Computes the topological ordering of plan phases, along with the critical path
 * (longest dependency chain by phase count) and ready flags.
 *
 * - `orderedPhases`: all phases in topological order, with position as tie-breaker.
 * - `criticalPath`: phase ids on the longest dependency chain (by count), stable by position.
 * - `remaining`: number of phases not yet `done`.
 */
export function computePlanPath(plan: Plan): PlanPath {
  const phases = plan.phases;
  const phaseMap = new Map<string, PlanPhase>(phases.map((p) => [p.id, p]));

  // Build reverse adjacency (dep → phases that depend on it)
  const revAdj = new Map<string, string[]>(phases.map((p) => [p.id, []]));
  for (const phase of phases) {
    for (const dep of phase.dependsOn) {
      if (revAdj.has(dep)) {
        revAdj.get(dep)!.push(phase.id);
      }
    }
  }

  // Topological sort (Kahn's) with stable position-based ordering
  const positionIndex = new Map<string, number>(phases.map((p, i) => [p.id, i]));

  // Queue: start with nodes that have no dependencies (inDegree == 0), sorted by position
  const queue: string[] = phases
    .filter((p) => p.dependsOn.length === 0)
    .map((p) => p.id)
    .sort((a, b) => (positionIndex.get(a) ?? 0) - (positionIndex.get(b) ?? 0));

  const sorted: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    // Take next node (already sorted by position)
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    sorted.push(nodeId);

    // Find phases that directly depend on nodeId and whose all deps are now visited
    const dependents = (revAdj.get(nodeId) ?? []).filter((dep) => {
      const phase = phaseMap.get(dep);
      if (!phase) return false;
      return phase.dependsOn.every((d) => visited.has(d));
    });

    // Sort dependents by position for stability
    dependents.sort((a, b) => (positionIndex.get(a) ?? 0) - (positionIndex.get(b) ?? 0));
    queue.push(...dependents);
    // Re-sort queue by position to maintain stable order
    queue.sort((a, b) => (positionIndex.get(a) ?? 0) - (positionIndex.get(b) ?? 0));
  }

  // Append any phases not reached (e.g. nodes in cycles or orphaned) in position order
  for (const phase of phases) {
    if (!visited.has(phase.id)) {
      sorted.push(phase.id);
    }
  }

  // Compute ready flag for each phase
  const orderedPhases: PlanPathPhase[] = sorted.map((phaseId) => {
    const phase = phaseMap.get(phaseId)!;
    const ready = phase.dependsOn.every((depId) => {
      const dep = phaseMap.get(depId);
      return dep !== undefined && dep.status === "done";
    });
    return {
      phaseId: phase.id,
      title: phase.title,
      status: phase.status,
      dependsOn: phase.dependsOn.slice(),
      ready,
    };
  });

  // Compute critical path: longest chain by phase count through the dependency graph.
  // dp[id] = length of longest chain ending at id (counting itself).
  const dp = new Map<string, number>();
  const computeDp = (phaseId: string): number => {
    if (dp.has(phaseId)) return dp.get(phaseId)!;
    const phase = phaseMap.get(phaseId);
    if (!phase || phase.dependsOn.length === 0) {
      dp.set(phaseId, 1);
      return 1;
    }
    const maxDepChain = Math.max(...phase.dependsOn.map(computeDp));
    const val = maxDepChain + 1;
    dp.set(phaseId, val);
    return val;
  };

  for (const phase of phases) {
    computeDp(phase.id);
  }

  // Find maximum chain length
  const maxChainLength = Math.max(...[...dp.values()], 0);

  // Critical path: reconstruct the longest chain, using position as tie-breaker
  const criticalPath: string[] = [];
  if (maxChainLength > 0) {
    // Find the end node(s) of the critical path (nodes with dp = maxChainLength), stable by position
    let currentId = phases
      .filter((p) => dp.get(p.id) === maxChainLength)
      .sort((a, b) => (positionIndex.get(a.id) ?? 0) - (positionIndex.get(b.id) ?? 0))[0]?.id;

    // Walk back through the chain
    const chain: string[] = [];
    while (currentId !== undefined) {
      chain.unshift(currentId);
      const currentPhase = phaseMap.get(currentId);
      if (!currentPhase || currentPhase.dependsOn.length === 0) break;

      // Find the dep with the highest dp value (stable by position)
      const nextId = currentPhase.dependsOn
        .filter((depId) => phaseMap.has(depId))
        .sort((a, b) => {
          const diff = (dp.get(b) ?? 0) - (dp.get(a) ?? 0);
          if (diff !== 0) return diff;
          return (positionIndex.get(a) ?? 0) - (positionIndex.get(b) ?? 0);
        })[0];
      currentId = nextId;
    }
    criticalPath.push(...chain);
  }

  const remaining = phases.filter((p) => p.status !== "done").length;

  return {
    planId: plan.id,
    orderedPhases,
    criticalPath,
    remaining,
  };
}
