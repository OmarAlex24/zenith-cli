/** @jsxImportSource @opentui/react */

import { useState, type ReactNode } from "react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import type { ProjectStatus } from "../app/decode-app";
import type {
  CompactContext,
  Decision,
  Finding,
  Plan,
  ProjectBrief,
  Roadmap,
  Session,
  Spike,
} from "../domain/schemas";
import {
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
  spikes: Spike[];
  findings: Finding[];
  sessions: Session[];
  decisions: Decision[];
  context: CompactContext;
};

export type DashboardProps = {
  initialData: DashboardData;
  reload?: () => Promise<DashboardData>;
};

const sections = [
  { id: "home", label: "Home" },
  { id: "brief", label: "Brief" },
  { id: "roadmap", label: "Roadmap" },
  { id: "plan", label: "Plan" },
  { id: "spikes", label: "Spikes" },
  { id: "findings", label: "Findings" },
  { id: "sessions", label: "Sessions" },
  { id: "decisions", label: "Decisions" },
  { id: "context", label: "Context" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type SelectionState = Record<SectionId, number>;

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
  const [refreshing, setRefreshing] = useState(false);
  const renderer = useRenderer();
  const { height } = useTerminalDimensions();

  const count = selectionCount(activeSection, data);
  const selectedIndex = clamp(selectionBySection[activeSection] ?? 0, count);

  const goToSection = (section: SectionId) => setActiveSection(section);

  useKeyboard((key) => {
    const token = key.name || key.raw || key.sequence;

    if (key.name === "q" || key.name === "escape") {
      renderer.destroy();
      return;
    }

    if (key.name === "right" || key.name === "tab") {
      goToSection(stepSection(activeSection, 1));
      return;
    }
    if (key.name === "left") {
      goToSection(stepSection(activeSection, -1));
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectionBySection((prev) => ({ ...prev, [activeSection]: clamp(selectedIndex - 1, count) }));
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setSelectionBySection((prev) => ({ ...prev, [activeSection]: clamp(selectedIndex + 1, count) }));
      return;
    }

    const numbered = sectionByNumber(token);
    if (numbered) {
      goToSection(numbered);
      return;
    }

    if (key.name === "r" && reload && !refreshing) {
      setRefreshing(true);
      void reload()
        .then((next) => {
          setData(next);
          setSelectionBySection((prev) => clampAll(prev, next));
        })
        .finally(() => setRefreshing(false));
    }
  });

  const bodyHeight = Math.max(6, height - 6);

  return (
    <box style={{ width: "100%", height: "100%", flexDirection: "column", backgroundColor: palette.bg, padding: 1 }}>
      <Header status={data.status} refreshing={refreshing} />
      <box style={{ flexDirection: "row", flexGrow: 1, gap: 1 }}>
        <Sidebar data={data} activeSection={activeSection} />
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          <Main data={data} section={activeSection} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />
        </box>
      </box>
      <Footer status={data.status} />
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

function Sidebar({ data, activeSection }: { data: DashboardData; activeSection: SectionId }) {
  const plan = data.status.activePlan;
  const phaseTotal = plan?.phases.length ?? 0;
  const phaseDone = plan?.phases.filter((phase) => phase.status === "done").length ?? 0;

  return (
    <box
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ width: 18, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
    >
      {sections.map((section) => {
        const active = section.id === activeSection;
        const badge = sidebarBadge(section.id, data);
        return (
          <text key={section.id}>
            <span fg={active ? palette.accent : palette.faint}>{active ? "▸ " : "  "}</span>
            <span fg={active ? palette.accent : palette.text}>{section.label}</span>
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

function Footer({ status }: { status: ProjectStatus }) {
  return (
    <box style={{ flexDirection: "column", height: 2 }}>
      <text>
        <span fg={palette.accent}>▶ NEXT  </span>
        <span fg={palette.text}>{truncate(status.next.recommendation ?? "nothing pending", 60)}</span>
        <span fg={palette.faint}>{`  — ${truncate(status.next.reason, 50)}`}</span>
      </text>
      <text fg={palette.faint}>1-9 section · ←→ switch · ↑↓ select · r refresh · q quit</text>
    </box>
  );
}

function Main({
  data,
  section,
  selectedIndex,
  bodyHeight,
}: {
  data: DashboardData;
  section: SectionId;
  selectedIndex: number;
  bodyHeight: number;
}) {
  if (section === "home") return <HomeView data={data} bodyHeight={bodyHeight} />;
  if (section === "brief") return <BriefView data={data} />;
  if (section === "context") return <ContextView data={data} />;
  if (section === "roadmap") return <RoadmapView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
  if (section === "plan") return <PlanView data={data} selectedIndex={selectedIndex} bodyHeight={bodyHeight} />;
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

function RoadmapView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const entries = roadmapEntries(data);
  const selected = entries[selectedIndex];
  const rows: Row[] = entries.map((entry) => ({
    key: entry.item.id,
    glyph: statusGlyph(entry.item.status),
    glyphColor: statusColor(entry.item.status),
    title: truncate(entry.item.title, 24),
  }));

  return (
    <MasterDetail
      listTitle={`Roadmap items (${entries.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Item detail"
    >
      {selected ? (
        <>
          <text fg={palette.accent}>{selected.item.title}</text>
          <DetailRow label="Status" value={statusLabel(selected.item.status)} color={statusColor(selected.item.status)} />
          <DetailRow label="Roadmap" value={selected.roadmap.title} />
          <DetailText label="Description" value={selected.item.description ?? "none"} />
          <DetailText label="Why" value={selected.item.justification ?? "none"} />
          <DetailRow label="Source phase" value={selected.item.sourcePhaseId ?? "none"} />
          <DetailText
            label="Evidence"
            value={selected.item.evidence.map((evidence) => `${evidence.kind}: ${evidence.value}`).join("\n") || "none"}
          />
        </>
      ) : (
        <text fg={palette.muted}>No roadmap items.</text>
      )}
    </MasterDetail>
  );
}

function PlanView({ data, selectedIndex, bodyHeight }: SectionViewProps) {
  const plan = data.plans[selectedIndex];
  const rows: Row[] = data.plans.map((item) => {
    const counts = phaseCounts(item);
    return {
      key: item.id,
      glyph: statusGlyph(item.status),
      glyphColor: statusColor(item.status),
      title: truncate(item.title, 18),
      badge: { text: `${counts.done}/${item.phases.length}`, color: palette.muted },
    };
  });

  return (
    <MasterDetail
      listTitle={`Plans (${data.plans.length})`}
      rows={rows}
      selectedIndex={selectedIndex}
      bodyHeight={bodyHeight}
      detailTitle="Plan detail"
    >
      {plan ? (
        <>
          <text fg={palette.accent}>{plan.title}</text>
          <DetailRow label="Status" value={statusLabel(plan.status)} color={statusColor(plan.status)} />
          <DetailRow label="Priority" value={plan.priority ?? "none"} />
          <text fg={palette.accent}>{progressBar(phaseCounts(plan).done, plan.phases.length, 12)}</text>
          <DetailRow label="Source" value={plan.sourceRoadmapId ?? "standalone"} />
          <text fg={palette.muted}>{"Phases"}</text>
          {plan.phases.map((phase) => (
            <text key={phase.id}>
              <span fg={statusColor(phase.status)}>{`  ${statusGlyph(phase.status)} `}</span>
              <span fg={palette.text}>{phase.title}</span>
              <span fg={palette.faint}>{`  ${statusLabel(phase.status)}`}</span>
            </text>
          ))}
        </>
      ) : (
        <text fg={palette.muted}>No plans recorded.</text>
      )}
    </MasterDetail>
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
}: {
  title: string;
  rows: Row[];
  selectedIndex: number;
  visibleRows: number;
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
      borderColor={palette.borderActive}
      backgroundColor={palette.panel}
      style={{ width: 32, flexShrink: 0, flexDirection: "column", paddingLeft: 1, paddingRight: 1 }}
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
  if (section === "roadmap") return roadmapEntries(data).length;
  if (section === "plan") return data.plans.length;
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

type RoadmapEntry = { roadmap: Roadmap; item: Roadmap["items"][number] };

function roadmapEntries(data: DashboardData): RoadmapEntry[] {
  return data.roadmaps.flatMap((roadmap) => roadmap.items.map((item) => ({ roadmap, item })));
}

function phaseCounts(plan: Plan): { done: number; inProgress: number; todo: number } {
  return plan.phases.reduce(
    (counts, phase) => ({
      done: counts.done + (phase.status === "done" ? 1 : 0),
      inProgress: counts.inProgress + (phase.status === "in_progress" ? 1 : 0),
      todo: counts.todo + (phase.status === "todo" ? 1 : 0),
    }),
    { done: 0, inProgress: 0, todo: 0 },
  );
}
