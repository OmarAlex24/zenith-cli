/** @jsxImportSource @opentui/react */

import { describe, expect, test } from "bun:test";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { Dashboard, type DashboardData } from "../src/tui/Dashboard";
import type { ProjectStatus } from "../src/app/decode-app";
import { buildRoadmapWorkspace } from "../src/app/roadmap-workspace";
import type { CompactContext, Decision, Event, Finding, Plan, ProjectBrief, Roadmap, Session, Spike } from "../src/domain/schemas";

describe("OpenTUI dashboard", () => {
  test("renders sidebar shell, sections, and master-detail navigation", async () => {
    const data = makeDashboardData();

    const setup = await testRender(<Dashboard initialData={data} />, { width: 120, height: 32 });
    await setup.flush();
    const home = setup.captureCharFrame();

    expect(home).toContain("ZENITH");
    expect(home).toContain("Meridian");
    expect(home).toContain("main");
    expect(home).toContain("PULSE");
    expect(home).toContain("Roadmap");
    expect(home).toContain("Findings");
    expect(home).toContain("Next action");
    expect(home).toContain("NEXT");
    expect(home).toContain("Focus");

    await act(async () => {
      setup.mockInput.pressKey("3");
    });
    await setup.flush();
    const roadmapTop = setup.captureCharFrame();
    expect(roadmapTop).toContain("Roadmaps");
    expect(roadmapTop).toContain("Items");
    expect(roadmapTop).toContain("Detail");

    // Drill into items, then select the in-progress item that has a linked plan.
    await act(async () => {
      setup.mockInput.pressEnter();
    });
    await setup.flush();
    await act(async () => {
      setup.mockInput.pressArrow("down");
    });
    await setup.flush();
    const roadmap = setup.captureCharFrame();
    expect(roadmap).toContain("Why");
    expect(roadmap).toContain("Zenith MVP");
    expect(roadmap).toContain("Foundation");

    await act(async () => {
      setup.mockInput.pressKey("5");
    });
    await setup.flush();
    const findings = setup.captureCharFrame();
    expect(findings).toContain("Findings");
    expect(findings).toContain("HIGH");
    expect(findings).toContain("Missing session close");
    expect(findings).toContain("Finding detail");
    expect(findings).toContain("Description");
    expect(findings).toContain("src/cli/program.ts");

    await act(async () => {
      setup.mockInput.pressKey("6");
    });
    await setup.flush();
    const sessions = setup.captureCharFrame();
    expect(sessions).toContain("Sessions");
    expect(sessions).toContain("Finished context work");

    await act(async () => {
      setup.mockInput.pressKey("7");
    });
    await setup.flush();
    const decisions = setup.captureCharFrame();
    expect(decisions).toContain("Decisions");
    expect(decisions).toContain("Rename product");
    expect(decisions).toContain("Use Zenith CLI");

    await act(async () => {
      setup.mockInput.pressKey("2");
    });
    await setup.flush();
    const brief = setup.captureCharFrame();
    expect(brief).toContain("Project Brief");
    expect(brief).toContain("Meridian Brief");

    await act(async () => {
      setup.mockInput.pressKey("8");
    });
    await setup.flush();
    const context = setup.captureCharFrame();
    expect(context).toContain("Compact Context");
    expect(context).toContain("Zenith Compact Context");

    act(() => {
      setup.resize(70, 20);
    });
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("ZENITH");

    act(() => {
      setup.renderer.destroy();
    });
  });

  test("selection moves within a list and reload refreshes data", async () => {
    const initialData = makeDashboardData({
      findings: [
        makeFinding(),
        {
          ...makeFinding(),
          id: "finding_2",
          severity: "low",
          title: "Second selectable finding",
          description: "Selection should move to this item.",
          relatedFiles: ["src/tui/Dashboard.tsx"],
        },
      ],
    });
    const refreshedData = makeDashboardData({
      findings: [
        {
          ...makeFinding(),
          id: "finding_3",
          severity: "medium",
          type: "docs_gap",
          title: "Dashboard docs missing",
          description: "README should explain the redesigned TUI.",
          relatedFiles: ["README.md"],
        },
      ],
      projectName: "Atlas",
    });
    let reloadCount = 0;

    const setup = await testRender(
      <Dashboard
        initialData={initialData}
        reload={async () => {
          reloadCount += 1;
          return refreshedData;
        }}
      />,
      { width: 110, height: 30 },
    );
    await setup.flush();

    await act(async () => {
      setup.mockInput.pressKey("5");
    });
    await setup.flush();

    await act(async () => {
      setup.mockInput.pressArrow("down");
    });
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("Second selectable finding");

    await act(async () => {
      setup.mockInput.pressKey("r");
    });
    await setup.flush();
    const refreshed = setup.captureCharFrame();

    expect(reloadCount).toBe(1);
    expect(refreshed).toContain("Dashboard docs missing");
    expect(refreshed).toContain("README.md");
    expect(refreshed).toContain("Atlas");

    act(() => {
      setup.renderer.destroy();
    });
  });

  test("pressing t opens timeline overlay and numeric keys still navigate sections when closed", async () => {
    const timeline = makeTimeline();
    const data = makeDashboardData({ timeline });
    const setup = await testRender(<Dashboard initialData={data} />, { width: 120, height: 32 });
    await setup.flush();

    // Press 't' to open timeline overlay
    await act(async () => {
      setup.mockInput.pressKey("t");
    });
    await setup.flush();
    const overlayFrame = setup.captureCharFrame();
    expect(overlayFrame).toContain("TIMELINE");
    expect(overlayFrame).toContain("project.registered");

    // Press 't' again to close the overlay
    await act(async () => {
      setup.mockInput.pressKey("t");
    });
    await setup.flush();

    // Numeric key '3' should still navigate to Roadmap section
    await act(async () => {
      setup.mockInput.pressKey("3");
    });
    await setup.flush();
    const roadmapFrame = setup.captureCharFrame();
    expect(roadmapFrame).toContain("Roadmap");
    expect(roadmapFrame).not.toContain("TIMELINE");

    act(() => {
      setup.renderer.destroy();
    });
  });
});

function makeDashboardData(
  options: { findings?: Finding[]; projectName?: string; timeline?: Event[] } = {},
): DashboardData {
  const findings = options.findings ?? [makeFinding()];
  const status = makeStatus({ findings, ...(options.projectName ? { projectName: options.projectName } : {}) });
  const plans = [status.activePlan!];
  return {
    status,
    brief: makeBrief(),
    plans,
    roadmaps: status.recentRoadmaps,
    workspace: buildRoadmapWorkspace(status.recentRoadmaps, plans, null),
    spikes: [makeSpike()],
    findings,
    sessions: status.recentSessions,
    decisions: status.recentDecisions,
    context: makeContext(status),
    timeline: options.timeline ?? makeTimeline(),
  };
}

function makeTimeline(): Event[] {
  return [
    {
      id: "evt_1",
      projectId: "proj_1",
      type: "project.registered",
      entityType: "project",
      entityId: "proj_1",
      payload: { rootPath: "/work/meridian" },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "evt_2",
      projectId: "proj_1",
      type: "plan.created",
      entityType: "plan",
      entityId: "plan_1",
      payload: {},
      createdAt: "2026-01-01T00:01:00.000Z",
    },
  ];
}

function makeStatus(options: { findings: Finding[]; projectName?: string }): ProjectStatus {
  const projectName = options.projectName ?? "Meridian";
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
        status: "todo",
        acceptanceCriteria: ["Documented acceptance"],
        evidence: [],
        dependsOn: [],
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  return {
    project: {
      id: "proj_1",
      name: projectName,
      rootPath: "/work/meridian",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    git: {
      isGitRepo: true,
      rootPath: "/work/meridian",
      worktreeRoot: "/work/meridian",
      repoRoot: "/work/meridian",
      branch: "main",
      changedFiles: [],
      dirty: false,
    },
    registered: true,
    activePlan,
    currentPhase: activePlan.phases[0]!,
    currentBrief: makeBrief(),
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
    openFindings: options.findings.map((finding) => ({
      id: finding.id,
      type: finding.type,
      severity: finding.severity,
      title: finding.title,
      relatedFiles: finding.relatedFiles,
    })),
    focus: null,
    focusAmbiguous: false,
    next: {
      recommendation: "Foundation",
      reason: "First ready todo phase in the active plan.",
      planId: "plan_1",
      phaseId: "phase_1",
      evidence: ["Zenith MVP"],
    },
  };
}

function makeBrief(): ProjectBrief {
  return {
    id: "brief_1",
    projectId: "proj_1",
    version: 1,
    title: "Meridian Brief",
    summary: "Local-first memory for projects.",
    body: "# Intent\nMeridian uses Zenith for durable project memory.",
    status: "current",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeFinding(): Finding {
  return {
    id: "finding_1",
    projectId: "proj_1",
    type: "bug",
    severity: "high",
    title: "Missing session close",
    description: "Sessions must be closed so future agents can resume from accurate next steps.",
    status: "open",
    relatedFiles: ["src/cli/program.ts"],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeRoadmap(): Roadmap {
  return {
    id: "roadmap_1",
    projectId: "proj_1",
    title: "Zenith CLI Product Roadmap",
    status: "active",
    items: [
      { id: "rmi_1", roadmapId: "roadmap_1", title: "Product Roadmap", status: "done", evidence: [] },
      {
        id: "rmi_2",
        roadmapId: "roadmap_1",
        title: "Product And Architecture Hardening",
        justification: "Hardening before review skills.",
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
    project: { id: "proj_1", name: "Meridian", rootPath: "/work/meridian" },
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
      { id: "roadmap_1", title: "Zenith CLI Product Roadmap", status: "active", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    openSpikes: [
      { id: "spike_1", title: "SQLite storage spike", question: "Which local store should Zenith use?", status: "open", updatedAt: "2026-01-01T00:00:00.000Z" },
    ],
    activePlan: { id: "plan_1", title: "Zenith MVP", status: "active" },
    currentPhase: status.currentPhase,
    selectedPhase: { planId: "plan_1", planTitle: "Zenith MVP", phase: status.currentPhase! },
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
    recentDecisions: [{ id: "dec_1", title: "Rename product", relatedPlanIds: ["plan_1"], createdAt: "2026-01-01T00:00:00.000Z" }],
    openFindings: [
      { id: "finding_1", type: "bug", severity: "high", title: "Missing session close", relatedFiles: ["src/cli/program.ts"] },
    ],
    next: status.next,
    markdown:
      "# Zenith Compact Context\n\n## Project\n- Name: Meridian\n\n## Plan\n- Active plan: Zenith MVP\n\n## Phase details\n- Description: Documented acceptance details.",
  };
}
