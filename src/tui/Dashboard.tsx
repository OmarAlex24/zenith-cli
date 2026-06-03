/** @jsxImportSource @opentui/react */

import { useState, type ReactNode } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { ProjectStatus } from "../app/decode-app";
import type { RoadmapWorkspace, WorkspaceGroup } from "../app/roadmap-workspace";
import type {
  CompactContext,
  Decision,
  Event,
  Finding,
  Plan,
  ProjectBrief,
  Roadmap,
  Session,
  Spike,
} from "../domain/schemas";
import {
  eventGlyph,
  palette,
  progressBar,
  severityBadge,
  statusColor,
  statusGlyph,
  statusLabel,
  findingTypeLabel,
  truncate,
} from "./theme";

export type DashboardData = {
  status: ProjectStatus;
  brief: ProjectBrief | null;
  plans: Plan[];
  roadmaps: Roadmap[];
  workspace: RoadmapWorkspace;
  spikes: Spike[];
  findings: Finding[];
  sessions: Session[];
  decisions: Decision[];
  context: CompactContext;
  timeline: Event[];
};

export type DashboardProps = {
  initialData: DashboardData;
  reload?: () => Promise<DashboardData>;
};

const sections = [
  { id: "home", label: "Home" },
  { id: "brief", label: "Brief" },
  { id: "roadmap", label: "Roadmap" },
  { id: "spikes", label: "Spikes" },
  { id: "findings", label: "Findings" },
  { id: "sessions", label: "Sessions" },
  { id: "decisions", label: "Decisions" },
  { id: "context", label: "Context" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type SelectionState = Record<SectionId, number>;

type WorkspaceState = { groupIdx: number; itemIdx: number; detailIdx: number; level: 0 | 1 | 2 };

const initialWorkspaceState: WorkspaceState = { groupIdx: 0, itemIdx: 0, detailIdx: 0, level: 0 };

type Row = {
  key: string;
  glyph: string;
  glyphColor: string;
  title: string;
  titleColor?: string;
  badge?: { text: string; color: string };
};

export function Dashboard({ initialData, reload }: DashboardProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [selectionBySection, setSelectionBySection] = useState<SelectionState>(initialSelection);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [focusRegion, setFocusRegion] = useState<"sidebar" | "content">("sidebar");
  const [refreshing, setRefreshing] = useState(false);
  const [overlay, setOverlay] = useState<"timeline" | null>(null);
  const [timelineScrollIndex, setTimelineScrollIndex] = useState(0);
  const renderer = useRenderer();
  const { height } = useTerminalDimensions();

  const count = selectionCount(activeSection, data);
  const selectedIndex = clamp(selectionBySection[activeSection] ?? 0, count);

  const goToSection = (section: SectionId) => setActiveSection(section);

  useKeyboard((key) => {
    const token = key.name || key.raw || key.sequence;

    // Overlay mode: intercept all keys when timeline is open
    if (overlay === "timeline") {
      if (key.name === "t" || key.name === "escape") {
        setOverlay(null);
        return;
      }
      if (key.name === "up" || key.name === "k") {
        setTimelineScrollIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setTimelineScrollIndex((prev) => Math.min(Math.max(0, data.timeline.length - 1), prev + 1));
        return;
      }
      if (key.name === "q") {
        renderer.destroy();
        return;
      }
      return;
    }

    if (key.name === "q" || key.name === "escape") {
      renderer.destroy();
      return;
    }

    if (key.name === "t") {
      setOverlay("timeline");
      setTimelineScrollIndex(0);
      return;
    }

    // Global shortcuts that always work
    const numbered = sectionByNumber(token);
    if (numbered) {
      goToSection(numbered);
      setFocusRegion("content");
      if (numbered !== "roadmap") {
        setWorkspaceState(initialWorkspaceState);
      }
      return;
    }

    if (key.name === "r" && reload && !refreshing) {
      setRefreshing(true);
      void reload()
        .then((next) => {
          setData(next);
          setSelectionBySection((prev) => clampAll(prev, next));
          setWorkspaceState((prev) => clampWorkspace(prev, next.workspace));
        })
        .finally(() => setRefreshing(false));
      return;
    }

    if (focusRegion === "sidebar") {
      if (key.name === "up" || key.name === "k") {
        goToSection(stepSection(activeSection, -1));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        goToSection(stepSection(activeSection, 1));
        return;
      }
      if (key.name === "return" || key.name === "enter" || key.name === "right" || key.name === "tab") {
        setFocusRegion("content");
        return;
      }
      return;
    }

    // focusRegion === "content"
    if (key.name === "backspace" || key.name === "left") {
      if (activeSection === "roadmap" && workspaceState.level > 0) {
        setWorkspaceState((prev) => stepWorkspaceLevel(prev, data.workspace, -1));
      } else {
        setFocusRegion("sidebar");
      }
      return;
    }

    if (activeSection === "roadmap") {
      if (key.name === "return" || key.name === "enter" || key.name === "right" || key.name === "tab") {
        setWorkspaceState((prev) => stepWorkspaceLevel(prev, data.workspace, 1));
        return;
      }
      if (key.name === "up" || key.name === "k") {
        setWorkspaceState((prev) => moveWorkspace(prev, data.workspace, -1));
        return;
      }
      if (key.name === "down" || key.name === "j") {
        setWorkspaceState((prev) => moveWorkspace(prev, data.workspace, 1));
        return;
      }
      return;
    }

    // Other sections: up/down move the selection within the content list
    if (key.name === "up" || key.name === "k") {
      setSelectionBySection((prev) => ({ ...prev, [activeSection]: clamp(selectedIndex - 1, count) }));
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setSelectionBySection((prev) => ({ ...prev, [activeSection]: clamp(selectedIndex + 1, count) }));
      return;
    }
  });

  const bodyHeight = Math.max(6, height - 6);

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: palette.bg, padding: 1 }}>
      <Header status={data.status} refreshing={refreshing} />
      <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
        <Sidebar data={data} activeSection={activeSection} hasFocus={focusRegion === "sidebar"} />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {overlay === "timeline" ? (
            <TimelineOverlay timeline={data.timeline} scrollIndex={timelineScrollIndex} bodyHeight={bodyHeight} />
          ) : (
            <Main
              data={data}
              section={activeSection}
              selectedIndex={selectedIndex}
              bodyHeight={bodyHeight}
              workspaceState={workspaceState}
            />
          )}
        </box>
      </box>
      <Footer status={data.status} overlayOpen={overlay !== null} />
    </box>
  );
}

function Header({ status, refreshing }: { status: ProjectStatus; refreshing: boolean }) {
  const project = status.project?.name ?? "unregistered";
  const branch = status.git.branch ?? "no-branch";
  const dirty = status.git.dirty ? "●dirty" : "clean";
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 1 }}>
      <text>
        <span fg={palette.accent}>ZENITH</span>
        <span fg={palette.faint}>  ·  local project memory</span>
      </text>
      <text>
        <span fg={palette.text}>{truncate(project, 22)}</span>
        <span fg={palette.faint}>{" · "}</span>
        <span fg={palette.accentAlt}>{truncate(branch, 18)}</span>
        <span fg={palette.faint}>{" · "}</span>
        <span fg={status.git.dirty ? palette.warning : palette.success}>{dirty}</span>
        {refreshing ? <span fg={palette.muted}>{"  refreshing…"}</span> : null}
      </text>
    </box>
  );
}

function Sidebar({ data, activeSection, hasFocus }: { data: DashboardData; activeSection: SectionId; hasFocus: boolean }) {
  const plan = data.status.activePlan;
  const phaseTotal = plan?.phases.length ?? 0;
  const phaseDone = plan?.phases.filter((phase) => phase.status === "done").length ?? 0;

  return (
    <box
      border
      borderColor={hasFocus ? palette.borderActive : palette.border}
      backgroundColor={palette.panel}
      style={{ width: 18, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {sections.map((section) => {
        const active = section.id === activeSection;
        const badge = sidebarBadge(section.id, data);
        return (
          <text key={section.id}>
            <span fg={active && hasFocus ? palette.accent : palette.faint}>{active ? "▸ " : "  "}</span>
            <span fg={active && hasFocus ? palette.accent : palette.text}>{section.label}</span>
            {badge ? <span fg={badge.color}>{` ${badge.text}`}</span> : null}
          </text>
        );
      })}
      <text fg={palette.faint}>{"────────────"}</text>
      <text fg={palette.muted}>PULSE</text>
      <text>
        <span fg={palette.faint}>plan </span>
        <span fg={palette.accent}>{plan ? progressBar(phaseDone, phaseTotal, 6) : "none"}</span>
      </text>
      <text>
        <span fg={palette.faint}>find </span>
        <span fg={data.findings.length > 0 ? palette.danger : palette.success}>{`${data.findings.length} open`}</span>
      </text>
      <text>
        <span fg={palette.faint}>spike </span>
        <span fg={palette.text}>{`${data.spikes.length}`}</span>
      </text>
      <text>
        <span fg={palette.faint}>sess </span>
        <span fg={palette.text}>{`${data.sessions.length}`}</span>
      </text>
    </box>
  );
}

function Footer({ status, overlayOpen }: { status: ProjectStatus; overlayOpen: boolean }) {
  return (
    <box style={{ flexDirection: "column", height: 2 }}>
      <text>
        <span fg={palette.accent}>▶ NEXT  </span>
        <span fg={palette.text}>{truncate(status.next.recommendation ?? "nothing pending", 60)}</span>
        <span fg={palette.faint}>{`  — ${truncate(status.next.reason, 50)}`}</span>
      </text>
      {overlayOpen ? (
        <text fg={palette.faint}>t/esc close timeline · ↑↓ scroll · q quit</text>
      ) : (
        <text fg={palette.faint}>↑↓ nav · enter focus · ⌫ back · 1-8 jump · t timeline · r refresh · q quit</text>
      )}
    </box>
  );
}

function TimelineOverlay({
  timeline,
  scrollIndex,
  bodyHeight,
}: {
  timeline: Event[];
  scrollIndex: number;
  bodyHeight: number;
}) {
  const visibleCount = Math.max(1, bodyHeight - 2);
  const start = Math.max(0, scrollIndex - Math.floor(visibleCount / 2));
  const visible = timeline.slice(start, start + visibleCount);

  return (
    <box
      border
      borderColor={palette.borderActive}
      backgroundColor={palette.panel}
      style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}
    >
      <text>
        <span fg={palette.accent}>{"TIMELINE  "}</span>
        <span fg={palette.faint}>{`${timeline.length} events`}</span>
      </text>
      {timeline.length === 0 ? (
        <text fg={palette.muted}>{"No events recorded yet."}</text>
      ) : (
        visible.map((event, idx) => {
          const absoluteIdx = start + idx;
          const active = absoluteIdx === scrollIndex;
          const glyph = eventGlyph(event.type);
          return (
            <text key={event.id}>
              <span fg={active ? palette.accent : palette.faint}>{active ? "▸ " : "  "}</span>
              <span fg={palette.muted}>{`${glyph} `}</span>
              <span fg={active ? palette.text : palette.muted}>{truncate(event.type, 28)}</span>
              <span fg={palette.faint}>{`  ${event.entityType}:${truncate(event.entityId, 16)}`}</span>
              <span fg={palette.faint}>{`  ${event.createdAt}`}</span>
            </text>
          );
        })
      )}
    </box>
  );
}

function Main({
  data,
  section,
  selectedIndex,
  bodyHeight,
  workspaceState,
}: {
  data: DashboardData;
  section: SectionId;
  selectedIndex: number;
  bodyHeight: number;
  workspaceState: WorkspaceState;
}) {
  if (section === "home") return <HomeView data={data} bodyHeight={bodyHeight} />;
  if (section === "brief") return <BriefView data={data} />;
  if (section === "context") return <ContextView data={data} />;
  if (section === "roadmap")
    return <RoadmapWorkspaceView workspace={data.workspace} state={workspaceState} bodyHeight={bodyHeight} />;
  if (section === "spikes") return <SpikesView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
  if (section === "findings") return <FindingsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
  if (section === "sessions") return <SessionsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
  return <DecisionsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
}

function HomeView({ data, bodyHeight }: { data: DashboardData; bodyHeight: number }) {
  const { status } = data;
  const plan = status.activePlan;
  const phaseTotal = plan?.phases.length ?? 0;
  const phaseDone = plan?.phases.filter((phase) => phase.status === "done").length ?? 0;
  const showHero = bodyHeight >= 12;

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
      {showHero ? (
        <box border borderColor={palette.border} backgroundColor={palette.panel} style={{ paddingLeft: 1, paddingRight: 1 }}>
          <ascii-font text="ZENITH" font="tiny" />
        </box>
      ) : null}

      <Panel title="Next action" grow={false}>
        <text fg={palette.accent}>{status.next.recommendation ?? "nothing pending"}</text>
        <text fg={palette.muted}>{status.next.reason}</text>
      </Panel>

      <Panel title="Focus" grow={false}>
        {status.focus ? (
          <text>
            <span fg={palette.accent}>{truncate(status.focus.roadmapTitle, 44)}</span>
            <span fg={palette.faint}>{`  ${status.focus.branch ?? "no-branch"}`}</span>
          </text>
        ) : status.focusAmbiguous ? (
          <text fg={palette.warning}>{"no focus — multiple roadmaps active · zenith focus set <id>"}</text>
        ) : (
          <text fg={palette.muted}>{"no focus binding for this worktree"}</text>
        )}
      </Panel>

      <box style={{ flexDirection: "row", gap: 1, flexGrow: 1 }}>
        <Panel title="Active plan">
          <text fg={palette.text}>{truncate(plan?.title ?? "no active plan", 40)}</text>
          {plan ? <text fg={palette.accent}>{progressBar(phaseDone, phaseTotal, 10)}</text> : null}
          {plan
            ? plan.phases.slice(0, 5).map((phase) => (
                <text key={phase.id}>
                  <span fg={statusColor(phase.status)}>{`${statusGlyph(phase.status)} `}</span>
                  <span fg={palette.text}>{truncate(phase.title, 34)}</span>
                </text>
              ))
            : null}
        </Panel>

        <box style={{ flexDirection: "column", flexGrow: 1, gap: 1 }}>
          <Panel title={`Findings (${status.openFindings.length})`}>
            {status.openFindings.length === 0 ? (
              <text fg={palette.muted}>none open</text>
            ) : (
              status.openFindings.slice(0, 3).map((finding) => (
                <text key={finding.id}>
                  <span fg={severityBadge(finding.severity).color}>{`${severityBadge(finding.severity).label} `}</span>
                  <span fg={palette.text}>{truncate(finding.title, 30)}</span>
                </text>
              ))
            )}
          </Panel>
          <Panel title={`Spikes (${data.spikes.length})`}>
            {data.spikes.length === 0 ? (
              <text fg={palette.muted}>none</text>
            ) : (
              data.spikes.slice(0, 3).map((spike) => (
                <text key={spike.id} fg={palette.text}>
                  {truncate(spike.title, 36)}
                </text>
              ))
            )}
          </Panel>
        </box>
      </box>
    </box>
  );
}

function BriefView({ data }: { data: DashboardData }) {
  const brief = data.brief;
  return (
    <Panel title="Project Brief">
      {brief ? (
        <scrollbox focused style={{ flexGrow: 1 }}>
          <text fg={palette.accent}>{truncate(brief.title, 90)}</text>
          <text fg={palette.muted}>{`v${brief.version} · ${statusLabel(brief.status)} · ${truncate(brief.updatedAt, 24)}`}</text>
          <text fg={palette.text}> </text>
          <text fg={palette.text}>{brief.summary}</text>
          <text fg={palette.text}> </text>
          {brief.body.split("\n").map((line, index) => (
            <text key={index} fg={line.startsWith("#") ? palette.accent : palette.text}>
              {line.length > 0 ? line : " "}
            </text>
          ))}
        </scrollbox>
      ) : (
        <text fg={palette.muted}>No brief recorded. Use `zenith brief set` to define project intent.</text>
      )}
    </Panel>
  );
}

function ContextView({ data }: { data: DashboardData }) {
  const lines = data.context.markdown.split("\n");
  return (
    <Panel title="Compact Context">
      <scrollbox focused style={{ flexGrow: 1 }}>
        {lines.map((line, index) => (
          <text key={index} fg={line.startsWith("#") ? palette.accent : palette.text}>
            {line.length > 0 ? line : " "}
          </text>
        ))}
      </scrollbox>
    </Panel>
  );
}

function RoadmapWorkspaceView({
  workspace,
  state,
  bodyHeight,
}: {
  workspace: RoadmapWorkspace;
  state: WorkspaceState;
  bodyHeight: number;
}) {
  const groups = workspace.groups;
  if (groups.length === 0) {
    return (
      <box border borderColor={palette.border} backgroundColor={palette.panel} style={{ flexGrow: 1, padding: 1 }}>
        <text fg={palette.muted}>No roadmaps yet. Use `zenith roadmap create`.</text>
      </box>
    );
  }

  const groupIdx = clamp(state.groupIdx, groups.length);
  const group = groups[groupIdx]!;
  const itemCount = groupItemCount(group);
  const itemIdx = clamp(state.itemIdx, itemCount);

  const groupRows: Row[] = groups.map((entry) => ({
    key: entry.roadmapId ?? "standalone",
    glyph: entry.isFocused ? "◎" : statusGlyph(entry.status),
    glyphColor: entry.isFocused ? palette.accent : statusColor(entry.status),
    title: truncate(entry.title, 18),
    badge: { text: `${entry.itemProgress.done}/${entry.itemProgress.total}`, color: palette.muted },
  }));

  const itemRows: Row[] = workspaceItemRows(group);

  const visibleRows = Math.max(3, bodyHeight - 2);

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
      <ListPanel
        title={`Roadmaps (${groups.length})`}
        rows={groupRows}
        selectedIndex={groupIdx}
        visibleRows={visibleRows}
        active={state.level === 0}
        width={22}
      />
      <ListPanel
        title={`Items (${itemCount})`}
        rows={itemRows}
        selectedIndex={itemIdx}
        visibleRows={visibleRows}
        active={state.level === 1}
        width={28}
      />
      <box
        title="Detail"
        border
        borderColor={state.level === 2 ? palette.borderActive : palette.border}
        backgroundColor={palette.panel}
        style={{ flexGrow: 1, flexBasis: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
      >
        <scrollbox focused style={{ flexGrow: 1 }}>
          <WorkspaceDetail group={group} itemIdx={itemIdx} detailIdx={state.detailIdx} detailActive={state.level === 2} />
        </scrollbox>
      </box>
    </box>
  );
}

function WorkspaceDetail({
  group,
  itemIdx,
  detailIdx,
  detailActive,
}: {
  group: WorkspaceGroup;
  itemIdx: number;
  detailIdx: number;
  detailActive: boolean;
}) {
  if (group.roadmapId === null) {
    const plan = group.standalonePlans[itemIdx];
    if (!plan) return <text fg={palette.muted}>No unlinked plans.</text>;
    return <PlanDetail plan={plan} detailIdx={detailIdx} detailActive={detailActive} />;
  }

  const entry = group.items[itemIdx];
  if (!entry) return <text fg={palette.muted}>No roadmap items.</text>;

  return (
    <>
      <text>
        <span fg={statusColor(entry.item.status)}>{`${statusGlyph(entry.item.status)} `}</span>
        <span fg={palette.accent}>{entry.item.title}</span>
      </text>
      <DetailRow label="Status" value={statusLabel(entry.item.status)} color={statusColor(entry.item.status)} />
      <DetailText label="Description" value={entry.item.description ?? "none"} />
      <DetailText label="Why" value={entry.item.justification ?? "none"} />
      {entry.linkedPlans.length === 0 ? (
        <text fg={palette.muted}>{"No plan yet — create with `zenith roadmap create-plan`."}</text>
      ) : (
        entry.linkedPlans.map((plan) => <PlanDetail key={plan.id} plan={plan} detailIdx={detailIdx} detailActive={detailActive} />)
      )}
    </>
  );
}

function PlanDetail({ plan, detailIdx, detailActive }: { plan: Plan; detailIdx: number; detailActive: boolean }) {
  const done = plan.phases.filter((phase) => phase.status === "done").length;
  return (
    <>
      <text fg={palette.text}> </text>
      <text>
        <span fg={palette.accentAlt}>{"▶ "}</span>
        <span fg={palette.text}>{plan.title}</span>
        <span fg={palette.faint}>{`  ${statusLabel(plan.status)}`}</span>
      </text>
      <text fg={palette.accent}>{progressBar(done, plan.phases.length, 12)}</text>
      {plan.phases.map((phase, index) => {
        const selected = detailActive && index === detailIdx;
        return (
          <text key={phase.id} {...(selected ? { bg: palette.highlight } : {})}>
            <span fg={statusColor(phase.status)}>{`  ${statusGlyph(phase.status)} `}</span>
            <span fg={selected ? palette.accent : palette.text}>{phase.title}</span>
            <span fg={palette.faint}>{`  ${statusLabel(phase.status)}`}</span>
          </text>
        );
      })}
    </>
  );
}

function SpikesView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const spike = data.spikes[selectedIndex];
  const rows: Row[] = data.spikes.map((item) => ({
    key: item.id,
    glyph: statusGlyph(item.status),
    glyphColor: statusColor(item.status),
    title: truncate(item.title, 24),
  }));

  return (
    <MasterDetail
      listTitle={`Spikes (${data.spikes.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Spike detail"
    >
      {spike ? (
        <>
          <text fg={palette.accent}>{spike.title}</text>
          <DetailRow label="Status" value={statusLabel(spike.status)} color={statusColor(spike.status)} />
          <DetailText label="Question" value={spike.question} />
          <DetailText label="Hypothesis" value={spike.hypothesis ?? "none"} />
          <DetailText label="Options" value={spike.options.join("\n") || "none"} />
          <DetailText label="Result" value={spike.result ?? "open"} />
          <DetailText label="Recommendation" value={spike.recommendation ?? "none"} />
        </>
      ) : (
        <text fg={palette.muted}>No spikes recorded.</text>
      )}
    </MasterDetail>
  );
}

function FindingsView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const finding = data.findings[selectedIndex];
  const rows: Row[] = data.findings.map((item) => ({
    key: item.id,
    glyph: statusGlyph(item.status),
    glyphColor: statusColor(item.status),
    title: truncate(item.title, 18),
    badge: { text: severityBadge(item.severity).label, color: severityBadge(item.severity).color },
  }));

  return (
    <MasterDetail
      listTitle={`Findings (${data.findings.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Finding detail"
    >
      {finding ? (
        <>
          <text>
            <span fg={severityBadge(finding.severity).color}>{`${severityBadge(finding.severity).label} `}</span>
            <span fg={palette.accent}>{finding.title}</span>
          </text>
          <DetailRow label="Type" value={findingTypeLabel(finding.type)} />
          <DetailRow label="Severity" value={finding.severity} color={severityBadge(finding.severity).color} />
          <DetailRow label="Status" value={statusLabel(finding.status)} color={statusColor(finding.status)} />
          <DetailText label="Description" value={finding.description} />
          <DetailText label="Files" value={finding.relatedFiles.join("\n") || "none"} />
          <DetailRow label="Created" value={truncate(finding.createdAt, 24)} />
          <DetailRow label="Closed" value={finding.closedAt ?? "open"} />
          {finding.relatedPlanId && <DetailRow label="Plan" value={finding.relatedPlanId} />}
          {finding.relatedPhaseId && <DetailRow label="Phase" value={finding.relatedPhaseId} />}
        </>
      ) : (
        <text fg={palette.muted}>No findings.</text>
      )}
    </MasterDetail>
  );
}

function SessionsView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const session = data.sessions[selectedIndex];
  const rows: Row[] = data.sessions.map((item) => ({
    key: item.id,
    glyph: item.endedAt ? "✓" : "◐",
    glyphColor: item.endedAt ? palette.success : palette.accent,
    title: truncate(item.summary ?? item.id, 22),
  }));

  return (
    <MasterDetail
      listTitle={`Sessions (${data.sessions.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Session detail"
    >
      {session ? (
        <>
          <text fg={palette.accent}>{session.endedAt ? "closed" : "open"} · {truncate(session.id, 40)}</text>
          <DetailRow label="Started" value={truncate(session.startedAt, 24)} />
          <DetailRow label="Ended" value={session.endedAt ?? "open"} />
          <DetailRow label="Branch" value={session.branch ?? "none"} />
          <DetailText label="Summary" value={session.summary ?? "none"} />
          <DetailText label="Changed files" value={session.changedFiles.join("\n") || "none"} />
          <DetailText label="Next steps" value={session.nextSteps.join("\n") || "none"} />
          <DetailRow label="Plan" value={session.relatedPlanId ?? "none"} />
        </>
      ) : (
        <text fg={palette.muted}>No sessions recorded.</text>
      )}
    </MasterDetail>
  );
}

function DecisionsView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const decision = data.decisions[selectedIndex];
  const rows: Row[] = data.decisions.map((item) => ({
    key: item.id,
    glyph: "◇",
    glyphColor: palette.accentAlt,
    title: truncate(item.title, 24),
  }));

  return (
    <MasterDetail
      listTitle={`Decisions (${data.decisions.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Decision detail"
    >
      {decision ? (
        <>
          <text fg={palette.accent}>{decision.title}</text>
          <DetailText label="Context" value={decision.context} />
          <DetailText label="Decision" value={decision.decision} />
          <DetailText label="Consequences" value={decision.consequences ?? "none"} />
          <DetailText label="Alternatives" value={decision.alternatives.join("\n") || "none"} />
          <DetailRow label="Created" value={truncate(decision.createdAt, 24)} />
        </>
      ) : (
        <text fg={palette.muted}>No decisions recorded.</text>
      )}
    </MasterDetail>
  );
}

type SectionViewProps = { data: DashboardData; selectedIndex: number; bodyHeight: number };

function MasterDetail({
  listTitle,
  rows,
  selectedIndex,
  bodyHeight,
  detailTitle,
  children,
}: {
  listTitle: string;
  rows: Row[];
  selectedIndex: number;
  bodyHeight: number;
  detailTitle: string;
  children: ReactNode;
}) {
  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
      <ListPanel title={listTitle} rows={rows} selectedIndex={selectedIndex} visibleRows={Math.max(3, bodyHeight - 2)} />
      <box
        title={detailTitle}
        border
        borderColor={palette.border}
        backgroundColor={palette.panel}
        style={{ flexGrow: 1, flexBasis: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
      >
        <scrollbox focused style={{ flexGrow: 1 }}>
          {children}
        </scrollbox>
      </box>
    </box>
  );
}

function ListPanel({
  title,
  rows,
  selectedIndex,
  visibleRows,
  active = true,
  width = 32,
}: {
  title: string;
  rows: Row[];
  selectedIndex: number;
  visibleRows: number;
  active?: boolean;
  width?: number;
}) {
  const maxStart = Math.max(0, rows.length - visibleRows);
  const desired = selectedIndex - Math.floor(visibleRows / 2);
  const windowStart = Math.max(0, Math.min(desired, maxStart));
  const slice = rows.slice(windowStart, windowStart + visibleRows);
  const hiddenBefore = windowStart;
  const hiddenAfter = Math.max(0, rows.length - (windowStart + visibleRows));

  return (
    <box
      title={title}
      border
      borderColor={active ? palette.borderActive : palette.border}
      backgroundColor={palette.panel}
      style={{ width, flexShrink: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {rows.length === 0 ? <text fg={palette.muted}>Nothing here.</text> : null}
      {hiddenBefore > 0 ? <text fg={palette.faint}>{`↑ ${hiddenBefore} more`}</text> : null}
      {slice.map((row, index) => {
        const idx = windowStart + index;
        const selected = idx === selectedIndex;
        return (
          <text key={row.key} {...(selected ? { bg: palette.highlight } : {})}>
            <span fg={selected ? palette.accent : row.glyphColor}>{`${selected ? "▸" : " "}${row.glyph} `}</span>
            <span fg={selected ? palette.accent : (row.titleColor ?? palette.text)}>{row.title}</span>
            {row.badge ? <span fg={row.badge.color}>{`  ${row.badge.text}`}</span> : null}
          </text>
        );
      })}
      {hiddenAfter > 0 ? <text fg={palette.faint}>{`↓ ${hiddenAfter} more`}</text> : null}
    </box>
  );
}

function Panel({ title, children, grow = true }: { title: string; children: ReactNode; grow?: boolean }) {
  return (
    <box
      title={title}
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: grow ? 1 : 0, flexBasis: grow ? 0 : undefined, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {children}
    </box>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <text>
      <span fg={palette.faint}>{`${label}: `}</span>
      <span fg={color ?? palette.text}>{value}</span>
    </text>
  );
}

function DetailText({ label, value }: { label: string; value: string }) {
  const lines = value.split("\n");
  return (
    <>
      <text fg={palette.faint}>{`${label}:`}</text>
      {lines.map((line, index) => (
        <text key={index} fg={palette.text}>
          {`  ${line}`}
        </text>
      ))}
    </>
  );
}

function sidebarBadge(section: SectionId, data: DashboardData): { text: string; color: string } | null {
  if (section === "findings" && data.findings.length > 0) {
    return { text: `${data.findings.length}`, color: palette.danger };
  }
  return null;
}

function initialSelection(): SelectionState {
  return Object.fromEntries(sections.map((section) => [section.id, 0])) as SelectionState;
}

function selectionCount(section: SectionId, data: DashboardData): number {
  if (section === "spikes") return data.spikes.length;
  if (section === "findings") return data.findings.length;
  if (section === "sessions") return data.sessions.length;
  if (section === "decisions") return data.decisions.length;
  return 0;
}

function clampAll(selection: SelectionState, data: DashboardData): SelectionState {
  return Object.fromEntries(
    sections.map((section) => [section.id, clamp(selection[section.id] ?? 0, selectionCount(section.id, data))]),
  ) as SelectionState;
}

function clamp(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

function sectionByNumber(token: string): SectionId | null {
  const index = Number(token) - 1;
  return sections[index]?.id ?? null;
}

function stepSection(active: SectionId, delta: number): SectionId {
  const index = sections.findIndex((section) => section.id === active);
  return sections[(index + delta + sections.length) % sections.length]!.id;
}

function groupItemCount(group: WorkspaceGroup | undefined): number {
  if (!group) return 0;
  return group.items.length + group.standalonePlans.length;
}

function selectedItemPlans(group: WorkspaceGroup | undefined, itemIdx: number): Plan[] {
  if (!group) return [];
  if (itemIdx < group.items.length) {
    return group.items[itemIdx]?.linkedPlans ?? [];
  }
  const standalone = group.standalonePlans[itemIdx - group.items.length];
  return standalone ? [standalone] : [];
}

function detailPhaseCount(group: WorkspaceGroup | undefined, itemIdx: number): number {
  return selectedItemPlans(group, itemIdx).reduce((total, plan) => total + plan.phases.length, 0);
}

function workspaceItemRows(group: WorkspaceGroup): Row[] {
  if (group.roadmapId === null) {
    return group.standalonePlans.map((plan) => ({
      key: plan.id,
      glyph: statusGlyph(plan.status),
      glyphColor: statusColor(plan.status),
      title: truncate(plan.title, 20),
      badge: {
        text: `${plan.phases.filter((phase) => phase.status === "done").length}/${plan.phases.length}`,
        color: palette.muted,
      },
    }));
  }

  return group.items.map((entry) => ({
    key: entry.item.id,
    glyph: statusGlyph(entry.item.status),
    glyphColor: statusColor(entry.item.status),
    title: truncate(entry.item.title, 22),
    ...(entry.phaseProgress.total > 0
      ? { badge: { text: `${entry.phaseProgress.done}/${entry.phaseProgress.total}`, color: palette.muted } }
      : {}),
  }));
}

function moveWorkspace(state: WorkspaceState, workspace: RoadmapWorkspace, delta: number): WorkspaceState {
  const groups = workspace.groups;
  if (state.level === 0) {
    const groupIdx = clamp(state.groupIdx + delta, groups.length);
    return { ...state, groupIdx, itemIdx: 0, detailIdx: 0 };
  }
  if (state.level === 1) {
    const itemIdx = clamp(state.itemIdx + delta, groupItemCount(groups[state.groupIdx]));
    return { ...state, itemIdx, detailIdx: 0 };
  }
  const detailIdx = clamp(state.detailIdx + delta, detailPhaseCount(groups[state.groupIdx], state.itemIdx));
  return { ...state, detailIdx };
}

function stepWorkspaceLevel(state: WorkspaceState, workspace: RoadmapWorkspace, delta: number): WorkspaceState {
  const groups = workspace.groups;
  if (delta > 0) {
    if (state.level === 0 && groupItemCount(groups[state.groupIdx]) === 0) return state;
    if (state.level === 1 && detailPhaseCount(groups[state.groupIdx], state.itemIdx) === 0) return state;
  }
  const level = Math.max(0, Math.min(2, state.level + delta)) as 0 | 1 | 2;
  return { ...state, level };
}

function clampWorkspace(state: WorkspaceState, workspace: RoadmapWorkspace): WorkspaceState {
  const groups = workspace.groups;
  const groupIdx = clamp(state.groupIdx, groups.length);
  const group = groups[groupIdx];
  const itemIdx = clamp(state.itemIdx, groupItemCount(group));
  const detailIdx = clamp(state.detailIdx, detailPhaseCount(group, itemIdx));
  let level = state.level;
  if (groupItemCount(group) === 0) level = 0;
  else if (detailPhaseCount(group, itemIdx) === 0 && level > 1) level = 1;
  return { groupIdx, itemIdx, detailIdx, level };
}
