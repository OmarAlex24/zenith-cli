import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  BenchmarkScenarioSchema,
  listBenchmarkScenarios,
  loadBenchmarkScenarios,
  renderBenchmarkTask,
} from "../src/benchmarks/scenarios";
import { compareBenchmarkRuns, listBenchmarkRuns } from "../src/benchmarks/store";

describe("manual benchmark scenarios", () => {
  test("loads tracked scenario fixtures in stable id order", () => {
    const scenarios = loadBenchmarkScenarios();

    expect(scenarios.map((scenario) => scenario.id)).toEqual(["continue-resume", "phase-execution", "review-handoff"]);
    expect(scenarios.map((scenario) => scenario.category).sort()).toEqual(["continuity", "execution", "review"]);
    expect(scenarios.every((scenario) => scenario.successCriteria.length > 0)).toBe(true);
    expect(scenarios.every((scenario) => scenario.metrics.length > 0)).toBe(true);
  });

  test("lists scenario summaries without full prompts", () => {
    const summaries = listBenchmarkScenarios();

    expect(summaries[0]).toEqual({
      id: "continue-resume",
      title: "Resume From Continuity Context",
      category: "continuity",
      difficulty: "basic",
      description: expect.any(String),
      variants: ["no_zenith", "manual_handoff", "continue", "prompt"],
      tags: ["resume", "continue", "readiness"],
    });
    expect("prompt" in summaries[0]!).toBe(false);
    expect("successCriteria" in summaries[0]!).toBe(false);
  });

  test("renders copyable task exports with criteria, metrics, and privacy rules", () => {
    const scenario = loadBenchmarkScenarios().find((entry) => entry.id === "phase-execution")!;
    const task = renderBenchmarkTask(scenario, { variant: "prompt" });

    expect(task.scenarioId).toBe("phase-execution");
    expect(task.variant).toBe("prompt");
    expect(task.content).toContain("# Zenith Benchmark Task: Execute A Scoped Plan Phase");
    expect(task.content).toContain("## Success Criteria");
    expect(task.content).toContain("## Metrics");
    expect(task.content).toContain("## Privacy Rules");
    expect(task.content).toContain("Do not store full model transcripts.");
    expect(task.content).toContain("Do not include secrets");
  });

  test("rejects unsupported variants and invalid scenario shapes", () => {
    const scenario = loadBenchmarkScenarios().find((entry) => entry.id === "continue-resume")!;

    expect(() => renderBenchmarkTask(scenario, { variant: "full_loop" })).toThrow("does not support variant full_loop");
    expect(() => BenchmarkScenarioSchema.parse({ id: "bad" })).toThrow();
  });

  test("reading benchmark runs does not create local storage", () => {
    const zenithHome = mkdtempSync(join(tmpdir(), "zenith-bench-read-"));
    try {
      expect(listBenchmarkRuns({ zenithHome })).toEqual([]);
      expect(compareBenchmarkRuns({ zenithHome })).toEqual({ totalRuns: 0, variants: [] });
      expect(existsSync(join(zenithHome, "benchmarks"))).toBe(false);
    } finally {
      rmSync(zenithHome, { recursive: true, force: true });
    }
  });
});
