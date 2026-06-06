import { ZenithError } from "../cli/json-output";

export const MEMORY_GUARD_LIMITS = {
  entityBytes: 8 * 1024,
  longFieldChars: 2_000,
  shortFieldChars: 300,
  evidenceValueChars: 500,
  evidenceItems: 12,
  nextSteps: 8,
  changedFiles: 200,
};

const SHORT_FIELD_NAMES = new Set(["title", "summary", "next", "nextAction"]);
const LONG_FIELD_NAMES = new Set([
  "body",
  "context",
  "decision",
  "description",
  "justification",
  "recommendation",
  "result",
  "text",
]);

const HIGH_CONFIDENCE_SECRET_PATTERNS: Array<{ code: string; pattern: RegExp }> = [
  { code: "secret_detected", pattern: /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i },
  { code: "secret_detected", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,}\b/ },
  { code: "secret_detected", pattern: /\bglpat-[A-Za-z0-9_\-]{20,}\b/ },
  { code: "secret_detected", pattern: /\bsk-[A-Za-z0-9_\-]{24,}\b/ },
  {
    code: "secret_detected",
    pattern: /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=\-]{16,}/i,
  },
];

const LOW_CONFIDENCE_TOKEN_PATTERN =
  /\b(?:token|secret|password|authorization|api[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=\-]{8,})/gi;

export function guardMemoryWrite(payload: unknown, label = "memory"): void {
  const normalized = JSON.stringify(payload);
  if (byteLength(normalized) > MEMORY_GUARD_LIMITS.entityBytes) {
    throwMemoryGuardError("record_too_large", `${label} exceeds the 8 KB normalized memory limit.`, {
      label,
      bytes: byteLength(normalized),
      limit: MEMORY_GUARD_LIMITS.entityBytes,
    });
  }

  walkMemory(payload, [], (value, path) => validateMemoryString(value, path, label));
  validateStructuredLimits(payload, label);
}

export function sanitizeEventPayload(payload: unknown): unknown {
  return sanitizeValue(payload, []);
}

export function redactLowConfidenceSecrets(value: string): string {
  return value.replace(LOW_CONFIDENCE_TOKEN_PATTERN, (match, token: string) => match.replace(token, "[REDACTED]"));
}

export function requireEvidenceForAction(evidence: Array<{ kind?: string; value: string }>, action: string): void {
  if (evidence.length === 0) {
    throw new ZenithError(`${action} requires evidence.`, {
      code: "evidence_required",
      details: { action },
    });
  }

  const strong = evidence.some((item) => {
    const value = item.value.trim();
    return value.length > 0 && !/^marked .* by zenith\b/i.test(value);
  });
  if (!strong) {
    throw new ZenithError(`${action} requires non-generic evidence.`, {
      code: "weak_evidence",
      details: { action },
    });
  }
}

export function memoryGuardErrorForText(value: string, label = "memory"): ZenithError | null {
  try {
    validateMemoryString(value, [label], label);
    return null;
  } catch (error) {
    return error instanceof ZenithError ? error : null;
  }
}

function validateStructuredLimits(payload: unknown, label: string): void {
  if (!payload || typeof payload !== "object") return;
  const object = payload as Record<string, unknown>;
  const evidence = object.evidence;
  if (Array.isArray(evidence) && evidence.length > MEMORY_GUARD_LIMITS.evidenceItems) {
    throwMemoryGuardError("record_too_large", `${label} includes too many evidence items.`, {
      label,
      count: evidence.length,
      limit: MEMORY_GUARD_LIMITS.evidenceItems,
    });
  }
  const nextSteps = object.nextSteps;
  if (Array.isArray(nextSteps) && nextSteps.length > MEMORY_GUARD_LIMITS.nextSteps) {
    throwMemoryGuardError("record_too_large", `${label} includes too many next steps.`, {
      label,
      count: nextSteps.length,
      limit: MEMORY_GUARD_LIMITS.nextSteps,
    });
  }
  const changedFiles = object.changedFiles;
  if (Array.isArray(changedFiles) && changedFiles.length > MEMORY_GUARD_LIMITS.changedFiles) {
    throwMemoryGuardError("record_too_large", `${label} includes too many changed files.`, {
      label,
      count: changedFiles.length,
      limit: MEMORY_GUARD_LIMITS.changedFiles,
    });
  }
}

function validateMemoryString(value: string, path: string[], label: string): void {
  const fieldName = path[path.length - 1] ?? label;
  const limit = fieldLimit(fieldName, path);
  if (value.length > limit) {
    throwMemoryGuardError("record_too_large", `${fieldName} exceeds the memory field limit.`, {
      label,
      field: path.join("."),
      length: value.length,
      limit,
    });
  }

  for (const { code, pattern } of HIGH_CONFIDENCE_SECRET_PATTERNS) {
    if (pattern.test(value)) {
      throwMemoryGuardError(code, "High-confidence secret detected in memory payload.", {
        label,
        field: path.join("."),
      });
    }
  }

  if (looksLikeFullDiff(value)) {
    throwMemoryGuardError("full_diff_detected", "Full diffs must not be stored in Zenith memory.", {
      label,
      field: path.join("."),
    });
  }
  if (looksLikeLongTranscript(value)) {
    throwMemoryGuardError("long_transcript_detected", "Long transcripts must not be stored in Zenith memory.", {
      label,
      field: path.join("."),
    });
  }
  if (looksLikeLogBlob(value)) {
    throwMemoryGuardError("log_blob_detected", "Log blobs must not be stored in Zenith memory.", {
      label,
      field: path.join("."),
    });
  }
  if (looksLikeCopiedDoc(value)) {
    throwMemoryGuardError("canonical_doc_duplicate", "Documentation should be stored as anchors and summaries, not copied into memory.", {
      label,
      field: path.join("."),
    });
  }
}

function fieldLimit(fieldName: string, path: string[]): number {
  if (fieldName === "value" && path.includes("evidence")) return MEMORY_GUARD_LIMITS.evidenceValueChars;
  if (SHORT_FIELD_NAMES.has(fieldName) || fieldName.endsWith("Title")) return MEMORY_GUARD_LIMITS.shortFieldChars;
  if (LONG_FIELD_NAMES.has(fieldName)) return MEMORY_GUARD_LIMITS.longFieldChars;
  return MEMORY_GUARD_LIMITS.longFieldChars;
}

function walkMemory(value: unknown, path: string[], visitor: (value: string, path: string[]) => void): void {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkMemory(item, [...path, String(index)], visitor));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      walkMemory(item, [...path, key], visitor);
    }
  }
}

function sanitizeValue(value: unknown, path: string[]): unknown {
  if (typeof value === "string") {
    if (path[path.length - 1] === "value" && path.includes("evidence")) return "[evidence]";
    return truncateSanitized(redactLowConfidenceSecrets(value));
  }
  if (Array.isArray(value)) {
    const key = path[path.length - 1] ?? "";
    if (key === "evidence") return { count: value.length };
    if (key === "changedFiles" || key === "nextSteps" || key === "relatedFiles") return { count: value.length };
    return value.slice(0, 20).map((item, index) => sanitizeValue(item, [...path, String(index)]));
  }
  if (value && typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith("_json") || key === "payload" || key === "body" || key === "context" || key === "decision") {
        sanitized[key] = "[redacted]";
        continue;
      }
      sanitized[key] = sanitizeValue(item, [...path, key]);
    }
    return sanitized;
  }
  return value;
}

function truncateSanitized(value: string): string {
  if (value.length <= 160) return value;
  return `${value.slice(0, 157)}...`;
}

function looksLikeFullDiff(value: string): boolean {
  return /^diff --git /m.test(value) || (/^@@ .* @@/m.test(value) && /^\+\+\+ /m.test(value) && /^--- /m.test(value));
}

function looksLikeLongTranscript(value: string): boolean {
  const turns = value.match(/^(?:user|assistant|system|developer|human|ai):/gim);
  return Boolean(turns && turns.length >= 8) || (/transcript/i.test(value) && value.length > 1_200);
}

function looksLikeLogBlob(value: string): boolean {
  const lines = value.split(/\r?\n/);
  if (lines.length < 20) return false;
  const logLike = lines.filter((line) => /\b(?:error|warn|info|debug|trace)\b/i.test(line) || /^\d{4}-\d{2}-\d{2}[T\s]/.test(line));
  return logLike.length >= 12;
}

function looksLikeCopiedDoc(value: string): boolean {
  if (value.length < 3_000) return false;
  const headingCount = (value.match(/^#{1,3}\s+\S/gm) ?? []).length;
  return headingCount >= 6;
}

function throwMemoryGuardError(code: string, message: string, details: Record<string, unknown>): never {
  throw new ZenithError(message, { code, details });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
