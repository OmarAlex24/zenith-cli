import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createZenithApp } from "../src/app/factory";
import { openDecodeDatabase, openZenithDatabase } from "../src/storage/database";
import { getDatabasePath, getZenithHome } from "../src/storage/paths";
import { ZenithRepository } from "../src/storage/repository";
import { cleanupTempDir, makeTempDir } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("sqlite repository", () => {
  test("uses Zenith home and database naming by default", () => {
    const originalHome = Bun.env.HOME;
    const originalZenithHome = Bun.env.ZENITH_HOME;
    const originalDecodeHome = Bun.env.DECODE_HOME;
    const homeRoot = makeTempDir();
    tempDirs.push(homeRoot);

    try {
      Bun.env.HOME = homeRoot;
      delete Bun.env.ZENITH_HOME;
      delete Bun.env.DECODE_HOME;

      expect(getZenithHome()).toBe(join(homeRoot, ".zenith"));
      expect(getDatabasePath()).toBe(join(homeRoot, ".zenith", "zenith.db"));
    } finally {
      restoreEnv("HOME", originalHome);
      restoreEnv("ZENITH_HOME", originalZenithHome);
      restoreEnv("DECODE_HOME", originalDecodeHome);
    }
  });

  test("uses legacy decode home only as a fallback", () => {
    const originalHome = Bun.env.HOME;
    const originalZenithHome = Bun.env.ZENITH_HOME;
    const originalDecodeHome = Bun.env.DECODE_HOME;
    const homeRoot = makeTempDir();
    tempDirs.push(homeRoot);

    try {
      Bun.env.HOME = homeRoot;
      delete Bun.env.ZENITH_HOME;
      delete Bun.env.DECODE_HOME;
      mkdirSync(join(homeRoot, ".decode"), { recursive: true });

      expect(getZenithHome()).toBe(join(homeRoot, ".decode"));
      expect(getDatabasePath()).toBe(join(homeRoot, ".decode", "decode.db"));
    } finally {
      restoreEnv("HOME", originalHome);
      restoreEnv("ZENITH_HOME", originalZenithHome);
      restoreEnv("DECODE_HOME", originalDecodeHome);
    }
  });

  test("ZENITH_HOME takes precedence over legacy DECODE_HOME", () => {
    const originalZenithHome = Bun.env.ZENITH_HOME;
    const originalDecodeHome = Bun.env.DECODE_HOME;
    const zenithHome = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(zenithHome, decodeHome);

    try {
      Bun.env.ZENITH_HOME = zenithHome;
      Bun.env.DECODE_HOME = decodeHome;

      expect(getZenithHome()).toBe(zenithHome);
      expect(getDatabasePath()).toBe(join(zenithHome, "zenith.db"));
    } finally {
      restoreEnv("ZENITH_HOME", originalZenithHome);
      restoreEnv("DECODE_HOME", originalDecodeHome);
    }
  });

  test("explicit storage options prefer zenithHome and preserve decodeHome compatibility", () => {
    const root = makeTempDir();
    const zenithHome = join(root, ".zenith");
    const decodeHome = join(root, ".decode");
    tempDirs.push(root);

    expect(getDatabasePath({ zenithHome, decodeHome })).toBe(join(zenithHome, "zenith.db"));
    expect(getDatabasePath({ decodeHome })).toBe(join(decodeHome, "decode.db"));

    const db = openZenithDatabase({ zenithHome });
    db.close();
    expect(existsSync(join(zenithHome, "zenith.db"))).toBe(true);
  });

  test("runs migrations and registers a project", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);

    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
      repositoryUrl: "git@example.com:zenith/meridian.git",
      branch: "main",
    });

    expect(project.name).toBe("meridian");
    expect(repo.findProjectByRootPath("/work/meridian")?.id).toBe(project.id);
    repo.close();
  });

  test("records, lists, and finds decisions by project", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const firstProject = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });
    const secondProject = repo.registerProject({
      name: "atlas",
      rootPath: "/work/atlas",
    });

    const firstDecision = repo.recordDecision({
      projectId: firstProject.id,
      title: "Use local SQLite",
      context: "Project memory must stay local.",
      decision: "Store project memory in SQLite.",
      consequences: "State is queryable without external services.",
      alternatives: ["JSON files"],
      relatedPlanIds: ["plan_memory"],
    });
    const secondDecision = repo.recordDecision({
      projectId: secondProject.id,
      title: "Use remote API",
      context: "Second project has different constraints.",
      decision: "Store project memory remotely.",
      alternatives: [],
      relatedPlanIds: [],
    });

    const firstProjectDecisions = repo.listDecisions(firstProject.id);

    expect(firstProjectDecisions).toHaveLength(1);
    expect(firstProjectDecisions[0]?.id).toBe(firstDecision.id);
    expect(firstProjectDecisions[0]?.title).toBe("Use local SQLite");
    expect(firstProjectDecisions[0]?.alternatives).toEqual(["JSON files"]);
    expect(repo.getDecisionById(firstDecision.id)?.decision).toBe("Store project memory in SQLite.");
    expect(repo.getDecisionById(secondDecision.id)?.projectId).toBe(secondProject.id);
    expect(repo.getDecisionById("dec_missing")).toBeNull();
    repo.close();
  });

  test("records, lists, and closes findings by project", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });

    const finding = repo.recordFinding({
      projectId: project.id,
      type: "bug",
      severity: "high",
      title: "Missing lifecycle command",
      description: "Agents cannot close operational findings yet.",
      relatedFiles: ["src/cli/program.ts"],
    });

    expect(repo.listFindings(project.id)).toHaveLength(1);
    expect(repo.listOpenFindings(project.id)[0]?.id).toBe(finding.id);
    expect(repo.getFindingById(finding.id)?.relatedFiles).toEqual(["src/cli/program.ts"]);

    const closed = repo.closeFinding(finding.id);

    expect(closed.status).toBe("closed");
    expect(closed.closedAt).toBeTruthy();
    expect(repo.listOpenFindings(project.id)).toEqual([]);
    expect(repo.listFindings(project.id, "closed")[0]?.id).toBe(finding.id);
    repo.close();
  });

  test("v6 migration adds related_plan_id and related_phase_id columns to findings", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });

    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(findings)")
      .all()
      .map((col) => col.name);

    expect(columns).toContain("related_plan_id");
    expect(columns).toContain("related_phase_id");
    db.close();
  });

  test("recordFinding with relatedPlanId and relatedPhaseId round-trips correctly", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });
    const plan = repo.createPlan({
      projectId: project.id,
      title: "Linked plan",
      status: "active",
      phases: [{ title: "Phase Alpha", status: "todo", acceptanceCriteria: [], evidence: [] }],
    });
    const phaseId = plan.phases[0]!.id;

    const linkedFinding = repo.recordFinding({
      projectId: project.id,
      type: "risk",
      severity: "medium",
      title: "Finding linked to plan",
      description: "This finding is linked to a plan and phase.",
      relatedFiles: [],
      relatedPlanId: plan.id,
      relatedPhaseId: phaseId,
    });

    const fetched = repo.getFindingById(linkedFinding.id);
    expect(fetched?.relatedPlanId).toBe(plan.id);
    expect(fetched?.relatedPhaseId).toBe(phaseId);
    repo.close();
  });

  test("recordFinding without relatedPlanId/relatedPhaseId reads back without those fields", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });

    const finding = repo.recordFinding({
      projectId: project.id,
      type: "bug",
      severity: "low",
      title: "Unlinked finding",
      description: "No plan or phase link.",
      relatedFiles: [],
    });

    const fetched = repo.getFindingById(finding.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.relatedPlanId).toBeUndefined();
    expect(fetched?.relatedPhaseId).toBeUndefined();
    repo.close();
  });

  test("starts, captures, and ends sessions", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });

    const started = repo.startSession({
      projectId: project.id,
      startedAt: "2026-01-01T00:00:00.000Z",
      branch: "main",
      changedFiles: ["src/index.ts"],
      nextSteps: ["Capture progress"],
    });

    expect(started.endedAt).toBeUndefined();
    expect(started.changedFiles).toEqual(["src/index.ts"]);

    const captured = repo.captureSession(started.id, {
      summary: "Implemented most lifecycle commands.",
      nextSteps: ["Run verification"],
    });

    expect(captured.summary).toBe("Implemented most lifecycle commands.");
    expect(captured.nextSteps).toEqual(["Run verification"]);
    expect(captured.endedAt).toBeUndefined();

    const ended = repo.endSession(started.id, {
      endedAt: "2026-01-01T01:00:00.000Z",
      changedFiles: ["src/index.ts", "tests/storage.test.ts"],
      nextSteps: ["Record evidence"],
    });

    expect(ended.endedAt).toBe("2026-01-01T01:00:00.000Z");
    expect(ended.changedFiles).toEqual(["src/index.ts", "tests/storage.test.ts"]);
    expect(ended.nextSteps).toEqual(["Record evidence"]);
    repo.close();
  });

  test("creates a plan and computes deterministic next step", async () => {
    const workspace = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(workspace, zenithHome);
    const services = createZenithApp({ cwd: workspace, zenithHome });

    await services.app.registerProject();
    const plan = await services.app.createPlan({
      title: "Integration Lifecycle v1",
      phases: [{ title: "DB schema" }, { title: "Manual sync" }],
    });
    const next = await services.app.nextPlanStep();

    expect(plan.phases).toHaveLength(2);
    expect(next.recommendation).toBe("DB schema");
    expect(next.reason).toContain("First ready todo phase");
    services.close();
  });

  test("phase update appends evidence", async () => {
    const workspace = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(workspace, zenithHome);
    const services = createZenithApp({ cwd: workspace, zenithHome });

    await services.app.registerProject();
    const plan = await services.app.createPlan({
      title: "Plan",
      phases: [{ title: "Phase 1" }],
    });

    const updated = await services.app.updatePhase(plan.id, {
      phaseTitle: "Phase 1",
      status: "done",
      evidence: [{ kind: "note", value: "Tests pass" }],
    });

    expect(updated.phases[0]?.status).toBe("done");
    expect(updated.phases[0]?.evidence[0]?.value).toBe("Tests pass");
    services.close();
  });

  test("updates plan metadata", async () => {
    const workspace = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(workspace, zenithHome);
    const services = createZenithApp({ cwd: workspace, zenithHome });

    await services.app.registerProject();
    const plan = await services.app.createPlan({
      title: "Old name",
      phases: [{ title: "Phase 1" }],
    });

    const updated = await services.app.updatePlan(plan.id, {
      title: "Zenith CLI Roadmap",
      description: "Updated product name.",
      priority: "high",
    });

    expect(updated.title).toBe("Zenith CLI Roadmap");
    expect(updated.description).toBe("Updated product name.");
    expect(updated.priority).toBe("high");
    services.close();
  });

  test("roadmap item justification is stored and updated", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });

    const roadmap = repo.createRoadmap({
      projectId: project.id,
      title: "Product Roadmap",
      status: "active",
      items: [
        {
          title: "MVP 4.5 - Product And Architecture Hardening",
          status: "done",
          justification: "Hardening was inserted before advanced skills.",
          evidence: [],
        },
      ],
    });
    const added = repo.addRoadmapItem(roadmap.id, {
      title: "MVP 4.75 - Operational Memory Polish",
      status: "todo",
      justification: "Memory must be reliable before review skills.",
      evidence: [],
      afterItemId: roadmap.items[0]!.id,
    });
    const updated = repo.updateRoadmapItem(
      roadmap.id,
      { itemId: added.items[1]!.id },
      { justification: "Memory operations need auditability before review skills." },
    );

    expect(roadmap.items[0]?.justification).toBe("Hardening was inserted before advanced skills.");
    expect(added.items[1]?.justification).toBe("Memory must be reliable before review skills.");
    expect(updated.items[1]?.justification).toBe("Memory operations need auditability before review skills.");
    repo.close();
  });

  test("database enforces active plan uniqueness and status constraints", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });

    repo.createPlan({
      projectId: project.id,
      title: "Active plan",
      status: "active",
      phases: [{ title: "Phase 1", status: "todo", acceptanceCriteria: [], evidence: [] }],
    });

    expect(() =>
      repo.createPlan({
        projectId: project.id,
        title: "Competing active plan",
        status: "active",
        phases: [{ title: "Phase 1", status: "todo", acceptanceCriteria: [], evidence: [] }],
      }),
    ).toThrow();
    expect(() =>
      db
        .query(
          `
          INSERT INTO plans (id, project_id, title, status, created_at, updated_at)
          VALUES ('plan_invalid', ?, 'Invalid', 'bogus', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        `,
        )
        .run(project.id),
    ).toThrow("invalid plans.status");
    repo.close();
  });

  test("roadmap source foreign keys and compound import rollback are enforced", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({
      name: "meridian",
      rootPath: "/work/meridian",
    });
    const plan = repo.createPlan({
      projectId: project.id,
      title: "Paused implementation plan",
      status: "paused",
      phases: [{ title: "Phase 1", status: "todo", acceptanceCriteria: [], evidence: [] }],
    });

    expect(() =>
      repo.createPlan({
        projectId: project.id,
        title: "Invalid source plan",
        status: "paused",
        sourceRoadmapId: "roadmap_missing",
        sourceRoadmapItemId: "rmi_missing",
        phases: [{ title: "Phase 1", status: "todo", acceptanceCriteria: [], evidence: [] }],
      }),
    ).toThrow();

    const malformedPlan = {
      ...plan,
      phases: [{ ...plan.phases[0]!, id: "phase_missing" }],
    };

    expect(() => repo.importPlanAsRoadmap(malformedPlan, { status: "active", archivePlan: true })).toThrow(
      "invalid roadmap_items.source_phase_id",
    );
    expect(repo.listRoadmaps(project.id)).toEqual([]);
    expect(repo.getPlanById(plan.id)?.status).toBe("paused");
    repo.close();
  });

  test("listEvents returns events newest-first, respects limit, and isolates by project", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);

    // Two projects — registerProject writes a project.registered event for each
    const projectA = repo.registerProject({ name: "alpha", rootPath: "/work/alpha" });
    const projectB = repo.registerProject({ name: "beta", rootPath: "/work/beta" });

    // Generate extra events for projectA by recording a decision and a finding
    repo.recordDecision({
      projectId: projectA.id,
      title: "Use SQLite",
      context: "Need local storage.",
      decision: "SQLite.",
      alternatives: [],
      relatedPlanIds: [],
    });
    repo.recordFinding({
      projectId: projectA.id,
      type: "bug",
      severity: "low",
      title: "Test finding",
      description: "Checking events.",
      relatedFiles: [],
    });

    const allA = repo.listEvents(projectA.id);
    const allB = repo.listEvents(projectB.id);

    // projectA should have at least 3 events (registered + decision + finding)
    expect(allA.length).toBeGreaterThanOrEqual(3);
    // Events are newest-first
    for (let i = 1; i < allA.length; i++) {
      expect(allA[i - 1]!.createdAt >= allA[i]!.createdAt).toBe(true);
    }

    // Events from projectB are not included in projectA results
    expect(allA.every((e) => e.projectId === projectA.id)).toBe(true);
    expect(allB.every((e) => e.projectId === projectB.id)).toBe(true);

    // limit: 1 returns exactly 1 event
    const limited = repo.listEvents(projectA.id, { limit: 1 });
    expect(limited).toHaveLength(1);

    repo.close();
  });

  test("v7 migration adds depends_on_json column to plan_phases", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });

    const columns = db
      .query<{ name: string }, []>("PRAGMA table_info(plan_phases)")
      .all()
      .map((col) => col.name);

    expect(columns).toContain("depends_on_json");
    db.close();
  });

  test("createPlan yields phases with dependsOn: []", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({ name: "meridian", rootPath: "/work/meridian" });

    const plan = repo.createPlan({
      projectId: project.id,
      title: "Dep plan",
      status: "active",
      phases: [
        { title: "Phase A", status: "todo", acceptanceCriteria: [], evidence: [] },
        { title: "Phase B", status: "todo", acceptanceCriteria: [], evidence: [] },
      ],
    });

    expect(plan.phases[0]?.dependsOn).toEqual([]);
    expect(plan.phases[1]?.dependsOn).toEqual([]);
    repo.close();
  });

  test("updatePhase with dependsOn round-trips correctly", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({ name: "meridian", rootPath: "/work/meridian" });

    const plan = repo.createPlan({
      projectId: project.id,
      title: "Dep plan 2",
      status: "active",
      phases: [
        { title: "Phase A", status: "done", acceptanceCriteria: [], evidence: [] },
        { title: "Phase B", status: "todo", acceptanceCriteria: [], evidence: [] },
      ],
    });
    const phaseAId = plan.phases[0]!.id;
    const phaseBId = plan.phases[1]!.id;

    const updated = repo.updatePhase(
      plan.id,
      { phaseId: phaseBId },
      { dependsOn: [phaseAId] },
    );

    expect(updated.phases[1]?.dependsOn).toEqual([phaseAId]);
    repo.close();
  });

  test("openDecodeDatabase remains a legacy compatibility alias", () => {
    const root = makeTempDir();
    const decodeHome = join(root, ".decode");
    tempDirs.push(root);
    const db = openDecodeDatabase({ decodeHome });

    db.close();
    expect(existsSync(join(decodeHome, "decode.db"))).toBe(true);
  });

  test("multiple active plans are allowed when they belong to different roadmaps", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({ name: "meridian", rootPath: "/work/meridian" });

    const roadmapA = repo.createRoadmap({
      projectId: project.id,
      title: "Roadmap A",
      status: "active",
      items: [{ title: "A1", status: "in_progress", evidence: [] }],
    });
    const roadmapB = repo.createRoadmap({
      projectId: project.id,
      title: "Roadmap B",
      status: "active",
      items: [{ title: "B1", status: "in_progress", evidence: [] }],
    });

    repo.createPlan({
      projectId: project.id,
      title: "Plan A",
      status: "active",
      sourceRoadmapId: roadmapA.id,
      sourceRoadmapItemId: roadmapA.items[0]!.id,
      phases: [{ title: "Phase A1", status: "todo", acceptanceCriteria: [], evidence: [] }],
    });

    expect(() =>
      repo.createPlan({
        projectId: project.id,
        title: "Plan B",
        status: "active",
        sourceRoadmapId: roadmapB.id,
        sourceRoadmapItemId: roadmapB.items[0]!.id,
        phases: [{ title: "Phase B1", status: "todo", acceptanceCriteria: [], evidence: [] }],
      }),
    ).not.toThrow();

    const activePlans = repo.listActivePlans(project.id);
    expect(activePlans).toHaveLength(2);
    repo.close();
  });

  test("focus CRUD binds a worktree to a roadmap and clears it", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({ name: "meridian", rootPath: "/work/meridian" });

    const roadmap = repo.createRoadmap({
      projectId: project.id,
      title: "Focused Roadmap",
      status: "active",
      items: [{ title: "Item 1", status: "todo", evidence: [] }],
    });

    expect(repo.getFocus(project.id, "/work/meridian")).toBeNull();

    const focus = repo.setFocus({
      projectId: project.id,
      worktreeKey: "/work/meridian",
      roadmapId: roadmap.id,
      branch: "main",
    });
    expect(focus.roadmapId).toBe(roadmap.id);
    expect(focus.branch).toBe("main");

    const fetched = repo.getFocus(project.id, "/work/meridian");
    expect(fetched).not.toBeNull();
    expect(fetched!.roadmapId).toBe(roadmap.id);

    const cleared = repo.clearFocus(project.id, "/work/meridian");
    expect(cleared).toBe(true);
    expect(repo.getFocus(project.id, "/work/meridian")).toBeNull();

    const clearAgain = repo.clearFocus(project.id, "/work/meridian");
    expect(clearAgain).toBe(false);
    repo.close();
  });

  test("setFocus rejects a nonexistent roadmap", () => {
    const root = makeTempDir();
    tempDirs.push(root);
    const db = openZenithDatabase({ dbPath: join(root, "zenith.db") });
    const repo = new ZenithRepository(db);
    const project = repo.registerProject({ name: "meridian", rootPath: "/work/meridian" });

    expect(() =>
      repo.setFocus({ projectId: project.id, worktreeKey: "/work/meridian", roadmapId: "roadmap_bogus" }),
    ).toThrow("Roadmap not found");
    repo.close();
  });
});

function restoreEnv(key: "HOME" | "ZENITH_HOME" | "DECODE_HOME", value: string | undefined): void {
  if (value === undefined) {
    delete Bun.env[key];
    return;
  }

  Bun.env[key] = value;
}
