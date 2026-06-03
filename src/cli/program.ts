import { Command } from "commander";
import { installAgentPack, type AgentKind } from "../agents/installer";
import { createZenithApp } from "../app/factory";
import { GitAdapter } from "../integrations/git/git-adapter";
import type { FindingListStatus } from "../storage/repository";
import { exitCodeFor, fail, ok, ZenithError } from "./json-output";
import { readJsonInput } from "./input";

export type RunCliOptions = {
  cwd?: string;
  zenithHome?: string;
  decodeHome?: string;
  dbPath?: string;
};

type CommandOptions = {
  json?: boolean;
  input?: string;
  phase?: string;
  status?: string;
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
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.nextPlanStep(), (next) =>
        `${next.recommendation ?? "No recommendation"}\nReason: ${next.reason}`,
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
    .command("resume")
    .description("Show compact context for resuming work")
    .option("--json", "Emit stable JSON")
    .action(async (commandOptions: CommandOptions) => {
      await handle(commandOptions, options, async (app) => app.resume(), humanMarkdown);
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

async function handleStandalone<T>(commandOptions: CommandOptions, action: () => Promise<T>): Promise<void> {
  try {
    const data = await action();
    emit(commandOptions, data, () => JSON.stringify(data, null, 2));
  } catch (error) {
    emitError(commandOptions, error);
  }
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

function toContextOptions(commandOptions: CommandOptions): { phaseId?: string } {
  return commandOptions.phase ? { phaseId: commandOptions.phase } : {};
}
