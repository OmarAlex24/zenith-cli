/** @jsxImportSource @opentui/react */

import { useState } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import type { ProjectStatus } from "../app/decode-app";
import type { CompactContext, Finding, Plan, Roadmap } from "../domain/schemas";

export type DashboardData = {
  status: ProjectStatus;
  plans: Plan[];
  roadmaps: Roadmap[];
  findings: Finding[];
  context: CompactContext;
};

export type DashboardProps = {
  initialData: DashboardData;
  reload?: () => Promise<DashboardData>;
};

const palette = {
  bg: "#111318",
  panel: "#191d24",
  border: "#3a4150",
  text: "#d7dce5",
  muted: "#8d96a8",
  accent: "#8bd5ca",
  warning: "#f5a97f",
  danger: "#ed8796",
  success: "#a6da95",
};

const tabs = [
  { id: "overview", label: "1 Overview" },
  { id: "roadmaps", label: "2 Roadmaps" },
  { id: "plan", label: "3 Plan" },
  { id: "spikes", label: "4 Spikes" },
  { id: "decisions", label: "5 Decisions" },
  { id: "findings", label: "6 Findings" },
  { id: "sessions", label: "7 Sessions" },
  { id: "context", label: "8 Context" },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function Dashboard({ initialData, reload }: DashboardProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [refreshing, setRefreshing] = useState(false);
  const renderer = useRenderer();

  useKeyboard((key) => {
    const keyToken = key.name || key.raw || key.sequence;

    if (key.name === "escape" || key.name === "q") {
      renderer.destroy();
    }

    if (key.name === "right" || key.name === "tab") {
      setActiveTab(nextTab(activeTab));
    }

    if (key.name === "left") {
      setActiveTab(previousTab(activeTab));
    }

    const selectedByNumber = tabByNumber(keyToken);
    if (selectedByNumber) {
      setActiveTab(selectedByNumber);
    }

    if (key.name === "r" && reload && !refreshing) {
      setRefreshing(true);
      void reload()
        .then(setData)
        .finally(() => setRefreshing(false));
    }
  });

  return (
    <box
      style={{
        width: "100%",
        height: "100%",
        flexDirection: "column",
        backgroundColor: palette.bg,
        padding: 1,
        gap: 1,
      }}
    >
      <Header refreshing={refreshing} />
      <TabBar activeTab={activeTab} />
      {renderTab(activeTab, data)}
    </box>
  );
}

function Header({ refreshing }: { refreshing: boolean }) {
  return (
    <box style={{ flexDirection: "row", justifyContent: "space-between", height: 2 }}>
      <text fg={palette.accent}>Zenith CLI</text>
      <text fg={palette.muted}>{refreshing ? "refreshing..." : "1-8 tabs  arrows/tab switch  r refresh  q/esc quit"}</text>
    </box>
  );
}

function TabBar({ activeTab }: { activeTab: TabId }) {
  return (
    <box style={{ flexDirection: "row", gap: 1, height: 2 }}>
      {tabs.map((tab) => (
        <text key={tab.id} fg={tab.id === activeTab ? palette.accent : palette.muted}>
          {tab.id === activeTab ? `[${tab.label}]` : ` ${tab.label} `}
        </text>
      ))}
    </box>
  );
}

function renderTab(activeTab: TabId, data: DashboardData) {
  if (activeTab === "roadmaps") {
    return <RoadmapsView data={data} />;
  }

  if (activeTab === "plan") {
    return <PlanView data={data} />;
  }

  if (activeTab === "spikes") {
    return <SpikesView data={data} />;
  }

  if (activeTab === "decisions") {
    return <DecisionsView data={data} />;
  }

  if (activeTab === "findings") {
    return <FindingsView data={data} />;
  }

  if (activeTab === "sessions") {
    return <SessionsView data={data} />;
  }

  if (activeTab === "context") {
    return <ContextView data={data} />;
  }

  return <OverviewView data={data} />;
}

function OverviewView({ data }: { data: DashboardData }) {
  const { status } = data;
  const phaseRows = status.activePlan?.phases.slice(0, 8) ?? [];
  const decisions = status.recentDecisions.slice(0, 4);
  const openSpikes = status.openSpikes.slice(0, 4);
  const openFindings = status.openFindings.slice(0, 4);

  return (
    <box style={{ flexDirection: "column", gap: 1, flexGrow: 1 }}>
      <box style={{ flexDirection: "row", gap: 1, flexGrow: 1 }}>
        <box
          title="Project"
          border
          borderColor={palette.border}
          backgroundColor={palette.panel}
          style={{ width: 34, flexDirection: "column", padding: 1, gap: 1 }}
        >
          <Labeled label="Name" value={status.project?.name ?? "unregistered"} />
          <Labeled label="Branch" value={status.git.branch ?? "none"} />
          <Labeled label="Git" value={status.git.isGitRepo ? "yes" : "no"} />
          <Labeled label="Dirty" value={status.git.dirty ? "yes" : "no"} />
          <Labeled label="Brief" value={status.currentBrief?.summary ?? "none"} />
          <text fg={palette.muted}>{truncateMiddle(status.git.rootPath, 30)}</text>
        </box>

        <box
          title="Active Plan"
          border
          borderColor={palette.border}
          backgroundColor={palette.panel}
          style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
        >
          <text fg={palette.text}>{status.activePlan?.title ?? "No active plan"}</text>
          <text fg={palette.muted}>{truncate(status.next.reason, 92)}</text>
          <text fg={palette.accent}>Next: {status.next.recommendation ?? "none"}</text>

          <box style={{ flexDirection: "column", gap: 0, flexGrow: 1 }}>
            {phaseRows.length === 0 ? (
              <text fg={palette.muted}>No phases to show.</text>
            ) : (
              phaseRows.map((phase) => (
                <text key={phase.id} fg={phaseColor(phase.status)}>
                  {statusGlyph(phase.status)} {truncate(phase.title, 72)}
                </text>
              ))
            )}
          </box>
        </box>
      </box>

      <box style={{ flexDirection: "row", gap: 1, height: 10 }}>
        <box
          title="Open Spikes"
          border
          borderColor={palette.border}
          backgroundColor={palette.panel}
          style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}
        >
          {openSpikes.length === 0 ? (
            <text fg={palette.muted}>No open spikes.</text>
          ) : (
            openSpikes.map((spike) => (
              <text key={spike.id} fg={palette.text}>
                {truncate(spike.title, 56)}
              </text>
            ))
          )}
        </box>

        <box
          title="Findings"
          border
          borderColor={palette.border}
          backgroundColor={palette.panel}
          style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}
        >
          {openFindings.length === 0 ? (
            <text fg={palette.muted}>No open findings.</text>
          ) : (
            openFindings.map((finding) => (
              <text key={finding.id} fg={severityColor(finding.severity)}>
                {finding.severity} {truncate(finding.title, 48)}
              </text>
            ))
          )}
        </box>

        <box
          title="Decisions"
          border
          borderColor={palette.border}
          backgroundColor={palette.panel}
          style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}
        >
          {decisions.length === 0 ? (
            <text fg={palette.muted}>No decisions recorded.</text>
          ) : (
            decisions.map((decision) => (
              <text key={decision.id} fg={palette.text}>
                {truncate(decision.title, 42)}
              </text>
            ))
          )}
        </box>
      </box>
    </box>
  );
}

function RoadmapsView({ data }: { data: DashboardData }) {
  const activeRoadmap = data.roadmaps.find((roadmap) => roadmap.status === "active");
  const nextRoadmapItem = activeRoadmap?.items.find((item) => item.status === "in_progress") ??
    activeRoadmap?.items.find((item) => item.status === "planned") ??
    activeRoadmap?.items.find((item) => item.status === "deferred");

  return (
    <box
      title="Roadmaps"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      <text fg={palette.accent}>Next roadmap target: {nextRoadmapItem ? truncate(nextRoadmapItem.title, 92) : "none"}</text>
      {data.roadmaps.length === 0 ? (
        <text fg={palette.muted}>No roadmaps recorded.</text>
      ) : (
        data.roadmaps.slice(0, 5).flatMap((roadmap) => [
          <text key={`${roadmap.id}-title`} fg={roadmap.status === "active" ? palette.accent : palette.text}>
            {statusGlyph(roadmap.status)} {truncate(roadmap.title, 96)}
          </text>,
          <text key={`${roadmap.id}-items`} fg={palette.muted}>
            {roadmap.status} / items {roadmap.items.length} / source {roadmap.sourcePlanId ?? "none"}
          </text>,
          ...roadmap.items.slice(0, 4).map((item) => (
            <text key={`${roadmap.id}-${item.id}`} fg={item.status === "in_progress" ? palette.accent : palette.text}>
              {"  "}
              {statusGlyph(item.status)} {truncate(item.title, 94)}
            </text>
          )),
        ])
      )}
    </box>
  );
}

function PlanView({ data }: { data: DashboardData }) {
  const phase = data.context.selectedPhase?.phase ?? data.status.currentPhase;
  const planTitle = data.context.selectedPhase?.planTitle ?? data.status.activePlan?.title ?? "none";

  return (
    <box
      title="Executable Plans"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      {phase ? (
        <>
          <text fg={palette.accent}>Current: {phase.title}</text>
          <text fg={palette.muted}>Plan: {truncate(planTitle, 96)}</text>
          <text fg={phaseColor(phase.status)}>Status: {phase.status}</text>
          <text fg={palette.text}>Description: {truncate(phase.description ?? "No description.", 140)}</text>
          <text fg={palette.muted}>
            Acceptance: {phase.acceptanceCriteria.length > 0 ? truncate(phase.acceptanceCriteria.join(" / "), 128) : "none"}
          </text>
          <text fg={palette.muted}>
            Evidence: {phase.evidence.length > 0 ? truncate(phase.evidence.map((item) => item.value).join(" / "), 128) : "none"}
          </text>
        </>
      ) : (
        <text fg={palette.muted}>No current phase.</text>
      )}
      {data.plans.length === 0 ? (
        <text fg={palette.muted}>No plans recorded.</text>
      ) : (
        data.plans.slice(0, 10).map((plan) => {
          const counts = phaseCounts(plan);
          return (
            <box key={plan.id} style={{ flexDirection: "column", height: 4 }}>
              <text fg={plan.status === "active" ? palette.accent : palette.text}>
                {statusGlyph(plan.status)} {truncate(plan.title, 86)}
              </text>
              <text fg={palette.muted}>
                {plan.status} / {plan.priority ?? "no priority"} / phases {counts.completed} done, {counts.inProgress} work,{" "}
                {counts.pending} todo
              </text>
              <text fg={palette.muted}>
                source {plan.sourceRoadmapId ?? "none"} / item {plan.sourceRoadmapItemId ?? "none"}
              </text>
            </box>
          );
        })
      )}
    </box>
  );
}

function SpikesView({ data }: { data: DashboardData }) {
  const spikes = data.status.openSpikes;
  return (
    <box
      title="Open Spikes"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      {spikes.length === 0 ? (
        <text fg={palette.muted}>No open spikes.</text>
      ) : (
        spikes.slice(0, 10).flatMap((spike) => [
          <text key={`${spike.id}-title`} fg={palette.accent}>
            {truncate(spike.title, 100)}
          </text>,
          <text key={`${spike.id}-question`} fg={palette.text}>
            question - {truncate(spike.question, 116)}
          </text>,
          <text key={`${spike.id}-hypothesis`} fg={palette.muted}>
            hypothesis - {truncate(spike.hypothesis ?? "none", 116)}
          </text>,
        ])
      )}
    </box>
  );
}

function DecisionsView({ data }: { data: DashboardData }) {
  const decisions = data.status.recentDecisions;
  const lines = decisions.slice(0, 5).flatMap((decision) => [
    { key: `${decision.id}-title`, color: palette.accent, text: truncate(decision.title, 110) },
    { key: `${decision.id}-decision`, color: palette.text, text: `decision - ${truncate(decision.decision, 120)}` },
    { key: `${decision.id}-context`, color: palette.muted, text: `context - ${truncate(decision.context, 120)}` },
    { key: `${decision.id}-consequences`, color: palette.muted, text: `consequences - ${truncate(decision.consequences ?? "none", 120)}` },
    { key: `${decision.id}-space`, color: palette.muted, text: "" },
  ]);

  return (
    <box
      title="Recent Decisions"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      {decisions.length === 0 ? (
        <text fg={palette.muted}>No decisions recorded.</text>
      ) : (
        lines.map((line) => (
          <text key={line.key} fg={line.color}>
            {line.text}
          </text>
        ))
      )}
    </box>
  );
}

function FindingsView({ data }: { data: DashboardData }) {
  const findings = data.findings;

  return (
    <box
      title="Open Findings"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      {findings.length === 0 ? (
        <text fg={palette.muted}>No open findings.</text>
      ) : (
        findings.slice(0, 5).flatMap((finding) => [
          <text key={`${finding.id}-title`} fg={severityColor(finding.severity)}>
            {finding.severity} {finding.type} - {truncate(finding.title, 92)}
          </text>,
          <text key={`${finding.id}-description`} fg={palette.text}>
            description - {truncate(finding.description, 116)}
          </text>,
          <text key={`${finding.id}-files`} fg={palette.muted}>
            files - {finding.relatedFiles.length > 0 ? truncate(finding.relatedFiles.join(", "), 116) : "none"}
          </text>,
          <text key={`${finding.id}-meta`} fg={palette.muted}>
            {finding.status} / {finding.id}
          </text>,
        ])
      )}
    </box>
  );
}

function SessionsView({ data }: { data: DashboardData }) {
  const sessions = data.status.recentSessions;

  return (
    <box
      title="Recent Sessions"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}
    >
      {sessions.length === 0 ? (
        <text fg={palette.muted}>No sessions recorded.</text>
      ) : (
        sessions.slice(0, 8).flatMap((session) => [
          <text key={`${session.id}-summary`} fg={session.endedAt ? palette.text : palette.accent}>
            {session.endedAt ? "closed" : "open"} {truncate(session.summary ?? session.id, 108)}
          </text>,
          <text key={`${session.id}-meta`} fg={palette.muted}>
            {session.branch ?? "no branch"} / files {session.changedFiles.length} / plan {session.relatedPlanId ?? "none"}
          </text>,
          <text key={`${session.id}-next`} fg={palette.muted}>
            next - {truncate(session.nextSteps[0] ?? "none", 116)}
          </text>,
        ])
      )}
    </box>
  );
}

function ContextView({ data }: { data: DashboardData }) {
  const lines = data.context.markdown.split("\n").filter((line) => line.trim().length > 0);

  return (
    <box
      title="Compact Context"
      border
      borderColor={palette.border}
      backgroundColor={palette.panel}
      style={{ flexGrow: 1, flexDirection: "column", padding: 1 }}
    >
      {lines.slice(0, 18).map((line, index) => (
        <text key={`${index}-${line}`} fg={line.startsWith("#") ? palette.accent : palette.text}>
          {truncate(line, 128)}
        </text>
      ))}
    </box>
  );
}

function Labeled({ label, value }: { label: string; value: string }) {
  return (
    <box style={{ flexDirection: "column", height: 2 }}>
      <text fg={palette.muted}>{label}</text>
      <text fg={palette.text}>{truncate(value, 30)}</text>
    </box>
  );
}

function statusGlyph(status: string): string {
  if (status === "completed") return "done";
  if (status === "in_progress") return "work";
  if (status === "blocked") return "block";
  if (status === "active") return "live";
  if (status === "paused") return "hold";
  if (status === "archived") return "arch";
  return "todo";
}

function phaseColor(status: string): string {
  if (status === "completed") return palette.success;
  if (status === "in_progress") return palette.accent;
  if (status === "blocked") return palette.danger;
  return palette.warning;
}

function severityColor(severity: string): string {
  if (severity === "critical" || severity === "high") return palette.danger;
  if (severity === "medium") return palette.warning;
  return palette.success;
}

function tabByNumber(keyName: string): TabId | null {
  const index = Number(keyName) - 1;
  return tabs[index]?.id ?? null;
}

function nextTab(activeTab: TabId): TabId {
  const index = tabs.findIndex((tab) => tab.id === activeTab);
  return tabs[(index + 1) % tabs.length]!.id;
}

function previousTab(activeTab: TabId): TabId {
  const index = tabs.findIndex((tab) => tab.id === activeTab);
  return tabs[(index - 1 + tabs.length) % tabs.length]!.id;
}

function phaseCounts(plan: Plan): { completed: number; inProgress: number; pending: number } {
  return plan.phases.reduce(
    (counts, phase) => ({
      completed: counts.completed + (phase.status === "completed" ? 1 : 0),
      inProgress: counts.inProgress + (phase.status === "in_progress" ? 1 : 0),
      pending: counts.pending + (phase.status === "pending" ? 1 : 0),
    }),
    { completed: 0, inProgress: 0, pending: 0 },
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 3))}...` : value;
}

function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}
