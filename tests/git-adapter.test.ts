import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitAdapter } from "../src/integrations/git/git-adapter";
import { cleanupTempDir, makeTempDir, runCommand } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    cleanupTempDir(tempDirs.pop()!);
  }
});

describe("git adapter", () => {
  test("falls back to cwd outside git", async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    const summary = await new GitAdapter().inspect(dir);

    expect(summary.isGitRepo).toBe(false);
    expect(summary.rootPath).toBe(dir);
    expect(summary.changedFiles).toEqual([]);
  });

  test("detects root, branch, and changed files in a git repo", async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    await runCommand(["git", "init"], dir);
    await runCommand(["git", "config", "user.email", "zenith@example.com"], dir);
    await runCommand(["git", "config", "user.name", "Zenith Test"], dir);
    writeFileSync(join(dir, "README.md"), "hello\n", "utf8");
    await runCommand(["git", "add", "README.md"], dir);
    await runCommand(["git", "commit", "-m", "init"], dir);
    writeFileSync(join(dir, "changed.txt"), "changed\n", "utf8");

    const summary = await new GitAdapter().inspect(dir);

    expect(summary.isGitRepo).toBe(true);
    expect(summary.rootPath).toBe(realpathSync(dir));
    expect(summary.changedFiles).toContain("changed.txt");
    expect(summary.headCommit).toBeTruthy();
  });

  test("preserves porcelain paths for modified, untracked, and renamed files", async () => {
    const dir = makeTempDir();
    tempDirs.push(dir);
    await runCommand(["git", "init"], dir);
    await runCommand(["git", "config", "user.email", "zenith@example.com"], dir);
    await runCommand(["git", "config", "user.name", "Zenith Test"], dir);
    writeFileSync(join(dir, "README.md"), "hello\n", "utf8");
    writeFileSync(join(dir, "old.txt"), "old\n", "utf8");
    await runCommand(["git", "add", "README.md", "old.txt"], dir);
    await runCommand(["git", "commit", "-m", "init"], dir);

    writeFileSync(join(dir, "README.md"), "changed\n", "utf8");
    mkdirSync(join(dir, ".github"));
    writeFileSync(join(dir, ".github", "ci.yml"), "name: ci\n", "utf8");
    await runCommand(["git", "mv", "old.txt", "new.txt"], dir);

    const summary = await new GitAdapter().inspect(dir);

    expect(summary.changedFiles).toContain("README.md");
    expect(summary.changedFiles).toContain(".github/");
    expect(summary.changedFiles).toContain("new.txt");
    expect(summary.changedFiles).not.toContain("EADME.md");
    expect(summary.dirty).toBe(true);
  });
});
