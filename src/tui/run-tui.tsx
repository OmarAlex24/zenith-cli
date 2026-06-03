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
    createRoot(renderer).render(
      <Dashboard initialData={initialData} reload={() => loadDashboardData(services.app)} />,
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
  const spikes = registered ? await app.listSpikes() : [];
  const findings = registered ? await app.listFindings() : [];
  const sessions = registered ? await app.listSessions() : [];
  const decisions = registered ? await app.listDecisions() : [];
  const context = await app.compactContext();
  return { status, brief, plans, roadmaps, spikes, findings, sessions, decisions, context };
}
