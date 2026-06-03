const PREFIX_PATTERN = /^[a-z][a-z0-9_]*$/;

export function createId(prefix: string): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Invalid id prefix: ${prefix}`);
  }

  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
