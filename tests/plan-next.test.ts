import { describe, expect, test } from "bun:test";
import { computeNext } from "../src/app/plan-next";
import type { Finding, Plan, PlanPhase, Roadmap, Session } from "../src/domain/schemas";

// ---------------------------------------------------------------------------
// Minimal fixture factories
// ---------------------------------------------------------------------------

function makePhase(overrides: Partial<PlanPhase> & { id: string; title: string; status: PlanPhase["status"] }): PlanPhase {
  return {
    acceptanceCriteria: [],
    evidence: [],
    dependsOn: [],
    ...overrides,
  };
}

function makePlan(
  overrides: Partial<Plan> & { id: string; title: string; phases: PlanPhase[] },
): Plan {
  return {
    projectId: "proj_1",
    description: undefined,
    status: "active",
    priority: undefined,
    sourceRoadmapId: undefined,
    sourceRoadmapItemId: undefined,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeFinding(
  overrides: Partial<Finding> & { id: string; title: string; severity: Finding["severity"] },
): Pick<Finding, "id" | "severity" | "title"> {
  return { id: overrides.id, severity: overrides.severity, title: overrides.title };
}

function makeSession(overrides: Partial<Session> & { id: string }): Session {
  return {
    projectId: "proj_1",
    startedAt: "2024-01-01T00:00:00.000Z",
    changedFiles: [],
    nextSteps: [],
    ...overrides,
  };
}

function makeRoadmap(
  overrides: Partial<Roadmap> & { id: string; title: string; items: Roadmap["items"] },
): Roadmap {
  return {
    projectId: "proj_1",
    description: undefined,
    status: "active",
    sourcePlanId: undefined,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeRoadmapItem(
  overrides: Partial<Roadmap["items"][number]> & {
    id: string;
    title: string;
    status: Roadmap["items"][number]["status"];
  },
): Roadmap["items"][number] {
  return {
    roadmapId: "roadmap_1",
    description: undefined,
    justification: undefined,
    evidence: [],
    sourcePhaseId: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — one per branch, in order
// ---------------------------------------------------------------------------

describe("computeNext — characterization tests", () => {
  test("1. blocking high-severity finding takes highest priority", () => {
    const finding = makeFinding({ id: "finding_high_1", title: "Critical memory leak", severity: "high" });
    const plan = makePlan({
      id: "plan_1",
      title: "Active Plan",
      phases: [makePhase({ id: "phase_1", title: "Phase One", status: "in_progress" })],
    });

    const result = computeNext(plan, [], [finding]);

    expect(result.recommendation).toBe("Review finding: Critical memory leak");
    expect(result.reason).toBe("Open high-severity finding should be handled before advancing the plan.");
    expect(result.evidence).toEqual(["finding_high_1"]);
  });

  test("1b. blocking critical-severity finding also takes highest priority", () => {
    const finding = makeFinding({ id: "finding_crit_1", title: "Auth bypass vulnerability", severity: "critical" });

    const result = computeNext(null, [], [finding]);

    expect(result.recommendation).toBe("Review finding: Auth bypass vulnerability");
    expect(result.reason).toBe("Open high-severity finding should be handled before advancing the plan.");
    expect(result.evidence).toEqual(["finding_crit_1"]);
  });

  test("2. active plan with in_progress phase", () => {
    const phase = makePhase({ id: "phase_ip_1", title: "Build Auth Module", status: "in_progress" });
    const plan = makePlan({ id: "plan_ip_1", title: "Auth Plan", phases: [phase] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Build Auth Module");
    expect(result.reason).toBe("Active plan has an in-progress phase.");
    expect(result.planId).toBe("plan_ip_1");
    expect(result.phaseId).toBe("phase_ip_1");
    expect(result.evidence).toEqual(["Auth Plan"]);
  });

  test("3. active plan with blocked phase (no in_progress)", () => {
    const blocked = makePhase({ id: "phase_blk_1", title: "Integrate Payment API", status: "blocked" });
    const done = makePhase({ id: "phase_done_1", title: "Setup DB", status: "done" });
    const plan = makePlan({ id: "plan_blk_1", title: "Payment Plan", phases: [done, blocked] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Unblock phase: Integrate Payment API");
    expect(result.reason).toBe("Active plan has a blocked phase.");
    expect(result.planId).toBe("plan_blk_1");
    expect(result.phaseId).toBe("phase_blk_1");
    expect(result.evidence).toEqual(["Payment Plan"]);
  });

  test("4. active plan with todo phase (no in_progress or blocked)", () => {
    const done = makePhase({ id: "phase_done_2", title: "Bootstrap Project", status: "done" });
    const todo = makePhase({ id: "phase_todo_1", title: "Write Unit Tests", status: "todo" });
    const plan = makePlan({ id: "plan_todo_1", title: "Testing Plan", phases: [done, todo] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Write Unit Tests");
    expect(result.reason).toBe("First ready todo phase in the active plan.");
    expect(result.planId).toBe("plan_todo_1");
    expect(result.phaseId).toBe("phase_todo_1");
    expect(result.evidence).toEqual(["Testing Plan"]);
  });

  test("5. no active plan + active roadmap with in_progress item", () => {
    const item = makeRoadmapItem({ id: "item_ip_1", roadmapId: "roadmap_a", title: "MVP 5 - PR Review Skill", status: "in_progress" });
    const roadmap = makeRoadmap({ id: "roadmap_a", title: "Product Roadmap", items: [item], status: "active" });

    const result = computeNext(null, [], [], [roadmap]);

    expect(result.recommendation).toBe("Create plan from roadmap: MVP 5 - PR Review Skill");
    expect(result.reason).toContain("active roadmap");
    expect(result.evidence).toEqual(["roadmap_a", "item_ip_1"]);
  });

  test("5b. no active plan + active roadmap with todo item", () => {
    const done = makeRoadmapItem({ id: "item_done_1", roadmapId: "roadmap_b", title: "MVP 4 - Foundation", status: "done" });
    const todo = makeRoadmapItem({ id: "item_todo_1", roadmapId: "roadmap_b", title: "MVP 4.5 - Hardening", status: "todo" });
    const roadmap = makeRoadmap({ id: "roadmap_b", title: "Product Roadmap 2", items: [done, todo], status: "active" });

    const result = computeNext(null, [], [], [roadmap]);

    expect(result.recommendation).toBe("Create plan from roadmap: MVP 4.5 - Hardening");
    expect(result.evidence).toEqual(["roadmap_b", "item_todo_1"]);
  });

  test("6. no active plan + active roadmap whose only actionable item is deferred", () => {
    const done = makeRoadmapItem({ id: "item_done_2", roadmapId: "roadmap_c", title: "MVP 4 - Done", status: "done" });
    const deferred = makeRoadmapItem({ id: "item_def_1", roadmapId: "roadmap_c", title: "MVP 5 - Deferred Feature", status: "deferred" });
    const roadmap = makeRoadmap({ id: "roadmap_c", title: "Deferred Roadmap", items: [done, deferred], status: "active" });

    const result = computeNext(null, [], [], [roadmap]);

    expect(result.recommendation).toBe("Review deferred roadmap work: MVP 5 - Deferred Feature");
    expect(result.reason).toContain("reactivate");
    expect(result.evidence).toEqual(["roadmap_c", "item_def_1"]);
  });

  test("7. no active plan + low-severity finding with no actionable roadmap", () => {
    const finding = makeFinding({ id: "finding_low_1", title: "Missing docstrings", severity: "low" });

    const result = computeNext(null, [], [finding], []);

    expect(result.recommendation).toBe("Review finding: Missing docstrings");
    expect(result.reason).toBe("No active plan exists; open findings remain before new work is selected.");
    expect(result.evidence).toEqual(["finding_low_1"]);
  });

  test("8. session with explicit nextSteps when nothing higher-priority exists", () => {
    const session = makeSession({ id: "session_1", nextSteps: ["Refactor the database layer"] });

    const result = computeNext(null, [session], [], []);

    expect(result.recommendation).toBe("Refactor the database layer");
    expect(result.reason).toBe("Latest session included an explicit next step.");
    expect(result.evidence).toContain("session_1");
  });

  test("9a. fallback: active plan with all phases done", () => {
    const done1 = makePhase({ id: "phase_d1", title: "Phase A", status: "done" });
    const done2 = makePhase({ id: "phase_d2", title: "Phase B", status: "done" });
    const plan = makePlan({ id: "plan_done_1", title: "Completed Plan", phases: [done1, done2] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Review completed active plan");
  });

  test("9b. fallback: null plan with nothing else", () => {
    const result = computeNext(null, [], [], []);

    expect(result.recommendation).toBe("Create an active plan");
  });

  test("options param is accepted without affecting output (forward-compatible seam)", () => {
    const result = computeNext(null, [], [], [], { now: "2025-01-01T00:00:00.000Z", staleAfterDays: 7, top: 3 });

    expect(result.recommendation).toBe("Create an active plan");
  });

  // ---------------------------------------------------------------------------
  // Dependency-aware todo branch
  // ---------------------------------------------------------------------------

  test("10a. first todo has unmet dep but a later todo is ready → recommend the ready one", () => {
    const done = makePhase({ id: "phase_d", title: "Setup", status: "done" });
    const gated = makePhase({ id: "phase_g", title: "Gated Phase", status: "todo", dependsOn: ["phase_missing"] });
    const ready = makePhase({ id: "phase_r", title: "Ready Phase", status: "todo", dependsOn: ["phase_d"] });
    const plan = makePlan({ id: "plan_dep_a", title: "Dep Plan A", phases: [done, gated, ready] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Ready Phase");
    expect(result.reason).toBe("First ready todo phase in the active plan.");
    expect(result.phaseId).toBe("phase_r");
  });

  test("10b. all todo phases gated → recommendation starts with 'Blocked by dependency:' and blockedBy lists unmet ids", () => {
    const todo1 = makePhase({ id: "phase_t1", title: "Phase T1", status: "todo", dependsOn: ["phase_missing_1"] });
    const todo2 = makePhase({ id: "phase_t2", title: "Phase T2", status: "todo", dependsOn: ["phase_missing_2"] });
    const plan = makePlan({ id: "plan_dep_b", title: "Dep Plan B", phases: [todo1, todo2] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toMatch(/^Blocked by dependency:/);
    expect(result.blockedBy).toBeDefined();
    expect(result.blockedBy).toContain("phase_missing_1");
  });

  test("10c. todo phase whose all deps are done → recommended normally with correct reason (regression)", () => {
    const dep = makePhase({ id: "phase_dep_done", title: "Dependency Phase", status: "done" });
    const todo = makePhase({ id: "phase_main", title: "Main Work", status: "todo", dependsOn: ["phase_dep_done"] });
    const plan = makePlan({ id: "plan_dep_c", title: "Dep Plan C", phases: [dep, todo] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Main Work");
    expect(result.reason).toBe("First ready todo phase in the active plan.");
    expect(result.phaseId).toBe("phase_main");
  });

  test("10d. phases with empty dependsOn behave exactly as before", () => {
    const done = makePhase({ id: "phase_done_x", title: "Bootstrap", status: "done" });
    const todo = makePhase({ id: "phase_todo_x", title: "Build Features", status: "todo", dependsOn: [] });
    const plan = makePlan({ id: "plan_dep_d", title: "Dep Plan D", phases: [done, todo] });

    const result = computeNext(plan, [], []);

    expect(result.recommendation).toBe("Build Features");
    expect(result.reason).toBe("First ready todo phase in the active plan.");
    expect(result.phaseId).toBe("phase_todo_x");
    expect(result.evidence).toEqual(["Dep Plan D"]);
  });
});
