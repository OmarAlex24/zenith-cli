/** @jsxImportSource @opentui/react */

import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createZenithApp, type AppFactoryOptions } from "../app/factory";
import { buildActivityReport } from "../app/telemetry";
import { listBenchmarkScenarios } from "../benchmarks/scenarios";
import { compareBenchmarkRuns } from "../benchmarks/store";
import { Dashboard, type DashboardData } from "./Dashboard";

export type RunTuiOptions = AppFactoryOptions;

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  const services = createZenithApp(options);
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  try {
    const initialData = await loadDashboardData(services.app, options);
    renderer.setTerminalTitle("Zenith CLI");
    const motionEnabled = process.env["ZENITH_NO_MOTION"] !== "1";
    createRoot(renderer).render(
      <Dashboard initialData={initialData} reload={() => loadDashboardData(services.app, options)} motion={motionEnabled} />,
    );

    await new Promise<void>((resolve) => {
      renderer.once(CliRenderEvents.DESTROY, () => resolve());
    });
  } finally {
    renderer.destroy();
    services.close();
  }
}

async function loadDashboardData(app: ReturnType<typeof createZenithApp>["app"], options: RunTuiOptions = {}): Promise<DashboardData> {
  const status = await app.getProjectStatus();
  const registered = Boolean(status.project);
  const brief = registered ? await app.showBrief() : null;
  const plans = registered ? await app.listPlans() : [];
  const roadmaps = registered ? await app.listRoadmaps() : [];
  const workspace = registered ? await app.roadmapWorkspace() : { groups: [] };
  const spikes = registered ? await app.listSpikes() : [];
  const findings = registered ? await app.listFindings() : [];
  const sessions = registered ? await app.listSessions() : [];
  const decisions = registered ? await app.listDecisions() : [];
  const context = await app.compactContext();
  const timeline = registered ? await app.timeline({ limit: 50 }) : [];
  const activity = registered ? await app.activity() : buildActivityReport([], { now: new Date().toISOString() });
  const continuity = await app.continueWork();
  const benchmarkOptions: { zenithHome?: string } = {};
  if (options.zenithHome) benchmarkOptions.zenithHome = options.zenithHome;
  const benchmarks = {
    scenarios: listBenchmarkScenarios(),
    compare: compareBenchmarkRuns(benchmarkOptions),
  };
  const search = registered ? await app.searchMemory({ limit: 200 }) : [];
  return { status, brief, plans, roadmaps, workspace, spikes, findings, sessions, decisions, context, timeline, activity, continuity, benchmarks, search };
}
