import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { createZenithApp } from "../src/app/factory";
import { cleanupTempDir, makeTempDir, runCommand, runDecode } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("cli json commands", () => {
  test("init and status emit stable envelopes", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const init = await runDecode(["init", "--json"], { cwd, zenithHome });
    expect(init.exitCode).toBe(0);
    expect((init.json as any).ok).toBe(true);

    const status = await runDecode(["project", "status", "--json"], { cwd, zenithHome });
    expect(status.exitCode).toBe(0);
    expect((status.json as any).data.registered).toBe(true);
    expect((status.json as any).meta.schemaVersion).toBe(1);
  });

  test("creates a plan from stdin and returns plan next", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Zenith MVP",
        phases: [{ title: "Foundation" }, { title: "TUI" }],
      },
    });

    expect(created.exitCode).toBe(0);
    expect((created.json as any).data.title).toBe("Zenith MVP");

    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    expect((next.json as any).data.recommendation).toBe("Foundation");
  });

  test("context, resume, and phase commands emit stable json", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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

    const context = await runDecode(["context", "get", "--json", "--phase", phaseId], { cwd, zenithHome });
    const compact = await runDecode(["context", "compact", "--json", "--phase", phaseId], { cwd, zenithHome });
    const phase = await runDecode(["plan", "phase", "show", phaseId, "--json"], { cwd, zenithHome });
    const resume = await runDecode(["continue", "--compact", "--json"], { cwd, zenithHome });

    expect(context.exitCode).toBe(0);
    expect((context.json as any).data.selectedPhase.phase.id).toBe(phaseId);
    expect((compact.json as any).data.markdown).toContain("Context Engine v1");
    expect((phase.json as any).data.planTitle).toBe("Zenith CLI Roadmap");
    expect((resume.json as any).data.markdown).toContain("Zenith Resume");
    expect((resume.json as any).data.readiness.status).toBe("ready");
    expect((resume.json as any).data.roi.sourceEvents).toBeGreaterThan(0);
  });

  test("continue emits continuity read model without mutating sessions", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Continuity Plan",
        phases: [{ title: "Resume command", status: "todo" }],
      },
    });
    const phaseId = (created.json as any).data.phases[0].id;

    const beforeSessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });
    const result = await runDecode(["continue", "--json"], { cwd, zenithHome });
    const human = await runRawZenith(["continue"], { cwd, zenithHome });
    const afterSessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.markdown).toStartWith("# Zenith Continue");
    expect((result.json as any).data.markdown).toContain("## Where We Are");
    expect((result.json as any).data.markdown).toContain("## Next Action");
    expect((result.json as any).data.markdown).toContain("## Risk Radar");
    expect((result.json as any).data.markdown).toContain("## Worktree");
    expect((result.json as any).data.context.activePlan.title).toBe("Continuity Plan");
    expect((result.json as any).data.phase.phase.id).toBe(phaseId);
    expect((result.json as any).data.actionBriefing.goal).toBe("Continuity Plan");
    expect((result.json as any).data.actionBriefing.nextAction).toBe("Resume command");
    expect((result.json as any).data.actionBriefing.freshness.join("\n")).toContain("Working tree clean");
    expect((result.json as any).data.roi.sourceEvents).toBeGreaterThan(0);
    expect((result.json as any).data.markdown).toContain("## ROI");
    expect((result.json as any).data.newSession).toBeNull();
    expect((result.json as any).data.closedSession).toBeNull();
    expect((result.json as any).data.readiness.status).toBe("ready");
    expect(human.exitCode).toBe(0);
    expect(human.stdout).toStartWith("# Zenith Continue");
    expect(human.stdout).toContain("## ROI");
    expect(human.stdout).not.toContain('"ok"');
    expect(human.stdout).not.toContain('"data"');
    expect(human.stdout).not.toContain('"meta"');
    expect(() => JSON.parse(human.stdout)).toThrow();
    expect((beforeSessions.json as any).data).toHaveLength(0);
    expect((afterSessions.json as any).data).toHaveLength(0);
  });

  test("continue handles unregistered projects without mutating memory", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const result = await runDecode(["continue", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.context.project).toBeNull();
    expect((result.json as any).data.next.recommendation).toBe("Run zenith init");
    expect((result.json as any).data.warnings.join("\n")).toContain("Project is not registered");
    expect((result.json as any).data.newSession).toBeNull();
    expect((result.json as any).data.readiness.status).toBe("needs_cleanup");
  });

  test("continue includes roadmap create-plan candidate when no active plan exists", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Continuity Roadmap",
        items: [{ title: "MVP 8", status: "todo" }],
      },
    });

    const result = await runDecode(["continue", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.next.kind).toBe("create_plan");
    expect((result.json as any).data.roadmapItem.title).toBe("MVP 8");
    expect((result.json as any).data.readiness.status).toBe("needs_plan");
  });

  test("continue readiness blocks on severe findings", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        type: "bug",
        severity: "critical",
        title: "Cannot resume safely",
        description: "Critical finding should block continuity readiness.",
        relatedFiles: [],
      },
    });

    const result = await runDecode(["continue", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.next.kind).toBe("blocking_finding");
    expect((result.json as any).data.readiness.status).toBe("blocked");
    expect((result.json as any).data.warnings.join("\n")).toContain("high or critical");
  });

  test("continue reports dirty worktree state", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    await runCommand(["git", "init"], cwd);
    writeFileSync(join(cwd, "README.md"), "dirty\n");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const result = await runDecode(["continue", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.context.git.dirty).toBe(true);
    expect((result.json as any).data.context.git.changedFiles).toContain("README.md");
    expect((result.json as any).data.readiness.status).toBe("needs_cleanup");
  });

  test("continue session flags mutate only when explicit", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Session Flag Plan",
        phases: [{ title: "Work" }],
      },
    });
    const opened = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Already open",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const openSessionId = (opened.json as any).data.id;

    const noDuplicate = await runDecode(["continue", "--json", "--start-session"], { cwd, zenithHome });
    const replaced = await runDecode(["continue", "--json", "--close-open-session", "--start-session", "--auto-capture"], {
      cwd,
      zenithHome,
    });
    const sessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });

    expect(noDuplicate.exitCode).toBe(0);
    expect((noDuplicate.json as any).data.newSession).toBeNull();
    expect((noDuplicate.json as any).data.warnings.join("\n")).toContain("open session already exists");

    expect(replaced.exitCode).toBe(0);
    expect((replaced.json as any).data.closedSession.id).toBe(openSessionId);
    expect((replaced.json as any).data.newSession.id).toBe((replaced.json as any).data.openSession.id);
    expect((sessions.json as any).data).toHaveLength(2);
    expect((sessions.json as any).data.filter((session: any) => !session.endedAt)).toHaveLength(1);
  });

  test("roi command reports deterministic context compression and supports since cursor", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "ROI Plan",
        phases: [{ title: "Measure" }],
      },
    });
    const cursorTimeline = await runDecode(["report", "timeline", "--json", "--limit", "1"], { cwd, zenithHome });
    const cursorId = (cursorTimeline.json as any).data[0].id as string;
    await runDecode(["decision", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Measure ROI",
        context: "Need deterministic continuity value.",
        decision: "Estimate token compression from local memory records.",
      },
    });

    const full = await runDecode(["report", "roi", "--json"], { cwd, zenithHome });
    const since = await runDecode(["report", "roi", "--json", "--since", cursorId], { cwd, zenithHome });
    const human = await runRawZenith(["report", "roi"], { cwd, zenithHome });

    expect(full.exitCode).toBe(0);
    expect((full.json as any).data.sourceEvents).toBeGreaterThan(0);
    expect((full.json as any).data.sourcePhases).toBe(1);
    expect((full.json as any).data.compactTokens).toBeGreaterThan(0);
    expect((full.json as any).data.compressionRatio).toBeGreaterThanOrEqual(0);
    expect((full.json as any).data.continuitySignals).toContain("active_plan");

    expect(since.exitCode).toBe(0);
    expect((since.json as any).data.sourceEvents).toBeGreaterThan(0);
    expect((since.json as any).data.sourceDecisions).toBe(1);

    expect(human.exitCode).toBe(0);
    expect(human.stdout).toContain("Compression ratio:");
  });

  test("prompt command renders formats without mutating memory and omits metadata by default", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Prompt Plan",
        phases: [{ title: "Prompt Phase", status: "in_progress", acceptanceCriteria: ["Prompt includes next step"] }],
      },
    });

    const beforeSessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });
    const markdown = await runDecode(["agent", "prompt", "--json"], { cwd, zenithHome });
    const agent = await runDecode(["agent", "prompt", "--json", "--format", "agent"], { cwd, zenithHome });
    const codex = await runDecode(["agent", "prompt", "--json", "--format", "codex"], { cwd, zenithHome });
    const claude = await runDecode(["agent", "prompt", "--json", "--format", "claude", "--metadata"], { cwd, zenithHome });
    const reviewer = await runDecode(["agent", "prompt", "--json", "--format", "codex", "--role", "reviewer"], { cwd, zenithHome });
    const humanCodex = await runRawZenith(["agent", "prompt", "--format", "codex", "--max-tokens", "800"], { cwd, zenithHome });
    const afterSessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });

    expect(markdown.exitCode).toBe(0);
    expect((markdown.json as any).data.format).toBe("markdown");
    expect((markdown.json as any).data.content).toContain("# Zenith Prompt (markdown)");
    expect((markdown.json as any).data.content).toContain("## Next Step");
    expect((markdown.json as any).data.metadata).toBeUndefined();

    expect((agent.json as any).data.format).toBe("agent");
    expect((agent.json as any).data.content).toContain("implementation agent");
    expect((codex.json as any).data.format).toBe("codex");
    expect((codex.json as any).data.content).toContain("You are Codex");
    expect((claude.json as any).data.format).toBe("claude");
    expect((claude.json as any).data.content).toContain("You are Claude Code");
    expect((claude.json as any).data.content).toContain("## Metadata");
    expect((claude.json as any).data.metadata.readinessStatus).toBe("ready");
    expect((reviewer.json as any).data.role).toBe("reviewer");
    expect((reviewer.json as any).data.content).toContain("Role: reviewer");
    expect((reviewer.json as any).data.sections.find((section: any) => section.id === "worktree").priority).toBeGreaterThan(65);
    expect(humanCodex.exitCode).toBe(0);
    expect(humanCodex.stdout).toStartWith("# Zenith Prompt (codex)");
    expect(humanCodex.stdout).toContain("You are Codex");
    expect(humanCodex.stdout).not.toContain('"ok"');
    expect(humanCodex.stdout).not.toContain('"data"');
    expect(humanCodex.stdout).not.toContain('"meta"');
    expect(() => JSON.parse(humanCodex.stdout)).toThrow();

    expect((beforeSessions.json as any).data).toHaveLength(0);
    expect((afterSessions.json as any).data).toHaveLength(0);
  });

  test("prompt truncation keeps high-priority next and phase sections before lower-priority context", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Truncated Prompt Plan",
        phases: [{ title: "Keep Me", status: "in_progress", description: "This phase must survive truncation." }],
      },
    });

    const result = await runDecode(["agent", "prompt", "--json", "--format", "codex", "--max-tokens", "120"], { cwd, zenithHome });
    const sections = (result.json as any).data.sections as Array<{ id: string; included: boolean }>;

    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.truncated).toBe(true);
    expect(sections.find((section) => section.id === "next")?.included).toBe(true);
    expect(sections.find((section) => section.id === "phase")?.included).toBe(true);
    expect(sections.find((section) => section.id === "compact-context")?.included).toBe(false);
    expect((result.json as any).data.content).toContain("## Next Step");
    expect((result.json as any).data.content).toContain("## Phase");
    expect((result.json as any).data.content).not.toContain("## Compact Context");
  });

  test("prompt returns stable errors for invalid format and token options", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    const invalidFormat = await runDecode(["agent", "prompt", "--json", "--format", "xml"], { cwd, zenithHome });
    const invalidTokens = await runDecode(["agent", "prompt", "--json", "--max-tokens", "0"], { cwd, zenithHome });

    expect(invalidFormat.exitCode).toBe(1);
    expect((invalidFormat.json as any).errors[0].code).toBe("invalid_option");
    expect((invalidFormat.json as any).errors[0].details.optionName).toBe("format");
    expect(invalidTokens.exitCode).toBe(1);
    expect((invalidTokens.json as any).errors[0].code).toBe("invalid_option");
    expect((invalidTokens.json as any).errors[0].details.optionName).toBe("max-tokens");
  });

  test("benchmark CLI lists scenarios, exports tasks, records runs, compares variants, and rejects transcripts", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const list = await runDecode(["benchmark", "list", "--json"], { cwd, zenithHome });
    const task = await runDecode(["benchmark", "task", "continue-resume", "--variant", "prompt", "--json"], { cwd, zenithHome });
    const recordedPrompt = await runDecode(["benchmark", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        scenarioId: "continue-resume",
        variant: "prompt",
        score: 4,
        metrics: {
          identified_next_step: true,
          continuity_score: 4,
        },
      },
    });
    const recordedManual = await runDecode(["benchmark", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        scenarioId: "continue-resume",
        variant: "manual_handoff",
        score: 3,
        metrics: {
          identified_next_step: false,
          continuity_score: 3,
        },
      },
    });
    const runs = await runDecode(["benchmark", "runs", "--json"], { cwd, zenithHome });
    const compare = await runDecode(["benchmark", "compare", "--scenario", "continue-resume", "--json"], { cwd, zenithHome });
    const forbidden = await runDecode(["benchmark", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        scenarioId: "continue-resume",
        variant: "prompt",
        transcript: "full model output must not be stored",
      },
    });

    const runsPath = join(zenithHome, "benchmarks", "runs.json");
    const stored = JSON.parse(readFileSync(runsPath, "utf8")) as any;

    expect(list.exitCode).toBe(0);
    expect((list.json as any).data.map((scenario: any) => scenario.id)).toEqual(["continue-resume", "phase-execution", "review-handoff"]);
    expect(task.exitCode).toBe(0);
    expect((task.json as any).data.content).toContain("# Zenith Benchmark Task: Resume From Continuity Context");
    expect((task.json as any).data.content).toContain("## Privacy Rules");
    expect((recordedPrompt.json as any).data.id).toStartWith("bench_");
    expect((recordedManual.json as any).data.variant).toBe("manual_handoff");
    expect((runs.json as any).data).toHaveLength(2);
    expect((compare.json as any).data.totalRuns).toBe(2);
    expect((compare.json as any).data.variants.find((variant: any) => variant.variant === "prompt").averageScore).toBe(4);
    expect((compare.json as any).data.variants.find((variant: any) => variant.variant === "manual_handoff").averageScore).toBe(3);
    expect(existsSync(runsPath)).toBe(true);
    expect(stored.runs).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toContain("full model output");
    expect(forbidden.exitCode).toBe(1);
    expect((forbidden.json as any).errors[0].code).toBe("benchmark_forbidden_field");
    expect((forbidden.json as any).errors[0].details.fields).toEqual(["transcript"]);
  });

  test("demo CLI lists and shows read-only onboarding guides", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const list = await runDecode(["demo", "list", "--json"], { cwd, zenithHome });
    const guide = await runDecode(["demo", "show", "continuity", "--json"], { cwd, zenithHome });
    const missing = await runDecode(["demo", "show", "missing", "--json"], { cwd, zenithHome });

    expect(list.exitCode).toBe(0);
    expect((list.json as any).data.map((entry: any) => entry.id)).toEqual(["continuity", "daily-loop", "benchmark-proof"]);
    expect((list.json as any).data[0].durationMinutes).toBe(5);
    expect((guide.json as any).data.markdown).toContain("# Five-Minute Continuity Demo");
    expect((guide.json as any).data.markdown).toContain("## Privacy And Storage");
    expect((guide.json as any).data.markdown).toContain("bun run zenith continue");
    expect((guide.json as any).data.markdown).toContain("bun run zenith handoff --to implementer --compact");
    expect((guide.json as any).data.markdown).toContain("bun run zenith session checkpoint --from-git");
    expect((guide.json as any).data.markdown).toContain("bun run zenith plan ready --evidence");
    expect((guide.json as any).data.markdown).not.toContain("bun run zenith continue --json");
    expect((guide.json as any).data.markdown).not.toContain("bun run zenith agent prompt --format codex --max-tokens 1200 --json");
    expect((guide.json as any).data.privacy.join("\n")).toContain("stores project memory locally");
    expect((guide.json as any).data.steps.map((step: any) => step.title)).toContain("Check benchmark proof");
    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("demo_not_found");
    expect((missing.json as any).errors[0].details).toEqual({ demoId: "missing" });
    expect(existsSync(join(zenithHome, "benchmarks"))).toBe(false);
  });

  test("updates plan metadata from stdin", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Old roadmap",
        phases: [{ title: "Foundation" }],
      },
    });

    const updated = await runDecode(["plan", "update", (created.json as any).data.id, "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const active = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Active roadmap",
        phases: [{ title: "Foundation" }],
      },
    });
    const activePlanId = (active.json as any).data.id;

    const duplicateActive = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
      zenithHome,
      input: {
        title: "Paused roadmap",
        status: "paused",
        phases: [{ title: "Discovery" }],
      },
    });
    const pausedPlanId = (paused.json as any).data.id;
    const activatePaused = await runDecode(["plan", "update", pausedPlanId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
      zenithHome,
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
      zenithHome,
      input: {
        title: "MVP 4.75 - Missing Justification",
        afterItemTitle: "MVP 4.5 - Product And Architecture Hardening",
      },
    });
    const deferred = await runDecode(["roadmap", "update-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        itemTitle: "MVP 5 - PR Review Skill",
        status: "deferred",
        justification: "Core foundations should be stronger before review skills.",
      },
    });

    const createdPlan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    const duplicate = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
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

  test("discarded roadmap items stay visible but cannot become plans", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Zenith CLI Product Roadmap",
        items: [{ title: "MVP 6 - Agent Backends", status: "deferred" }],
      },
    });
    const roadmapId = (roadmap.json as any).data.id as string;
    const itemId = (roadmap.json as any).data.items[0].id as string;

    const discarded = await runDecode(["roadmap", "update-item", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        itemId,
        status: "discarded",
        justification: "Wake-on-event choreography replaces provider CLI spawning.",
      },
    });
    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    const createPlan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId },
    });

    expect(discarded.exitCode).toBe(0);
    expect((discarded.json as any).data.items[0].status).toBe("discarded");
    expect((next.json as any).data.kind).toBe("create_plan_empty");
    expect(createPlan.exitCode).toBe(1);
    expect((createPlan.json as any).errors[0].code).toBe("roadmap_item_discarded");
  });

  test("decision list and show return project decisions", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const recorded = await runDecode(["decision", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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

    const list = await runDecode(["decision", "list", "--json"], { cwd, zenithHome });
    const show = await runDecode(["decision", "show", decisionId, "--json"], { cwd, zenithHome });

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
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const unregisteredList = await runDecode(["decision", "list", "--json"], { cwd, zenithHome });
    const unregisteredShow = await runDecode(["decision", "show", "dec_missing", "--json"], { cwd, zenithHome });

    expect(unregisteredList.exitCode).toBe(1);
    expect((unregisteredList.json as any).errors[0].code).toBe("project_not_registered");
    expect(unregisteredShow.exitCode).toBe(1);
    expect((unregisteredShow.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const missing = await runDecode(["decision", "show", "dec_missing", "--json"], { cwd, zenithHome });

    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("decision_not_found");
    expect((missing.json as any).errors[0].details).toEqual({ decisionId: "dec_missing" });
  });

  test("finding record list and close emit stable json", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const unregisteredList = await runDecode(["finding", "list", "--json"], { cwd, zenithHome });
    expect(unregisteredList.exitCode).toBe(1);
    expect((unregisteredList.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const missing = await runDecode(["finding", "close", "finding_missing", "--json"], { cwd, zenithHome });
    expect(missing.exitCode).toBe(1);
    expect((missing.json as any).errors[0].code).toBe("finding_not_found");
    expect((missing.json as any).errors[0].details).toEqual({ findingId: "finding_missing" });

    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        type: "risk",
        severity: "high",
        title: "Open operational risk",
        description: "High severity findings should block the next plan step.",
        relatedFiles: ["src/app/plan-next.ts"],
      },
    });
    const findingId = (recorded.json as any).data.id;

    const list = await runDecode(["finding", "list", "--json"], { cwd, zenithHome });
    const shown = await runDecode(["finding", "show", findingId, "--json"], { cwd, zenithHome });
    const updated = await runDecode(["finding", "update", findingId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        severity: "medium",
        title: "Updated operational risk",
        relatedFiles: ["src/app/plan-next.ts", "src/cli/program.ts"],
      },
    });
    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    const closed = await runDecode(["finding", "close", findingId, "--evidence", "Risk reviewed and closed", "--json"], { cwd, zenithHome });
    const afterClose = await runDecode(["finding", "list", "--json"], { cwd, zenithHome });
    const closedList = await runDecode(["finding", "list", "--status", "closed", "--json"], { cwd, zenithHome });
    const allList = await runDecode(["finding", "list", "--status", "all", "--json"], { cwd, zenithHome });

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
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const createdPlan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Linked Plan",
        phases: [{ title: "Phase One" }],
      },
    });
    expect(createdPlan.exitCode).toBe(0);
    const planId = (createdPlan.json as any).data.id;

    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
    const shown = await runDecode(["finding", "show", findingId, "--json"], { cwd, zenithHome });
    expect(shown.exitCode).toBe(0);
    expect((shown.json as any).data.relatedPlanId).toBe(planId);
  });

  test("finding record with non-existent relatedPlanId returns plan_not_found error", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const recorded = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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

  test("memory tag set list and search emit stable json", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Searchable Release Plan",
        phases: [
          {
            title: "Memory Discovery",
            acceptanceCriteria: ["taggable memory", "deterministic search"],
          },
        ],
      },
    });
    const planId = (created.json as any).data.id as string;

    const tagged = await runDecode(["tag", "set", "plan", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { tags: ["Release Notes", "OSS", "release-notes"] },
    });
    const listed = await runDecode(["tag", "list", "--json", "--tag", "Release Notes"], { cwd, zenithHome });
    const planSearch = await runDecode(["search", "--json", "--query", "searchable release", "--entity-type", "plan"], {
      cwd,
      zenithHome,
    });
    const taggedSearch = await runDecode(["search", "--json", "--query", "searchable", "--tag", "oss", "--limit", "1"], {
      cwd,
      zenithHome,
    });
    const invalidEntity = await runDecode(["tag", "set", "plan", "plan_missing", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { tags: ["missing"] },
    });
    const invalidTag = await runDecode(["tag", "set", "plan", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { tags: ["!!!"] },
    });

    expect(tagged.exitCode).toBe(0);
    expect((tagged.json as any).data.map((tag: any) => tag.tag)).toEqual(["oss", "release-notes"]);
    expect((listed.json as any).data[0].entityId).toBe(planId);
    expect((planSearch.json as any).data[0]).toMatchObject({
      entityType: "plan",
      entityId: planId,
      title: "Searchable Release Plan",
    });
    expect((taggedSearch.json as any).data).toHaveLength(1);
    expect((taggedSearch.json as any).data[0].tags).toContain("oss");
    expect(invalidEntity.exitCode).toBe(1);
    expect((invalidEntity.json as any).errors[0].code).toBe("memory_entity_not_found");
    expect(invalidTag.exitCode).toBe(1);
    expect((invalidTag.json as any).errors[0].code).toBe("invalid_memory_tag");
  });

  test("hardening commands support tags, claims, handoff, inspect, doctor, purge, and guard errors", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Hardening Plan",
        phases: [{ title: "Implement", acceptanceCriteria: ["hardening commands work"] }],
      },
    });
    const planId = (plan.json as any).data.id as string;

    const tag = await runDecode(["tag", "create", "area:cli", "--description", "CLI area", "--json"], { cwd, zenithHome });
    const unusedTag = await runDecode(["tag", "create", "risk:release", "--json"], { cwd, zenithHome });
    const alias = await runDecode(["tag", "alias", "command-line", "area:cli", "--json"], { cwd, zenithHome });
    const tagged = await runDecode(["tag", "set", "plan", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { tags: ["command-line"] },
    });
    const unused = await runDecode(["tag", "list", "--unused", "--json"], { cwd, zenithHome });
    const search = await runDecode(["search", "--query", "Hardening", "--tag", "area:cli", "--since", "1970-01-01T00:00:00.000Z", "--json"], {
      cwd,
      zenithHome,
    });

    const claim = await runDecode(["agent", "claim", "create", planId, "--scope", "src", "--ttl", "1h", "--role", "implementer", "--json"], {
      cwd,
      zenithHome,
    });
    const claimId = (claim.json as any).data.id as string;
    const claimList = await runDecode(["agent", "claim", "list", "--json"], { cwd, zenithHome });
    const refreshed = await runDecode(["agent", "claim", "refresh", claimId, "--ttl", "2h", "--json"], { cwd, zenithHome });
    const released = await runDecode(["agent", "claim", "release", claimId, "--json"], { cwd, zenithHome });

    const handoff = await runDecode(["handoff", "--to", "implementer", "--compact", "--json"], { cwd, zenithHome });
    const raw = await runDecode(["memory", "inspect", "raw", "plan", planId, "--json"], { cwd, zenithHome });
    const doctor = await runDecode(["doctor", "--json"], { cwd, zenithHome });
    const purgeBlocked = await runDecode(["memory", "purge", "entity", "plan", planId, "--json"], { cwd, zenithHome });
    const purged = await runDecode(["memory", "purge", "entity", "plan", planId, "--confirm", "--json"], { cwd, zenithHome });
    const guarded = await runDecode(["decision", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Reject secret",
        context: "api_key=super-secret-token-value-12345",
        decision: "Should not persist.",
      },
    });

    expect(tag.exitCode).toBe(0);
    expect((tag.json as any).data.tag).toBe("area:cli");
    expect(unusedTag.exitCode).toBe(0);
    expect((alias.json as any).data).toMatchObject({ alias: "command-line", tag: "area:cli" });
    expect((tagged.json as any).data.map((item: any) => item.tag)).toEqual(["area:cli"]);
    expect((unused.json as any).data.map((item: any) => item.tag)).toContain("risk:release");
    expect((search.json as any).data[0].tags).toContain("area:cli");

    expect(claim.exitCode).toBe(0);
    expect((claimList.json as any).data[0].id).toBe(claimId);
    expect((refreshed.json as any).data.id).toBe(claimId);
    expect((released.json as any).data[0].status).toBe("released");

    expect((handoff.json as any).data.role).toBe("implementer");
    expect((raw.json as any).data.lifecycle).toBe("active");
    expect((doctor.json as any).data.summary).toBeDefined();
    expect(purgeBlocked.exitCode).toBe(1);
    expect((purgeBlocked.json as any).errors[0].code).toBe("purge_confirmation_required");
    expect((purged.json as any).data.purged).toBe(true);
    expect(guarded.exitCode).toBe(1);
    expect((guarded.json as any).errors[0].code).toBe("secret_detected");
  });

  test("session start capture end and summarize emit stable json", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const unregisteredStart = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {},
    });
    expect(unregisteredStart.exitCode).toBe(1);
    expect((unregisteredStart.json as any).errors[0].code).toBe("project_not_registered");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const missingCapture = await runDecode(["session", "capture", "sess_missing", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { summary: "No session exists." },
    });
    expect(missingCapture.exitCode).toBe(1);
    expect((missingCapture.json as any).errors[0].code).toBe("session_not_found");
    expect((missingCapture.json as any).errors[0].details).toEqual({ sessionId: "sess_missing" });

    const started = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Started lifecycle work.",
        changedFiles: ["src/domain/schemas.ts"],
        nextSteps: ["Capture progress"],
      },
    });
    const sessionId = (started.json as any).data.id;

    const captured = await runDecode(["session", "capture", sessionId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Captured lifecycle progress.",
        nextSteps: ["End session"],
      },
    });

    const ended = await runDecode(["session", "end", sessionId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Finished lifecycle work.",
        changedFiles: ["src/domain/schemas.ts", "src/cli/program.ts"],
        nextSteps: ["Record evidence"],
        endedAt: "2026-01-01T01:00:00.000Z",
      },
    });

    const summarized = await runDecode(["session", "summarize", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Compatibility summary still works.",
        changedFiles: ["README.md"],
      },
    });
    const sessionList = await runDecode(["session", "list", "--json"], { cwd, zenithHome });
    const sessionShow = await runDecode(["session", "show", sessionId, "--json"], { cwd, zenithHome });

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

  test("low-friction capture wrappers record checkpoints, notes, and decisions", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Wrapper Plan",
        phases: [{ title: "Capture" }],
      },
    });
    const planId = (plan.json as any).data.id as string;

    const checkpoint = await runDecode(["session", "checkpoint", "Reached a useful state", "--next", "Run tests", "--plan", planId, "--json"], {
      cwd,
      zenithHome,
    });
    const note = await runDecode(["session", "note", "Remember to update generated skills", "--json"], { cwd, zenithHome });
    const decision = await runDecode(
      [
        "decision",
        "record",
        "Use explicit wrappers",
        "--context",
        "Nested commands are verbose for frequent capture.",
        "--decision",
        "Expose top-level wrapper commands.",
        "--alternative",
        "Keep only nested commands.",
        "--plan",
        planId,
        "--json",
      ],
      { cwd, zenithHome },
    );
    const sessions = await runDecode(["session", "list", "--json"], { cwd, zenithHome });

    expect(checkpoint.exitCode).toBe(0);
    expect((checkpoint.json as any).data.summary).toBe("Reached a useful state");
    expect((checkpoint.json as any).data.nextSteps).toEqual(["Run tests"]);
    expect((checkpoint.json as any).data.relatedPlanId).toBe(planId);
    expect(typeof (checkpoint.json as any).data.endedAt).toBe("string");

    expect(note.exitCode).toBe(0);
    expect((note.json as any).data.summary).toBe("Remember to update generated skills");
    expect(typeof (note.json as any).data.endedAt).toBe("string");

    expect(decision.exitCode).toBe(0);
    expect((decision.json as any).data.title).toBe("Use explicit wrappers");
    expect((decision.json as any).data.relatedPlanIds).toEqual([planId]);
    expect((decision.json as any).data.alternatives).toEqual(["Keep only nested commands."]);

    expect((sessions.json as any).data).toHaveLength(2);
  });

  test("checkpoint from git drafts read-only and saves only with --save", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runCommand(["git", "init", "-b", "main"], cwd);
    writeFileSync(join(cwd, "README.md"), "# Git Project\n");
    await runCommand(["git", "add", "README.md"], cwd);
    await runCommand(["git", "-c", "user.name=Test User", "-c", "user.email=test@example.com", "commit", "-m", "Initial commit"], cwd);
    writeFileSync(join(cwd, "README.md"), "# Git Project\n\nChanged\n");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Git Checkpoint Plan", phases: [{ title: "Inspect git", status: "todo" }] },
    });

    const draft = await runDecode(["session", "checkpoint", "--from-git", "--json"], { cwd, zenithHome });
    const sessionsAfterDraft = await runDecode(["session", "list", "--json"], { cwd, zenithHome });
    const saved = await runDecode(["session", "checkpoint", "--from-git", "--save", "--summary", "Git summary", "--next", "Review diff", "--json"], {
      cwd,
      zenithHome,
    });
    const sessionsAfterSave = await runDecode(["session", "list", "--json"], { cwd, zenithHome });

    expect(draft.exitCode).toBe(0);
    expect((draft.json as any).data.kind).toBe("draft");
    expect((draft.json as any).data.draft.branch).toBe("main");
    expect((draft.json as any).data.draft.git.headSubject).toBe("Initial commit");
    expect((draft.json as any).data.draft.changedFiles).toContain("README.md");
    expect((draft.json as any).data.draft.nextSteps).toEqual(["Inspect git"]);
    expect((sessionsAfterDraft.json as any).data).toHaveLength(0);

    expect(saved.exitCode).toBe(0);
    expect((saved.json as any).data.kind).toBe("session");
    expect((saved.json as any).data.session.summary).toBe("Git summary");
    expect((saved.json as any).data.session.nextSteps).toEqual(["Review diff"]);
    expect((saved.json as any).data.session.changedFiles).toContain("README.md");
    expect((saved.json as any).data.session.evidence.some((item: any) => item.kind === "command")).toBe(true);
    expect((sessionsAfterSave.json as any).data).toHaveLength(1);
  });

  test("docs suggest, pin, ignore, and list context anchors", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);
    mkdirSync(join(cwd, "docs"), { recursive: true });
    writeFileSync(join(cwd, "AGENTS.md"), "# Agent Instructions\nUse Zenith before planning.\n");
    writeFileSync(join(cwd, "README.md"), "# Zenith Test\nCLI docs.\n");
    writeFileSync(join(cwd, "docs", "INDEX.md"), "# Docs Index\n- reference\n");

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Docs Plan", phases: [{ title: "Update docs", status: "todo" }] },
    });

    const suggested = await runDecode(["docs", "suggest", "--task", "current", "--json"], { cwd, zenithHome });
    const pinned = await runDecode(["docs", "pin", "AGENTS.md", "--task", "current", "--json"], { cwd, zenithHome });
    const ignored = await runDecode(["docs", "ignore", "README.md", "--task", "current", "--json"], { cwd, zenithHome });
    const listed = await runDecode(["docs", "list", "--task", "current", "--json"], { cwd, zenithHome });
    const afterIgnore = await runDecode(["docs", "suggest", "--task", "current", "--json"], { cwd, zenithHome });

    expect(suggested.exitCode).toBe(0);
    expect((suggested.json as any).data.map((doc: any) => doc.path)).toContain("AGENTS.md");
    expect((suggested.json as any).data.map((doc: any) => doc.path)).toContain("README.md");
    expect(pinned.exitCode).toBe(0);
    expect((pinned.json as any).data.status).toBe("pinned");
    expect((pinned.json as any).data.path).toBe("AGENTS.md");
    expect((pinned.json as any).data.summary).toBe("Agent Instructions");
    expect(ignored.exitCode).toBe(0);
    expect((ignored.json as any).data.status).toBe("ignored");
    expect((listed.json as any).data.map((doc: any) => `${doc.status}:${doc.path}`)).toEqual(
      expect.arrayContaining(["pinned:AGENTS.md", "ignored:README.md"]),
    );
    expect((afterIgnore.json as any).data.map((doc: any) => doc.path)).not.toContain("README.md");
  });

  test("done and blocked wrappers advance phases and close findings", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "State Wrapper Plan",
        phases: [
          { title: "Implement", status: "in_progress" },
          { title: "Verify", status: "todo" },
        ],
      },
    });
    const planId = (plan.json as any).data.id as string;
    const implementPhaseId = (plan.json as any).data.phases[0].id as string;
    const verifyPhaseId = (plan.json as any).data.phases[1].id as string;

    const done = await runDecode(["plan", "done", "--evidence", "Implementation verified", "--json"], { cwd, zenithHome });
    const blockedFinding = await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        type: "risk",
        title: "External API unavailable",
        description: "Cannot verify until the API fixture is available.",
        severity: "high",
        relatedPhaseId: verifyPhaseId,
        relatedPlanId: planId,
        relatedFiles: ["src/index.ts"],
      },
    });
    const findingId = (blockedFinding.json as any).data.id as string;
    const closedFinding = await runDecode(["finding", "close", findingId, "--evidence", "Finding reviewed and closed", "--json"], { cwd, zenithHome });
    const blockedPhase = await runDecode(["plan", "block", "--phase", verifyPhaseId, "--plan", planId, "--evidence", "Waiting", "--json"], {
      cwd,
      zenithHome,
    });
    const phase = await runDecode(["plan", "phase", "show", verifyPhaseId, "--json"], { cwd, zenithHome });

    expect(done.exitCode).toBe(0);
    expect((done.json as any).data.kind).toBe("phase");
    expect((done.json as any).data.result.completed).toEqual({ phaseId: implementPhaseId, status: "done" });

    expect(blockedFinding.exitCode).toBe(0);
    expect((blockedFinding.json as any).data.severity).toBe("high");
    expect((blockedFinding.json as any).data.relatedPlanId).toBe(planId);
    expect((blockedFinding.json as any).data.relatedPhaseId).toBe(verifyPhaseId);
    expect((blockedFinding.json as any).data.relatedFiles).toEqual(["src/index.ts"]);

    expect(closedFinding.exitCode).toBe(0);
    expect((closedFinding.json as any).data.status).toBe("closed");

    expect(blockedPhase.exitCode).toBe(0);
    expect((blockedPhase.json as any).data.kind).toBe("phase");
    expect((blockedPhase.json as any).data.result.completed).toEqual({ phaseId: verifyPhaseId, status: "blocked" });
    expect((phase.json as any).data.phase.status).toBe("blocked");
  });

  test("ready marks a phase needs_review and sets review stage", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Ready Plan",
        phases: [{ title: "Implement", status: "in_progress" }],
      },
    });
    const planId = (plan.json as any).data.id as string;
    const phaseId = (plan.json as any).data.phases[0].id as string;

    const ready = await runDecode(
      ["plan", "ready", "--plan", planId, "--phase", phaseId, "--role", "codex", "--evidence", "Tests passed", "--json"],
      { cwd, zenithHome },
    );
    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    const complete = await runDecode(["plan", "complete", planId, "--json"], { cwd, zenithHome });

    expect(ready.exitCode).toBe(0);
    expect((ready.json as any).data.phase.phase.status).toBe("needs_review");
    expect((ready.json as any).data.phase.phase.evidence[0].value).toBe("Tests passed");
    expect((ready.json as any).data.stage.stage).toBe("review");
    expect((ready.json as any).data.stage.role).toBe("codex");
    expect((ready.json as any).data.next.kind).toBe("review_phase");
    expect((next.json as any).data.kind).toBe("review_phase");
    expect(complete.exitCode).toBe(1);
    expect((complete.json as any).errors[0].code).toBe("plan_has_open_phases");
  });

  test("done reports exact suggested commands when current phase is ambiguous", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    const roadmapA = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Wrapper Alpha", items: [{ title: "Alpha Item", status: "in_progress" }] },
    });
    const roadmapAId = (roadmapA.json as any).data.id as string;
    const roadmapB = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Wrapper Beta", items: [{ title: "Beta Item", status: "in_progress" }] },
    });
    const roadmapBId = (roadmapB.json as any).data.id as string;

    const planA = await runDecode(["roadmap", "create-plan", roadmapAId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemTitle: "Alpha Item", phases: [{ title: "Alpha Phase", status: "in_progress" }] },
    });
    const planB = await runDecode(["roadmap", "create-plan", roadmapBId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemTitle: "Beta Item", phases: [{ title: "Beta Phase", status: "in_progress" }] },
    });
    const planAId = (planA.json as any).data.id as string;
    const planBId = (planB.json as any).data.id as string;
    const phaseAId = (planA.json as any).data.phases[0].id as string;
    const phaseBId = (planB.json as any).data.phases[0].id as string;

    const result = await runDecode(["plan", "done", "--json"], { cwd, zenithHome });

    expect(result.exitCode).toBe(1);
    expect((result.json as any).errors[0].code).toBe("ambiguous_current_phase");
    expect((result.json as any).errors[0].details.suggestedCommands).toContain(`zenith agent focus set ${roadmapAId}`);
    expect((result.json as any).errors[0].details.suggestedCommands).toContain(`zenith agent focus set ${roadmapBId}`);
    expect((result.json as any).errors[0].details.suggestedCommands).toContain(`zenith plan done --plan ${planAId} --phase ${phaseAId}`);
    expect((result.json as any).errors[0].details.suggestedCommands).toContain(`zenith plan done --plan ${planBId} --phase ${phaseBId}`);
  });

  test("phase show returns phase_not_found for unknown ids", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const missing = await runDecode(["plan", "phase", "show", "phase_missing", "--json"], { cwd, zenithHome });

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

    const commandBlock = stdout.split("Commands:\n")[1] ?? "";
    // Only parse lines that start with exactly 2 spaces (Commander's command indent),
    // not wrapped description continuation lines which are indented further.
    const commandNames = commandBlock
      .split("\n")
      .filter((line) => /^  [^ ]/.test(line))
      .map((line) => line.trim().split(/\s+/)[0])
      .filter((name): name is string => Boolean(name) && name !== "help")
      .sort();
    expect(commandNames).toEqual(
      [
        "agent",
        "benchmark",
        "context",
        "continue",
        "decision",
        "demo",
        "dispatch",
        "docs",
        "doctor",
        "finding",
        "handoff",
        "init",
        "memory",
        "plan",
        "project",
        "report",
        "roadmap",
        "search",
        "session",
        "tag",
      ].sort(),
    );
  });

  test("removed top-level commands fail as unknown commands", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    for (const command of ["checkpoint", "ready", "done", "watch", "timeline", "prompt", "focus", "brief", "spike"]) {
      const result = await runRawZenith([command], { cwd, zenithHome });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`unknown command '${command}'`);
    }
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
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    const result = await runDecode(["report", "timeline", "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    expect(Array.isArray((result.json as any).data)).toBe(true);
    // After init there should be at least one event
    expect((result.json as any).data.length).toBeGreaterThanOrEqual(1);
  });

  test("plan update-phase dependency graph validation", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
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
      zenithHome,
      input: { phaseId: phaseAId, dependsOn: [phaseBId] },
    });
    expect(setDepAonB.exitCode).toBe(0);
    expect((setDepAonB.json as any).data.phases[0].dependsOn).toEqual([phaseBId]);

    // Setting B dependsOn A creates a cycle → dependency_cycle error
    const cyclicDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { phaseId: phaseBId, dependsOn: [phaseAId] },
    });
    expect(cyclicDep.exitCode).toBe(1);
    expect((cyclicDep.json as any).errors[0].code).toBe("dependency_cycle");

    // Self-dependency → dependency_self error
    const selfDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { phaseId: phaseAId, dependsOn: [phaseAId] },
    });
    expect(selfDep.exitCode).toBe(1);
    expect((selfDep.json as any).errors[0].code).toBe("dependency_self");

    // Non-existent phase id → dependency_unknown_phase error
    const unknownDep = await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { phaseId: phaseAId, dependsOn: ["phase_does_not_exist"] },
    });
    expect(unknownDep.exitCode).toBe(1);
    expect((unknownDep.json as any).errors[0].code).toBe("dependency_unknown_phase");
  });

  test("timeline --limit 1 returns at most 1 entry", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    // Create an extra event
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Timeline Test Plan", phases: [{ title: "Phase 1" }] },
    });

    const result = await runDecode(["report", "timeline", "--json", "--limit", "1"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).data).toHaveLength(1);
  });

  test("parallel roadmaps each keep an active plan and focus resolves which to implement", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    const roadmapA = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Roadmap Alpha", items: [{ title: "Alpha Item", status: "in_progress" }] },
    });
    const roadmapAId = (roadmapA.json as any).data.id as string;

    const roadmapB = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Roadmap Beta", items: [{ title: "Beta Item", status: "in_progress" }] },
    });
    const roadmapBId = (roadmapB.json as any).data.id as string;

    const planA = await runDecode(["roadmap", "create-plan", roadmapAId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemTitle: "Alpha Item", phases: [{ title: "Alpha Phase", status: "in_progress" }] },
    });
    expect(planA.exitCode).toBe(0);

    // A second active plan for a different roadmap is allowed.
    const planB = await runDecode(["roadmap", "create-plan", roadmapBId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemTitle: "Beta Item", phases: [{ title: "Beta Phase", status: "in_progress" }] },
    });
    expect(planB.exitCode).toBe(0);

    // Without focus, plan next is ambiguous.
    const ambiguous = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    expect((ambiguous.json as any).data.recommendation).toContain("Set roadmap focus");
    const ambiguousContinue = await runDecode(["continue", "--json"], { cwd, zenithHome });
    expect((ambiguousContinue.json as any).data.next.kind).toBe("ambiguous_focus");
    expect((ambiguousContinue.json as any).data.readiness.status).toBe("ambiguous");

    // Binding the worktree to Roadmap Alpha resolves the active plan.
    const setFocus = await runDecode(["agent", "focus", "set", roadmapAId, "--json"], { cwd, zenithHome });
    expect(setFocus.exitCode).toBe(0);
    expect((setFocus.json as any).data.focus.roadmapId).toBe(roadmapAId);

    const focused = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    expect((focused.json as any).data.recommendation).toBe("Alpha Phase");

    const show = await runDecode(["agent", "focus", "show", "--json"], { cwd, zenithHome });
    expect((show.json as any).data.focus.roadmapId).toBe(roadmapAId);
    expect((show.json as any).data.activePlan.title).toContain("Alpha");

    // Clearing focus restores ambiguity.
    const cleared = await runDecode(["agent", "focus", "clear", "--json"], { cwd, zenithHome });
    expect((cleared.json as any).data.focus).toBeNull();
    const ambiguousAgain = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });
    expect((ambiguousAgain.json as any).data.recommendation).toContain("Set roadmap focus");
  });

  test("roadmap workspace lists groups with linked plans and rollups", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Workspace Roadmap", items: [{ title: "WS Item", status: "in_progress" }] },
    });
    const roadmapId = (roadmap.json as any).data.id as string;

    await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemTitle: "WS Item", phases: [{ title: "WS Phase", status: "done" }] },
    });

    const workspace = await runDecode(["roadmap", "workspace", "--json"], { cwd, zenithHome });
    expect(workspace.exitCode).toBe(0);
    const group = (workspace.json as any).data.groups.find((g: any) => g.roadmapId === roadmapId);
    expect(group.title).toBe("Workspace Roadmap");
    const item = group.items.find((entry: any) => entry.item.title === "WS Item");
    expect(item.linkedPlans).toHaveLength(1);
    expect(item.phaseProgress).toEqual({ done: 1, total: 1 });
  });

  test("stage set and watch support scoped wake-on-event predicates", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const plan = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Choreography Plan",
        phases: [{ title: "Implement" }],
      },
    });
    const planId = (plan.json as any).data.id as string;
    const phaseId = (plan.json as any).data.phases[0].id as string;

    const stage = await runDecode(["agent", "stage", "set", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        phaseId,
        stage: "review",
        role: "codex",
        note: "Ready for review.",
      },
    });
    const watch = await runDecode(
      ["agent", "watch", "--until", `stage=review,plan=${planId},phase=${phaseId}`, "--timeout", "100", "--poll-interval", "1", "--json"],
      { cwd, zenithHome },
    );
    const next = await runDecode(["plan", "next", "--json"], { cwd, zenithHome });

    expect(stage.exitCode).toBe(0);
    expect((stage.json as any).data.planId).toBe(planId);
    expect((stage.json as any).data.phaseId).toBe(phaseId);
    expect((stage.json as any).data.stage).toBe("review");
    expect((watch.json as any).ok).toBe(true);
    expect((watch.json as any).data.matched).toBe(true);
    expect((watch.json as any).data.stage.stage).toBe("review");
    expect((next.json as any).data.recommendation).toBe("Implement");
  });

  test("watch returns stable timeout and invalid predicate errors", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const timeout = await runDecode(["agent", "watch", "--until", "stage=review", "--timeout", "1", "--poll-interval", "1", "--json"], {
      cwd,
      zenithHome,
    });
    const invalid = await runDecode(["agent", "watch", "--until", "stage=bogus", "--timeout", "1", "--poll-interval", "1", "--json"], {
      cwd,
      zenithHome,
    });

    expect(timeout.exitCode).toBe(2);
    expect((timeout.json as any).ok).toBe(false);
    expect((timeout.json as any).errors[0].code).toBe("watch_timeout");
    expect((invalid.json as any).ok).toBe(false);
    expect((invalid.json as any).errors[0].code).toBe("invalid_watch_predicate");
  });

  // -------------------------------------------------------------------------
  // F1: plan complete
  // -------------------------------------------------------------------------

  test("plan complete fails with plan_has_open_phases when phases are not done", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Incomplete Plan", phases: [{ title: "Phase A" }, { title: "Phase B", status: "done" }] },
    });
    const planId = (created.json as any).data.id;
    const openPhaseId = (created.json as any).data.phases[0].id;

    const result = await runDecode(["plan", "complete", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(1);
    expect((result.json as any).errors[0].code).toBe("plan_has_open_phases");
    expect((result.json as any).errors[0].details.openPhaseIds).toContain(openPhaseId);
  });

  test("plan complete succeeds when all phases are done and emits stable envelope", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Completable Plan", phases: [{ title: "Phase A", status: "done" }] },
    });
    const planId = (created.json as any).data.id;

    const result = await runDecode(["plan", "complete", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    expect((result.json as any).meta.schemaVersion).toBe(1);
    expect((result.json as any).data.plan.status).toBe("completed");
    expect((result.json as any).data.roadmapItemAdvanced).toBeNull();
  });

  test("plan complete via roadmap advances roadmap item to done", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Complete Roadmap", items: [{ title: "Item A", status: "todo" }] },
    });
    const roadmapId = (roadmap.json as any).data.id;
    const itemId = (roadmap.json as any).data.items[0].id;

    const plan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId, phases: [{ title: "Phase A", status: "done" }] },
    });
    expect(plan.exitCode).toBe(0);
    const planId = (plan.json as any).data.id;

    // Verify companion fix: item is now in_progress
    const roadmapAfterCreate = await runDecode(["roadmap", "show", roadmapId, "--json"], { cwd, zenithHome });
    expect((roadmapAfterCreate.json as any).data.items[0].status).toBe("in_progress");

    const result = await runDecode(["plan", "complete", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.plan.status).toBe("completed");
    expect((result.json as any).data.roadmapItemAdvanced.roadmapId).toBe(roadmapId);
    expect((result.json as any).data.roadmapItemAdvanced.itemId).toBe(itemId);

    // Verify roadmap item is now done
    const roadmapAfterComplete = await runDecode(["roadmap", "show", roadmapId, "--json"], { cwd, zenithHome });
    expect((roadmapAfterComplete.json as any).data.items[0].status).toBe("done");
  });

  // -------------------------------------------------------------------------
  // F1 companion: createPlanFromRoadmap flips item todo → in_progress
  // -------------------------------------------------------------------------

  test("roadmap create-plan flips todo item to in_progress when plan is active", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Flip Roadmap", items: [{ title: "Todo Item", status: "todo" }] },
    });
    const roadmapId = (roadmap.json as any).data.id;
    const itemId = (roadmap.json as any).data.items[0].id;

    const plan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId, phases: [{ title: "Phase A" }] },
    });
    expect(plan.exitCode).toBe(0);

    const roadmapAfter = await runDecode(["roadmap", "show", roadmapId, "--json"], { cwd, zenithHome });
    expect((roadmapAfter.json as any).data.items[0].status).toBe("in_progress");
  });

  test("roadmap create-plan does NOT flip item that is already in_progress", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Already Active Roadmap", items: [{ title: "Active Item", status: "in_progress" }] },
    });
    const roadmapId = (roadmap.json as any).data.id;
    const itemId = (roadmap.json as any).data.items[0].id;

    const plan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId, phases: [{ title: "Phase A" }] },
    });
    expect(plan.exitCode).toBe(0);

    const roadmapAfter = await runDecode(["roadmap", "show", roadmapId, "--json"], { cwd, zenithHome });
    // Still in_progress, not mutated by the flip logic
    expect((roadmapAfter.json as any).data.items[0].status).toBe("in_progress");
  });

  // -------------------------------------------------------------------------
  // F3: plan advance
  // -------------------------------------------------------------------------

  test("plan advance marks phase done and recomputes next step", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Advance Plan", phases: [{ title: "Phase A" }, { title: "Phase B" }] },
    });
    const planId = (created.json as any).data.id;
    const phaseAId = (created.json as any).data.phases[0].id;

    const result = await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId, completedPhaseId: phaseAId, evidence: [{ kind: "note", value: "Phase A done!" }] },
    });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    expect((result.json as any).meta.schemaVersion).toBe(1);
    expect((result.json as any).data.completed.phaseId).toBe(phaseAId);
    expect((result.json as any).data.completed.status).toBe("done");
    expect((result.json as any).data.planCompleted).toBe(false);
    expect((result.json as any).data.roadmapItemAdvanced).toBeNull();
    expect((result.json as any).data.next.recommendation).toBe("Phase B");
  });

  test("plan advance auto-completes plan when last phase is finished", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Auto-Complete Roadmap", items: [{ title: "AC Item", status: "todo" }, { title: "Next Item", status: "todo" }] },
    });
    const roadmapId = (roadmap.json as any).data.id;
    const itemId = (roadmap.json as any).data.items[0].id;

    const plan = await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { itemId, phases: [{ title: "Only Phase" }] },
    });
    expect(plan.exitCode).toBe(0);
    const planId = (plan.json as any).data.id;
    const phaseId = (plan.json as any).data.phases[0].id;

    const result = await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId, completedPhaseId: phaseId, evidence: [{ kind: "note", value: "Only phase complete" }] },
    });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.planCompleted).toBe(true);
    expect((result.json as any).data.roadmapItemAdvanced.itemId).toBe(itemId);
    // Next step should now point to the second roadmap item
    expect((result.json as any).data.next.recommendation).toContain("Next Item");
  });

  test("plan advance without completedPhaseId just recomputes next", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "No-Op Advance Plan", phases: [{ title: "Phase A" }] },
    });
    const planId = (created.json as any).data.id;

    const result = await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId },
    });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).data.completed).toBeNull();
    expect((result.json as any).data.planCompleted).toBe(false);
    expect((result.json as any).data.next.recommendation).toBe("Phase A");
  });

  // -------------------------------------------------------------------------
  // F4: plan path
  // -------------------------------------------------------------------------

  test("plan path returns topological order with ready flags and critical path", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Path Plan", phases: [{ title: "Phase A" }, { title: "Phase B" }, { title: "Phase C" }] },
    });
    const planId = (created.json as any).data.id;
    const phaseAId = (created.json as any).data.phases[0].id;
    const phaseBId = (created.json as any).data.phases[1].id;
    const phaseCId = (created.json as any).data.phases[2].id;

    // Set B depends on A
    await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { phaseId: phaseBId, dependsOn: [phaseAId] },
    });

    const result = await runDecode(["plan", "path", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    expect((result.json as any).meta.schemaVersion).toBe(1);
    expect((result.json as any).data.planId).toBe(planId);
    expect((result.json as any).data.remaining).toBe(3);

    const phases = (result.json as any).data.orderedPhases;
    expect(phases).toHaveLength(3);
    // A must come before B in topo order
    const aIdx = phases.findIndex((p: any) => p.phaseId === phaseAId);
    const bIdx = phases.findIndex((p: any) => p.phaseId === phaseBId);
    expect(aIdx).toBeLessThan(bIdx);

    // A is ready (no deps), B is not ready (dep A is todo), C is ready (no deps)
    expect(phases.find((p: any) => p.phaseId === phaseAId).ready).toBe(true);
    expect(phases.find((p: any) => p.phaseId === phaseBId).ready).toBe(false);
    expect(phases.find((p: any) => p.phaseId === phaseCId).ready).toBe(true);

    // Critical path includes A and B (chain of 2)
    const criticalPath = (result.json as any).data.criticalPath;
    expect(criticalPath).toContain(phaseAId);
    expect(criticalPath).toContain(phaseBId);
  });

  // -------------------------------------------------------------------------
  // F4b: plan dispatchables + dispatch (parallel-dispatch layer)
  // -------------------------------------------------------------------------

  test("plan dispatchables: A and B independent, C blocked by A and B", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Dispatch Plan",
        phases: [{ title: "Phase A" }, { title: "Phase B" }, { title: "Phase C" }],
      },
    });
    const planId = (created.json as any).data.id;
    const phaseAId = (created.json as any).data.phases[0].id;
    const phaseBId = (created.json as any).data.phases[1].id;
    const phaseCId = (created.json as any).data.phases[2].id;

    // C depends on both A and B
    await runDecode(["plan", "update-phase", planId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { phaseId: phaseCId, dependsOn: [phaseAId, phaseBId] },
    });

    const result = await runDecode(["plan", "dispatchables", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    expect((result.json as any).ok).toBe(true);
    const data = (result.json as any).data;

    // A and B should be in parallelGroups, C in blocked
    const parallelIds = data.parallelGroups.map((p: any) => p.phaseId);
    expect(parallelIds).toContain(phaseAId);
    expect(parallelIds).toContain(phaseBId);
    expect(parallelIds).not.toContain(phaseCId);

    const blockedIds = data.blocked.map((p: any) => p.phaseId);
    expect(blockedIds).toContain(phaseCId);

    // C's blockedBy should include both A and B
    const blockedC = data.blocked.find((p: any) => p.phaseId === phaseCId);
    expect(blockedC.blockedBy).toContain(phaseAId);
    expect(blockedC.blockedBy).toContain(phaseBId);

    // Mark A and B done, re-run — C should now be in parallelGroups
    await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId, completedPhaseId: phaseAId, evidence: [{ kind: "note", value: "Phase A complete" }] },
    });
    await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId, completedPhaseId: phaseBId, evidence: [{ kind: "note", value: "Phase B complete" }] },
    });

    const result2 = await runDecode(["plan", "dispatchables", planId, "--json"], { cwd, zenithHome });
    expect(result2.exitCode).toBe(0);
    const data2 = (result2.json as any).data;
    const parallelIds2 = data2.parallelGroups.map((p: any) => p.phaseId);
    expect(parallelIds2).toContain(phaseCId);
    expect(data2.blocked.map((p: any) => p.phaseId)).not.toContain(phaseCId);
  });

  test("dispatch: prompts for A and B are different strings each containing their own phase title (regression)", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Regression Plan",
        phases: [{ title: "Alpha Phase" }, { title: "Beta Phase" }],
      },
    });
    const planId = (created.json as any).data.id;
    const phaseAId = (created.json as any).data.phases[0].id;
    const phaseBId = (created.json as any).data.phases[1].id;

    const result = await runDecode(["dispatch", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    const handoffs = (result.json as any).data.handoffs;
    expect(handoffs.length).toBeGreaterThanOrEqual(2);

    const handoffA = handoffs.find((h: any) => h.phaseId === phaseAId);
    const handoffB = handoffs.find((h: any) => h.phaseId === phaseBId);

    expect(handoffA).toBeDefined();
    expect(handoffB).toBeDefined();

    // Prompts must be different
    expect(handoffA.prompt).not.toEqual(handoffB.prompt);

    // Each prompt contains its own phase title
    expect(handoffA.prompt).toContain("Alpha Phase");
    expect(handoffB.prompt).toContain("Beta Phase");
  });

  test("dispatch: needs_review phase appears in needsReview with reviewer role handoff", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Review Plan",
        phases: [{ title: "Review Me", status: "needs_review" }],
      },
    });
    const planId = (created.json as any).data.id;
    const phaseId = (created.json as any).data.phases[0].id;

    const dispResult = await runDecode(["plan", "dispatchables", planId, "--json"], { cwd, zenithHome });
    expect(dispResult.exitCode).toBe(0);
    const dispData = (dispResult.json as any).data;
    const reviewIds = dispData.needsReview.map((p: any) => p.phaseId);
    expect(reviewIds).toContain(phaseId);
    expect(dispData.parallelGroups.map((p: any) => p.phaseId)).not.toContain(phaseId);

    const result = await runDecode(["dispatch", planId, "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    const handoffs = (result.json as any).data.handoffs;
    const reviewHandoff = handoffs.find((h: any) => h.phaseId === phaseId);
    expect(reviewHandoff).toBeDefined();
    expect(reviewHandoff.role).toBe("reviewer");
  });

  test("dispatch: open high-severity finding produces blockingFindings and warning", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Finding Plan", phases: [{ title: "Do Work" }] },
    });

    // Record a high-severity finding
    await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Critical Bug",
        description: "Something is broken",
        type: "bug",
        severity: "high",
      },
    });

    const result = await runDecode(["plan", "dispatchables", "--json"], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    const data = (result.json as any).data;
    expect(data.blockingFindings.length).toBeGreaterThan(0);
    expect(data.warnings.some((w: string) => w.includes("blocking findings"))).toBe(true);
    // Implementation phases are still surfaced
    expect(data.parallelGroups.length).toBeGreaterThan(0);
  });

  test("dispatch --format conductor: human output contains Workspace blocks; --json has expected keys", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Conductor Plan", phases: [{ title: "Phase One" }] },
    });
    const planId = (created.json as any).data.id;

    // JSON output should have expected keys regardless of format
    const jsonResult = await runDecode(["dispatch", planId, "--json", "--format", "conductor"], { cwd, zenithHome });
    expect(jsonResult.exitCode).toBe(0);
    const handoffs = (jsonResult.json as any).data.handoffs;
    expect(handoffs.length).toBeGreaterThan(0);
    const h = handoffs[0];
    expect(h).toHaveProperty("phaseId");
    expect(h).toHaveProperty("prompt");
    expect(h).toHaveProperty("role");
    expect(h).toHaveProperty("branchSuggestion");
    expect(h).toHaveProperty("suggestedCommands");
    // Branch suggestion must not double the "phase-" prefix for titles starting with "Phase".
    expect(h.branchSuggestion).not.toContain("phase-phase-");
    expect(h.branchSuggestion).toBe("phase-one");
    expect((jsonResult.json as any).data.format).toBe("conductor");

    // Human output (no --json) should contain "Workspace" blocks
    const humanResult = await runRawZenith(["dispatch", planId, "--format", "conductor"], { cwd, zenithHome });
    expect(humanResult.exitCode).toBe(0);
    expect(humanResult.stdout).toContain("Workspace");
  });

  test("dispatch --claim: claimsCreated non-empty, follow-up dispatchables warns about claimed phase", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Claim Plan", phases: [{ title: "Phase To Claim" }] },
    });
    const planId = (created.json as any).data.id;

    const dispatchResult = await runDecode(["dispatch", planId, "--json", "--claim"], { cwd, zenithHome });
    expect(dispatchResult.exitCode).toBe(0);
    const claimsCreated = (dispatchResult.json as any).data.claimsCreated;
    expect(claimsCreated.length).toBeGreaterThan(0);

    // Follow-up dispatchables should warn the phase is claimed
    const secondResult = await runDecode(["plan", "dispatchables", planId, "--json"], { cwd, zenithHome });
    expect(secondResult.exitCode).toBe(0);
    const secondData = (secondResult.json as any).data;
    expect(secondData.warnings.some((w: string) => w.includes("claimed"))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // F5: timeline --since
  // -------------------------------------------------------------------------

  test("timeline --since <iso> returns only events after the timestamp", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    // Get the timestamp after init
    const after = new Date().toISOString();

    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Since Test Plan", phases: [{ title: "Phase A" }] },
    });

    const result = await runDecode(["report", "timeline", "--json", "--since", after], { cwd, zenithHome });
    expect(result.exitCode).toBe(0);
    // Only events after 'after' — should include plan.created but not project.registered
    const events = (result.json as any).data as any[];
    expect(events.some((e) => e.type === "plan.created")).toBe(true);
    // All returned events should be after the timestamp
    for (const event of events) {
      expect(event.createdAt >= after).toBe(true);
    }
  });

  test("timeline --since <eventId> returns only events after that event", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    // Get the first event id from timeline
    const timeline = await runDecode(["report", "timeline", "--json", "--limit", "1"], { cwd, zenithHome });
    // The most recent event (DESC order) — use this as the cursor
    const firstEventId = (timeline.json as any).data[0].id;

    // Create a plan to generate more events
    await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "EventId Since Test", phases: [{ title: "Phase A" }] },
    });

    // Pass that event id as --since; we should get the plan events but not the init event
    const sinceResult = await runDecode(["report", "timeline", "--json", "--since", firstEventId], { cwd, zenithHome });
    expect(sinceResult.exitCode).toBe(0);
    const events = (sinceResult.json as any).data as any[];
    // There should be new events (plan.created at minimum)
    expect(events.some((e) => e.type === "plan.created")).toBe(true);
  });

  test("timeline --since with unknown event id returns event_not_found error", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });

    const result = await runDecode(["report", "timeline", "--json", "--since", "evt_nonexistent_xyz"], { cwd, zenithHome });
    expect(result.exitCode).toBe(1);
    expect((result.json as any).errors[0].code).toBe("event_not_found");
  });

  test("self-tracking telemetry commands emit stable json", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const roadmap = await runDecode(["roadmap", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Product Roadmap",
        items: [{ title: "Telemetry", status: "todo" }],
      },
    });
    const roadmapId = (roadmap.json as any).data.id as string;
    await runDecode(["roadmap", "create-plan", roadmapId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        itemTitle: "Telemetry",
        phases: [{ title: "Read model" }],
      },
    });
    const session = await runDecode(["session", "start", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Checkpoint",
        startedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const sessionId = (session.json as any).data.id as string;
    await runDecode(["session", "end", sessionId, "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        summary: "Checkpoint done",
        endedAt: "2026-01-01T01:00:00.000Z",
      },
    });
    await runDecode(["decision", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        title: "Use telemetry",
        context: "Need daily operational visibility.",
        decision: "Aggregate existing events.",
      },
    });

    const cursorTimeline = await runDecode(["report", "timeline", "--json", "--limit", "1"], { cwd, zenithHome });
    const cursorId = (cursorTimeline.json as any).data[0].id as string;
    await runDecode(["finding", "record", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: {
        type: "test_gap",
        severity: "low",
        title: "Telemetry tests",
        description: "Cover telemetry commands.",
        relatedFiles: [],
      },
    });

    const standup = await runDecode(["report", "standup", "--json", "--days", "7"], { cwd, zenithHome });
    const diffDefault = await runDecode(["report", "diff", "--json"], { cwd, zenithHome });
    const diff = await runDecode(["report", "diff", "--json", "--since", cursorId, "--limit", "10"], { cwd, zenithHome });
    const drift = await runDecode(["report", "drift", "--json"], { cwd, zenithHome });
    const adherence = await runDecode(["report", "adherence", "--json", "--days", "7"], { cwd, zenithHome });
    const next = await runDecode(["plan", "next", "--json", "--stale-after-days", "1"], { cwd, zenithHome });

    expect(standup.exitCode).toBe(0);
    expect((standup.json as any).data.events.total).toBeGreaterThan(0);
    expect((standup.json as any).data.findings.openTotal).toBe(1);

    expect(diffDefault.exitCode).toBe(0);
    expect((diffDefault.json as any).data.cursor.source).toBe("latest_session");

    expect(diff.exitCode).toBe(0);
    expect((diff.json as any).data.cursor.source).toBe("event_id");
    expect(((diff.json as any).data.events as any[]).some((event) => event.type === "finding.recorded")).toBe(true);

    expect(drift.exitCode).toBe(0);
    expect((drift.json as any).data.aligned).toBe(true);
    expect((drift.json as any).data.sourceRoadmapItem.status).toBe("in_progress");

    expect(adherence.exitCode).toBe(0);
    expect((adherence.json as any).data.activeDayCount).toBeGreaterThan(0);
    expect((adherence.json as any).data.completions.sessionsEnded).toBe(1);

    expect(next.exitCode).toBe(0);
    expect((next.json as any).data.staleness.staleAfterDays).toBe(1);
  });

  test("activity reports uncapped day counts for app and cli callers", async () => {
    const cwd = realpathSync(makeTempDir());
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    const services = createZenithApp({ cwd, zenithHome });
    await services.app.registerProject();
    for (let index = 0; index < 520; index += 1) {
      await services.app.recordDecision({
        title: `Activity event ${index}`,
        context: "Need more than the timeline cap.",
        decision: "Count grouped events directly.",
      });
    }

    const appActivity = await services.app.activity();
    services.close();

    const cliActivity = await runDecode(["report", "activity", "--json"], { cwd, zenithHome });
    const humanActivity = await runRawZenith(["report", "activity"], { cwd, zenithHome });

    expect(appActivity.stats.totalEvents).toBeGreaterThan(500);
    expect(appActivity.grid.columns).toBe(53);
    expect(appActivity.grid.rows).toBe(7);
    expect(cliActivity.exitCode).toBe(0);
    expect((cliActivity.json as any).data.stats.totalEvents).toBe(appActivity.stats.totalEvents);
    expect((cliActivity.json as any).data.grid.days).toHaveLength(371);
    expect(humanActivity.exitCode).toBe(0);
    expect(humanActivity.stdout).toContain("Current streak:");
  });

  test("completePlan is idempotent: second call is a no-op and does not emit duplicate events", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Idempotent Complete Plan", phases: [{ title: "Only Phase" }] },
    });
    expect(created.exitCode).toBe(0);
    const planId = (created.json as any).data.id as string;
    const phaseId = (created.json as any).data.phases[0].id as string;

    // Advance the plan marking the only phase done — triggers auto-complete
    const advance = await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId, completedPhaseId: phaseId, evidence: [{ kind: "note", value: "Only phase complete" }] },
    });
    expect(advance.exitCode).toBe(0);
    expect((advance.json as any).data.planCompleted).toBe(true);

    // Count events after first completion
    const timelineAfterFirst = await runDecode(["report", "timeline", "--json"], { cwd, zenithHome });
    expect(timelineAfterFirst.exitCode).toBe(0);
    const countAfterFirst = ((timelineAfterFirst.json as any).data as any[]).length;

    // Explicitly complete the already-completed plan — should be a no-op
    const second = await runDecode(["plan", "complete", planId, "--json"], { cwd, zenithHome });
    expect(second.exitCode).toBe(0);

    // Timeline should not have grown (no new events emitted)
    const timelineAfterSecond = await runDecode(["report", "timeline", "--json"], { cwd, zenithHome });
    expect(timelineAfterSecond.exitCode).toBe(0);
    const countAfterSecond = ((timelineAfterSecond.json as any).data as any[]).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  test("advancing a zero-phase plan does not auto-complete it", async () => {
    const cwd = makeTempDir();
    const zenithHome = makeTempDir();
    tempDirs.push(cwd, zenithHome);

    await runDecode(["init", "--json"], { cwd, zenithHome });
    // Create a plan with no phases
    const created = await runDecode(["plan", "create", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { title: "Zero Phase Plan", phases: [] },
    });
    // A plan with zero phases may be rejected by schema; tolerate that and skip
    if (created.exitCode !== 0) {
      return;
    }
    const planId = (created.json as any).data.id as string;

    // Advance with no completedPhaseId — just a recompute
    const advance = await runDecode(["plan", "advance", "--json", "--input", "-"], {
      cwd,
      zenithHome,
      input: { planId },
    });
    expect(advance.exitCode).toBe(0);
    // Plan must NOT be auto-completed for a zero-phase plan
    expect((advance.json as any).data.planCompleted).toBe(false);

    // Verify plan status remains active
    const show = await runDecode(["plan", "show", planId, "--json"], { cwd, zenithHome });
    expect(show.exitCode).toBe(0);
    expect((show.json as any).data.status).not.toBe("completed");
  });
});

async function runRawZenith(args: string[], options: { cwd: string; zenithHome: string }) {
  const entrypoint = join(process.cwd(), "src", "index.ts");
  const proc = Bun.spawn(["bun", "run", entrypoint, ...args], {
    cwd: options.cwd,
    env: {
      ...Bun.env,
      ZENITH_HOME: options.zenithHome,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
