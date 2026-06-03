/** @jsxImportSource @opentui/react */

import { CliRenderEvents, createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createZenithApp, type AppFactoryOptions } from "../app/factory";
import { Dashboard, type DashboardData } from "./Dashboard";

export type RunTuiOptions = AppFactoryOptions;

export async function runTui(options: RunTuiOptions = {}): Promise<void> {
  const services = createZenithApp(options);
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  try {
    const initialData = await loadDashboardData(services.app);
    renderer.setTerminalTitle("Zenith CLI");
    const motionEnabled = process.env["ZENITH_NO_MOTION"] !== "1";
    createRoot(renderer).render(
      <Dashboard initialData={initialData} reload={() => loadDashboardData(services.app)} motion={motionEnabled} />,
    );

    await new Promise<void>((resolve) => {
      renderer.once(CliRenderEvents.DESTROY, () => resolve());
    });
  } finally {
    renderer.destroy();
    services.close();
  }
}

async function loadDashboardData(app: ReturnType<typeof createZenithApp>["app"]): Promise<DashboardData> {
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
  return { status, brief, plans, roadmaps, workspace, spikes, findings, sessions, decisions, context, timeline };
}
