import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installAgentPack } from "../src/agents/installer";
import { cleanupTempDir, makeTempDir } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("agent installer", () => {
  test("creates codex root instructions and skill files", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const result = installAgentPack("codex", dir);

    expect(result.files.some((file) => file.path.endsWith("AGENTS.md") && file.action === "created")).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".codex", "skills", "zenith-pr-review", "SKILL.md")))).toBe(true);
    const rootInstructions = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(rootInstructions).toContain("BEGIN ZENITH CLI");
    const skill = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "SKILL.md"), "utf8");
    const cliReference = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "cli-reference.md"), "utf8");
    const workflows = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "workflows.md"), "utf8");
    const prReviewSkill = readFileSync(join(dir, ".codex", "skills", "zenith-pr-review", "SKILL.md"), "utf8");
    const prReviewReferenceFiles = [
      "correctness.md",
      "simplification.md",
      "docs-compliance.md",
      "design-quality.md",
      "consistency.md",
      "pr-comments.md",
      "post-fix-resolution.md",
    ];
    const prReviewReferences = prReviewReferenceFiles.map((file) =>
      readFileSync(join(dir, ".codex", "skills", "zenith-pr-review", "references", file), "utf8"),
    );
    const generated = [rootInstructions, skill, cliReference, workflows, prReviewSkill, ...prReviewReferences].join("\n");

    expect(skill).toContain("name: zenith-memory");
    expect(skill).toContain("description: Use when working in a repository that uses Zenith CLI");
    expect(skill).toContain("Zenith Memory");
    expect(skill).toContain("zenith context compact --json");
    expect(skill).toContain("zenith plan next --json");
    expect(skill).toContain("zenith phase show <phase-id> --json");
    expect(skill).toContain("bun run zenith");
    expect(skill).toContain("bun x tsc --noEmit");
    expect(skill).toContain("propose committing the completed change set");
    expect(rootInstructions).toContain("Use the zenith-pr-review skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-pr-review/SKILL.md");
    expect(rootInstructions).toContain("reviewing a PR, MR, branch, diff, staged changes");
    expect(prReviewSkill).toContain("name: zenith-pr-review");
    expect(prReviewSkill).toContain("description: Use when reviewing a PR, MR, diff, branch");
    expect(prReviewSkill).toContain("zenith context compact --json");
    expect(prReviewSkill).toContain("zenith finding record --json --input -");
    expect(prReviewSkill).toContain("references/correctness.md");
    expect(prReviewSkill).toContain("bug");
    expect(prReviewSkill).toContain("simplification");
    expect(prReviewReferences[0]).toContain("Reviewer Mandate: Correctness");
    expect(prReviewReferences[1]).toContain("Reviewer Mandate: Simplification");
    expect(prReviewReferences[2]).toContain("zenith decision list --json");
    expect(prReviewReferences[3]).toContain("concrete consequence");
    expect(prReviewReferences[4]).toContain("API Surface");
    expect(prReviewReferences[5]).toContain("Existing PR Comments");
    expect(prReviewReferences[6]).toContain("resolveReviewThread");
    expect(cliReference).toContain("zenith plan update <plan-id> --json --input -");
    expect(cliReference).toContain("zenith decision list --json");
    expect(cliReference).toContain("zenith finding show <finding-id> --json");
    expect(cliReference).toContain("zenith finding update <finding-id> --json --input -");
    expect(cliReference).toContain("zenith session start --json --input -");
    expect(cliReference).toContain("zenith session show <session-id> --json");
    expect(cliReference).toContain("deferred");
    expect(cliReference).toContain("bun run zenith");
    expect(workflows).toContain("Continue With Minimal Prompt");
    expect(workflows).toContain("Insert Intermediate Roadmap Work");
    expect(workflows).toContain("Defer Roadmap Work");
    expect(workflows).toContain("Targeted insertions");
    expect(workflows).toContain("Use that phase as the implementation target");
    expect(workflows).toContain("zenith session end session_id --json --input -");
    expect(workflows).toContain("bun run zenith");
    expect(generated).not.toContain("Decode CLI");
    expect(generated).not.toContain("decode-memory");
    expect(generated.replace("Use `decode` only as a legacy alias when `zenith` is unavailable.", "")).not.toMatch(
      /`(?:bun run )?decode\s+[^`]+`/,
    );

    // New capability assertions
    expect(cliReference).toContain("zenith timeline");
    expect(cliReference).toContain("--limit <n>");
    expect(cliReference).toContain("dependsOn");
    expect(cliReference).toContain("Blocked by dependency:");
    expect(cliReference).toContain("relatedPlanId");
    expect(cliReference).toContain("relatedPhaseId");
    expect(skill).toContain("zenith timeline");
    expect(skill).toContain("zenith standup");
    expect(skill).toContain("dependsOn");
    expect(cliReference).toContain("Self-Tracking Telemetry");
    expect(cliReference).toContain("zenith drift");
    expect(cliReference).toContain("zenith activity");
    expect(cliReference).toContain("staleness");
    expect(workflows).toContain("Sequence Phases With Dependencies");
    expect(workflows).toContain("Self-Tracking Telemetry");
    expect(workflows).toContain("zenith adherence");
    expect(workflows).toContain("zenith activity");
    expect(workflows).toContain("dependsOn");
    expect(workflows).toContain("Blocked by dependency");
    expect(workflows).toContain("relatedPlanId");
    expect(workflows).toContain("relatedPhaseId");

    // F1-F5 long-running loop assertions
    expect(cliReference).toContain("zenith plan complete");
    expect(cliReference).toContain("zenith plan advance");
    expect(cliReference).toContain("zenith plan path");
    expect(cliReference).toContain("--since");
    expect(cliReference).toContain("AdvanceResult");
    expect(cliReference).toContain("implement_phase");
    expect(cliReference).toContain("blocking_finding");
    expect(cliReference).toContain("create_plan_empty");
    expect(skill).toContain("zenith plan advance");
    expect(skill).toContain("zenith plan complete");
    expect(skill).toContain("zenith plan path");
    expect(skill).toContain("kind");
    expect(workflows).toContain("Long-Running Loop");
    expect(workflows).toContain("implement_phase");
    expect(workflows).toContain("zenith plan advance");
    expect(workflows).toContain("zenith plan complete");
    expect(workflows).toContain("zenith plan path");
    expect(workflows).toContain("--since");
  });

  test("updates only the marked block in existing agent file", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const target = join(dir, "AGENTS.md");
    writeFileSync(target, "# Existing\n\nKeep this.\n\n<!-- BEGIN DECODE CLI -->\nold\n<!-- END DECODE CLI -->\n", "utf8");

    installAgentPack("codex", dir);
    const content = readFileSync(target, "utf8");

    expect(content).toContain("Keep this.");
    expect(content).toContain("BEGIN ZENITH CLI");
    expect(content).not.toContain("BEGIN DECODE CLI");
    expect(content).not.toContain("\nold\n");
    expect(content).toContain("zenith context compact --json");
    expect(content).toContain("zenith plan next --json");
    expect(content).toContain("zenith-pr-review");
  });

  test("creates claude root instructions and PR review skill files", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const result = installAgentPack("claude", dir);

    expect(result.files.some((file) => file.path.endsWith("CLAUDE.md") && file.action === "created")).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-pr-review", "SKILL.md")))).toBe(true);

    const rootInstructions = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    const prReviewSkill = readFileSync(join(dir, ".claude", "skills", "zenith-pr-review", "SKILL.md"), "utf8");
    const correctness = readFileSync(join(dir, ".claude", "skills", "zenith-pr-review", "references", "correctness.md"), "utf8");

    expect(rootInstructions).toContain(".claude/skills/zenith-memory/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-pr-review/SKILL.md");
    expect(prReviewSkill).toContain("Generated for claude.");
    expect(correctness).toContain("Security footguns");
  });

  test("installAgentPack is idempotent: second run returns all unchanged", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);

    // First install — should create files
    const result1 = installAgentPack("codex", dir);
    expect(result1.files.every((f) => f.action === "created")).toBe(true);

    // Second install — nothing should change
    const result2 = installAgentPack("codex", dir);
    expect(result2.files.every((f) => f.action === "unchanged")).toBe(true);
  });
});
