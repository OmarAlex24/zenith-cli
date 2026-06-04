import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTempDir(prefix = "zenith-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

type CliRunOptions = {
  cwd: string;
  zenithHome?: string;
  input?: unknown;
};

export async function runZenith(args: string[], options: CliRunOptions) {
  const entrypoint = join(process.cwd(), "src", "index.ts");
  const proc = Bun.spawn(["bun", "run", entrypoint, ...args], {
    cwd: options.cwd,
    env: {
      ...Bun.env,
      ...(options.zenithHome ? { ZENITH_HOME: options.zenithHome } : {}),
    },
    stdin: options.input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (options.input !== undefined && proc.stdin) {
    proc.stdin.write(JSON.stringify(options.input));
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    stdout,
    stderr,
    exitCode,
    json: stdout.trim() ? (JSON.parse(stdout) as unknown) : null,
  };
}

export async function runDecode(args: string[], options: CliRunOptions) {
  return runZenith(args, options);
}

export async function runCommand(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${stderr}`);
  }
}
