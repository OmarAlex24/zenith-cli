export const palette = {
  bg: "#0f1115",
  panel: "#171b22",
  panelAlt: "#1e232c",
  border: "#2c333f",
  borderActive: "#8bd5ca",
  text: "#d7dce5",
  muted: "#7d889c",
  faint: "#566072",
  accent: "#8bd5ca",
  accentAlt: "#7dc4e4",
  accentDim: "#5e8a83",
  warning: "#f5a97f",
  danger: "#ed8796",
  success: "#a6da95",
  highlight: "#2a3a44",
} as const;

export type StatusGlyph = { glyph: string; color: string; label: string };

const statusMap: Record<string, StatusGlyph> = {
  // work-item lifecycle (phases + roadmap items)
  todo: { glyph: "○", color: palette.muted, label: "todo" },
  in_progress: { glyph: "◐", color: palette.accent, label: "in progress" },
  needs_review: { glyph: "◇", color: palette.warning, label: "needs review" },
  done: { glyph: "✓", color: palette.success, label: "done" },
  blocked: { glyph: "✕", color: palette.danger, label: "blocked" },
  deferred: { glyph: "⊘", color: palette.faint, label: "deferred" },
  discarded: { glyph: "×", color: palette.faint, label: "discarded" },
  // container statuses
  active: { glyph: "●", color: palette.success, label: "active" },
  completed: { glyph: "✓", color: palette.success, label: "completed" },
  paused: { glyph: "❚❚", color: palette.warning, label: "paused" },
  archived: { glyph: "▣", color: palette.faint, label: "archived" },
  // spikes
  open: { glyph: "◆", color: palette.warning, label: "open" },
  concluded: { glyph: "✓", color: palette.success, label: "concluded" },
  abandoned: { glyph: "✕", color: palette.faint, label: "abandoned" },
  // findings / brief
  closed: { glyph: "✓", color: palette.success, label: "closed" },
  current: { glyph: "●", color: palette.accent, label: "current" },
};

const fallbackStatus: StatusGlyph = { glyph: "·", color: palette.muted, label: "unknown" };

export function statusInfo(status: string): StatusGlyph {
  return statusMap[status] ?? { ...fallbackStatus, label: status };
}

export function statusGlyph(status: string): string {
  return statusInfo(status).glyph;
}

export function statusColor(status: string): string {
  return statusInfo(status).color;
}

export function statusLabel(status: string): string {
  return statusInfo(status).label;
}

export type SeverityBadge = { label: string; color: string };

export function severityBadge(severity: string): SeverityBadge {
  if (severity === "critical") return { label: "CRIT", color: palette.danger };
  if (severity === "high") return { label: "HIGH", color: palette.danger };
  if (severity === "medium") return { label: "MED", color: palette.warning };
  return { label: "LOW", color: palette.success };
}

const findingTypeLabels: Record<string, string> = {
  bug: "bug",
  risk: "risk",
  tech_debt: "debt",
  architecture: "arch",
  docs_gap: "docs",
  test_gap: "test",
  simplification: "simplify",
};

export function findingTypeLabel(type: string): string {
  return findingTypeLabels[type] ?? type;
}

export function progressBar(done: number, total: number, width = 10): string {
  if (total <= 0) return `${"▱".repeat(width)} 0%`;
  const ratio = Math.max(0, Math.min(1, done / total));
  const filled = Math.round(ratio * width);
  const pct = Math.round(ratio * 100);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)} ${pct}%`;
}

export function truncate(value: string, max: number): string {
  if (max <= 0) return "";
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}…` : value;
}

export function truncateMiddle(value: string, max: number): string {
  if (value.length <= max) return value;
  const half = Math.floor((max - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(value.length - half)}`;
}

const eventGlyphMap: Record<string, string> = {
  "project.registered": "◆",
  "plan.created": "●",
  "plan.updated": "◐",
  "phase.updated": "◐",
  "decision.recorded": "📌",
  "finding.recorded": "⚠",
  "finding.closed": "✓",
  "session.started": "▷",
  "session.ended": "■",
  "roadmap.created": "◈",
  "spike.created": "◆",
  "spike.concluded": "✓",
  "brief.set": "📄",
};

export function eventGlyph(type: string): string {
  return eventGlyphMap[type] ?? "·";
}

// ---------------------------------------------------------------------------
// Color lerp utility (used for the ▶ NEXT pulse animation)
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return [r, g, b];
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

/**
 * Linearly interpolate between two hex colors.
 * @param from - start color (e.g. "#8bd5ca")
 * @param to   - end color   (e.g. "#7dc4e4")
 * @param t    - progress in [0, 1]
 */
export function lerpHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = r1 + (r2 - r1) * t;
  const g = g1 + (g2 - g1) * t;
  const b = b1 + (b2 - b1) * t;
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}
