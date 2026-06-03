import { basename, dirname, resolve } from "node:path";

export type GitSummary = {
  isGitRepo: boolean;
  rootPath: string;
  worktreeRoot: string;
  repoRoot: string;
  branch?: string;
  repositoryUrl?: string;
  headCommit?: string;
  changedFiles: string[];
  dirty: boolean;
};

export class GitAdapter {
  async inspect(cwd: string): Promise<GitSummary> {
    const rootPath = await this.gitText(["rev-parse", "--show-toplevel"], cwd);

    if (!rootPath) {
      const fallback = resolve(cwd);
      return {
        isGitRepo: false,
        rootPath: fallback,
        worktreeRoot: fallback,
        repoRoot: fallback,
        changedFiles: [],
        dirty: false,
      };
    }

    const [branch, repositoryUrl, headCommit, status, commonDir] = await Promise.all([
      this.gitText(["rev-parse", "--abbrev-ref", "HEAD"], rootPath),
      this.gitText(["config", "--get", "remote.origin.url"], rootPath),
      this.gitText(["rev-parse", "HEAD"], rootPath),
      this.gitText(["status", "--porcelain=v1"], rootPath, { preserveWhitespace: true }),
      this.gitText(["rev-parse", "--path-format=absolute", "--git-common-dir"], rootPath),
    ]);

    const changedFiles = parseChangedFiles(status ?? "");
    const repoRoot = commonDir ? dirname(commonDir) : rootPath;

    return {
      isGitRepo: true,
      rootPath: repoRoot,
      worktreeRoot: rootPath,
      repoRoot,
      ...(branch && branch !== "HEAD" ? { branch } : {}),
      ...(repositoryUrl ? { repositoryUrl } : {}),
      ...(headCommit ? { headCommit } : {}),
      changedFiles,
      dirty: changedFiles.length > 0,
    };
  }

  projectNameFromPath(rootPath: string): string {
    return basename(rootPath);
  }

  private async gitText(
    args: string[],
    cwd: string,
    options: { preserveWhitespace?: boolean } = {},
  ): Promise<string | null> {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (exitCode !== 0) {
      return null;
    }

    if (options.preserveWhitespace) {
      return stdout.length > 0 ? stdout : null;
    }

    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

function parseChangedFiles(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.slice(3))
    .map((file) => {
      const renameSeparator = " -> ";
      return file.includes(renameSeparator) ? file.slice(file.indexOf(renameSeparator) + renameSeparator.length) : file;
    });
}
