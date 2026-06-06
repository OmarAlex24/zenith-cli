import {
  DemoGuideSchema,
  DemoGuideSummarySchema,
  type DemoGuide,
  type DemoGuideSummary,
} from "../domain/schemas";

type DemoGuideSource = Omit<DemoGuide, "markdown">;

const DEMO_GUIDE_SOURCES: DemoGuideSource[] = [
  {
    id: "continuity",
    title: "Five-Minute Continuity Demo",
    description: "A compact walkthrough that shows how Zenith helps an agent resume, act, and capture progress.",
    durationMinutes: 5,
    tags: ["continue", "onboarding", "privacy", "prompt", "benchmarks"],
    whenItHelps: [
      "A coding session starts with a dirty worktree, stale notes, or no shared context.",
      "A user wants an agent to resume from local memory instead of a long chat transcript.",
      "A team needs a fast proof that project memory is local, inspectable, and useful.",
    ],
    privacy: [
      "Zenith stores project memory locally under the configured Zenith home.",
      "Read-only commands such as continue, report roi, handoff, agent prompt, demo, benchmark list, and the TUI do not mutate memory by default.",
      "Benchmark runs store strict metadata only; transcripts, prompts, outputs, secrets, tokens, and credentials are rejected.",
    ],
    prerequisites: [
      "Run from a git checkout.",
      "Install dependencies with bun install.",
      "Use bun run zenith from this source checkout, or zenith when the launcher is installed.",
    ],
    steps: [
      {
        title: "Inspect continuity",
        purpose: "Show the single command an agent should run first.",
        commands: ["bun run zenith continue"],
        expected: "Read where we are, what changed last, what remains, next action, risk radar, freshness, worktree state, and ROI.",
        durationMinutes: 1,
      },
      {
        title: "Render a copyable prompt",
        purpose: "Show how to hand context to an agent without pasting private transcripts.",
        commands: ["bun run zenith handoff --to implementer --compact"],
        expected: "The output keeps next-step and phase context first and omits internal metadata unless requested.",
        durationMinutes: 1,
      },
      {
        title: "Use the daily loop",
        purpose: "Demonstrate explicit progress capture boundaries.",
        commands: [
          "bun run zenith session checkpoint --from-git",
          "bun run zenith session checkpoint \"Verified current phase\" --next \"Run full verification\"",
          "bun run zenith plan ready --evidence \"Verification passed\"",
          "bun run zenith plan done --evidence \"Review passed\"",
        ],
        expected: "Only explicit mutating commands write sessions, decisions, findings, or phase progress.",
        durationMinutes: 1,
      },
      {
        title: "Check benchmark proof",
        purpose: "Show how users can compare continuity workflows without external APIs.",
        commands: [
          "bun run zenith benchmark list",
          "bun run zenith benchmark task continue-resume --variant continue",
          "bun run zenith benchmark compare --scenario continue-resume",
        ],
        expected: "Scenarios are tracked in the repo; run metadata is stored under Zenith home only when recorded.",
        durationMinutes: 1,
      },
      {
        title: "Open the cockpit",
        purpose: "Show the human overview for readiness, ROI, next action, Pulse, and Bench.",
        commands: ["bun run zenith"],
        expected: "The OpenTUI continuity cockpit opens read-only from the source checkout.",
        durationMinutes: 1,
      },
    ],
    nextSteps: [
      "Install the launcher with scripts/install.sh or use the Homebrew/curl packaging templates when publishing a release.",
      "Keep using continue at the start of each agent run; use checkpoint, ready, or done only when progress should be recorded.",
      "Run benchmark tasks manually when comparing no-Zenith, handoff, continue, and prompt workflows.",
    ],
  },
  {
    id: "daily-loop",
    title: "Daily Agent Loop",
    description: "A shorter loop for starting work, capturing a checkpoint, and handing verified work to review.",
    durationMinutes: 3,
    tags: ["continue", "checkpoint", "done"],
    whenItHelps: [
      "A developer wants repeatable daily continuity without opening the full TUI.",
      "An agent needs exact next action and capture commands before editing code.",
    ],
    privacy: [
      "continue is read-only unless explicit session flags are passed.",
      "checkpoint, ready, and done are intentional writes and should summarize, not store transcripts.",
    ],
    prerequisites: ["Project is registered with zenith init.", "An active plan or roadmap item exists."],
    steps: [
      {
        title: "Start from state",
        purpose: "Load the current project state.",
        commands: ["zenith continue"],
        expected: "Readiness and next action tell the agent whether to implement, clean up, or stop.",
        durationMinutes: 1,
      },
      {
        title: "Capture useful progress",
        purpose: "Record a concise handoff point.",
        commands: ["zenith session checkpoint --from-git", "zenith session checkpoint \"Implemented focused change\" --next \"Run verification\""],
        expected: "A session entry records summary and next step without storing a transcript.",
        durationMinutes: 1,
      },
      {
        title: "Hand verified work to review",
        purpose: "Mark implementation ready without claiming review is complete.",
        commands: ["zenith plan ready --evidence \"bun test passed\""],
        expected: "The phase becomes needs_review and stage=review is published through an explicit mutating command.",
        durationMinutes: 1,
      },
    ],
    nextSteps: ["Use zenith handoff --to reviewer --compact when handing context to a reviewer."],
  },
  {
    id: "benchmark-proof",
    title: "Benchmark Proof Loop",
    description: "Show how to export benchmark tasks and compare locally recorded run metadata.",
    durationMinutes: 4,
    tags: ["benchmark", "roi", "local-storage"],
    whenItHelps: [
      "A user wants evidence that continuity commands reduce resume friction.",
      "A maintainer wants repeatable local benchmark tasks without provider integrations.",
    ],
    privacy: [
      "benchmark list, task, runs, and compare are read-only except benchmark record.",
      "benchmark record rejects transcript, prompt, output, secret, token, credential, and unknown fields.",
    ],
    prerequisites: ["Use bun run zenith from the source checkout or an installed zenith launcher."],
    steps: [
      {
        title: "List scenarios",
        purpose: "Inspect available benchmark tasks.",
        commands: ["zenith benchmark list"],
        expected: "Scenario summaries omit full prompts and criteria.",
        durationMinutes: 1,
      },
      {
        title: "Export a task",
        purpose: "Copy a deterministic task for a manual run.",
        commands: ["zenith benchmark task continue-resume --variant prompt"],
        expected: "The task includes criteria, metrics, and privacy rules.",
        durationMinutes: 1,
      },
      {
        title: "Record metadata",
        purpose: "Store only strict run metadata under Zenith home.",
        commands: ["zenith benchmark record --json --input -"],
        expected: "The input accepts scenario id, variant, timestamps, metrics, and score only.",
        durationMinutes: 1,
      },
      {
        title: "Compare variants",
        purpose: "Summarize local run metadata.",
        commands: ["zenith benchmark compare --scenario continue-resume"],
        expected: "Variant run counts and score averages are computed deterministically.",
        durationMinutes: 1,
      },
    ],
    nextSteps: ["Use zenith report roi beside benchmark compare output when explaining context compression."],
  },
];

const DEMO_GUIDES = DEMO_GUIDE_SOURCES.map((guide) =>
  DemoGuideSchema.parse({
    ...guide,
    markdown: renderDemoMarkdown(guide),
  }),
);

export function listDemoGuides(): DemoGuideSummary[] {
  return DEMO_GUIDES.map((guide) =>
    DemoGuideSummarySchema.parse({
      id: guide.id,
      title: guide.title,
      description: guide.description,
      durationMinutes: guide.durationMinutes,
      tags: guide.tags,
    }),
  );
}

export function getDemoGuide(id: string): DemoGuide | undefined {
  return DEMO_GUIDES.find((guide) => guide.id === id);
}

export function loadDemoGuides(): DemoGuide[] {
  return DEMO_GUIDES;
}

function renderDemoMarkdown(guide: DemoGuideSource): string {
  return [
    `# ${guide.title}`,
    "",
    guide.description,
    "",
    `Duration: ${guide.durationMinutes} minutes`,
    "",
    "## When Zenith Helps",
    ...guide.whenItHelps.map((item) => `- ${item}`),
    "",
    "## Privacy And Storage",
    ...guide.privacy.map((item) => `- ${item}`),
    "",
    "## Prerequisites",
    ...guide.prerequisites.map((item) => `- ${item}`),
    "",
    "## Steps",
    ...guide.steps.flatMap((step, index) => [
      `${index + 1}. ${step.title} (${step.durationMinutes} min)`,
      `   Purpose: ${step.purpose}`,
      ...step.commands.map((command) => `   Command: ${command}`),
      `   Expected: ${step.expected}`,
    ]),
    "",
    "## Next Steps",
    ...guide.nextSteps.map((item) => `- ${item}`),
  ].join("\n");
}
