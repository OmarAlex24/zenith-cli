import { Command } from "commander";
import { installAgentPack, type AgentKind } from "../agents/installer";
import { createZenithApp } from "../app/factory";
import { listBenchmarkScenarios, loadBenchmarkScenarios, renderBenchmarkTask } from "../benchmarks/scenarios";
import { compareBenchmarkRuns, listBenchmarkRuns, recordBenchmarkRun } from "../benchmarks/store";
import { getDemoGuide, listDemoGuides } from "../demo/guides";
import { GitAdapter } from "../integrations/git/git-adapter";
import type { FindingListStatus } from "../storage/repository";
import { exitCodeFor, fail, ok, ZenithError } from "./json-output";
import { readJsonInput } from "./input";

export type RunCliOptions = {
  cwd?: string;
  zenithHome?: string;
  dbPath?: string;
};

type CommandOptions = {
  json?: boolean;
  input?: string;
  phase?: string;
  plan?: string;
  finding?: string;
  markPhase?: string;
  status?: string;
  limit?: string;
  since?: string;
  days?: string;
  staleAfterDays?: string;
  until?: string;
  timeout?: string;
  pollInterval?: string;
  query?: string;
  tag?: string;
  entityType?: string;
  startSession?: boolean;
  closeOpenSession?: boolean;
  autoCapture?: boolean;
  context?: string;
  decision?: string;
  consequences?: string;
  description?: string;
  severity?: string;
  type?: string;
  next?: string[];
  alternative?: string[];
  file?: string[];
  evidence?: string[];
  format?: string;
  maxTokens?: string;
  metadata?: boolean;
  variant?: string;
  scenario?: string;
};

export async function runCli(argv = process.argv, options: RunCliOptions = {}): Promise<void> {
  const program = new Command();
  program.name("zenith").description("Local-first project memory and agent coordination CLI");

  program
    .command("init")
    .description("Register the current git root in private Zenith memory")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.registerProject(), humanProjectDetection);
    });

  const project = program.command("project").description("Project detection and status");

  project
    .command("detect")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.detectProject(), humanProjectDetection);
    });

  project
    .command("status")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.getProjectStatus(), humanProjectStatus);
    });

  const context = program.command("context").description("Agent-readable project context");

  context
    .command("get")
    .option("--json", "Emit stable JSON")
    .option("--phase <phase-id>", "Include extra context for a specific phase id")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) => app.getContext(toContextOptions(commandOptions)),
        humanMarkdown,
      );
    });

  context
    .command("compact")
    .option("--json", "Emit stable JSON")
    .option("--phase <phase-id>", "Include extra context for a specific phase id")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) => app.compactContext(toContextOptions(commandOptions)),
        humanMarkdown,
      );
    });

  const brief = program.command("brief").description("Project brief memory");

  brief
    .command("set")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.setBrief(await readJsonInput(commandOptions.input)), humanBrief);
    });

  brief
    .command("show")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showBrief(), humanBrief);
    });

  brief
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listBriefs(), humanBriefList);
    });

  const roadmap = program.command("roadmap").description("Long-running project direction");

  roadmap
    .command("create")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.createRoadmap(await readJsonInput(commandOptions.input)), humanRoadmap);
    });

  roadmap
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listRoadmaps(), humanRoadmapList);
    });

  roadmap
    .command("workspace")
    .description("Roadmaps with their linked plans, phase rollups, and worktree focus")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.roadmapWorkspace(), humanRoadmapWorkspace);
    });

  roadmap
    .command("show")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showRoadmap(roadmapId), humanRoadmap);
    });

  roadmap
    .command("update")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.updateRoadmap(roadmapId, await readJsonInput(commandOptions.input)),
      humanRoadmap);
    });

  roadmap
    .command("add-item")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.addRoadmapItem(roadmapId, await readJsonInput(commandOptions.input)),
      humanRoadmap);
    });

  roadmap
    .command("update-item")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.updateRoadmapItem(roadmapId, await readJsonInput(commandOptions.input)),
      humanRoadmap);
    });

  roadmap
    .command("import-plan")
    .argument("<plan-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.importPlanToRoadmap(planId, await readJsonInput(commandOptions.input)),
      humanRoadmap);
    });

  roadmap
    .command("create-plan")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.createPlanFromRoadmap(roadmapId, await readJsonInput(commandOptions.input)),
      humanPlan);
    });

  const focus = program.command("focus").description("Bind the current worktree/branch to a roadmap");

  focus
    .command("show")
    .description("Show the roadmap focus resolved for the current worktree")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.focusStatus(), humanFocusStatus);
    });

  focus
    .command("set")
    .description("Bind the current worktree to a roadmap")
    .argument("<roadmap-id>")
    .option("--json", "Emit stable JSON")
    .action(async (roadmapId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.setFocus(roadmapId), humanFocusStatus);
    });

  focus
    .command("clear")
    .description("Remove the roadmap focus for the current worktree")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.clearFocus(), humanFocusStatus);
    });

  const stage = program.command("stage").description("Agent choreography stage state");

  stage
    .command("set")
    .description("Set project, plan, or phase stage state for wake-on-event workflows")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.setStage(await readJsonInput(commandOptions.input)), humanStage);
    });

  const spike = program.command("spike").description("Bounded investigations");

  spike
    .command("create")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.createSpike(await readJsonInput(commandOptions.input)), humanSpike);
    });

  spike
    .command("record")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.recordSpike(await readJsonInput(commandOptions.input)), humanSpike);
    });

  spike
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listSpikes(), humanSpikeList);
    });

  spike
    .command("show")
    .argument("<spike-id>")
    .option("--json", "Emit stable JSON")
    .action(async (spikeId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showSpike(spikeId), humanSpike);
    });

  spike
    .command("conclude")
    .argument("<spike-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (spikeId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.concludeSpike(spikeId, await readJsonInput(commandOptions.input)),
      humanSpike);
    });

  const plan = program.command("plan").description("Plans and phases");

  plan
    .command("create")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.createPlan(await readJsonInput(commandOptions.input)), humanPlan);
    });

  plan
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listPlans(), (plans) =>
        plans.map((item) => `${item.id} ${item.status} ${item.title}`).join("\n"),
      );
    });

  plan
    .command("show")
    .argument("<plan-id>")
    .option("--json", "Emit stable JSON")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showPlan(planId), humanPlan);
    });

  plan
    .command("update")
    .argument("<plan-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.updatePlan(planId, await readJsonInput(commandOptions.input)),
      humanPlan);
    });

  plan
    .command("update-phase")
    .argument("<plan-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.updatePhase(planId, await readJsonInput(commandOptions.input)),
      humanPlan);
    });

  plan
    .command("next")
    .option("--json", "Emit stable JSON")
    .option("--stale-after-days <n>", "Include staleness metadata when the next step is older than n days")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.nextPlanStep({
          ...parseStaleAfterDaysOption(commandOptions.staleAfterDays),
        }),
      (next) =>
        `${next.recommendation ?? "No recommendation"}\nReason: ${next.reason}`,
      );
    });

  plan
    .command("complete")
    .argument("<plan-id>")
    .description("Mark a plan completed (all phases must be done); advances the source roadmap item if set")
    .option("--json", "Emit stable JSON")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.completePlan(planId), (result) =>
        [
          `Plan: ${result.plan.title}`,
          `Status: ${result.plan.status}`,
          result.roadmapItemAdvanced
            ? `Roadmap item advanced: ${result.roadmapItemAdvanced.itemId} → done`
            : "No roadmap item to advance.",
        ].join("\n"),
      );
    });

  plan
    .command("advance")
    .description("Advance the plan by marking a phase done, appending evidence, and recomputing next step")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.advancePlan(await readJsonInput(commandOptions.input)), (result) =>
        [
          result.completed ? `Completed phase: ${result.completed.phaseId} → ${result.completed.status}` : "No phase completed.",
          `Plan completed: ${result.planCompleted ? "yes" : "no"}`,
          result.roadmapItemAdvanced
            ? `Roadmap item advanced: ${result.roadmapItemAdvanced.itemId}`
            : "No roadmap item advanced.",
          `Next: ${result.next.recommendation ?? "none"}`,
        ].join("\n"),
      );
    });

  plan
    .command("path")
    .argument("<plan-id>")
    .description("Topological view of plan phases with dependency ordering, critical path, and ready flags")
    .option("--json", "Emit stable JSON")
    .action(async (planId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.planPath(planId), (path) =>
        [
          `Plan: ${path.planId}`,
          `Remaining: ${path.remaining}`,
          `Critical path: ${path.criticalPath.join(" → ") || "none"}`,
          "Phases (topo order):",
          ...path.orderedPhases.map((p) =>
            `  ${p.ready ? "✓" : "○"} [${p.status}] ${p.title}${p.dependsOn.length > 0 ? ` (deps: ${p.dependsOn.join(", ")})` : ""}`,
          ),
        ].join("\n"),
      );
    });

  const phase = program.command("phase").description("Phase lookup");

  phase
    .command("show")
    .argument("<phase-id>")
    .option("--json", "Emit stable JSON")
    .action(async (phaseId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showPhase(phaseId), humanPhase);
    });

  const decision = program.command("decision").description("Technical decisions");

  decision
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listDecisions(), humanDecisionList);
    });

  decision
    .command("show")
    .argument("<decision-id>")
    .option("--json", "Emit stable JSON")
    .action(async (decisionId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showDecision(decisionId), humanDecision);
    });

  decision
    .command("record")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.recordDecision(await readJsonInput(commandOptions.input)), (item) =>
        `${item.id} ${item.title}`,
      );
    });

  const finding = program.command("finding").description("Findings and risks");

  finding
    .command("record")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.recordFinding(await readJsonInput(commandOptions.input)), humanFinding);
    });

  finding
    .command("show")
    .argument("<finding-id>")
    .option("--json", "Emit stable JSON")
    .action(async (findingId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showFinding(findingId), humanFinding);
    });

  finding
    .command("update")
    .argument("<finding-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (findingId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.updateFinding(findingId, await readJsonInput(commandOptions.input)),
      humanFinding);
    });

  finding
    .command("list")
    .option("--json", "Emit stable JSON")
    .option("--status <status>", "Filter by open, closed, or all")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listFindings(parseFindingStatus(commandOptions.status)), humanFindingList);
    });

  finding
    .command("close")
    .argument("<finding-id>")
    .option("--json", "Emit stable JSON")
    .action(async (findingId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.closeFinding(findingId), humanFinding);
    });

  const session = program.command("session").description("Session lifecycle");

  session
    .command("start")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.startSession(await readJsonInput(commandOptions.input)), humanSession);
    });

  session
    .command("list")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.listSessions(), humanSessionList);
    });

  session
    .command("show")
    .argument("<session-id>")
    .option("--json", "Emit stable JSON")
    .action(async (sessionId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.showSession(sessionId), humanSession);
    });

  session
    .command("capture")
    .argument("<session-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (sessionId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.captureSession(sessionId, await readJsonInput(commandOptions.input)),
      humanSession);
    });

  session
    .command("end")
    .argument("<session-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (sessionId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.endSession(sessionId, await readJsonInput(commandOptions.input)),
      humanSession);
    });

  session
    .command("summarize")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.summarizeSession(await readJsonInput(commandOptions.input)), (item) =>
        `${item.id} ${item.summary ?? ""}`,
      );
    });

  program
    .command("checkpoint")
    .description("Record a closed session checkpoint")
    .argument("[summary]")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .option("--next <step>", "Add a next step", collectValues, [])
    .option("--plan <plan-id>", "Related plan id")
    .action(async (summary: string | undefined, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.checkpoint(
          await readJsonInputOr(commandOptions.input, {
            summary: summary ?? "",
            nextSteps: commandOptions.next ?? [],
            ...(commandOptions.plan ? { relatedPlanId: commandOptions.plan } : {}),
          }),
        ),
      humanSession);
    });

  program
    .command("note")
    .description("Record a lightweight session note")
    .argument("[text]")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .option("--next <step>", "Add a next step", collectValues, [])
    .option("--plan <plan-id>", "Related plan id")
    .action(async (text: string | undefined, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.note(
          await readJsonInputOr(commandOptions.input, {
            text: text ?? "",
            nextSteps: commandOptions.next ?? [],
            ...(commandOptions.plan ? { relatedPlanId: commandOptions.plan } : {}),
          }),
        ),
      humanSession);
    });

  program
    .command("decide")
    .description("Record a technical decision")
    .argument("[title]")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .option("--context <text>", "Decision context")
    .option("--decision <text>", "Decision made")
    .option("--consequences <text>", "Consequences")
    .option("--alternative <text>", "Alternative considered", collectValues, [])
    .option("--plan <plan-id>", "Related plan id")
    .action(async (title: string | undefined, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.decide(
          await readJsonInputOr(commandOptions.input, {
            title: title ?? "",
            context: commandOptions.context ?? "",
            decision: commandOptions.decision ?? "",
            ...(commandOptions.consequences ? { consequences: commandOptions.consequences } : {}),
            alternatives: commandOptions.alternative ?? [],
            relatedPlanIds: commandOptions.plan ? [commandOptions.plan] : [],
          }),
        ),
      humanDecision);
    });

  program
    .command("done")
    .description("Complete the current or explicit phase, or close a finding")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .option("--plan <plan-id>", "Plan id for phase completion")
    .option("--phase <phase-id>", "Phase id to complete")
    .option("--finding <finding-id>", "Finding id to close")
    .option("--evidence <text>", "Append note evidence", collectValues, [])
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.done(
          await readJsonInputOr(commandOptions.input, {
            ...(commandOptions.plan ? { planId: commandOptions.plan } : {}),
            ...(commandOptions.phase ? { phaseId: commandOptions.phase } : {}),
            ...(commandOptions.finding ? { findingId: commandOptions.finding } : {}),
            evidence: evidenceFromNotes(commandOptions.evidence ?? []),
          }),
        ),
      humanDone);
    });

  program
    .command("blocked")
    .description("Record a blocking finding or explicitly mark a phase blocked")
    .argument("[title]")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .option("--description <text>", "Finding description")
    .option("--severity <severity>", "Finding severity: low, medium, high, or critical")
    .option("--type <type>", "Finding type")
    .option("--file <path>", "Related file", collectValues, [])
    .option("--plan <plan-id>", "Related plan id")
    .option("--phase <phase-id>", "Related phase id for a finding")
    .option("--mark-phase <phase-id>", "Mark an explicit phase blocked instead of recording a finding")
    .option("--evidence <text>", "Append note evidence when marking a phase", collectValues, [])
    .action(async (title: string | undefined, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.blocked(
          await readJsonInputOr(commandOptions.input, {
            ...(title ? { title } : {}),
            ...(commandOptions.description ? { description: commandOptions.description } : {}),
            ...(commandOptions.type ? { type: commandOptions.type } : {}),
            ...(commandOptions.severity ? { severity: commandOptions.severity } : {}),
            relatedFiles: commandOptions.file ?? [],
            ...(commandOptions.plan ? { relatedPlanId: commandOptions.plan } : {}),
            ...(commandOptions.phase ? { relatedPhaseId: commandOptions.phase } : {}),
            ...(commandOptions.markPhase ? { markPhaseId: commandOptions.markPhase } : {}),
            evidence: evidenceFromNotes(commandOptions.evidence ?? []),
          }),
        ),
      humanBlocked);
    });

  program
    .command("resume")
    .description("Show compact context for resuming work")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.resume(), humanMarkdown);
    });

  program
    .command("continue")
    .description("Show the full continuity briefing for resuming work")
    .option("--json", "Emit stable JSON")
    .option("--start-session", "Start a new session only when no session is open")
    .option("--close-open-session", "Close the open session before optionally starting a new one")
    .option("--auto-capture", "Capture current git changes into the open session")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) =>
          app.continueWork({
            ...(commandOptions.startSession ? { startSession: true } : {}),
            ...(commandOptions.closeOpenSession ? { closeOpenSession: true } : {}),
            ...(commandOptions.autoCapture ? { autoCapture: true } : {}),
          }),
        humanMarkdown,
      );
    });

  program
    .command("roi")
    .description("Report deterministic context compression and continuity signals")
    .option("--json", "Emit stable JSON")
    .option("--since <cursor>", "Event id or ISO timestamp")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) =>
          app.contextRoi({
            ...(commandOptions.since ? { since: commandOptions.since } : {}),
          }),
        humanRoi,
      );
    });

  program
    .command("prompt")
    .description("Render read-only agent prompt context")
    .option("--json", "Emit stable JSON")
    .option("--format <format>", "Prompt format: markdown, agent, codex, or claude")
    .option("--max-tokens <n>", "Approximate token budget for deterministic truncation")
    .option("--metadata", "Include ids and internal routing metadata")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) =>
          app.prompt({
            ...(commandOptions.format ? { format: parsePromptFormat(commandOptions.format) } : {}),
            ...parseMaxTokensOption(commandOptions.maxTokens),
            ...(commandOptions.metadata ? { includeMetadata: true } : {}),
          }),
        humanPrompt,
      );
    });

  program
    .command("timeline")
    .description("Show recent project activity (read-only event log)")
    .option("--json", "Emit stable JSON")
    .option("--limit <n>", "Max number of events (default 50)")
    .option("--since <cursor>", "Return only events after this event id or ISO timestamp (checkpoint/resume diff)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) => app.timeline({ ...parseLimitOption(commandOptions.limit), ...(commandOptions.since ? { since: commandOptions.since } : {}) }),
        humanTimeline,
      );
    });

  program
    .command("standup")
    .description("Show a daily project telemetry digest")
    .option("--json", "Emit stable JSON")
    .option("--days <n>", "Number of days to include (default 1)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.standup({ ...parseDaysOption(commandOptions.days) }), humanStandup);
    });

  program
    .command("diff")
    .description("Show project memory changes since a cursor or the latest ended session")
    .option("--json", "Emit stable JSON")
    .option("--since <cursor>", "Event id or ISO timestamp")
    .option("--limit <n>", "Max number of events (default 50)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) =>
          app.diff({
            ...(commandOptions.since ? { since: commandOptions.since } : {}),
            ...parseLimitOption(commandOptions.limit),
          }),
        humanDiff,
      );
    });

  program
    .command("drift")
    .description("Report roadmap-vs-active-plan alignment")
    .option("--json", "Emit stable JSON")
    .option("--stale-after-days <n>", "Mark next-step work stale after n days (default 7)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.drift({
          ...parseStaleAfterDaysOption(commandOptions.staleAfterDays),
        }),
      humanDrift);
    });

  program
    .command("adherence")
    .description("Show event-derived velocity and adherence metrics")
    .option("--json", "Emit stable JSON")
    .option("--days <n>", "Number of days to include (default 14)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.adherence({ ...parseDaysOption(commandOptions.days) }), humanAdherence);
    });

  program
    .command("activity")
    .description("Show project activity heatmap data")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.activity(), humanActivity);
    });

  const benchmark = program.command("benchmark").description("Local benchmark scenarios and runs");

  benchmark
    .command("list")
    .description("List benchmark scenarios")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handleStandalone(commandOptions, async () => listBenchmarkScenarios(), humanBenchmarkScenarioList);
    });

  benchmark
    .command("task")
    .description("Render a copyable benchmark task")
    .argument("<scenario-id>")
    .option("--json", "Emit stable JSON")
    .option("--variant <variant>", "Benchmark variant")
    .action(async (scenarioId: string, commandOptions: CommandOptions) => {
      await handleStandalone(
        commandOptions,
        async () =>
          renderBenchmarkTask(requireBenchmarkScenario(scenarioId), {
            ...(commandOptions.variant ? { variant: parseBenchmarkVariant(commandOptions.variant) } : {}),
          }),
        humanBenchmarkTask,
      );
    });

  benchmark
    .command("record")
    .description("Record benchmark run metadata under Zenith home")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (commandOptions: CommandOptions) => {
      await handleStandalone(
        commandOptions,
        async () => recordBenchmarkRun(await readJsonInput(commandOptions.input), storageHomeOptions(options)),
        humanBenchmarkRun,
      );
    });

  benchmark
    .command("runs")
    .description("List recorded benchmark runs")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handleStandalone(commandOptions, async () => listBenchmarkRuns(storageHomeOptions(options)), humanBenchmarkRunList);
    });

  benchmark
    .command("compare")
    .description("Compare benchmark runs by variant")
    .option("--json", "Emit stable JSON")
    .option("--scenario <scenario-id>", "Filter to one scenario id")
    .action(async (commandOptions: CommandOptions) => {
      await handleStandalone(
        commandOptions,
        async () =>
          compareBenchmarkRuns({
            ...storageHomeOptions(options),
            ...(commandOptions.scenario ? { scenarioId: commandOptions.scenario } : {}),
          }),
        humanBenchmarkCompare,
      );
    });

  const demo = program.command("demo").description("Read-only onboarding demos");

  demo
    .command("list")
    .description("List copyable Zenith demo guides")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handleStandalone(commandOptions, async () => listDemoGuides(), humanDemoGuideList);
    });

  demo
    .command("show")
    .description("Show a copyable Zenith demo guide")
    .argument("<demo-id>")
    .option("--json", "Emit stable JSON")
    .action(async (demoId: string, commandOptions: CommandOptions) => {
      await handleStandalone(commandOptions, async () => requireDemoGuide(demoId), humanDemoGuide);
    });

  const tag = program.command("tag").description("Tag project memory entities");

  tag
    .command("set")
    .description("Replace tags for a memory entity")
    .argument("<entity-type>")
    .argument("<entity-id>")
    .option("--json", "Emit stable JSON")
    .option("--input <source>", "Read JSON payload from stdin with --input -")
    .action(async (entityType: string, entityId: string, commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.setMemoryTags(entityType, entityId, await readJsonInput(commandOptions.input)),
      humanMemoryTagList);
    });

  tag
    .command("list")
    .description("List memory tags")
    .option("--json", "Emit stable JSON")
    .option("--tag <tag>", "Filter by normalized tag")
    .option("--entity-type <type>", "Filter by memory entity type")
    .option("--entity-id <id>", "Filter by memory entity id")
    .action(async (commandOptions: CommandOptions & { entityId?: string }) => {
      await handle(commandOptions, options, async (app) =>
        app.listMemoryTags({
          ...(commandOptions.tag ? { tag: commandOptions.tag } : {}),
          ...(commandOptions.entityType ? { entityType: commandOptions.entityType } : {}),
          ...(commandOptions.entityId ? { entityId: commandOptions.entityId } : {}),
        }),
      humanMemoryTagList);
    });

  program
    .command("search")
    .description("Search project memory deterministically")
    .requiredOption("--query <text>", "Search query")
    .option("--json", "Emit stable JSON")
    .option("--tag <tag>", "Filter by normalized tag")
    .option("--entity-type <type>", "Filter by memory entity type")
    .option("--limit <n>", "Max number of results (default 50)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) =>
        app.searchMemory({
          ...(commandOptions.query ? { query: commandOptions.query } : {}),
          ...(commandOptions.tag ? { tag: commandOptions.tag } : {}),
          ...(commandOptions.entityType ? { entityType: commandOptions.entityType } : {}),
          ...parseLimitOption(commandOptions.limit),
        }),
      humanMemorySearchResults);
    });

  program
    .command("watch")
    .description("Block until a local project memory predicate matches")
    .requiredOption("--until <predicate>", "Predicate such as stage=review,plan=<plan-id>,phase=<phase-id>")
    .option("--json", "Emit stable JSON")
    .option("--timeout <ms>", "Maximum time to wait in milliseconds")
    .option("--poll-interval <ms>", "Polling interval in milliseconds (default 1000)")
    .action(async (commandOptions: CommandOptions) => {
      await handle(
        commandOptions,
        options,
        async (app) =>
          app.watch({
            until: commandOptions.until ?? "",
            ...parseTimeoutOption(commandOptions.timeout),
            ...parsePollIntervalOption(commandOptions.pollInterval),
          }),
        humanWatch,
      );
    });

  const agents = program.command("agents").description("Agent pack installer");

  agents
    .command("install")
    .argument("<agent>", "codex or claude")
    .option("--json", "Emit stable JSON")
    .action(async (agent: string, commandOptions: CommandOptions) => {
      await handleStandalone(commandOptions, async () => {
        if (agent !== "codex" && agent !== "claude") {
          throw new Error("Agent must be codex or claude.");
        }

        const git = await new GitAdapter().inspect(options.cwd ?? process.cwd());
        return installAgentPack(agent as AgentKind, git.rootPath);
      });
    });

  if (argv.slice(2).length === 0) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(argv);
}

async function handle<T>(
  commandOptions: CommandOptions,
  runOptions: RunCliOptions,
  action: (app: ReturnType<typeof createZenithApp>["app"]) => Promise<T>,
  human: (data: T) => string,
): Promise<void> {
  const services = createZenithApp(runOptions);
  try {
    const data = await action(services.app);
    emit(commandOptions, data, human);
  } catch (error) {
    emitError(commandOptions, error);
  } finally {
    services.close();
  }
}

async function handleStandalone<T>(
  commandOptions: CommandOptions,
  action: () => Promise<T>,
  human: (data: T) => string = (data) => JSON.stringify(data, null, 2),
): Promise<void> {
  try {
    const data = await action();
    emit(commandOptions, data, human);
  } catch (error) {
    emitError(commandOptions, error);
  }
}

async function readJsonInputOr(input: string | undefined, fallback: unknown): Promise<unknown> {
  return input ? readJsonInput(input) : fallback;
}

function emit<T>(commandOptions: CommandOptions, data: T, human: (data: T) => string): void {
  if (commandOptions.json) {
    console.log(JSON.stringify(ok(data), null, 2));
    return;
  }

  console.log(human(data));
}

function emitError(commandOptions: CommandOptions, error: unknown): void {
  if (commandOptions.json) {
    console.log(JSON.stringify(fail(error), null, 2));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }

  process.exitCode = exitCodeFor(error);
}

function humanProjectDetection(data: {
  project: { name: string; rootPath: string } | null;
  registered: boolean;
  git: { rootPath: string; branch?: string; isGitRepo: boolean };
}): string {
  return [
    `Project: ${data.project?.name ?? "unregistered"}`,
    `Root: ${data.git.rootPath}`,
    `Registered: ${data.registered ? "yes" : "no"}`,
    `Git: ${data.git.isGitRepo ? data.git.branch ?? "detached" : "no"}`,
  ].join("\n");
}

function humanProjectStatus(data: {
  project: { name: string } | null;
  activePlan: { title: string } | null;
  currentPhase: { title: string; status: string } | null;
  next: { recommendation: string | null; reason: string };
}): string {
  return [
    `Project: ${data.project?.name ?? "unregistered"}`,
    `Active Plan: ${data.activePlan?.title ?? "none"}`,
    `Current Phase: ${data.currentPhase ? `${data.currentPhase.title} (${data.currentPhase.status})` : "none"}`,
    `Next: ${data.next.recommendation ?? "none"}`,
    `Reason: ${data.next.reason}`,
  ].join("\n");
}

function humanPlan(plan: {
  id: string;
  title: string;
  status: string;
  sourceRoadmapId?: string | undefined;
  sourceRoadmapItemId?: string | undefined;
  phases: Array<{ title: string; status: string }>;
}): string {
  const phases = plan.phases.map((phase) => `  - ${phase.status}: ${phase.title}`).join("\n");
  return [
    `Plan: ${plan.title}`,
    `ID: ${plan.id}`,
    `Status: ${plan.status}`,
    `Source roadmap: ${plan.sourceRoadmapId ?? "none"}`,
    `Source item: ${plan.sourceRoadmapItemId ?? "none"}`,
    phases,
  ]
    .filter(Boolean)
    .join("\n");
}

function humanBrief(
  brief: { id: string; title: string; summary: string; version: number; status: string; source?: string | undefined } | null,
): string {
  if (!brief) {
    return "No brief recorded.";
  }

  return [
    `Brief: ${brief.title}`,
    `ID: ${brief.id}`,
    `Version: ${brief.version}`,
    `Status: ${brief.status}`,
    `Summary: ${brief.summary}`,
    `Source: ${brief.source ?? "none"}`,
  ].join("\n");
}

function humanBriefList(briefs: Array<{ id: string; title: string; version: number; status: string }>): string {
  return briefs.map((brief) => `${brief.id} v${brief.version} ${brief.status} ${brief.title}`).join("\n");
}

function humanRoadmap(roadmap: {
  id: string;
  title: string;
  status: string;
  sourcePlanId?: string | undefined;
  items: Array<{ title: string; status: string; justification?: string | undefined }>;
}): string {
  const items = roadmap.items
    .map((item) =>
      [`  - ${item.status}: ${item.title}`, item.justification ? `    justification: ${item.justification}` : ""]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
  return [
    `Roadmap: ${roadmap.title}`,
    `ID: ${roadmap.id}`,
    `Status: ${roadmap.status}`,
    `Source plan: ${roadmap.sourcePlanId ?? "none"}`,
    items,
  ]
    .filter(Boolean)
    .join("\n");
}

function humanRoadmapList(roadmaps: Array<{ id: string; title: string; status: string }>): string {
  return roadmaps.map((roadmap) => `${roadmap.id} ${roadmap.status} ${roadmap.title}`).join("\n");
}

function humanRoadmapWorkspace(workspace: {
  groups: Array<{
    roadmapId: string | null;
    title: string;
    status: string;
    isFocused: boolean;
    itemProgress: { done: number; total: number };
    items: Array<{
      item: { id: string; title: string; status: string };
      linkedPlans: Array<{ id: string; title: string }>;
      phaseProgress: { done: number; total: number };
    }>;
    standalonePlans: Array<{ id: string; title: string; status: string }>;
  }>;
}): string {
  return workspace.groups
    .map((group) => {
      const header = `${group.isFocused ? "* " : ""}${group.title} [${group.status}] ${group.itemProgress.done}/${group.itemProgress.total}`;
      const items = group.items.map((entry) => {
        const plans = entry.linkedPlans.map((plan) => plan.title).join(", ");
        const planLabel = plans.length > 0 ? ` -> ${plans} (${entry.phaseProgress.done}/${entry.phaseProgress.total})` : " -> no plan";
        return `  - ${entry.item.status}: ${entry.item.title}${planLabel}`;
      });
      const standalone = group.standalonePlans.map((plan) => `  - ${plan.status}: ${plan.title}`);
      return [header, ...items, ...standalone].join("\n");
    })
    .join("\n\n");
}

function humanFocusStatus(status: {
  worktreeKey: string;
  branch: string | null;
  focus: { roadmapId: string; roadmapTitle: string } | null;
  ambiguous: boolean;
  candidates: Array<{ roadmapId: string; roadmapTitle: string; planTitle: string }>;
  activePlan: { id: string; title: string } | null;
}): string {
  const lines = [
    `Worktree: ${status.worktreeKey}`,
    `Branch: ${status.branch ?? "none"}`,
    `Focus: ${status.focus ? `${status.focus.roadmapTitle} (${status.focus.roadmapId})` : "none"}`,
    `Active plan: ${status.activePlan ? status.activePlan.title : "none"}`,
  ];
  if (status.ambiguous) {
    lines.push("Ambiguous: multiple roadmaps have an active plan. Use `zenith focus set <roadmap-id>`.");
    for (const candidate of status.candidates) {
      lines.push(`  - ${candidate.roadmapTitle} (${candidate.roadmapId}): ${candidate.planTitle}`);
    }
  }
  return lines.join("\n");
}

function humanSpike(spike: {
  id: string;
  title: string;
  question: string;
  status: string;
  result?: string | undefined;
  recommendation?: string | undefined;
}): string {
  return [
    `Spike: ${spike.title}`,
    `ID: ${spike.id}`,
    `Status: ${spike.status}`,
    `Question: ${spike.question}`,
    `Result: ${spike.result ?? "none"}`,
    `Recommendation: ${spike.recommendation ?? "none"}`,
  ].join("\n");
}

function humanSpikeList(spikes: Array<{ id: string; title: string; status: string }>): string {
  return spikes.map((spike) => `${spike.id} ${spike.status} ${spike.title}`).join("\n");
}

function humanMarkdown(data: { markdown: string }): string {
  return data.markdown;
}

function humanRoi(report: {
  sourceEvents: number;
  estimatedRawTokens: number;
  compactTokens: number;
  compressionRatio: number;
  continuitySignals: string[];
  missingSignals: string[];
}): string {
  return [
    `Source events: ${report.sourceEvents}`,
    `Estimated raw tokens: ${report.estimatedRawTokens}`,
    `Compact tokens: ${report.compactTokens}`,
    `Compression ratio: ${report.compressionRatio}x`,
    `Signals: ${report.continuitySignals.join(", ") || "none"}`,
    `Missing: ${report.missingSignals.join(", ") || "none"}`,
  ].join("\n");
}

function humanPrompt(prompt: { content: string }): string {
  return prompt.content;
}

function humanBenchmarkScenarioList(
  scenarios: Array<{ id: string; title: string; category: string; difficulty: string; variants: string[] }>,
): string {
  return scenarios
    .map((scenario) => `${scenario.id} ${scenario.category}/${scenario.difficulty} ${scenario.title} [${scenario.variants.join(",")}]`)
    .join("\n");
}

function humanBenchmarkTask(task: { content: string }): string {
  return task.content;
}

function humanBenchmarkRun(run: { id: string; scenarioId: string; variant: string; score?: number | undefined }): string {
  return `${run.id} ${run.scenarioId} ${run.variant}${run.score === undefined ? "" : ` score=${run.score}`}`;
}

function humanBenchmarkRunList(runs: Array<{ id: string; scenarioId: string; variant: string; score?: number | undefined }>): string {
  if (runs.length === 0) return "No benchmark runs recorded.";
  return runs.map(humanBenchmarkRun).join("\n");
}

function humanBenchmarkCompare(compare: {
  totalRuns: number;
  variants: Array<{ variant: string; runs: number; averageScore?: number | undefined }>;
}): string {
  if (compare.totalRuns === 0) return "No benchmark runs recorded.";
  return compare.variants
    .map((variant) => `${variant.variant} runs=${variant.runs}${variant.averageScore === undefined ? "" : ` avg=${variant.averageScore}`}`)
    .join("\n");
}

function humanDemoGuideList(guides: Array<{ id: string; title: string; durationMinutes: number; tags: string[] }>): string {
  return guides.map((guide) => `${guide.id} ${guide.durationMinutes}m ${guide.title} [${guide.tags.join(",")}]`).join("\n");
}

function humanDemoGuide(guide: { markdown: string }): string {
  return guide.markdown;
}

function humanPhase(data: { planId: string; planTitle: string; phase: { id: string; title: string; status: string } }): string {
  return [
    `Plan: ${data.planTitle}`,
    `Plan ID: ${data.planId}`,
    `Phase: ${data.phase.title}`,
    `Phase ID: ${data.phase.id}`,
    `Status: ${data.phase.status}`,
  ].join("\n");
}

function humanDecisionList(decisions: Array<{ id: string; title: string }>): string {
  return decisions.map((decision) => `${decision.id} ${decision.title}`).join("\n");
}

function humanDecision(decision: {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences?: string | undefined;
  alternatives: string[];
  relatedPlanIds: string[];
}): string {
  return [
    `Decision: ${decision.title}`,
    `ID: ${decision.id}`,
    `Context: ${decision.context}`,
    `Decision: ${decision.decision}`,
    `Consequences: ${decision.consequences ?? "none"}`,
    `Alternatives: ${decision.alternatives.length > 0 ? decision.alternatives.join(", ") : "none"}`,
    `Related plans: ${decision.relatedPlanIds.length > 0 ? decision.relatedPlanIds.join(", ") : "none"}`,
  ].join("\n");
}

function humanFinding(finding: {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  relatedFiles: string[];
}): string {
  return [
    `Finding: ${finding.title}`,
    `ID: ${finding.id}`,
    `Status: ${finding.status}`,
    `Severity: ${finding.severity}`,
    `Type: ${finding.type}`,
    `Description: ${finding.description}`,
    `Related files: ${finding.relatedFiles.length > 0 ? finding.relatedFiles.join(", ") : "none"}`,
  ].join("\n");
}

function humanFindingList(findings: Array<{ id: string; severity: string; title: string; status: string }>): string {
  return findings.map((finding) => `${finding.id} ${finding.status} ${finding.severity} ${finding.title}`).join("\n");
}

function humanSession(session: {
  id: string;
  startedAt: string;
  endedAt?: string | undefined;
  branch?: string | undefined;
  summary?: string | undefined;
  nextSteps: string[];
}): string {
  return [
    `Session: ${session.id}`,
    `Started: ${session.startedAt}`,
    `Ended: ${session.endedAt ?? "open"}`,
    `Branch: ${session.branch ?? "none"}`,
    `Summary: ${session.summary ?? "none"}`,
    `Next: ${session.nextSteps[0] ?? "none"}`,
  ].join("\n");
}

function humanSessionList(sessions: Array<{ id: string; startedAt: string; endedAt?: string | undefined; summary?: string | undefined }>): string {
  return sessions
    .map((session) => `${session.id} ${session.endedAt ? "closed" : "open"} ${session.summary ?? session.startedAt}`)
    .join("\n");
}

function humanDone(result:
  | { kind: "phase"; result: { completed: { phaseId: string; status: string } | null; planCompleted: boolean; next: { recommendation: string | null } } }
  | { kind: "finding"; finding: { id: string; title: string; status: string } },
): string {
  if (result.kind === "finding") {
    return `Finding closed: ${result.finding.id} ${result.finding.title}`;
  }

  return [
    result.result.completed
      ? `Phase: ${result.result.completed.phaseId} -> ${result.result.completed.status}`
      : "No phase completed.",
    `Plan completed: ${result.result.planCompleted ? "yes" : "no"}`,
    `Next: ${result.result.next.recommendation ?? "none"}`,
  ].join("\n");
}

function humanBlocked(result:
  | { kind: "phase"; result: { completed: { phaseId: string; status: string } | null; next: { recommendation: string | null } } }
  | { kind: "finding"; finding: { id: string; title: string; severity: string } },
): string {
  if (result.kind === "finding") {
    return `Finding recorded: ${result.finding.id} ${result.finding.severity} ${result.finding.title}`;
  }

  return [
    result.result.completed
      ? `Phase: ${result.result.completed.phaseId} -> ${result.result.completed.status}`
      : "No phase marked blocked.",
    `Next: ${result.result.next.recommendation ?? "none"}`,
  ].join("\n");
}

function humanStage(stage: {
  id: string;
  stage: string;
  planId?: string | undefined;
  phaseId?: string | undefined;
  role?: string | undefined;
  note?: string | undefined;
  updatedAt: string;
}): string {
  return [
    `Stage: ${stage.stage}`,
    `ID: ${stage.id}`,
    `Plan: ${stage.planId ?? "project"}`,
    `Phase: ${stage.phaseId ?? "none"}`,
    `Role: ${stage.role ?? "none"}`,
    `Note: ${stage.note ?? "none"}`,
    `Updated: ${stage.updatedAt}`,
  ].join("\n");
}

function humanWatch(result: {
  matched: true;
  predicate: { raw: string };
  stage: { stage: string; planId?: string | undefined; phaseId?: string | undefined };
  elapsedMs: number;
}): string {
  return [
    `Matched: ${result.predicate.raw}`,
    `Stage: ${result.stage.stage}`,
    `Plan: ${result.stage.planId ?? "project"}`,
    `Phase: ${result.stage.phaseId ?? "none"}`,
    `Elapsed: ${result.elapsedMs}ms`,
  ].join("\n");
}

function parseFindingStatus(status: string | undefined): FindingListStatus {
  if (status === undefined) {
    return "open";
  }

  if (status === "open" || status === "closed" || status === "all") {
    return status;
  }

  throw new ZenithError("Finding status must be open, closed, or all.", {
    code: "invalid_finding_status",
    details: { status },
  });
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function evidenceFromNotes(values: string[]): Array<{ kind: "note"; value: string }> {
  return values.map((value) => ({ kind: "note", value }));
}

function toContextOptions(commandOptions: CommandOptions): { phaseId?: string } {
  return commandOptions.phase ? { phaseId: commandOptions.phase } : {};
}

function parseLimitOption(value?: string): { limit?: number } {
  if (value === undefined) return {};
  const n = parseInt(value, 10);
  return isNaN(n) ? {} : { limit: n };
}

function parseDaysOption(value?: string): { days?: number } {
  const days = parsePositiveIntegerOption(value, "days");
  return days === undefined ? {} : { days };
}

function parseStaleAfterDaysOption(value?: string): { staleAfterDays?: number } {
  const staleAfterDays = parsePositiveIntegerOption(value, "stale-after-days");
  return staleAfterDays === undefined ? {} : { staleAfterDays };
}

function parseMaxTokensOption(value?: string): { maxTokens?: number } {
  const maxTokens = parsePositiveIntegerOption(value, "max-tokens");
  return maxTokens === undefined ? {} : { maxTokens };
}

function parsePromptFormat(value: string): "markdown" | "agent" | "codex" | "claude" {
  if (value === "markdown" || value === "agent" || value === "codex" || value === "claude") {
    return value;
  }

  throw new ZenithError("--format must be markdown, agent, codex, or claude.", {
    code: "invalid_option",
    details: { optionName: "format", value },
  });
}

function parseBenchmarkVariant(value: string): "no_zenith" | "manual_handoff" | "continue" | "prompt" | "full_loop" {
  if (value === "no_zenith" || value === "manual_handoff" || value === "continue" || value === "prompt" || value === "full_loop") {
    return value;
  }

  throw new ZenithError("--variant must be no_zenith, manual_handoff, continue, prompt, or full_loop.", {
    code: "invalid_option",
    details: { optionName: "variant", value },
  });
}

function requireBenchmarkScenario(scenarioId: string) {
  const scenario = loadBenchmarkScenarios().find((candidate) => candidate.id === scenarioId);
  if (!scenario) {
    throw new ZenithError(`Benchmark scenario not found: ${scenarioId}`, {
      code: "benchmark_scenario_not_found",
      details: { scenarioId },
    });
  }
  return scenario;
}

function requireDemoGuide(demoId: string) {
  const guide = getDemoGuide(demoId);
  if (!guide) {
    throw new ZenithError(`Demo guide not found: ${demoId}`, {
      code: "demo_not_found",
      details: { demoId },
    });
  }
  return guide;
}

function storageHomeOptions(options: RunCliOptions): { zenithHome?: string } {
  return {
    ...(options.zenithHome ? { zenithHome: options.zenithHome } : {}),
  };
}

function parseTimeoutOption(value?: string): { timeoutMs?: number } {
  const timeoutMs = parsePositiveIntegerOption(value, "timeout");
  return timeoutMs === undefined ? {} : { timeoutMs };
}

function parsePollIntervalOption(value?: string): { pollIntervalMs?: number } {
  const pollIntervalMs = parsePositiveIntegerOption(value, "poll-interval");
  return pollIntervalMs === undefined ? {} : { pollIntervalMs };
}

function parsePositiveIntegerOption(value: string | undefined, optionName: string): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== value) {
    throw new ZenithError(`--${optionName} must be a positive integer.`, {
      code: "invalid_option",
      details: { optionName, value },
    });
  }
  return n;
}

function humanTimeline(
  events: Array<{ createdAt: string; type: string; entityType: string; entityId: string }>,
): string {
  if (events.length === 0) {
    return "No events recorded for this project yet.";
  }
  return events.map((e) => `${e.createdAt}  ${e.type}  ${e.entityType}:${e.entityId}`).join("\n");
}

function humanStandup(digest: {
  window: { since: string; until: string };
  next: { recommendation: string | null };
  events: { total: number };
  completions: { plansCompleted: number; phasesCompleted: number };
  findings: { openTotal: number };
}): string {
  return [
    `Window: ${digest.window.since} → ${digest.window.until}`,
    `Next: ${digest.next.recommendation ?? "none"}`,
    `Events: ${digest.events.total}`,
    `Completed: ${digest.completions.plansCompleted} plans, ${digest.completions.phasesCompleted} phases`,
    `Open findings: ${digest.findings.openTotal}`,
  ].join("\n");
}

function humanDiff(diff: {
  window: { since: string; until: string; source: string };
  events: Array<{ createdAt: string; type: string; entityType: string; entityId: string }>;
}): string {
  if (diff.events.length === 0) {
    return `No events since ${diff.window.since} (${diff.window.source}).`;
  }
  return [
    `Since: ${diff.window.since} (${diff.window.source})`,
    ...diff.events.map((event) => `${event.createdAt}  ${event.type}  ${event.entityType}:${event.entityId}`),
  ].join("\n");
}

function humanDrift(report: {
  aligned: boolean;
  activePlan: { title: string } | null;
  sourceRoadmap: { title: string } | null;
  issues: Array<{ severity: string; title: string; detail: string }>;
}): string {
  const lines = [
    `Aligned: ${report.aligned ? "yes" : "no"}`,
    `Plan: ${report.activePlan?.title ?? "none"}`,
    `Roadmap: ${report.sourceRoadmap?.title ?? "none"}`,
  ];
  if (report.issues.length > 0) {
    lines.push(...report.issues.map((issue) => `${issue.severity}: ${issue.title} - ${issue.detail}`));
  }
  return lines.join("\n");
}

function humanAdherence(report: {
  window: { since: string; until: string };
  events: { total: number };
  activeDayCount: number;
  eventsPerDay: number;
  completionEventsPerDay: number;
}): string {
  return [
    `Window: ${report.window.since} → ${report.window.until}`,
    `Events: ${report.events.total}`,
    `Active days: ${report.activeDayCount}`,
    `Events/day: ${report.eventsPerDay}`,
    `Completion events/day: ${report.completionEventsPerDay}`,
  ].join("\n");
}

function humanActivity(report: {
  window: { since: string; until: string; weeks: number };
  stats: {
    totalEvents: number;
    activeDays: number;
    currentStreak: number;
    longestStreak: number;
    maxDailyEvents: number;
  };
}): string {
  return [
    `Window: ${report.window.since} → ${report.window.until}`,
    `Grid: ${report.window.weeks} weeks`,
    `Events: ${report.stats.totalEvents}`,
    `Active days: ${report.stats.activeDays}`,
    `Current streak: ${report.stats.currentStreak} days`,
    `Longest streak: ${report.stats.longestStreak} days`,
    `Max daily events: ${report.stats.maxDailyEvents}`,
  ].join("\n");
}

function humanMemoryTagList(tags: Array<{ entityType: string; entityId: string; tag: string }>): string {
  if (tags.length === 0) {
    return "No tags.";
  }
  return tags.map((tag) => `${tag.tag}  ${tag.entityType}:${tag.entityId}`).join("\n");
}

function humanMemorySearchResults(
  results: Array<{ entityType: string; entityId: string; title: string; score: number; tags: string[]; snippet: string }>,
): string {
  if (results.length === 0) {
    return "No matching memory.";
  }
  return results
    .map((result) => {
      const tags = result.tags.length > 0 ? ` tags:${result.tags.join(",")}` : "";
      return `${result.score}  ${result.entityType}:${result.entityId}  ${result.title}${tags}\n  ${result.snippet}`;
    })
    .join("\n");
}
