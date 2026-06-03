import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanupTempDir, makeTempDir, runDecode, runWithLegacyDecodeHome } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("cli json commands", () => {
  test("init and status emit stable envelopes", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    const init = await runDecode(["init", "--json"], { cwd, decodeHome });
    expect(init.exitCode).toBe(0);
    expect((init.json as any).ok).toBe(true);

    const status = await runDecode(["project", "status", "--json"], { cwd, decodeHome });
    expect(status.exitCode).toBe(0);
    expect((status.json as any).data.registered).toBe(true);
    expect((status.json as any).meta.schemaVersion).toBe(1);
  });

  test("creates a plan from stdin and returns plan next", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Zenith MVP",
        phases: [{ title: "Foundation" }, { title: "TUI" }],
      },
    });

    expect(created.exitCode).toBe(0);
    expect((created.json as any).data.title).toBe("Zenith MVP");

    const next = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    expect((next.json as any).data.recommendation).toBe("Foundation");
  });

  test("context, resume, and phase commands emit stable json", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Zenith CLI Roadmap",
        phases: [
          { title: "Foundation", status: "completed" },
          {
            title: "Context Engine v1",
            status: "in_progress",
            acceptanceCriteria: ["zenith context get --json"],
          },
        ],
      },
    });
    const phaseId = (created.json as any).data.phases[1].id;

    const context = await runDecode(["context", "get", "--json", "--phase", phaseId], { cwd, decodeHome });
    const compact = await runDecode(["context", "compact", "--json", "--phase", phaseId], { cwd, decodeHome });
    const phase = await runDecode(["phase", "show", phaseId, "--json"], { cwd, decodeHome });
    const resume = await runDecode(["resume", "--json"], { cwd, decodeHome });

    expect(context.exitCode).toBe(0);
    expect((context.json as any).data.selectedPhase.phase.id).toBe(phaseId);
    expect((compact.json as any).data.markdown).toContain("Context Engine v1");
    expect((phase.json as any).data.planTitle).toBe("Zenith CLI Roadmap");
    expect((resume.json as any).data.markdown).toContain("Zenith Resume");
  });

  test("updates plan metadata from stdin", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Old roadmap",
        phases: [{ title: "Foundation" }],
      },
    });

    const updated = await runDecode(["plan", "update", (created.json as any).data.id, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Zenith CLI Roadmap",
        description: "Renamed roadmap",
        status: "paused",
        priority: "high",
      },
    });

    expect(updated.exitCode).toBe(0);
    expect((updated.json as any).ok).toBe(true);
    expect((updated.json as any).meta.schemaVersion).toBe(1);
    expect((updated.json as any).data.title).toBe("Zenith CLI Roadmap");
    expect((updated.json as any).data.description).toBe("Renamed roadmap");
    expect((updated.json as any).data.status).toBe("paused");
    expect((updated.json as any).data.priority).toBe("high");
  });

  test("plan create and update reject a second active plan", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const active = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Active roadmap",
        phases: [{ title: "Foundation" }],
      },
    });
    const activePlanId = (active.json as any).data.id;

    const duplicateActive = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Competing roadmap",
        phases: [{ title: "Discovery" }],
      },
    });

    expect(duplicateActive.exitCode).toBe(1);
    expect((duplicateActive.json as any).errors[0].code).toBe("active_plan_exists");
    expect((duplicateActive.json as any).errors[0].details).toEqual({
      activePlanId,
      activePlanTitle: "Active roadmap",
    });

    const paused = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Paused roadmap",
        status: "paused",
        phases: [{ title: "Discovery" }],
      },
    });
    const pausedPlanId = (paused.json as any).data.id;
    const activatePaused = await runDecode(["plan", "update", pausedPlanId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        status: "active",
      },
    });

    expect(paused.exitCode).toBe(0);
    expect(activatePaused.exitCode).toBe(1);
    expect((activatePaused.json as any).errors[0].code).toBe("active_plan_exists");
    expect((activatePaused.json as any).errors[0].details).toEqual({
      activePlanId,
      activePlanTitle: "Active roadmap",
    });
  });

  test("decision list and show return project decisions", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const recorded = await runDecode(["decision", "record", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Use local SQLite",
        context: "Zenith needs private project memory.",
        decision: "Store memory in a local SQLite database.",
        consequences: "Agents can resume without remote services.",
        alternatives: ["JSON files", "Remote API"],
        relatedPlanIds: ["plan_memory"],
      },
    });
    const decisionId = (recorded.json as any).data.id;

    const list = await runDecode(["decision", "list", "--json"], { cwd, decodeHome });
    const show = await runDecode(["decision", "show", decisionId, "--json"], { cwd, decodeHome });

    expect(list.exitCode).toBe(0);
    expect((list.json as any).data).toHaveLength(1);
    expect((list.json as any).data[0].id).toBe(decisionId);
    expect((list.json as any).data[0].title).toBe("Use local SQLite");
    expect(show.exitCode).toBe(0);
    expect((show.json as any).data.id).toBe(decisionId);
    expect((show.json as any).data.context).toBe("Zenith needs private project memory.");
    expect((show.json as any).data.decision).toBe("Store memory in a local SQLite database.");
    expect((show.json as any).data.consequences).toBe("Agents can resume without remote services.");
    expect((show.json as any).data.alternatives).toEqual(["JSON files", "Remote API"]);
    expect((show.json as any).data.relatedPlanIds).toEqual(["plan_memory"]);
  });

  test("decision browsing returns stable error envelopes", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    const unregisteredList = await runDecode(["decision", "list", "--json"], { cwd, decodeHome });
    const unregisteredShow = await runDecode(["decision", "show", "dec_missing", "--json"], { cwd, decodeHome });

    expect(unregisteredList.exitCode).toBe(1);
    expect((unregisteredList.json as any).errors[0].code).toBe("project_not_registered");
    expect(unregisteredShow.exitCode).toBe(1);
    expect((unregisteredShow.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const missing = await runDecode(["decision", "show", "dec_missing", "--json"], { cwd, decodeHome });

    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("decision_not_found");
    expect((missing.json as any).errors[0].details).toEqual({ decisionId: "dec_missing" });
  });

  test("phase show returns phase_not_found for unknown ids", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const missing = await runDecode(["phase", "show", "phase_missing", "--json"], { cwd, decodeHome });

    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("phase_not_found");
  });

  test("top-level help exposes Zenith as the public CLI brand", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const proc = Bun.spawn(["bun", "run", join(process.cwd(), "src", "index.ts"), "--help"], {
      cwd,
      env: { ...Bun.env, ZENITH_HOME: zenithHome },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("zenith");
    expect(stdout).toContain("Zenith");
    expect(stdout).not.toContain("Decode");
  });

  test("DECODE_HOME remains a legacy compatibility alias", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    const init = await runWithLegacyDecodeHome(["init", "--json"], { cwd, decodeHome });
    const status = await runWithLegacyDecodeHome(["project", "status", "--json"], { cwd, decodeHome });

    expect(init.exitCode).toBe(0);
    expect(status.exitCode).toBe(0);
    expect((status.json as any).data.registered).toBe(true);
  });

  test("invalid stdin json returns an error envelope", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const proc = Bun.spawn(["bun", "run", join(process.cwd(), "src", "index.ts"), "plan", "create", "--json", "--input", "-"], {
      cwd,
      env: { ...Bun.env, ZENITH_HOME: zenithHome },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.stdin?.write("{bad");
    proc.stdin?.end();

    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    const parsed = JSON.parse(stdout) as any;

    expect(exitCode).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.errors[0].code).toBe("invalid_json_input");
  });
});
