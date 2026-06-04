import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ZenithError } from "../cli/json-output";
import { createId, nowIso } from "../domain/ids";
import { ensureZenithHome, getZenithHome, type StorageHomeOptions } from "../storage/paths";
import { BenchmarkVariantSchema } from "./scenarios";

const FORBIDDEN_RUN_FIELDS = [
  "transcript",
  "transcripts",
  "output",
  "outputs",
  "prompt",
  "prompts",
  "secret",
  "secrets",
  "token",
  "tokens",
  "apiKey",
  "password",
];

export const BenchmarkMetricValueSchema = z.union([z.number(), z.boolean()]);

export const BenchmarkRunInputSchema = z
  .object({
    scenarioId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    variant: BenchmarkVariantSchema,
    startedAt: z.string().min(1).optional(),
    endedAt: z.string().min(1).optional(),
    score: z.number().min(1).max(5).optional(),
    metrics: z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), BenchmarkMetricValueSchema).default({}),
  })
  .strict();

export const BenchmarkRunRecordSchema = BenchmarkRunInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export const BenchmarkRunStoreSchema = z.object({
  schemaVersion: z.literal(1),
  runs: z.array(BenchmarkRunRecordSchema),
});

export const BenchmarkMetricComparisonSchema = z.object({
  metricId: z.string().min(1),
  samples: z.number().int().nonnegative(),
  average: z.number().optional(),
  trueRate: z.number().optional(),
});

export const BenchmarkVariantComparisonSchema = z.object({
  variant: BenchmarkVariantSchema,
  runs: z.number().int().nonnegative(),
  averageScore: z.number().optional(),
  metrics: z.array(BenchmarkMetricComparisonSchema),
});

export const BenchmarkCompareResultSchema = z.object({
  scenarioId: z.string().min(1).optional(),
  totalRuns: z.number().int().nonnegative(),
  variants: z.array(BenchmarkVariantComparisonSchema),
});

export type BenchmarkRunInput = z.infer<typeof BenchmarkRunInputSchema>;
export type BenchmarkRunRecord = z.infer<typeof BenchmarkRunRecordSchema>;
export type BenchmarkCompareResult = z.infer<typeof BenchmarkCompareResultSchema>;

export function benchmarkRunsPath(options: StorageHomeOptions = {}): string {
  return join(benchmarkResultsDir(options), "runs.json");
}

export function benchmarkResultsDir(options: StorageHomeOptions = {}): string {
  const dir = join(ensureZenithHome(options), "benchmarks");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function benchmarkRunsReadPath(options: StorageHomeOptions = {}): string {
  return join(getZenithHome(options), "benchmarks", "runs.json");
}

export function recordBenchmarkRun(rawInput: unknown, options: StorageHomeOptions = {}): BenchmarkRunRecord {
  rejectForbiddenRunFields(rawInput);
  const input = BenchmarkRunInputSchema.parse(rawInput);
  const store = readBenchmarkRunStore(options);
  const record = BenchmarkRunRecordSchema.parse({
    ...input,
    id: createId("bench"),
    createdAt: nowIso(),
  });
  store.runs.push(record);
  writeBenchmarkRunStore(store, options);
  return record;
}

export function listBenchmarkRuns(options: StorageHomeOptions = {}): BenchmarkRunRecord[] {
  return readBenchmarkRunStore(options).runs;
}

export function compareBenchmarkRuns(
  options: StorageHomeOptions & { scenarioId?: string } = {},
): BenchmarkCompareResult {
  const runs = readBenchmarkRunStore(options).runs.filter((run) => !options.scenarioId || run.scenarioId === options.scenarioId);
  const variants = [...new Set(runs.map((run) => run.variant))].sort();

  return BenchmarkCompareResultSchema.parse({
    ...(options.scenarioId ? { scenarioId: options.scenarioId } : {}),
    totalRuns: runs.length,
    variants: variants.map((variant) => compareVariant(variant, runs.filter((run) => run.variant === variant))),
  });
}

function readBenchmarkRunStore(options: StorageHomeOptions = {}): z.infer<typeof BenchmarkRunStoreSchema> {
  const path = benchmarkRunsReadPath(options);
  if (!existsSync(path)) {
    return { schemaVersion: 1, runs: [] };
  }

  return BenchmarkRunStoreSchema.parse(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function writeBenchmarkRunStore(store: z.infer<typeof BenchmarkRunStoreSchema>, options: StorageHomeOptions = {}): void {
  writeFileSync(benchmarkRunsPath(options), `${JSON.stringify(BenchmarkRunStoreSchema.parse(store), null, 2)}\n`, {
    mode: 0o600,
  });
}

function compareVariant(variant: BenchmarkRunRecord["variant"], runs: BenchmarkRunRecord[]): z.infer<typeof BenchmarkVariantComparisonSchema> {
  const scores = runs.map((run) => run.score).filter((score): score is number => typeof score === "number");
  const metricIds = [...new Set(runs.flatMap((run) => Object.keys(run.metrics)))].sort();

  return {
    variant,
    runs: runs.length,
    ...(scores.length > 0 ? { averageScore: round2(scores.reduce((sum, score) => sum + score, 0) / scores.length) } : {}),
    metrics: metricIds.map((metricId) => compareMetric(metricId, runs)),
  };
}

function compareMetric(metricId: string, runs: BenchmarkRunRecord[]): z.infer<typeof BenchmarkMetricComparisonSchema> {
  const values = runs.map((run) => run.metrics[metricId]).filter((value) => value !== undefined);
  const numeric = values.filter((value): value is number => typeof value === "number");
  const booleans = values.filter((value): value is boolean => typeof value === "boolean");

  return {
    metricId,
    samples: values.length,
    ...(numeric.length > 0 ? { average: round2(numeric.reduce((sum, value) => sum + value, 0) / numeric.length) } : {}),
    ...(booleans.length > 0 ? { trueRate: round2(booleans.filter(Boolean).length / booleans.length) } : {}),
  };
}

function rejectForbiddenRunFields(rawInput: unknown): void {
  if (!rawInput || typeof rawInput !== "object" || Array.isArray(rawInput)) return;
  const fields = FORBIDDEN_RUN_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(rawInput, field));
  if (fields.length === 0) return;

  throw new ZenithError("Benchmark runs must not store transcripts, prompts, outputs, secrets, tokens, or credentials.", {
    code: "benchmark_forbidden_field",
    details: { fields },
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
