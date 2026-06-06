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
    expect(result.files.some((file) => file.path.endsWith(join(".codex", "skills", "zenith-multi-agent", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".codex", "skills", "zenith-planner", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".codex", "skills", "zenith-implementer", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".codex", "skills", "zenith-reviewer", "SKILL.md")))).toBe(true);
    const rootInstructions = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(rootInstructions).toContain("BEGIN ZENITH CLI");
    const skill = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "SKILL.md"), "utf8");
    const cliReference = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "cli-reference.md"), "utf8");
    const workflows = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "workflows.md"), "utf8");
    const prReviewSkill = readFileSync(join(dir, ".codex", "skills", "zenith-pr-review", "SKILL.md"), "utf8");
    const multiAgentSkill = readFileSync(join(dir, ".codex", "skills", "zenith-multi-agent", "SKILL.md"), "utf8");
    const plannerSkill = readFileSync(join(dir, ".codex", "skills", "zenith-planner", "SKILL.md"), "utf8");
    const implementerSkill = readFileSync(join(dir, ".codex", "skills", "zenith-implementer", "SKILL.md"), "utf8");
    const reviewerSkill = readFileSync(join(dir, ".codex", "skills", "zenith-reviewer", "SKILL.md"), "utf8");
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
    const generated = [
      rootInstructions,
      skill,
      cliReference,
      workflows,
      prReviewSkill,
      multiAgentSkill,
      plannerSkill,
      implementerSkill,
      reviewerSkill,
      ...prReviewReferences,
    ].join("\n");

    expect(skill).toContain("name: zenith-memory");
    expect(skill).toContain("description: Use when working in a repository that uses Zenith CLI");
    expect(skill).toContain("Zenith Memory");
    expect(skill).toContain("zenith continue");
    expect(skill).toContain("zenith report roi");
    expect(skill).toContain("zenith handoff --to planner|implementer|reviewer --compact");
    expect(skill).toContain("zenith demo show continuity");
    expect(skill).not.toContain("zenith continue --json");
    expect(skill).not.toContain("zenith agent prompt --format codex --json");
    expect(skill).toContain("zenith benchmark");
    expect(skill).toContain("zenith session checkpoint");
    expect(skill).toContain("zenith session checkpoint --from-git");
    expect(skill).toContain("zenith docs suggest --task current");
    expect(skill).toContain("zenith plan ready");
    expect(skill).toContain("zenith plan done");
    expect(skill).toContain("zenith finding record");
    expect(skill).toContain("zenith context compact --json");
    expect(skill).toContain("zenith plan next --json");
    expect(skill).toContain("zenith plan phase show <phase-id> --json");
    expect(skill).toContain("bun run zenith");
    expect(skill).toContain("bun x tsc --noEmit");
    expect(skill).toContain("propose committing the completed change set");
    expect(rootInstructions).toContain("Use the zenith-pr-review skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-pr-review/SKILL.md");
    expect(rootInstructions).toContain("Use the zenith-multi-agent skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-multi-agent/SKILL.md");
    expect(rootInstructions).toContain("designing or debugging the shared wake-on-event choreography protocol");
    expect(rootInstructions).toContain("coordinating non-standard role handoffs beyond planner/implementer/reviewer");
    expect(rootInstructions).toContain("Use the zenith-planner skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-planner/SKILL.md");
    expect(rootInstructions).toContain("Use the zenith-implementer skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-implementer/SKILL.md");
    expect(rootInstructions).toContain("Use the zenith-reviewer skill");
    expect(rootInstructions).toContain(".codex/skills/zenith-reviewer/SKILL.md");
    expect(rootInstructions).toContain("Run `zenith continue`.");
    expect(rootInstructions).toContain("zenith handoff --to implementer --compact");
    expect(rootInstructions).toContain("zenith docs suggest --task current");
    expect(rootInstructions).not.toContain("Run `zenith continue --json`.");
    expect(rootInstructions).toContain("viewing continuity ROI");
    expect(rootInstructions).toContain("viewing onboarding demos");
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
    expect(multiAgentSkill).toContain("name: zenith-multi-agent");
    expect(multiAgentSkill).toContain("Use this skill as the protocol reference");
    expect(multiAgentSkill).toContain("For normal phase work, use the role-specific skills instead");
    expect(multiAgentSkill).toContain("zenith-planner");
    expect(multiAgentSkill).toContain("zenith-implementer");
    expect(multiAgentSkill).toContain("zenith-reviewer");
    expect(multiAgentSkill).toContain("Use this only for custom roles");
    expect(multiAgentSkill).toContain("zenith agent stage set --json --input -");
    expect(multiAgentSkill).toContain("zenith agent watch --until stage=implement");
    expect(multiAgentSkill).toContain("Do not make Zenith spawn Codex");
    expect(plannerSkill).toContain("name: zenith-planner");
    expect(plannerSkill).toContain("zenith context compact --json");
    expect(plannerSkill).toContain("zenith plan next --json");
    expect(plannerSkill).toContain("zenith plan phase show <phase-id> --json");
    expect(plannerSkill).toContain("zenith roadmap create-plan <roadmap-id> --json --input -");
    expect(plannerSkill).toContain("zenith agent stage set --json --input -");
    expect(plannerSkill).toContain("stage=implement");
    expect(plannerSkill).toContain("zenith agent watch --until stage=review");
    expect(plannerSkill).toContain("zenith report diff --json");
    expect(plannerSkill).toContain("tmux or screen");
    expect(plannerSkill).toContain("blocking_finding");
    expect(plannerSkill).toContain("Do not make Zenith spawn Codex");
    expect(implementerSkill).toContain("name: zenith-implementer");
    expect(implementerSkill).toContain("zenith agent watch --until stage=implement");
    expect(implementerSkill).toContain("zenith report diff --json");
    expect(implementerSkill).toContain("zenith plan phase show <phase-id> --json");
    expect(implementerSkill).toContain("zenith finding record --json --input -");
    expect(implementerSkill).toContain("zenith plan ready --plan plan_id --phase phase_id");
    expect(implementerSkill).toContain("stage=review");
    expect(implementerSkill).toContain("tmux or screen");
    expect(implementerSkill).toContain("blocking_finding");
    expect(implementerSkill).toContain("does not mark the phase done");
    expect(reviewerSkill).toContain("name: zenith-reviewer");
    expect(reviewerSkill).toContain("zenith agent watch --until stage=review");
    expect(reviewerSkill).toContain("zenith report diff --json");
    expect(reviewerSkill).toContain("relatedPlanId");
    expect(reviewerSkill).toContain("relatedPhaseId");
    expect(reviewerSkill).toContain("zenith plan advance --json --input -");
    expect(reviewerSkill).toContain("kind=review_phase");
    expect(reviewerSkill).toContain("stage=done");
    expect(reviewerSkill).toContain("tmux or screen");
    expect(reviewerSkill).toContain("blocking_finding");
    expect(cliReference).toContain("zenith plan update <plan-id> --json --input -");
    expect(cliReference).toContain("zenith decision list --json");
    expect(cliReference).toContain("zenith finding show <finding-id> --json");
    expect(cliReference).toContain("zenith finding update <finding-id> --json --input -");
    expect(cliReference).toContain("zenith session start --json --input -");
    expect(cliReference).toContain("zenith session show <session-id> --json");
    expect(cliReference).toContain("zenith agent prompt --format markdown|agent|codex|claude --json");
    expect(cliReference).toContain("--role planner|implementer|reviewer|handoff");
    expect(cliReference).toContain("zenith demo list --json");
    expect(cliReference).toContain("zenith demo show <demo-id> --json");
    expect(cliReference).toContain("zenith benchmark list --json");
    expect(cliReference).toContain("zenith benchmark compare --json");
    expect(cliReference).toContain("Low-Friction Writes");
    expect(cliReference).toContain('zenith session checkpoint "Summary" --next "Next step" --json');
    expect(cliReference).toContain("zenith session checkpoint --from-git --json");
    expect(cliReference).toContain("zenith plan ready --plan <plan-id> --phase <phase-id>");
    expect(cliReference).toContain('zenith finding close <finding-id> --evidence "Reviewed" --json');
    expect(cliReference).toContain("zenith plan block --phase <phase-id> --plan <plan-id> --json");
    expect(cliReference).toContain("Memory Discovery");
    expect(cliReference).toContain("zenith search --json --query <text>");
    expect(cliReference).toContain("zenith tag set <entity-type> <entity-id> --json --input -");
    expect(cliReference).toContain("zenith tag list --json");
    expect(cliReference).toContain("deferred");
    expect(cliReference).toContain("discarded");
    expect(cliReference).toContain("bun run zenith");
    expect(workflows).toContain("Continue With Minimal Prompt");
    expect(workflows).toContain("zenith handoff --to implementer --compact");
    expect(workflows).toContain("zenith demo show continuity");
    expect(workflows).not.toContain("zenith agent prompt --format codex --json");
    expect(workflows).not.toContain("zenith demo show continuity --json");
    expect(workflows).toContain("Discover Existing Memory");
    expect(workflows).toContain('zenith search --json --query "release docs"');
    expect(workflows).toContain("zenith tag set plan plan_id --json --input -");
    expect(workflows).toContain("Insert Intermediate Roadmap Work");
    expect(workflows).toContain("Defer Roadmap Work");
    expect(workflows).toContain("Targeted insertions");
    expect(workflows).toContain("Use that phase as the implementation target");
    expect(workflows).toContain("zenith session end session_id --json --input -");
    expect(workflows).toContain('zenith session checkpoint "Verified current phase" --next "Next action"');
    expect(workflows).toContain("zenith session checkpoint --from-git");
    expect(workflows).toContain("zenith plan ready --plan <planId> --phase <phaseId>");
    expect(workflows).toContain("bun run zenith");
    expect(generated).not.toMatch(/\bdecode\b/i);

    // New capability assertions
    expect(cliReference).toContain("zenith report timeline");
    expect(cliReference).toContain("--limit <n>");
    expect(cliReference).toContain("dependsOn");
    expect(cliReference).toContain("Blocked by dependency:");
    expect(cliReference).toContain("relatedPlanId");
    expect(cliReference).toContain("relatedPhaseId");
    expect(skill).toContain("zenith report timeline");
    expect(skill).toContain("zenith report standup");
    expect(skill).toContain("dependsOn");
    expect(cliReference).toContain("Self-Tracking Telemetry");
    expect(cliReference).toContain("Agent Choreography");
    expect(cliReference).toContain("zenith agent stage set --json --input -");
    expect(cliReference).toContain("zenith agent watch --until stage=review");
    expect(cliReference).toContain("zenith-planner");
    expect(cliReference).toContain("zenith-implementer");
    expect(cliReference).toContain("zenith-reviewer");
    expect(cliReference).toContain("zenith report drift");
    expect(cliReference).toContain("zenith report activity");
    expect(cliReference).toContain("staleness");
    expect(workflows).toContain("Sequence Phases With Dependencies");
    expect(workflows).toContain("Self-Tracking Telemetry");
    expect(workflows).toContain("Multi-Agent Choreography");
    expect(workflows).toContain("Role-Based Choreography Skills");
    expect(workflows).toContain("zenith-planner");
    expect(workflows).toContain("zenith-implementer");
    expect(workflows).toContain("zenith-reviewer");
    expect(workflows).toContain("stage=review");
    expect(workflows).toContain("zenith agent watch --until");
    expect(workflows).toContain("zenith report adherence");
    expect(workflows).toContain("zenith report activity");
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
    expect(cliReference).toContain("review_phase");
    expect(cliReference).toContain("blocking_finding");
    expect(cliReference).toContain("create_plan_empty");
    expect(skill).toContain("zenith plan advance");
    expect(skill).toContain("zenith plan complete");
    expect(skill).toContain("zenith plan path");
    expect(skill).toContain("kind");
    expect(workflows).toContain("Long-Running Loop");
    expect(workflows).toContain("implement_phase");
    expect(workflows).toContain("review_phase");
    expect(workflows).toContain("zenith plan advance");
    expect(workflows).toContain("zenith plan complete");
    expect(workflows).toContain("zenith plan path");
    expect(workflows).toContain("--since");
  });

  test("updates only the marked block in existing agent file", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const target = join(dir, "AGENTS.md");
    writeFileSync(target, "# Existing\n\nKeep this.\n\n<!-- BEGIN ZENITH CLI -->\nold\n<!-- END ZENITH CLI -->\n", "utf8");

    installAgentPack("codex", dir);
    const content = readFileSync(target, "utf8");

    expect(content).toContain("Keep this.");
    expect(content).toContain("BEGIN ZENITH CLI");
    expect(content).not.toContain("\nold\n");
    expect(content).toContain("zenith context compact --json");
    expect(content).toContain("zenith plan next --json");
    expect(content).toContain("zenith-pr-review");
    expect(content).toContain("zenith-multi-agent");
    expect(content).toContain("zenith-planner");
    expect(content).toContain("zenith-implementer");
    expect(content).toContain("zenith-reviewer");
  });

  test("README quick path stays markdown-first and links to machine reference", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const reference = readFileSync(join(process.cwd(), "docs", "reference.md"), "utf8");
    const dailyFlow = sectionBetween(readme, "## Daily Flow", "## Agent Workflow");

    expect(dailyFlow).toContain("zenith continue");
    expect(dailyFlow).toContain("zenith handoff --to implementer --compact");
    expect(dailyFlow).toContain("zenith session checkpoint --from-git");
    expect(dailyFlow).toContain('zenith session checkpoint "What changed" --next "What should happen next"');
    expect(dailyFlow).toContain('zenith plan ready --evidence "Verification passed"');
    expect(dailyFlow).toContain("zenith plan done");
    expect(dailyFlow).toContain('zenith finding record "What is blocked" --description "Why"');
    expect(dailyFlow).not.toContain("continue --json");
    expect(dailyFlow).not.toMatch(/prompt[^\n]*--json/);
    expect(dailyFlow).not.toContain("session start");
    expect(readme).toContain("[docs/reference.md](docs/reference.md)");
    expect(reference).toContain("# Zenith Machine/API Reference");
    expect(reference).toContain("zenith continue --json");
    expect(reference).toContain("zenith agent prompt --format codex --max-tokens 800 --json");
  });

  test("creates claude root instructions and role skill files", () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const result = installAgentPack("claude", dir);

    expect(result.files.some((file) => file.path.endsWith("CLAUDE.md") && file.action === "created")).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-pr-review", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-multi-agent", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-planner", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-implementer", "SKILL.md")))).toBe(true);
    expect(result.files.some((file) => file.path.endsWith(join(".claude", "skills", "zenith-reviewer", "SKILL.md")))).toBe(true);

    const rootInstructions = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    const prReviewSkill = readFileSync(join(dir, ".claude", "skills", "zenith-pr-review", "SKILL.md"), "utf8");
    const multiAgentSkill = readFileSync(join(dir, ".claude", "skills", "zenith-multi-agent", "SKILL.md"), "utf8");
    const plannerSkill = readFileSync(join(dir, ".claude", "skills", "zenith-planner", "SKILL.md"), "utf8");
    const implementerSkill = readFileSync(join(dir, ".claude", "skills", "zenith-implementer", "SKILL.md"), "utf8");
    const reviewerSkill = readFileSync(join(dir, ".claude", "skills", "zenith-reviewer", "SKILL.md"), "utf8");
    const correctness = readFileSync(join(dir, ".claude", "skills", "zenith-pr-review", "references", "correctness.md"), "utf8");

    expect(rootInstructions).toContain(".claude/skills/zenith-memory/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-pr-review/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-multi-agent/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-planner/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-implementer/SKILL.md");
    expect(rootInstructions).toContain(".claude/skills/zenith-reviewer/SKILL.md");
    expect(prReviewSkill).toContain("Generated for claude.");
    expect(multiAgentSkill).toContain("Generated for claude.");
    expect(plannerSkill).toContain("Generated for claude.");
    expect(implementerSkill).toContain("Generated for claude.");
    expect(reviewerSkill).toContain("Generated for claude.");
    expect(reviewerSkill).toContain("zenith plan advance --json --input -");
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

function sectionBetween(content: string, startHeading: string, endHeading: string): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return content.slice(start, end);
}
