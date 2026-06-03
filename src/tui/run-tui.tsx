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
  const plans = status.project ? await app.listPlans() : [];
  const roadmaps = status.project ? await app.listRoadmaps() : [];
  const findings = status.project ? await app.listFindings() : [];
  const context = await app.compactContext();
  return { status, plans, roadmaps, findings, context };
}
