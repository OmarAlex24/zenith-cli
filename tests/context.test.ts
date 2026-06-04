import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ZenithError } from "../src/cli/json-output";
import { createZenithApp } from "../src/app/factory";
import { cleanupTempDir, makeTempDir, runCommand } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("context engine", () => {
  test("returns useful context before project registration", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    const context = await services.app.getContext();

    expect(context.registered).toBe(false);
    expect(context.project).toBeNull();
    expect(context.next.recommendation).toBe("Run zenith init");
    expect(context.markdown).toContain("Run zenith init");
    services.close();
  });

  test("selects a phase by id and renders compact markdown", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const plan = await services.app.createPlan({
      title: "Zenith CLI Roadmap",
      phases: [
        { title: "Foundation", status: "completed" },
        {
          title: "Context Engine v1",
          status: "in_progress",
          description: "Assemble agent-readable project context.",
          acceptanceCriteria: ["context get works", "compact markdown is generated"],
        },
      ],
    });
    const phaseId = plan.phases[1]!.id;

    const defaultCompact = await services.app.compactContext();
    const context = await services.app.getContext({ phaseId });
    const compact = await services.app.compactContext({ phaseId });
    const phase = await services.app.showPhase(phaseId);

    expect(defaultCompact.markdown).toContain("compact markdown is generated");
    expect(context.selectedPhase?.phase.id).toBe(phaseId);
    expect(compact.markdown).toContain("Assemble agent-readable project context.");
    expect(compact.markdown).toContain("Context Engine v1");
    expect(compact.markdown).toContain("context get works");
    expect(phase.planId).toBe(plan.id);
    expect(phase.phase.title).toBe("Context Engine v1");
    services.close();
  });

  test("showPhase returns a stable error for unknown phase ids", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();

    try {
      await services.app.showPhase("phase_missing");
      throw new Error("Expected showPhase to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ZenithError);
      expect((error as ZenithError).code).toBe("phase_not_found");
    } finally {
      services.close();
    }
  });

  test("open high severity findings appear in context and block next step", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    await services.app.createPlan({
      title: "Zenith CLI Roadmap",
      phases: [{ title: "Foundation" }],
    });
    const finding = await services.app.recordFinding({
      type: "risk",
      severity: "high",
      title: "Lifecycle commands are missing",
      description: "Agents cannot close operational memory loops.",
      relatedFiles: ["src/cli/program.ts"],
    });
    const compact = await services.app.compactContext();

    expect(compact.openFindings[0]?.id).toBe(finding.id);
    expect(compact.openFindings[0]?.type).toBe("risk");
    expect(compact.openFindings[0]?.relatedFiles).toEqual(["src/cli/program.ts"]);
    expect(compact.next.recommendation).toBe("Review finding: Lifecycle commands are missing");
    expect(compact.markdown).toContain("high risk: Lifecycle commands are missing");
    expect(compact.markdown).toContain("src/cli/program.ts");
    services.close();
  });

  test("plan next uses active roadmap when no active plan exists", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const roadmap = await services.app.createRoadmap({
      title: "Zenith CLI Product Roadmap",
      items: [
        { title: "MVP 4 - OpenTUI Dashboard", status: "done" },
        {
          title: "MVP 4.5 - Product And Architecture Hardening",
          status: "in_progress",
          justification: "Hardening was inserted before review skills.",
        },
        {
          title: "MVP 5 - PR Review Skill",
          status: "deferred",
          justification: "Core foundations should be stronger before review skills.",
        },
      ],
    });
    await services.app.summarizeSession({
      summary: "Old session suggested unrelated work.",
      nextSteps: ["Ignore this stale next step"],
    });

    const next = await services.app.nextPlanStep();
    const compact = await services.app.compactContext();

    expect(next.recommendation).toBe("Create plan from roadmap: MVP 4.5 - Product And Architecture Hardening");
    expect(next.reason).toContain("active roadmap");
    expect(next.evidence).toEqual([roadmap.id, roadmap.items[1]!.id]);
    expect(compact.next.recommendation).toBe(next.recommendation);
    expect(compact.markdown).toContain("actionable: in_progress: MVP 4.5 - Product And Architecture Hardening");
    expect(compact.markdown).toContain("deferred backlog: deferred: MVP 5 - PR Review Skill");
    expect(compact.markdown).toContain("why: Hardening was inserted before review skills.");
    services.close();
  });

  test("plan next asks to review deferred roadmap work instead of executing it", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const roadmap = await services.app.createRoadmap({
      title: "Zenith CLI Product Roadmap",
      items: [
        { title: "MVP 4.75 - Operational Memory Polish", status: "done" },
        {
          title: "MVP 5 - PR Review Skill",
          status: "deferred",
          justification: "Core TUI and context should be stronger first.",
        },
      ],
    });

    const next = await services.app.nextPlanStep();
    const compact = await services.app.compactContext();

    expect(next.recommendation).toBe("Review deferred roadmap work: MVP 5 - PR Review Skill");
    expect(next.reason).toContain("reactivate");
    expect(next.evidence).toEqual([roadmap.id, roadmap.items[1]!.id]);
    expect(compact.markdown).toContain("actionable: none");
    expect(compact.markdown).toContain("deferred backlog: deferred: MVP 5 - PR Review Skill");
    services.close();
  });

  test("compact context reports discarded roadmap work without making it next", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    await services.app.createRoadmap({
      title: "Zenith CLI Product Roadmap",
      items: [
        { title: "MVP 5.5 - Pulse", status: "done" },
        {
          title: "MVP 6 - Agent Backends",
          status: "discarded",
          justification: "Provider CLI spawning is no longer in scope.",
        },
      ],
    });

    const next = await services.app.nextPlanStep();
    const compact = await services.app.compactContext();

    expect(next.kind).toBe("create_plan_empty");
    expect(compact.markdown).toContain("actionable: none");
    expect(compact.markdown).toContain("discarded: discarded: MVP 6 - Agent Backends");
    expect(compact.markdown).toContain("why: Provider CLI spawning is no longer in scope.");
    services.close();
  });

  test("git context includes changed file names without file contents", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    await runCommand(["git", "init"], cwd);
    writeFileSync(join(cwd, "secret.txt"), "API_TOKEN=super-secret-token\n", "utf8");
    const services = createZenithApp({ cwd, zenithHome });

    await services.app.registerProject();
    const context = await services.app.compactContext();
    const serialized = JSON.stringify(context);

    expect(context.git.changedFiles).toContain("secret.txt");
    expect(serialized).not.toContain("super-secret-token");
    expect(context.markdown).not.toContain("super-secret-token");
    services.close();
  });
});
