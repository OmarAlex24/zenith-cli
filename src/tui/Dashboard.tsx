/** @jsxImportSource @opentui/react */

import { useState, useEffect, type ReactNode } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions, useTimeline } from "@opentui/react";
import type { ProjectStatus } from "../app/decode-app";
import type { RoadmapWorkspace, WorkspaceGroup, WorkspaceItem } from "../app/roadmap-workspace";
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
  lerpHex,
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
  /** Enable animations. Defaults to false so tests render deterministic static frames. */
  motion?: boolean;
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

const sidebarWidth = 18;
const outerGapWidth = 1;
const workspaceGapWidth = 1;
const roadmapListMinWidth = 22;
const itemListMinWidth = 28;

type SectionId = (typeof sections)[number]["id"];
type SelectionState = Record<SectionId, number>;

type WorkspaceState = { groupIdx: number; itemIdx: number; detailIdx: number; level: 0 | 1 | 2 };

const initialWorkspaceState: WorkspaceState = { groupIdx: 0, itemIdx: 0, detailIdx: 0, level: 0 };

type Row = {
  key: string;
  glyph?: string;
  glyphColor?: string;
  title: string;
  titleColor?: string;
  badge?: { text: string; color: string };
  selectable?: boolean;
  variant?: "header";
};

export function Dashboard({ initialData, reload, motion = false }: DashboardProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activeSection, setActiveSection] = useState<SectionId>("home");
  const [selectionBySection, setSelectionBySection] = useState<SelectionState>(initialSelection);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>(initialWorkspaceState);
  const [focusRegion, setFocusRegion] = useState<"sidebar" | "content">("sidebar");
  const [refreshing, setRefreshing] = useState(false);
  const [overlay, setOverlay] = useState<"timeline" | null>(null);
  const [timelineScrollIndex, setTimelineScrollIndex] = useState(0);
  const renderer = useRenderer();
  const { height, width } = useTerminalDimensions();

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
      setFocusRegion(sectionHasFocusableContent(numbered, data) ? "content" : "sidebar");
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
        if (sectionHasFocusableContent(activeSection, data)) {
          setFocusRegion("content");
        }
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
      <Header status={data.status} refreshing={refreshing} motion={motion} />
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
              terminalWidth={width}
              workspaceState={workspaceState}
              contentHasFocus={focusRegion === "content"}
            />
          )}
        </box>
      </box>
      <Footer status={data.status} overlayOpen={overlay !== null} motion={motion} />
    </box>
  );
}

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

function Header({ status, refreshing, motion }: { status: ProjectStatus; refreshing: boolean; motion: boolean }) {
  const project = status.project?.name ?? "unregistered";
  const branch = status.git.branch ?? "no-branch";
  const dirty = status.git.dirty ? "●dirty" : "clean";
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (!motion || !refreshing) return;
    const id = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % BRAILLE_FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, [motion, refreshing]);

  const spinnerGlyph = BRAILLE_FRAMES[spinnerFrame % BRAILLE_FRAMES.length]!;

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
        {refreshing ? (
          motion ? (
            <span fg={palette.accent}>{`  ${spinnerGlyph}`}</span>
          ) : (
            <span fg={palette.muted}>{"  ⠿ refreshing…"}</span>
          )
        ) : null}
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
      borderStyle="rounded"
      borderColor={hasFocus ? palette.borderActive : palette.border}
      backgroundColor={hasFocus ? palette.panelAlt : palette.panel}
      style={{ width: sidebarWidth, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {sections.map((section) => {
        const active = section.id === activeSection;
        const badge = sidebarBadge(section.id, data);
        return (
          <text key={section.id}>
            <span fg={active ? (hasFocus ? palette.accent : palette.accentDim) : palette.faint}>{active ? "▸ " : "  "}</span>
            <span fg={active && hasFocus ? palette.accent : palette.text}>{section.label}</span>
            {badge ? <span fg={badge.color}>{` ${badge.text}`}</span> : null}
          </text>
        );
      })}
      <box border={["top"]} borderColor={palette.border} style={{ height: 1 }} />
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

function Footer({ status, overlayOpen, motion }: { status: ProjectStatus; overlayOpen: boolean; motion: boolean }) {
  const [nextGlyphColor, setNextGlyphColor] = useState<string>(palette.accent);
  const timeline = useTimeline({ loop: true, autoplay: false });

  useEffect(() => {
    const target = { progress: 0 };
    if (motion) {
      timeline.add(target, {
        duration: 2000,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        onUpdate: (anim) => {
          setNextGlyphColor(lerpHex(palette.accent, palette.accentAlt, anim.progress));
        },
      });
      timeline.play();
    } else {
      timeline.pause();
      setNextGlyphColor(palette.accent);
    }
    return () => {
      // Timeline (@opentui/core) exposes no per-track removal; resetItems() clears the
      // item state so a re-run (only possible if `motion` toggled) cannot stack live tracks.
      // In practice `motion` is env-derived and constant for the component lifetime.
      timeline.pause();
      timeline.resetItems();
    };
  }, [motion]);

  return (
    <box style={{ flexDirection: "column", height: 2 }}>
      <text>
        <span fg={nextGlyphColor}>▶ NEXT  </span>
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
      borderStyle="rounded"
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
  terminalWidth,
  workspaceState,
  contentHasFocus,
}: {
  data: DashboardData;
  section: SectionId;
  selectedIndex: number;
  bodyHeight: number;
  terminalWidth: number;
  workspaceState: WorkspaceState;
  contentHasFocus: boolean;
}) {
  if (section === "home") return <HomeView data={data} bodyHeight={bodyHeight} />;
  if (section === "brief") return <BriefView data={data} />;
  if (section === "context") return <ContextView data={data} />;
  if (section === "roadmap")
    return (
      <RoadmapWorkspaceView
        workspace={data.workspace}
        state={workspaceState}
        bodyHeight={bodyHeight}
        terminalWidth={terminalWidth}
        hasFocus={contentHasFocus}
      />
    );
  if (section === "spikes")
    return <SpikesView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} contentHasFocus={contentHasFocus} />;
  if (section === "findings")
    return <FindingsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} contentHasFocus={contentHasFocus} />;
  if (section === "sessions")
    return <SessionsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} contentHasFocus={contentHasFocus} />;
  return <DecisionsView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} contentHasFocus={contentHasFocus} />;
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
        <box border borderStyle="rounded" borderColor={palette.border} backgroundColor={palette.panel} style={{ paddingLeft: 1, paddingRight: 1 }}>
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
              <>
                <text fg={palette.accentDim}>⚠  all clear</text>
                <text fg={palette.faint}>zenith finding record ...</text>
              </>
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
              <>
                <text fg={palette.accentDim}>◆  no spikes</text>
                <text fg={palette.faint}>zenith spike create ...</text>
              </>
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
  terminalWidth,
  hasFocus,
}: {
  workspace: RoadmapWorkspace;
  state: WorkspaceState;
  bodyHeight: number;
  terminalWidth: number;
  hasFocus: boolean;
}) {
  const groups = workspace.groups;
  if (groups.length === 0) {
    return (
      <box border borderStyle="rounded" borderColor={palette.border} backgroundColor={palette.panel} style={{ flexGrow: 1, padding: 1, flexDirection: "column", alignItems: "center" }}>
        <text fg={palette.accentDim}>◈  no roadmaps</text>
        <text fg={palette.faint}>zenith roadmap create ...</text>
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
    title: entry.title,
    badge: { text: `${entry.itemProgress.done}/${entry.itemProgress.total}`, color: palette.muted },
  }));

  const itemRows: Row[] = workspaceItemRows(group);

  const visibleRows = Math.max(3, bodyHeight - 2);
  const { roadmapWidth, itemWidth, roadmapTitleMax, itemTitleMax } = roadmapWorkspaceWidths(terminalWidth);

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
      <ListPanel
        title={`Roadmaps (${groups.length})`}
        rows={groupRows}
        selectedIndex={groupIdx}
        visibleRows={visibleRows}
        active={hasFocus && state.level === 0}
        titleMax={roadmapTitleMax}
        width={roadmapWidth}
      />
      <ListPanel
        title={`Items (${itemCount})`}
        rows={itemRows}
        selectedIndex={itemIdx}
        visibleRows={visibleRows}
        active={hasFocus && state.level === 1}
        titleMax={itemTitleMax}
        width={itemWidth}
      />
      <box
        title="Detail"
        border
        borderStyle="rounded"
        borderColor={hasFocus && state.level === 2 ? palette.borderActive : palette.border}
        backgroundColor={hasFocus && state.level === 2 ? palette.panelAlt : palette.panel}
        style={{ flexGrow: 1, flexBasis: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
      >
        <scrollbox focused style={{ flexGrow: 1 }}>
          <WorkspaceDetail group={group} itemIdx={itemIdx} detailIdx={state.detailIdx} detailActive={hasFocus && state.level === 2} />
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

  const entry = orderedWorkspaceItems(group)[itemIdx];
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

function SpikesView({ data, selectedIndex, bodyHeight, contentHasFocus }: SectionViewProps) {
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
      hasFocus={contentHasFocus}
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
        <>
          <text fg={palette.accentDim}>◆  no spikes recorded</text>
          <text fg={palette.faint}>zenith spike create ...</text>
        </>
      )}
    </MasterDetail>
  );
}

function FindingsView({ data, selectedIndex, bodyHeight, contentHasFocus }: SectionViewProps) {
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
      hasFocus={contentHasFocus}
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
        <>
          <text fg={palette.accentDim}>⚠  no findings</text>
          <text fg={palette.faint}>zenith finding record ...</text>
        </>
      )}
    </MasterDetail>
  );
}

function SessionsView({ data, selectedIndex, bodyHeight, contentHasFocus }: SectionViewProps) {
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
      hasFocus={contentHasFocus}
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
        <>
          <text fg={palette.accentDim}>▷  no sessions recorded</text>
          <text fg={palette.faint}>zenith session start</text>
        </>
      )}
    </MasterDetail>
  );
}

function DecisionsView({ data, selectedIndex, bodyHeight, contentHasFocus }: SectionViewProps) {
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
      hasFocus={contentHasFocus}
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
        <>
          <text fg={palette.accentDim}>◇  no decisions recorded</text>
          <text fg={palette.faint}>zenith decision record ...</text>
        </>
      )}
    </MasterDetail>
  );
}

type SectionViewProps = { data: DashboardData; selectedIndex: number; bodyHeight: number; contentHasFocus: boolean };

function MasterDetail({
  listTitle,
  rows,
  selectedIndex,
  bodyHeight,
  detailTitle,
  hasFocus,
  children,
}: {
  listTitle: string;
  rows: Row[];
  selectedIndex: number;
  bodyHeight: number;
  detailTitle: string;
  hasFocus: boolean;
  children: ReactNode;
}) {
  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
      <ListPanel title={listTitle} rows={rows} selectedIndex={selectedIndex} visibleRows={Math.max(3, bodyHeight - 2)} active={hasFocus} />
      <box
        title={detailTitle}
        border
        borderStyle="rounded"
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
  titleMax,
  width = 32,
}: {
  title: string;
  rows: Row[];
  selectedIndex: number;
  visibleRows: number;
  active?: boolean;
  titleMax?: number;
  width?: number;
}) {
  const selectableIndexes = selectableRowIndexes(rows);
  const selectedRowIndex = selectableIndexes[clamp(selectedIndex, selectableIndexes.length)] ?? -1;
  const maxStart = Math.max(0, rows.length - visibleRows);
  const desired = Math.max(0, selectedRowIndex) - Math.floor(visibleRows / 2);
  const windowStart = Math.max(0, Math.min(desired, maxStart));
  const slice = rows.slice(windowStart, windowStart + visibleRows);
  const hiddenBefore = windowStart;
  const hiddenAfter = Math.max(0, rows.length - (windowStart + visibleRows));

  return (
    <box
      title={title}
      border
      borderStyle="rounded"
      borderColor={active ? palette.borderActive : palette.border}
      backgroundColor={active ? palette.panelAlt : palette.panel}
      style={{ width, flexShrink: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {rows.length === 0 ? <text fg={palette.muted}>Nothing here.</text> : null}
      {hiddenBefore > 0 ? <text fg={palette.faint}>{`↑ ${hiddenBefore} more`}</text> : null}
      {slice.map((row, index) => {
        const idx = windowStart + index;
        if (row.variant === "header") {
          return (
            <text key={row.key}>
              <span fg={row.titleColor ?? palette.faint}>{row.title}</span>
            </text>
          );
        }
        const selected = active && idx === selectedRowIndex && row.selectable !== false;
        return (
          <text key={row.key} {...(selected ? { bg: palette.highlight } : {})}>
            <span fg={selected ? palette.accent : (row.glyphColor ?? palette.faint)}>{`${selected ? "▸" : " "}${row.glyph ?? " "} `}</span>
            <span fg={selected ? palette.accent : (row.titleColor ?? palette.text)}>{truncate(row.title, titleMax ?? row.title.length)}</span>
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
      borderStyle="rounded"
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

function sectionHasFocusableContent(section: SectionId, data: DashboardData): boolean {
  if (section === "roadmap") return data.workspace.groups.length > 0;
  return selectionCount(section, data) > 0;
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
  const orderedItems = orderedWorkspaceItems(group);
  if (itemIdx < orderedItems.length) {
    return orderedItems[itemIdx]?.linkedPlans ?? [];
  }
  const standalone = group.standalonePlans[itemIdx - orderedItems.length];
  return standalone ? [standalone] : [];
}

function detailPhaseCount(group: WorkspaceGroup | undefined, itemIdx: number): number {
  return selectedItemPlans(group, itemIdx).reduce((total, plan) => total + plan.phases.length, 0);
}

function roadmapWorkspaceWidths(terminalWidth: number): {
  roadmapWidth: number;
  itemWidth: number;
  roadmapTitleMax: number;
  itemTitleMax: number;
} {
  const innerTerminalWidth = Math.max(0, terminalWidth - 2);
  const targetLeftWidth = Math.floor(innerTerminalWidth * 0.5);
  const fixedLeftWidth = sidebarWidth + outerGapWidth + workspaceGapWidth;
  const listWidthTotal = Math.max(roadmapListMinWidth + itemListMinWidth, targetLeftWidth - fixedLeftWidth);
  const roadmapWidth = Math.max(roadmapListMinWidth, Math.floor(listWidthTotal * 0.44));
  const itemWidth = Math.max(itemListMinWidth, listWidthTotal - roadmapWidth);

  return {
    roadmapWidth,
    itemWidth,
    roadmapTitleMax: Math.max(8, roadmapWidth - 6),
    itemTitleMax: Math.max(10, itemWidth - 6),
  };
}

function workspaceItemRows(group: WorkspaceGroup): Row[] {
  if (group.roadmapId === null) {
    return group.standalonePlans.map((plan) => ({
      key: plan.id,
      glyph: statusGlyph(plan.status),
      glyphColor: statusColor(plan.status),
      title: plan.title,
      badge: {
        text: `${plan.phases.filter((phase) => phase.status === "done").length}/${plan.phases.length}`,
        color: palette.muted,
      },
    }));
  }

  const buckets = roadmapItemBuckets(group.items);
  return [
    ...roadmapItemBucketRows("NEXT", buckets.next),
    ...roadmapItemBucketRows("LATER", buckets.later),
    ...roadmapItemBucketRows("DONE", buckets.done),
  ];
}

function selectableRowIndexes(rows: Row[]): number[] {
  return rows.flatMap((row, index) => (row.selectable === false ? [] : [index]));
}

function orderedWorkspaceItems(group: WorkspaceGroup | undefined): WorkspaceItem[] {
  if (!group || group.roadmapId === null) return [];
  const buckets = roadmapItemBuckets(group.items);
  return [...buckets.next, ...buckets.later, ...buckets.done];
}

function roadmapItemBuckets(items: WorkspaceItem[]): {
  next: WorkspaceItem[];
  later: WorkspaceItem[];
  done: WorkspaceItem[];
} {
  return {
    next: items.filter((entry) => entry.item.status === "in_progress" || entry.item.status === "todo"),
    later: items.filter((entry) => entry.item.status === "deferred"),
    done: items.filter((entry) => entry.item.status === "done"),
  };
}

function roadmapItemBucketRows(label: "NEXT" | "LATER" | "DONE", entries: WorkspaceItem[]): Row[] {
  if (entries.length === 0) return [];
  return [
    { key: `section-${label}`, title: label, titleColor: palette.faint, selectable: false, variant: "header" },
    ...entries.map((entry) => roadmapItemRow(entry)),
  ];
}

function roadmapItemRow(entry: WorkspaceItem): Row {
  const done = entry.item.status === "done";
  return {
    key: entry.item.id,
    glyph: statusGlyph(entry.item.status),
    glyphColor: done ? palette.faint : statusColor(entry.item.status),
    title: entry.item.title,
    ...(done ? { titleColor: palette.muted } : {}),
    ...(entry.phaseProgress.total > 0
      ? { badge: { text: `${entry.phaseProgress.done}/${entry.phaseProgress.total}`, color: done ? palette.faint : palette.muted } }
      : {}),
  };
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
