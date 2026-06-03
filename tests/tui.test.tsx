/** @jsxImportSource @opentui/react */

import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { Dashboard, type DashboardData } from "../src/tui/Dashboard";
import type { ProjectStatus } from "../src/app/decode-app";
import type { CompactContext, Plan, Roadmap, Spike } from "../src/domain/schemas";

describe("OpenTUI dashboard", () => {
  test("renders memory tabs, supports navigation, and handles resize", async () => {
    const data = makeDashboardData();

    const setup = await testRender(<Dashboard initialData={data} />, { width: 110, height: 30 });
    await setup.flush();
    const frame = setup.captureCharFrame();

    expect(frame).toContain("Zenith CLI");
    expect(frame).toContain("Meridian");
    expect(frame).toContain("Foundation");
    expect(frame).toContain("1 Overview");

    await act(async () => {
      setup.mockInput.pressKey("2");
    });
    await setup.flush();
    const roadmapsFrame = setup.captureCharFrame();
    expect(roadmapsFrame).toContain("Product Roadmap");
    expect(roadmapsFrame).toContain("Product And Architecture Hardening");
    expect(roadmapsFrame).toContain("active");

    await act(async () => {
      setup.mockInput.pressKey("3");
    });
    await setup.flush();
    const planFrame = setup.captureCharFrame();
    expect(planFrame).toContain("Executable Plans");
    expect(planFrame).toContain("Documented acceptance");
    expect(planFrame).toContain("roadmap_1");

    await act(async () => {
      setup.mockInput.pressKey("4");
    });
    await setup.flush();
    const spikesFrame = setup.captureCharFrame();
    expect(spikesFrame).toContain("SQLite storage spike");
    expect(spikesFrame).toContain("Which local store");

    await act(async () => {
      setup.mockInput.pressKey("5");
    });
    await setup.flush();
    const decisionsFrame = setup.captureCharFrame();
    expect(decisionsFrame).toContain("Rename product");
    expect(decisionsFrame).toContain("Use Zenith CLI");

    await act(async () => {
      setup.mockInput.pressKey("6");
    });
    await setup.flush();
    const findingsFrame = setup.captureCharFrame();
    expect(findingsFrame).toContain("Open Findings");
    expect(findingsFrame).toContain("Missing session close");
    expect(findingsFrame).toContain("high");

    await act(async () => {
      setup.mockInput.pressKey("7");
    });
    await setup.flush();
    const sessionsFrame = setup.captureCharFrame();
    expect(sessionsFrame).toContain("Recent Sessions");
    expect(sessionsFrame).toContain("Finished context work");

    await act(async () => {
      setup.mockInput.pressKey("8");
    });
    await setup.flush();
    const contextFrame = setup.captureCharFrame();
    expect(contextFrame).toContain("Zenith Compact Context");

    act(() => {
      setup.resize(70, 20);
    });
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("Zenith CLI");
    act(() => {
      setup.renderer.destroy();
    });
  });
});

function makeDashboardData(): DashboardData {
  const status = makeStatus();
  const plans = [status.activePlan!];
  const roadmaps = status.recentRoadmaps;
  const context = makeContext(status);
  return { status, plans, roadmaps, context };
}

function makeStatus(): ProjectStatus {
  const activePlan: Plan = {
    id: "plan_1",
    projectId: "proj_1",
    title: "Zenith MVP",
    status: "active",
    sourceRoadmapId: "roadmap_1",
    sourceRoadmapItemId: "rmi_2",
    phases: [
      {
        id: "phase_1",
        title: "Foundation",
        description: "Documented acceptance details.",
        status: "pending",
        acceptanceCriteria: ["Documented acceptance"],
        evidence: [],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const status: ProjectStatus = {
    project: {
      id: "proj_1",
      name: "Meridian",
      rootPath: "/work/meridian",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    git: {
      isGitRepo: true,
      rootPath: "/work/meridian",
      branch: "main",
      changedFiles: [],
      dirty: false,
    },
    registered: true,
    activePlan,
    currentPhase: {
      id: "phase_1",
      title: "Foundation",
      description: "Documented acceptance details.",
      status: "pending",
      acceptanceCriteria: ["Documented acceptance"],
      evidence: [],
    },
    currentBrief: {
      id: "brief_1",
      projectId: "proj_1",
      version: 1,
      title: "Meridian Brief",
      summary: "Local-first memory for projects.",
      body: "Meridian uses Zenith for durable project memory.",
      status: "current",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    recentRoadmaps: [makeRoadmap()],
    openSpikes: [makeSpike()],
    recentSessions: [
      {
        id: "sess_1",
        projectId: "proj_1",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T01:00:00.000Z",
        branch: "main",
        summary: "Finished context work",
        changedFiles: ["src/app/context-engine.ts"],
        relatedPlanId: "plan_1",
        nextSteps: ["Continue hardening"],
      },
    ],
    recentDecisions: [
      {
        id: "dec_1",
        projectId: "proj_1",
        title: "Rename product",
        context: "The previous name no longer fits.",
        decision: "Use Zenith CLI as the public name.",
        consequences: "Generated agent instructions use Zenith.",
        alternatives: ["Keep old name"],
        relatedPlanIds: ["plan_1"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    openFindings: [
      {
        id: "finding_1",
        severity: "high",
        title: "Missing session close",
      },
    ],
    next: {
      recommendation: "Foundation",
      reason: "First pending phase in the active plan.",
      planId: "plan_1",
      phaseId: "phase_1",
      evidence: ["Zenith MVP"],
    },
  };

  return status;
}

function makeRoadmap(): Roadmap {
  return {
    id: "roadmap_1",
    projectId: "proj_1",
    title: "Zenith CLI Product Roadmap",
    status: "active",
    items: [
      {
        id: "rmi_1",
        roadmapId: "roadmap_1",
        title: "Product Roadmap",
        status: "done",
        evidence: [],
      },
      {
        id: "rmi_2",
        roadmapId: "roadmap_1",
        title: "Product And Architecture Hardening",
        status: "in_progress",
        evidence: [],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeSpike(): Spike {
  return {
    id: "spike_1",
    projectId: "proj_1",
    title: "SQLite storage spike",
    question: "Which local store should Zenith use?",
    hypothesis: "SQLite is enough for typed project memory.",
    options: ["SQLite", "JSON files"],
    evidence: [],
    status: "open",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeContext(status: ProjectStatus): CompactContext {
  return {
    project: {
      id: "proj_1",
      name: "Meridian",
      rootPath: "/work/meridian",
    },
    git: status.git,
    currentBrief: {
      id: "brief_1",
      title: "Meridian Brief",
      summary: "Local-first memory for projects.",
      version: 1,
      status: "current",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    recentRoadmaps: [
      {
        id: "roadmap_1",
        title: "Zenith CLI Product Roadmap",
        status: "active",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    openSpikes: [
      {
        id: "spike_1",
        title: "SQLite storage spike",
        question: "Which local store should Zenith use?",
        status: "open",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    activePlan: {
      id: "plan_1",
      title: "Zenith MVP",
      status: "active",
    },
    currentPhase: status.currentPhase,
    selectedPhase: {
      planId: "plan_1",
      planTitle: "Zenith MVP",
      phase: status.currentPhase!,
    },
    recentSessions: [
      {
        id: "sess_1",
        startedAt: "2026-01-01T00:00:00.000Z",
        endedAt: "2026-01-01T01:00:00.000Z",
        branch: "main",
        summary: "Finished context work",
        changedFiles: ["src/app/context-engine.ts"],
        relatedPlanId: "plan_1",
        nextSteps: ["Continue hardening"],
      },
    ],
    recentDecisions: [
      {
        id: "dec_1",
        title: "Rename product",
        relatedPlanIds: ["plan_1"],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    openFindings: [
      {
        id: "finding_1",
        severity: "high",
        title: "Missing session close",
      },
    ],
    next: status.next,
    markdown:
      "# Zenith Compact Context\n\n## Project\n- Name: Meridian\n\n## Plan\n- Active plan: Zenith MVP\n\n## Phase details\n- Description: Documented acceptance details.",
  };
}
