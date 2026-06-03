import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export type StorageHomeOptions = {
  zenithHome?: string;
  decodeHome?: string;
};

type StorageHomeInput = string | StorageHomeOptions | undefined;

export function getZenithHome(options?: StorageHomeInput): string {
  const homeRoot = userHome();
  const legacyHome = join(homeRoot, ".decode");
  const defaultZenithHome = join(homeRoot, ".zenith");
  const explicitHome = typeof options === "string" ? options : options?.zenithHome ?? options?.decodeHome;
  const home = explicitHome ?? Bun.env.ZENITH_HOME ?? Bun.env.DECODE_HOME ?? (existsSync(legacyHome) ? legacyHome : defaultZenithHome);
  return resolve(home);
}

export function getDecodeHome(explicitHome?: string): string {
  return getZenithHome(explicitHome);
}

export function getDatabasePath(options?: StorageHomeInput): string {
  const home = getZenithHome(options);
  return join(home, basename(home) === ".decode" ? "decode.db" : "zenith.db");
}

export function ensureZenithHome(options?: StorageHomeInput): string {
  const home = getZenithHome(options);
  mkdirSync(home, { recursive: true, mode: 0o700 });
  return home;
}

export function ensureDecodeHome(explicitHome?: string): string {
  return ensureZenithHome(explicitHome);
}

function userHome(): string {
  return Bun.env.HOME ?? homedir();
}
