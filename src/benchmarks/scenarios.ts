import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const BenchmarkVariantSchema = z.enum(["no_zenith", "manual_handoff", "continue", "prompt", "full_loop"]);
export const BenchmarkCategorySchema = z.enum(["continuity", "execution", "review"]);
export const BenchmarkDifficultySchema = z.enum(["basic", "intermediate", "advanced"]);
export const BenchmarkMetricKindSchema = z.enum(["boolean", "score", "duration"]);

export const BenchmarkMetricSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  kind: BenchmarkMetricKindSchema,
  description: z.string().min(1),
});

export const BenchmarkScenarioSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  category: BenchmarkCategorySchema,
  difficulty: BenchmarkDifficultySchema,
  description: z.string().min(1),
  prompt: z.string().min(1),
  setup: z.array(z.string().min(1)).min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  expectedSignals: z.array(z.string().min(1)).min(1),
  privacyRules: z.array(z.string().min(1)).min(1),
  variants: z.array(BenchmarkVariantSchema).min(1),
  metrics: z.array(BenchmarkMetricSchema).min(1),
  tags: z.array(z.string().min(1)).default([]),
});

export const BenchmarkScenarioSummarySchema = BenchmarkScenarioSchema.pick({
  id: true,
  title: true,
  category: true,
  difficulty: true,
  description: true,
  variants: true,
  tags: true,
});

export const BenchmarkTaskExportSchema = z.object({
  scenarioId: z.string().min(1),
  variant: BenchmarkVariantSchema.optional(),
  content: z.string().min(1),
});

export type BenchmarkVariant = z.infer<typeof BenchmarkVariantSchema>;
export type BenchmarkScenario = z.infer<typeof BenchmarkScenarioSchema>;
export type BenchmarkScenarioSummary = z.infer<typeof BenchmarkScenarioSummarySchema>;
export type BenchmarkTaskExport = z.infer<typeof BenchmarkTaskExportSchema>;

const moduleDir = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BENCHMARK_SCENARIO_DIR = join(process.cwd(), "benchmarks", "scenarios");
const SOURCE_BENCHMARK_SCENARIO_DIR = join(moduleDir, "..", "..", "benchmarks", "scenarios");

export function loadBenchmarkScenarios(options: { dir?: string } = {}): BenchmarkScenario[] {
  const dir = options.dir ?? defaultBenchmarkScenarioDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(dir, file), "utf8")) as unknown;
      return BenchmarkScenarioSchema.parse(raw);
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function defaultBenchmarkScenarioDir(): string {
  if (existsSync(DEFAULT_BENCHMARK_SCENARIO_DIR)) return DEFAULT_BENCHMARK_SCENARIO_DIR;
  return SOURCE_BENCHMARK_SCENARIO_DIR;
}

export function listBenchmarkScenarios(options: { dir?: string } = {}): BenchmarkScenarioSummary[] {
  return loadBenchmarkScenarios(options).map((scenario) => BenchmarkScenarioSummarySchema.parse(scenario));
}

export function renderBenchmarkTask(
  scenario: BenchmarkScenario,
  options: { variant?: BenchmarkVariant } = {},
): BenchmarkTaskExport {
  if (options.variant && !scenario.variants.includes(options.variant)) {
    throw new Error(`Scenario ${scenario.id} does not support variant ${options.variant}.`);
  }

  const lines = [
    `# Zenith Benchmark Task: ${scenario.title}`,
    "",
    `Scenario: ${scenario.id}`,
    `Category: ${scenario.category}`,
    `Difficulty: ${scenario.difficulty}`,
    ...(options.variant ? [`Variant: ${options.variant}`] : []),
    "",
    "## Prompt",
    scenario.prompt,
    "",
    "## Setup",
    ...scenario.setup.map((item) => `- ${item}`),
    "",
    "## Success Criteria",
    ...scenario.successCriteria.map((item) => `- ${item}`),
    "",
    "## Expected Zenith Signals",
    ...scenario.expectedSignals.map((item) => `- ${item}`),
    "",
    "## Metrics",
    ...scenario.metrics.map((metric) => `- ${metric.id} (${metric.kind}): ${metric.description}`),
    "",
    "## Privacy Rules",
    ...scenario.privacyRules.map((item) => `- ${item}`),
  ];

  return BenchmarkTaskExportSchema.parse({
    scenarioId: scenario.id,
    ...(options.variant ? { variant: options.variant } : {}),
    content: lines.join("\n"),
  });
}
