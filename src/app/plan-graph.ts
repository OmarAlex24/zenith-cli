import { ZenithError } from "../cli/json-output";
import type { PlanPhase } from "../domain/schemas";

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
