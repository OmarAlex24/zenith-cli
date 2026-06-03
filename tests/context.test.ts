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
