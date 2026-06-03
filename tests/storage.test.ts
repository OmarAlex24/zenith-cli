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
    expect(next.reason).toContain("First pending phase");
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
      status: "completed",
      evidence: [{ kind: "note", value: "Tests pass" }],
    });

    expect(updated.phases[0]?.status).toBe("completed");
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

  test("openDecodeDatabase remains a legacy compatibility alias", () => {
    const root = makeTempDir();
    const decodeHome = join(root, ".decode");
    tempDirs.push(root);
    const db = openDecodeDatabase({ decodeHome });

    db.close();
    expect(existsSync(join(decodeHome, "decode.db"))).toBe(true);
  });
});

function restoreEnv(key: "HOME" | "ZENITH_HOME" | "DECODE_HOME", value: string | undefined): void {
  if (value === undefined) {
    delete Bun.env[key];
    return;
  }

  Bun.env[key] = value;
}
