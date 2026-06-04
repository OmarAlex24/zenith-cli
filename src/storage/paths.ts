import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type StorageHomeOptions = {
  zenithHome?: string;
};

type StorageHomeInput = string | StorageHomeOptions | undefined;

export function getZenithHome(options?: StorageHomeInput): string {
  const homeRoot = userHome();
  const defaultZenithHome = join(homeRoot, ".zenith");
  const explicitHome = typeof options === "string" ? options : options?.zenithHome;
  const home = explicitHome ?? Bun.env.ZENITH_HOME ?? defaultZenithHome;
  return resolve(home);
}

export function getDatabasePath(options?: StorageHomeInput): string {
  const home = getZenithHome(options);
  return join(home, "zenith.db");
}

export function ensureZenithHome(options?: StorageHomeInput): string {
  const home = getZenithHome(options);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  return home;
}

function userHome(): string {
  return Bun.env.HOME ?? homedir();
}
