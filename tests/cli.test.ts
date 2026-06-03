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

  test("roadmap items can become active executable plans", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Zenith CLI Product Roadmap",
        items: [
          { title: "MVP 4 - OpenTUI Dashboard", status: "in_progress" },
          { title: "MVP 5 - PR Review Skill" },
        ],
      },
    });
    const roadmapId = (roadmap.json as any).data.id as string;

    const added = await runDecode(["roadmap", "add-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "MVP 4.5 - Product And Architecture Hardening",
        description: "Harden product workflow and architecture before advanced skills.",
        status: "in_progress",
        afterItemTitle: "MVP 4 - OpenTUI Dashboard",
        justification: "Architecture hardening should happen before advanced review skills.",
        evidence: [{ kind: "note", value: "Backed by Zenith Product And Architecture Hardening." }],
      },
    });
    const itemId = (added.json as any).data.items[1].id as string;
    const missingJustification = await runDecode(["roadmap", "add-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "MVP 4.75 - Missing Justification",
        afterItemTitle: "MVP 4.5 - Product And Architecture Hardening",
      },
    });
    const deferred = await runDecode(["roadmap", "update-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        itemTitle: "MVP 5 - PR Review Skill",
        status: "deferred",
        justification: "Core foundations should be stronger before review skills.",
      },
    });

    const createdPlan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        itemId,
        title: "Zenith Product And Architecture Hardening",
        priority: "high",
        phases: [
          {
            title: "Roadmap-to-plan workflow",
            acceptanceCriteria: ["A CLI flow can create an active plan from a roadmap item"],
          },
        ],
      },
    });
    const next = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    const duplicate = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { itemId },
    });

    expect(added.exitCode).toBe(0);
    expect((added.json as any).data.items.map((item: any) => item.title)).toEqual([
      "MVP 4 - OpenTUI Dashboard",
      "MVP 4.5 - Product And Architecture Hardening",
      "MVP 5 - PR Review Skill",
    ]);
    expect((added.json as any).data.items[1].justification).toBe(
      "Architecture hardening should happen before advanced review skills.",
    );
    expect(missingJustification.exitCode).toBe(1);
    expect((missingJustification.json as any).errors[0].message).toContain("Provide justification");
    expect(deferred.exitCode).toBe(0);
    expect((deferred.json as any).data.items[2].status).toBe("deferred");
    expect((deferred.json as any).data.items[2].justification).toBe("Core foundations should be stronger before review skills.");
    expect(createdPlan.exitCode).toBe(0);
    expect((createdPlan.json as any).data.sourceRoadmapId).toBe(roadmapId);
    expect((createdPlan.json as any).data.sourceRoadmapItemId).toBe(itemId);
    expect((createdPlan.json as any).data.phases[0].evidence[0].value).toContain("Created from roadmap");
    expect((next.json as any).data.recommendation).toBe("Roadmap-to-plan workflow");
    expect(duplicate.exitCode).toBe(1);
    expect((duplicate.json as any).errors[0].code).toBe("active_plan_exists");
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

  test("finding record list and close emit stable json", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    const unregisteredList = await runDecode(["finding", "list", "--json"], { cwd, decodeHome });
    expect(unregisteredList.exitCode).toBe(1);
    expect((unregisteredList.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const missing = await runDecode(["finding", "close", "finding_missing", "--json"], { cwd, decodeHome });
    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("finding_not_found");
    expect((missing.json as any).errors[0].details).toEqual({ findingId: "finding_missing" });

    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        type: "risk",
        severity: "high",
        title: "Open operational risk",
        description: "High severity findings should block the next plan step.",
        relatedFiles: ["src/app/plan-next.ts"],
      },
    });
    const findingId = (recorded.json as any).data.id;

    const list = await runDecode(["finding", "list", "--json"], { cwd, decodeHome });
    const shown = await runDecode(["finding", "show", findingId, "--json"], { cwd, decodeHome });
    const updated = await runDecode(["finding", "update", findingId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        severity: "medium",
        title: "Updated operational risk",
        relatedFiles: ["src/app/plan-next.ts", "src/cli/program.ts"],
      },
    });
    const next = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    const closed = await runDecode(["finding", "close", findingId, "--json"], { cwd, decodeHome });
    const afterClose = await runDecode(["finding", "list", "--json"], { cwd, decodeHome });
    const closedList = await runDecode(["finding", "list", "--status", "closed", "--json"], { cwd, decodeHome });
    const allList = await runDecode(["finding", "list", "--status", "all", "--json"], { cwd, decodeHome });

    expect(recorded.exitCode).toBe(0);
    expect((recorded.json as any).data.status).toBe("open");
    expect((list.json as any).data).toHaveLength(1);
    expect((list.json as any).data[0].id).toBe(findingId);
    expect((shown.json as any).data.id).toBe(findingId);
    expect((updated.json as any).data.title).toBe("Updated operational risk");
    expect((updated.json as any).data.relatedFiles).toEqual(["src/app/plan-next.ts", "src/cli/program.ts"]);
    expect((next.json as any).data.recommendation).toContain("Updated operational risk");
    expect(closed.exitCode).toBe(0);
    expect((closed.json as any).data.status).toBe("closed");
    expect((afterClose.json as any).data).toEqual([]);
    expect((closedList.json as any).data[0].id).toBe(findingId);
    expect((allList.json as any).data[0].id).toBe(findingId);
  });

  test("finding record with relatedPlanId links plan and show returns it", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const createdPlan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Linked Plan",
        phases: [{ title: "Phase One" }],
      },
    });
    expect(createdPlan.exitCode).toBe(0);
    const planId = (createdPlan.json as any).data.id;

    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        type: "risk",
        severity: "medium",
        title: "Finding linked to plan",
        description: "This finding is linked to a specific plan.",
        relatedPlanId: planId,
      },
    });
    expect(recorded.exitCode).toBe(0);
    expect((recorded.json as any).data.relatedPlanId).toBe(planId);

    const findingId = (recorded.json as any).data.id;
    const shown = await runDecode(["finding", "show", findingId, "--json"], { cwd, decodeHome });
    expect(shown.exitCode).toBe(0);
    expect((shown.json as any).data.relatedPlanId).toBe(planId);
  });

  test("finding record with non-existent relatedPlanId returns plan_not_found error", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        type: "bug",
        severity: "low",
        title: "Bad link",
        description: "References a non-existent plan.",
        relatedPlanId: "plan_nonexistent_xyz",
      },
    });
    expect(recorded.exitCode).toBe(1);
    expect((recorded.json as any).errors[0].code).toBe("plan_not_found");
  });

  test("session start capture end and summarize emit stable json", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    const unregisteredStart = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {},
    });
    expect(unregisteredStart.exitCode).toBe(1);
    expect((unregisteredStart.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const missingCapture = await runDecode(["session", "capture", "sess_missing", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { summary: "No session exists." },
    });
    expect(missingCapture.exitCode).toBe(1);
    expect((missingCapture.json as any).errors[0].code).toBe("session_not_found");
    expect((missingCapture.json as any).errors[0].details).toEqual({ sessionId: "sess_missing" });

    const started = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        summary: "Started lifecycle work.",
        changedFiles: ["src/domain/schemas.ts"],
        nextSteps: ["Capture progress"],
      },
    });
    const sessionId = (started.json as any).data.id;

    const captured = await runDecode(["session", "capture", sessionId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        summary: "Captured lifecycle progress.",
        nextSteps: ["End session"],
      },
    });

    const ended = await runDecode(["session", "end", sessionId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        summary: "Finished lifecycle work.",
        changedFiles: ["src/domain/schemas.ts", "src/cli/program.ts"],
        nextSteps: ["Record evidence"],
        endedAt: "2026-01-01T01:00:00.000Z",
      },
    });

    const summarized = await runDecode(["session", "summarize", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        summary: "Compatibility summary still works.",
        changedFiles: ["README.md"],
      },
    });
    const sessionList = await runDecode(["session", "list", "--json"], { cwd, decodeHome });
    const sessionShow = await runDecode(["session", "show", sessionId, "--json"], { cwd, decodeHome });

    expect(started.exitCode).toBe(0);
    expect((started.json as any).data.endedAt).toBeUndefined();
    expect(captured.exitCode).toBe(0);
    expect((captured.json as any).data.summary).toBe("Captured lifecycle progress.");
    expect((captured.json as any).data.endedAt).toBeUndefined();
    expect(ended.exitCode).toBe(0);
    expect((ended.json as any).data.endedAt).toBe("2026-01-01T01:00:00.000Z");
    expect((ended.json as any).data.nextSteps).toEqual(["Record evidence"]);
    expect(summarized.exitCode).toBe(0);
    expect((summarized.json as any).data.summary).toBe("Compatibility summary still works.");
    expect((sessionList.json as any).data.map((session: any) => session.id)).toContain(sessionId);
    expect((sessionShow.json as any).data.id).toBe(sessionId);
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

  test("timeline --json returns ok envelope with array", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });

    const result = await runDecode(["timeline", "--json"], { cwd, decodeHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    expect(Array.isArray((result.json as any).data)).toBe(true);
    // After init there should be at least one event
    expect((result.json as any).data.length).toBeGreaterThanOrEqual(1);
  });

  test("plan update-phase dependency graph validation", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: {
        title: "Dep Graph Plan",
        phases: [{ title: "Phase A" }, { title: "Phase B" }],
      },
    });

    expect(created.exitCode).toBe(0);
    const planId = (created.json as any).data.id;
    const phaseAId = (created.json as any).data.phases[0].id;
    const phaseBId = (created.json as any).data.phases[1].id;

    // Setting A dependsOn B should succeed
    const setDepAonB = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { phaseId: phaseAId, dependsOn: [phaseBId] },
    });
    expect(setDepAonB.exitCode).toBe(0);
    expect((setDepAonB.json as any).data.phases[0].dependsOn).toEqual([phaseBId]);

    // Setting B dependsOn A creates a cycle → dependency_cycle error
    const cyclicDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { phaseId: phaseBId, dependsOn: [phaseAId] },
    });
    expect(cyclicDep.exitCode).toBe(1);
    expect((cyclicDep.json as any).errors[0].code).toBe("dependency_cycle");

    // Self-dependency → dependency_self error
    const selfDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { phaseId: phaseAId, dependsOn: [phaseAId] },
    });
    expect(selfDep.exitCode).toBe(1);
    expect((selfDep.json as any).errors[0].code).toBe("dependency_self");

    // Non-existent phase id → dependency_unknown_phase error
    const unknownDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { phaseId: phaseAId, dependsOn: ["phase_does_not_exist"] },
    });
    expect(unknownDep.exitCode).toBe(1);
    expect((unknownDep.json as any).errors[0].code).toBe("dependency_unknown_phase");
  });

  test("timeline --limit 1 returns at most 1 entry", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    // Create an extra event
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { title: "Timeline Test Plan", phases: [{ title: "Phase 1" }] },
    });

    const result = await runDecode(["timeline", "--json", "--limit", "1"], { cwd, decodeHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).data).toHaveLength(1);
  });

  test("parallel roadmaps each keep an active plan and focus resolves which to implement", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });

    const roadmapA = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { title: "Roadmap Alpha", items: [{ title: "Alpha Item", status: "in_progress" }] },
    });
    const roadmapAId = (roadmapA.json as any).data.id as string;

    const roadmapB = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { title: "Roadmap Beta", items: [{ title: "Beta Item", status: "in_progress" }] },
    });
    const roadmapBId = (roadmapB.json as any).data.id as string;

    const planA = await runDecode(["roadmap", "create-plan", roadmapAId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { itemTitle: "Alpha Item", phases: [{ title: "Alpha Phase", status: "in_progress" }] },
    });
    expect(planA.exitCode).toBe(0);

    // A second active plan for a different roadmap is allowed.
    const planB = await runDecode(["roadmap", "create-plan", roadmapBId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { itemTitle: "Beta Item", phases: [{ title: "Beta Phase", status: "in_progress" }] },
    });
    expect(planB.exitCode).toBe(0);

    // Without focus, plan next is ambiguous.
    const ambiguous = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    expect((ambiguous.json as any).data.recommendation).toContain("Set roadmap focus");

    // Binding the worktree to Roadmap Alpha resolves the active plan.
    const setFocus = await runDecode(["focus", "set", roadmapAId, "--json"], { cwd, decodeHome });
    expect(setFocus.exitCode).toBe(0);
    expect((setFocus.json as any).data.focus.roadmapId).toBe(roadmapAId);

    const focused = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    expect((focused.json as any).data.recommendation).toBe("Alpha Phase");

    const show = await runDecode(["focus", "show", "--json"], { cwd, decodeHome });
    expect((show.json as any).data.focus.roadmapId).toBe(roadmapAId);
    expect((show.json as any).data.activePlan.title).toContain("Alpha");

    // Clearing focus restores ambiguity.
    const cleared = await runDecode(["focus", "clear", "--json"], { cwd, decodeHome });
    expect((cleared.json as any).data.focus).toBeNull();
    const ambiguousAgain = await runDecode(["plan", "next", "--json"], { cwd, decodeHome });
    expect((ambiguousAgain.json as any).data.recommendation).toContain("Set roadmap focus");
  });

  test("roadmap workspace lists groups with linked plans and rollups", async () => {
    const cwd = makeTempDir();
    const decodeHome = makeTempDir();
    tempDirs.push(cwd, decodeHome);

    await runDecode(["init", "--json"], { cwd, decodeHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { title: "Workspace Roadmap", items: [{ title: "WS Item", status: "in_progress" }] },
    });
    const roadmapId = (roadmap.json as any).data.id as string;

    await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      decodeHome,
      input: { itemTitle: "WS Item", phases: [{ title: "WS Phase", status: "done" }] },
    });

    const workspace = await runDecode(["roadmap", "workspace", "--json"], { cwd, decodeHome });
    expect(workspace.exitCode).toBe(0);
    const group = (workspace.json as any).data.groups.find((g: any) => g.roadmapId === roadmapId);
    expect(group.title).toBe("Workspace Roadmap");
    const item = group.items.find((entry: any) => entry.item.title === "WS Item");
    expect(item.linkedPlans).toHaveLength(1);
    expect(item.phaseProgress).toEqual({ done: 1, total: 1 });
  });
});
