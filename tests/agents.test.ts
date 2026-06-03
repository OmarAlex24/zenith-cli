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
    expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toContain("BEGIN ZENITH CLI");
    const skill = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "SKILL.md"), "utf8");
    const cliReference = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "cli-reference.md"), "utf8");
    const workflows = readFileSync(join(dir, ".codex", "skills", "zenith-memory", "references", "workflows.md"), "utf8");
    const generated = [readFileSync(join(dir, "AGENTS.md"), "utf8"), skill, cliReference, workflows].join("\n");

    expect(skill).toContain("name: zenith-memory");
    expect(skill).toContain("description: Use when working in a repository that uses Zenith CLI");
    expect(skill).toContain("Zenith Memory");
    expect(skill).toContain("zenith context compact --json");
    expect(skill).toContain("zenith plan next --json");
    expect(skill).toContain("zenith phase show <phase-id> --json");
    expect(skill).toContain("bun run zenith");
    expect(skill).toContain("bun x tsc --noEmit");
    expect(cliReference).toContain("zenith plan update <plan-id> --json --input -");
    expect(cliReference).toContain("zenith decision list --json");
    expect(cliReference).toContain("bun run zenith");
    expect(workflows).toContain("Continue With Minimal Prompt");
    expect(workflows).toContain("Use that phase as the implementation target");
    expect(workflows).toContain("bun run zenith");
    expect(generated).not.toContain("Decode CLI");
    expect(generated).not.toContain("decode-memory");
    expect(generated.replace("Use `decode` only as a legacy alias when `zenith` is unavailable.", "")).not.toMatch(
      /`(?:bun run )?decode\s+[^`]+`/,
    );
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
  });
});
