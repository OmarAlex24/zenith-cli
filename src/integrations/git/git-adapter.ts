import { basename, resolve } from "node:path";

export type GitSummary = {
  isGitRepo: boolean;
  rootPath: string;
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
      return {
        isGitRepo: false,
        rootPath: resolve(cwd),
        changedFiles: [],
        dirty: false,
      };
    }

    const [branch, repositoryUrl, headCommit, status] = await Promise.all([
      this.gitText(["rev-parse", "--abbrev-ref", "HEAD"], rootPath),
      this.gitText(["config", "--get", "remote.origin.url"], rootPath),
      this.gitText(["rev-parse", "HEAD"], rootPath),
      this.gitText(["status", "--porcelain=v1"], rootPath),
    ]);

    const changedFiles = parseChangedFiles(status ?? "");

    return {
      isGitRepo: true,
      rootPath,
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

  private async gitText(args: string[], cwd: string): Promise<string | null> {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (exitCode !== 0) {
      return null;
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
