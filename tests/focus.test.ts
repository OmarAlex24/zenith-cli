import { describe, expect, test } from "bun:test";
import { resolveActivePlan } from "../src/app/focus";
import type { Plan, Roadmap } from "../src/domain/schemas";

function makePlan(id: string, sourceRoadmapId?: string): Plan {
  return {
    id,
    projectId: "proj_1",
    title: `Plan ${id}`,
    status: "active",
    ...(sourceRoadmapId ? { sourceRoadmapId } : {}),
    phases: [{ id: `${id}_ph`, title: "Phase", status: "todo", acceptanceCriteria: [], evidence: [], dependsOn: [] }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRoadmap(id: string, title: string): Roadmap {
  return {
    id,
    projectId: "proj_1",
    title,
    status: "active",
    items: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveActivePlan", () => {
  test("returns the single active plan when there is no focus and no ambiguity", () => {
    const plan = makePlan("plan_1", "rm_1");
    const result = resolveActivePlan({ roadmaps: [makeRoadmap("rm_1", "A")], activePlans: [plan], focusRoadmapId: null });
    expect(result.ambiguous).toBe(false);
    expect(result.activePlan?.id).toBe("plan_1");
  });

  test("returns null and ambiguous=true when multiple roadmaps have active plans and no focus", () => {
    const plans = [makePlan("plan_a", "rm_a"), makePlan("plan_b", "rm_b")];
    const roadmaps = [makeRoadmap("rm_a", "Alpha"), makeRoadmap("rm_b", "Beta")];
    const result = resolveActivePlan({ roadmaps, activePlans: plans, focusRoadmapId: null });
    expect(result.ambiguous).toBe(true);
    expect(result.activePlan).toBeNull();
    expect(result.candidates.map((c) => c.roadmapTitle).sort()).toEqual(["Alpha", "Beta"]);
  });

  test("focus selects the plan of the bound roadmap", () => {
    const plans = [makePlan("plan_a", "rm_a"), makePlan("plan_b", "rm_b")];
    const roadmaps = [makeRoadmap("rm_a", "Alpha"), makeRoadmap("rm_b", "Beta")];
    const result = resolveActivePlan({ roadmaps, activePlans: plans, focusRoadmapId: "rm_b" });
    expect(result.ambiguous).toBe(false);
    expect(result.activePlan?.id).toBe("plan_b");
  });

  test("focus on a roadmap without an active plan returns null without ambiguity", () => {
    const plans = [makePlan("plan_a", "rm_a")];
    const roadmaps = [makeRoadmap("rm_a", "Alpha"), makeRoadmap("rm_b", "Beta")];
    const result = resolveActivePlan({ roadmaps, activePlans: plans, focusRoadmapId: "rm_b" });
    expect(result.ambiguous).toBe(false);
    expect(result.activePlan).toBeNull();
  });

  test("no active plans returns null without ambiguity", () => {
    const result = resolveActivePlan({ roadmaps: [], activePlans: [], focusRoadmapId: null });
    expect(result.ambiguous).toBe(false);
    expect(result.activePlan).toBeNull();
  });
});
