export const OUTPUT_SCHEMA_VERSION = 1;

export type JsonError = {
  code: string;
  message: string;
  details?: unknown;
};

export type JsonEnvelope<T> = {
  ok: boolean;
  data: T | null;
  warnings: string[];
  errors: JsonError[];
  meta: {
    schemaVersion: number;
  };
};

export class ZenithError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly exitCode: number;

  constructor(message: string, options: { code?: string; details?: unknown; exitCode?: number } = {}) {
    super(message);
    this.name = "ZenithError";
    this.code = options.code ?? "zenith_error";
    this.details = options.details;
    this.exitCode = options.exitCode ?? 1;
  }
}

export { ZenithError as DecodeError };

export function ok<T>(data: T, warnings: string[] = []): JsonEnvelope<T> {
  return {
    ok: true,
    data,
    warnings,
    errors: [],
    meta: { schemaVersion: OUTPUT_SCHEMA_VERSION },
  };
}

export function fail(error: unknown, warnings: string[] = []): JsonEnvelope<never> {
  const normalized = normalizeError(error);

  return {
    ok: false,
    data: null,
    warnings,
    errors: [normalized],
    meta: { schemaVersion: OUTPUT_SCHEMA_VERSION },
  };
}

export function normalizeError(error: unknown): JsonError {
  if (error instanceof ZenithError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  if (error instanceof Error) {
    return {
      code: "unexpected_error",
      message: error.message,
    };
  }

  return {
    code: "unexpected_error",
    message: String(error),
  };
}

export function exitCodeFor(error: unknown): number {
  return error instanceof ZenithError ? error.exitCode : 1;
}
