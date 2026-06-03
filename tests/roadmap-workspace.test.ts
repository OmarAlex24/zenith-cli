import { describe, expect, test } from "bun:test";
import { buildRoadmapWorkspace } from "../src/app/roadmap-workspace";
import type { Plan, Roadmap } from "../src/domain/schemas";

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan_1",
    projectId: "proj_1",
    title: "Plan One",
    status: "active",
    phases: [
      { id: "ph_1", title: "P1", status: "done", acceptanceCriteria: [], evidence: [], dependsOn: [] },
      { id: "ph_2", title: "P2", status: "todo", acceptanceCriteria: [], evidence: [], dependsOn: [] },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRoadmap(overrides: Partial<Roadmap> = {}): Roadmap {
  return {
    id: "rm_1",
    projectId: "proj_1",
    title: "Roadmap One",
    status: "active",
    items: [
      { id: "rmi_1", roadmapId: "rm_1", title: "Item 1", status: "in_progress", evidence: [] },
      { id: "rmi_2", roadmapId: "rm_1", title: "Item 2", status: "done", evidence: [] },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildRoadmapWorkspace", () => {
  test("links plans to items and computes rollups", () => {
    const roadmap = makeRoadmap();
    const plan = makePlan({ sourceRoadmapId: "rm_1", sourceRoadmapItemId: "rmi_1" });
    const workspace = buildRoadmapWorkspace([roadmap], [plan], null);

    expect(workspace.groups).toHaveLength(1);
    const group = workspace.groups[0]!;
    expect(group.roadmapId).toBe("rm_1");
    expect(group.itemProgress).toEqual({ done: 1, total: 2 });

    const linkedItem = group.items.find((entry) => entry.item.id === "rmi_1")!;
    expect(linkedItem.linkedPlans.map((p) => p.id)).toEqual(["plan_1"]);
    expect(linkedItem.phaseProgress).toEqual({ done: 1, total: 2 });

    const unlinkedItem = group.items.find((entry) => entry.item.id === "rmi_2")!;
    expect(unlinkedItem.linkedPlans).toHaveLength(0);
    expect(unlinkedItem.phaseProgress).toEqual({ done: 0, total: 0 });
  });

  test("collects plans without a roadmap into an Unlinked plans group", () => {
    const roadmap = makeRoadmap();
    const standalone = makePlan({ id: "plan_solo", title: "Solo" });
    const workspace = buildRoadmapWorkspace([roadmap], [standalone], null);

    const unlinked = workspace.groups.find((group) => group.roadmapId === null)!;
    expect(unlinked.title).toBe("Unlinked plans");
    expect(unlinked.status).toBe("standalone");
    expect(unlinked.standalonePlans.map((p) => p.id)).toEqual(["plan_solo"]);
  });

  test("marks the focused roadmap", () => {
    const workspace = buildRoadmapWorkspace([makeRoadmap()], [], "rm_1");
    expect(workspace.groups[0]!.isFocused).toBe(true);
  });

  test("does not create an Unlinked group when every plan is linked", () => {
    const roadmap = makeRoadmap();
    const plan = makePlan({ sourceRoadmapId: "rm_1", sourceRoadmapItemId: "rmi_1" });
    const workspace = buildRoadmapWorkspace([roadmap], [plan], null);
    expect(workspace.groups.some((group) => group.roadmapId === null)).toBe(false);
  });
});
