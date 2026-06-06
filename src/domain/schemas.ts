import { z } from "zod";

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  repositoryUrl: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const PlanStatusSchema = z.enum(["active", "completed", "paused", "archived"]);
export const BriefStatusSchema = z.enum(["current", "archived"]);
export const RoadmapStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export const SpikeStatusSchema = z.enum(["open", "concluded", "abandoned"]);
export const AgentStageSchema = z.enum(["plan", "implement", "review", "done"]);
export const MEMORY_ENTITY_TYPES = [
  "brief",
  "roadmap",
  "roadmap_item",
  "plan",
  "phase",
  "spike",
  "decision",
  "finding",
  "session",
  "context_doc",
] as const;
export const MemoryEntityTypeSchema = z.enum(MEMORY_ENTITY_TYPES);

const PHASE_STATUS_ALIASES: Record<string, string> = { pending: "todo", completed: "done" };
const ROADMAP_ITEM_STATUS_ALIASES: Record<string, string> = {
  planned: "todo",
  completed: "done",
  canceled: "discarded",
  cancelled: "discarded",
};

const aliasPreprocessor = (aliases: Record<string, string>) => (value: unknown) =>
  typeof value === "string" && value in aliases ? aliases[value] : value;

export const PhaseStatusSchema = z.preprocess(
  aliasPreprocessor(PHASE_STATUS_ALIASES),
  z.enum(["todo", "in_progress", "needs_review", "done", "blocked"]),
);
export const RoadmapItemStatusSchema = z.preprocess(
  aliasPreprocessor(ROADMAP_ITEM_STATUS_ALIASES),
  z.enum(["todo", "in_progress", "done", "deferred", "discarded"]),
);

export const MemoryLifecycleSchema = z.enum(["active", "done", "blocked", "stale", "superseded", "archived"]);

export const EvidenceSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(["note", "commit", "file", "pr", "issue", "command", "test", "link", "adr", "branch"]).default("note"),
  value: z.string().min(1),
  path: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  endLine: z.number().int().positive().optional(),
  label: z.string().min(1).optional(),
  checkedAt: z.string().min(1).optional(),
  stale: z.boolean().optional(),
  supersededBy: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional(),
});

export const StoredEvidenceSchema = EvidenceSchema.extend({
  id: z.string().min(1),
  createdAt: z.string().min(1),
});

export const PlanPhaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: PhaseStatusSchema,
  lifecycle: MemoryLifecycleSchema.optional(),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  evidence: z.array(StoredEvidenceSchema).default([]),
  dependsOn: z.array(z.string().min(1)).default([]),
});

export const PlanSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: PlanStatusSchema,
  priority: z.enum(["low", "medium", "high"]).optional(),
  sourceRoadmapId: z.string().min(1).optional(),
  sourceRoadmapItemId: z.string().min(1).optional(),
  lifecycle: MemoryLifecycleSchema.optional(),
  phases: z.array(PlanPhaseSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const DecisionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  consequences: z.string().optional(),
  alternatives: z.array(z.string().min(1)).default([]),
  relatedPlanIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(StoredEvidenceSchema).default([]),
  lifecycle: MemoryLifecycleSchema.optional(),
  createdAt: z.string().min(1),
});

export const ProjectBriefSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  version: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  source: z.string().min(1).optional(),
  status: BriefStatusSchema,
  lifecycle: MemoryLifecycleSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const RoadmapItemSchema = z.object({
  id: z.string().min(1),
  roadmapId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  justification: z.string().min(1).optional(),
  status: RoadmapItemStatusSchema,
  lifecycle: MemoryLifecycleSchema.optional(),
  evidence: z.array(StoredEvidenceSchema).default([]),
  sourcePhaseId: z.string().min(1).optional(),
});

export const RoadmapSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: RoadmapStatusSchema,
  sourcePlanId: z.string().min(1).optional(),
  lifecycle: MemoryLifecycleSchema.optional(),
  items: z.array(RoadmapItemSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const SpikeSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  question: z.string().min(1),
  hypothesis: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).default([]),
  result: z.string().min(1).optional(),
  recommendation: z.string().min(1).optional(),
  evidence: z.array(StoredEvidenceSchema).default([]),
  status: SpikeStatusSchema,
  lifecycle: MemoryLifecycleSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  concludedAt: z.string().min(1).optional(),
});

export const FindingTypeSchema = z.enum([
  "bug",
  "risk",
  "tech_debt",
  "architecture",
  "docs_gap",
  "test_gap",
  "simplification",
]);

export const FindingSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const FindingSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: FindingTypeSchema,
  severity: FindingSeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  status: z.enum(["open", "closed"]),
  relatedFiles: z.array(z.string().min(1)).default([]),
  evidence: z.array(StoredEvidenceSchema).default([]),
  lifecycle: MemoryLifecycleSchema.optional(),
  createdAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
  relatedPlanId: z.string().min(1).optional(),
  relatedPhaseId: z.string().min(1).optional(),
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  changedFiles: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  nextSteps: z.array(z.string().min(1)).default([]),
  evidence: z.array(StoredEvidenceSchema).default([]),
  lifecycle: MemoryLifecycleSchema.optional(),
});

export const ContextDocScopeSchema = z.enum(["project", "plan", "phase"]);
export const ContextDocStatusSchema = z.enum(["pinned", "ignored"]);
export const ContextDocConfidenceSchema = z.enum(["low", "medium", "high"]);

export const ContextDocSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  scope: ContextDocScopeSchema,
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  path: z.string().min(1),
  reason: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  confidence: ContextDocConfidenceSchema,
  status: ContextDocStatusSchema,
  readAt: z.string().min(1),
  readCommit: z.string().min(1).optional(),
  observedMtime: z.string().min(1).optional(),
  lifecycle: MemoryLifecycleSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const ContextDocSuggestionSchema = z.object({
  scope: ContextDocScopeSchema,
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  path: z.string().min(1),
  reason: z.string().min(1),
  summary: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  confidence: ContextDocConfidenceSchema,
  readAt: z.string().min(1),
  readCommit: z.string().min(1).optional(),
  observedMtime: z.string().min(1).optional(),
  stale: z.boolean().default(false),
});

export const AgentStageStateSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  stage: AgentStageSchema,
  role: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const MemoryTagSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  entityType: MemoryEntityTypeSchema,
  entityId: z.string().min(1),
  tag: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const TagCatalogEntrySchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  tag: z.string().min(1),
  description: z.string().min(1).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  usageCount: z.number().int().nonnegative().optional(),
});

export const TagAliasSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  alias: z.string().min(1),
  tag: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const MemoryClaimSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  entityId: z.string().min(1),
  scope: z.string().min(1),
  role: z.string().min(1),
  owner: z.string().min(1).optional(),
  worktree: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  hostname: z.string().min(1).optional(),
  status: z.enum(["active", "released", "expired"]),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  releasedAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
});

export const MemoryEvidenceRecordSchema = StoredEvidenceSchema.extend({
  projectId: z.string().min(1),
  entityType: MemoryEntityTypeSchema,
  entityId: z.string().min(1),
});

export const RawMemoryEntitySchema = z.object({
  entityType: MemoryEntityTypeSchema,
  entityId: z.string().min(1),
  raw: z.unknown(),
  evidence: z.array(MemoryEvidenceRecordSchema).default([]),
  lifecycle: MemoryLifecycleSchema.optional(),
  tags: z.array(z.string().min(1)).default([]),
});

export const DoctorIssueSchema = z.object({
  id: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string().min(1),
  detail: z.string().min(1),
  entityType: MemoryEntityTypeSchema.optional(),
  entityId: z.string().min(1).optional(),
  evidence: z.array(z.string().min(1)).optional(),
});

export const DoctorReportSchema = z.object({
  generatedAt: z.string().min(1),
  ok: z.boolean(),
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
  }),
  issues: z.array(DoctorIssueSchema),
  markdown: z.string().min(1),
});

export const MemorySearchResultSchema = z.object({
  entityType: MemoryEntityTypeSchema,
  entityId: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  lifecycle: MemoryLifecycleSchema.optional(),
  score: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

export const GitContextSchema = z.object({
  isGitRepo: z.boolean(),
  rootPath: z.string().min(1),
  worktreeRoot: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  repositoryUrl: z.string().min(1).optional(),
  headCommit: z.string().min(1).optional(),
  headSubject: z.string().min(1).optional(),
  baseBranch: z.string().min(1).optional(),
  changedSinceBase: z.array(z.string().min(1)).default([]),
  changedFiles: z.array(z.string().min(1)).default([]),
  dirty: z.boolean(),
});

export const FindingSummarySchema = FindingSchema.pick({
  id: true,
  type: true,
  severity: true,
  title: true,
  relatedFiles: true,
  relatedPlanId: true,
  relatedPhaseId: true,
});

export const NextStepKindSchema = z.enum([
  "implement_phase",
  "review_phase",
  "create_plan",
  "review_deferred",
  "blocking_finding",
  "review_finding",
  "ambiguous_focus",
  "blocked_dependency",
  "review_completed",
  "create_plan_empty",
]);

export const NextStepStalenessSchema = z.object({
  stale: z.boolean(),
  ageDays: z.number().nonnegative(),
  staleAfterDays: z.number().int().positive(),
  lastUpdatedAt: z.string().min(1),
});

export const NextStepSchema = z.object({
  recommendation: z.string().min(1).nullable(),
  reason: z.string().min(1),
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  evidence: z.array(z.string().min(1)).default([]),
  blockedBy: z.array(z.string().min(1)).optional(),
  kind: NextStepKindSchema.optional(),
  staleness: NextStepStalenessSchema.optional(),
});

export const AdvancePlanInputSchema = z.object({
  planId: z.string().min(1),
  completedPhaseId: z.string().min(1).optional(),
  status: PhaseStatusSchema.optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const AdvanceResultSchema = z.object({
  completed: z
    .object({
      phaseId: z.string().min(1),
      status: PhaseStatusSchema,
    })
    .nullable(),
  planCompleted: z.boolean(),
  roadmapItemAdvanced: z
    .object({
      roadmapId: z.string().min(1),
      itemId: z.string().min(1),
    })
    .nullable(),
  next: NextStepSchema,
});

export const PlanPathPhaseSchema = z.object({
  phaseId: z.string().min(1),
  title: z.string().min(1),
  status: PhaseStatusSchema,
  dependsOn: z.array(z.string().min(1)),
  ready: z.boolean(),
});

export const PlanPathSchema = z.object({
  planId: z.string().min(1),
  orderedPhases: z.array(PlanPathPhaseSchema),
  criticalPath: z.array(z.string().min(1)),
  remaining: z.number().int().nonnegative(),
});

export const ProjectSummarySchema = ProjectSchema.pick({
  id: true,
  name: true,
  rootPath: true,
});

export const PlanSummarySchema = PlanSchema.pick({
  id: true,
  title: true,
  status: true,
  priority: true,
});

export const ProjectBriefSummarySchema = ProjectBriefSchema.pick({
  id: true,
  title: true,
  summary: true,
  source: true,
  version: true,
  status: true,
  updatedAt: true,
});

export const RoadmapSummarySchema = RoadmapSchema.pick({
  id: true,
  title: true,
  status: true,
  sourcePlanId: true,
  updatedAt: true,
});

export const SpikeSummarySchema = SpikeSchema.pick({
  id: true,
  title: true,
  question: true,
  status: true,
  recommendation: true,
  updatedAt: true,
});

export const PhaseDetailSchema = z.object({
  planId: z.string().min(1),
  planTitle: z.string().min(1),
  phase: PlanPhaseSchema,
});

export const SessionCompactSchema = SessionSchema.pick({
  id: true,
  startedAt: true,
  endedAt: true,
  branch: true,
  summary: true,
  changedFiles: true,
  relatedPlanId: true,
  nextSteps: true,
});

export const DecisionCompactSchema = DecisionSchema.pick({
  id: true,
  title: true,
  relatedPlanIds: true,
  createdAt: true,
});

export const ContextSnapshotSchema = z.object({
  project: ProjectSchema.nullable(),
  git: GitContextSchema,
  registered: z.boolean(),
  currentBrief: ProjectBriefSchema.nullable(),
  recentRoadmaps: z.array(RoadmapSchema),
  openSpikes: z.array(SpikeSchema),
  activePlan: PlanSchema.nullable(),
  currentPhase: PlanPhaseSchema.nullable(),
  selectedPhase: PhaseDetailSchema.nullable(),
  recentSessions: z.array(SessionSchema),
  recentDecisions: z.array(DecisionSchema),
  openFindings: z.array(FindingSummarySchema),
  contextDocs: z.array(ContextDocSchema).default([]),
  next: NextStepSchema,
  markdown: z.string().min(1),
});

export const CompactContextSchema = z.object({
  project: ProjectSummarySchema.nullable(),
  git: GitContextSchema,
  currentBrief: ProjectBriefSummarySchema.nullable(),
  recentRoadmaps: z.array(RoadmapSummarySchema),
  openSpikes: z.array(SpikeSummarySchema),
  activePlan: PlanSummarySchema.nullable(),
  currentPhase: PlanPhaseSchema.nullable(),
  selectedPhase: PhaseDetailSchema.nullable(),
  recentSessions: z.array(SessionCompactSchema),
  recentDecisions: z.array(DecisionCompactSchema),
  openFindings: z.array(FindingSummarySchema),
  contextDocs: z.array(ContextDocSchema).default([]),
  next: NextStepSchema,
  markdown: z.string().min(1),
});

export const ResumeContextSchema = z.object({
  project: ProjectSummarySchema.nullable(),
  git: GitContextSchema,
  currentBrief: ProjectBriefSummarySchema.nullable(),
  recentRoadmaps: z.array(RoadmapSummarySchema),
  openSpikes: z.array(SpikeSummarySchema),
  activePlan: PlanSummarySchema.nullable(),
  currentPhase: PlanPhaseSchema.nullable(),
  latestSession: SessionSchema.nullable(),
  recentDecisions: z.array(DecisionCompactSchema),
  openFindings: z.array(FindingSummarySchema),
  contextDocs: z.array(ContextDocSchema).default([]),
  next: NextStepSchema,
  readiness: z.lazy(() => ContinuityReadinessSchema).optional(),
  roi: z.lazy(() => ContextRoiReportSchema).optional(),
  markdown: z.string().min(1),
});

export const ContinuityReadinessSchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(["ready", "needs_plan", "needs_cleanup", "blocked", "ambiguous"]),
  strengths: z.array(z.string().min(1)),
  gaps: z.array(z.string().min(1)),
});

export const ContextRoiReportSchema = z.object({
  sourceEvents: z.number().int().nonnegative(),
  sourceSessions: z.number().int().nonnegative(),
  sourceDecisions: z.number().int().nonnegative(),
  sourceFindings: z.number().int().nonnegative(),
  sourcePhases: z.number().int().nonnegative(),
  estimatedRawTokens: z.number().int().nonnegative(),
  compactTokens: z.number().int().nonnegative(),
  compressionRatio: z.number().nonnegative(),
  continuitySignals: z.array(z.string().min(1)),
  missingSignals: z.array(z.string().min(1)),
});

export const ActionBriefingSchema = z.object({
  goal: z.string().min(1),
  lastSession: z.string().min(1).nullable(),
  remainingWork: z.array(z.string().min(1)).default([]),
  nextAction: z.string().min(1),
  blockers: z.array(z.string().min(1)).default([]),
  freshness: z.array(z.string().min(1)).default([]),
  suggestedCommands: z.array(z.string().min(1)).default([]),
});

export const ContinueResultSchema = z.object({
  context: CompactContextSchema,
  next: NextStepSchema,
  phase: PhaseDetailSchema.nullable(),
  roadmapItem: RoadmapItemSchema.nullable(),
  contextDocs: z.array(ContextDocSchema).default([]),
  actionBriefing: ActionBriefingSchema.optional(),
  latestSession: SessionSchema.nullable(),
  openSession: SessionSchema.nullable(),
  newSession: SessionSchema.nullable(),
  closedSession: SessionSchema.nullable(),
  warnings: z.array(z.string().min(1)),
  readiness: ContinuityReadinessSchema,
  roi: ContextRoiReportSchema,
  markdown: z.string().min(1),
});

export const CheckpointInputSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).optional(),
  nextSteps: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const NoteInputSchema = z.object({
  text: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).optional(),
  nextSteps: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const DecideInputSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  consequences: z.string().optional(),
  alternatives: z.array(z.string().min(1)).default([]),
  relatedPlanIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});

export const ReadyInputSchema = z.object({
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const DoneInputSchema = z
  .object({
    planId: z.string().min(1).optional(),
    phaseId: z.string().min(1).optional(),
    findingId: z.string().min(1).optional(),
    evidence: z.array(EvidenceSchema).default([]),
  })
  .refine((value) => !(value.findingId && (value.planId || value.phaseId)), {
    message: "Provide either findingId or plan/phase completion options",
  });

export const BlockedInputSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: FindingTypeSchema.default("risk"),
    severity: FindingSeveritySchema.default("high"),
    relatedFiles: z.array(z.string().min(1)).default([]),
    relatedPlanId: z.string().min(1).optional(),
    relatedPhaseId: z.string().min(1).optional(),
    markPhaseId: z.string().min(1).optional(),
    evidence: z.array(EvidenceSchema).default([]),
  })
  .refine((value) => Boolean(value.markPhaseId) || (Boolean(value.title) && Boolean(value.description)), {
    message: "Provide markPhaseId or both title and description",
  });

export const DoneResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phase"), result: AdvanceResultSchema }),
  z.object({ kind: z.literal("finding"), finding: FindingSchema }),
]);

export const BlockedResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("phase"), result: AdvanceResultSchema }),
  z.object({ kind: z.literal("finding"), finding: FindingSchema }),
]);

export const PromptFormatSchema = z.enum(["markdown", "agent", "codex", "claude"]);
export const PromptRoleSchema = z.enum(["planner", "implementer", "reviewer", "handoff"]);

export const PromptSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  priority: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  included: z.boolean(),
});

export const PromptResultSchema = z.object({
  format: PromptFormatSchema,
  role: PromptRoleSchema.optional(),
  content: z.string().min(1),
  estimatedTokens: z.number().int().nonnegative(),
  maxTokens: z.number().int().positive().optional(),
  truncated: z.boolean(),
  sections: z.array(PromptSectionSchema),
  metadata: z
    .object({
      projectId: z.string().min(1).optional(),
      planId: z.string().min(1).optional(),
      phaseId: z.string().min(1).optional(),
      nextKind: NextStepKindSchema.optional(),
      readinessStatus: ContinuityReadinessSchema.shape.status,
    })
    .optional(),
});

export const ReadyResultSchema = z.object({
  phase: PhaseDetailSchema,
  stage: AgentStageStateSchema,
  next: NextStepSchema,
});

export const CheckpointGitDraftSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).default([]),
  nextSteps: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
  git: GitContextSchema,
});

export const CheckpointFromGitResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft"), draft: CheckpointGitDraftSchema }),
  z.object({ kind: z.literal("session"), session: SessionSchema, draft: CheckpointGitDraftSchema }),
]);

export const DemoStepSchema = z.object({
  title: z.string().min(1),
  purpose: z.string().min(1),
  commands: z.array(z.string().min(1)).min(1),
  expected: z.string().min(1),
  durationMinutes: z.number().int().positive(),
});

export const DemoGuideSummarySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  tags: z.array(z.string().min(1)),
});

export const DemoGuideSchema = DemoGuideSummarySchema.extend({
  whenItHelps: z.array(z.string().min(1)),
  privacy: z.array(z.string().min(1)),
  prerequisites: z.array(z.string().min(1)),
  steps: z.array(DemoStepSchema).min(1),
  nextSteps: z.array(z.string().min(1)),
  markdown: z.string().min(1),
});

export const CreatePlanInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: PlanStatusSchema.default("active"),
  priority: z.enum(["low", "medium", "high"]).optional(),
  phases: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        status: PhaseStatusSchema.default("todo"),
        acceptanceCriteria: z.array(z.string().min(1)).default([]),
        evidence: z.array(EvidenceSchema).default([]),
      }),
    )
    .min(1),
});

export const UpdatePhaseInputSchema = z
  .object({
    phaseId: z.string().min(1).optional(),
    phaseTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: PhaseStatusSchema.optional(),
    acceptanceCriteria: z.array(z.string().min(1)).optional(),
    evidence: z.array(EvidenceSchema).optional(),
    dependsOn: z.array(z.string().min(1)).optional(),
  })
  .refine((value) => value.phaseId || value.phaseTitle, {
    message: "Provide phaseId or phaseTitle",
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.acceptanceCriteria !== undefined ||
      value.evidence !== undefined ||
      value.dependsOn !== undefined,
    {
      message: "Provide at least one phase update",
    },
  );

export const UpdatePlanInputSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: PlanStatusSchema.optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.priority !== undefined,
    {
      message: "Provide at least one plan update",
    },
  );

export const RecordDecisionInputSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  consequences: z.string().optional(),
  alternatives: z.array(z.string().min(1)).default([]),
  relatedPlanIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(EvidenceSchema).default([]),
});

export const SetBriefInputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().min(1),
  source: z.string().min(1).optional(),
});

export const CreateRoadmapInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: RoadmapStatusSchema.default("active"),
  items: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        justification: z.string().min(1).optional(),
        status: RoadmapItemStatusSchema.default("todo"),
        evidence: z.array(EvidenceSchema).default([]),
      }),
    )
    .min(1),
});

export const AddRoadmapItemInputSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    justification: z.string().min(1).optional(),
    status: RoadmapItemStatusSchema.default("todo"),
    evidence: z.array(EvidenceSchema).default([]),
    position: z.number().int().nonnegative().optional(),
    afterItemId: z.string().min(1).optional(),
    afterItemTitle: z.string().min(1).optional(),
  })
  .refine(
    (value) =>
      [value.position !== undefined, value.afterItemId !== undefined, value.afterItemTitle !== undefined].filter(Boolean)
        .length <= 1,
    {
      message: "Provide only one insertion target",
    },
  )
  .refine(
    (value) =>
      ![value.position !== undefined, value.afterItemId !== undefined, value.afterItemTitle !== undefined].some(Boolean) ||
      value.justification !== undefined,
    {
      message: "Provide justification when inserting a roadmap item at a specific position",
    },
  );

export const UpdateRoadmapInputSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: RoadmapStatusSchema.optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.description !== undefined || value.status !== undefined,
    {
      message: "Provide at least one roadmap update",
    },
  );

export const UpdateRoadmapItemInputSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    itemTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    justification: z.string().min(1).optional(),
    status: RoadmapItemStatusSchema.optional(),
    evidence: z.array(EvidenceSchema).optional(),
  })
  .refine((value) => value.itemId || value.itemTitle, {
    message: "Provide itemId or itemTitle",
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.justification !== undefined ||
      value.status !== undefined ||
      value.evidence !== undefined,
    {
      message: "Provide at least one roadmap item update",
    },
  );

export const ImportPlanToRoadmapInputSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: RoadmapStatusSchema.default("active"),
  archivePlan: z.boolean().default(false),
});

export const CreatePlanFromRoadmapInputSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    itemTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    status: PlanStatusSchema.default("active"),
    priority: z.enum(["low", "medium", "high"]).optional(),
    phases: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
          status: PhaseStatusSchema.default("todo"),
          acceptanceCriteria: z.array(z.string().min(1)).default([]),
          evidence: z.array(EvidenceSchema).default([]),
        }),
      )
      .optional(),
  })
  .refine((value) => Boolean(value.itemId) !== Boolean(value.itemTitle), {
    message: "Provide exactly one of itemId or itemTitle",
  });

export const CreateSpikeInputSchema = z.object({
  title: z.string().min(1).optional(),
  question: z.string().min(1),
  hypothesis: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  status: SpikeStatusSchema.default("open"),
});

export const RecordSpikeInputSchema = z.object({
  title: z.string().min(1).optional(),
  question: z.string().min(1),
  hypothesis: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).default([]),
  result: z.string().min(1),
  recommendation: z.string().min(1),
  evidence: z.array(EvidenceSchema).default([]),
  status: SpikeStatusSchema.default("concluded"),
});

export const ConcludeSpikeInputSchema = z.object({
  status: z.enum(["concluded", "abandoned"]).default("concluded"),
  result: z.string().min(1).optional(),
  recommendation: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const SessionSummaryInputSchema = z.object({
  summary: z.string().min(1),
  changedFiles: z.array(z.string().min(1)).optional(),
  nextSteps: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const RecordFindingInputSchema = z.object({
  type: FindingTypeSchema,
  severity: FindingSeveritySchema,
  title: z.string().min(1),
  description: z.string().min(1),
  relatedFiles: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  relatedPhaseId: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const UpdateFindingInputSchema = z
  .object({
    type: FindingTypeSchema.optional(),
    severity: FindingSeveritySchema.optional(),
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    relatedFiles: z.array(z.string().min(1)).optional(),
    relatedPlanId: z.string().min(1).optional(),
    relatedPhaseId: z.string().min(1).optional(),
    evidence: z.array(EvidenceSchema).optional(),
  })
  .refine(
    (value) =>
      value.type !== undefined ||
      value.severity !== undefined ||
      value.title !== undefined ||
      value.description !== undefined ||
      value.relatedFiles !== undefined ||
      value.relatedPlanId !== undefined ||
      value.relatedPhaseId !== undefined ||
      value.evidence !== undefined,
    {
      message: "Provide at least one finding update",
    },
  );

export const EventSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  type: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.unknown(),
  createdAt: z.string().min(1),
});

export const StartSessionInputSchema = z.object({
  summary: z.string().min(1).optional(),
  changedFiles: z.array(z.string().min(1)).optional(),
  nextSteps: z.array(z.string().min(1)).default([]),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  startedAt: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const CaptureSessionInputSchema = z
  .object({
    summary: z.string().min(1).optional(),
    changedFiles: z.array(z.string().min(1)).optional(),
    nextSteps: z.array(z.string().min(1)).optional(),
    relatedPlanId: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    evidence: z.array(EvidenceSchema).optional(),
  })
  .refine(
    (value) =>
      value.summary !== undefined ||
      value.changedFiles !== undefined ||
      value.nextSteps !== undefined ||
      value.relatedPlanId !== undefined ||
      value.branch !== undefined ||
      value.evidence !== undefined,
    {
      message: "Provide at least one session field to capture",
    },
  );

export const EndSessionInputSchema = z.object({
  summary: z.string().min(1).optional(),
  changedFiles: z.array(z.string().min(1)).optional(),
  nextSteps: z.array(z.string().min(1)).optional(),
  relatedPlanId: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  endedAt: z.string().min(1).optional(),
  evidence: z.array(EvidenceSchema).default([]),
});

export const DocsTaskSchema = z.enum(["current"]);
export const UpsertContextDocInputSchema = z.object({
  task: DocsTaskSchema.default("current"),
  path: z.string().min(1),
});

export const SetStageInputSchema = z.object({
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  stage: AgentStageSchema,
  role: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

export const SetMemoryTagsInputSchema = z.object({
  tags: z.array(z.string().min(1)).default([]),
});

export const CreateTagInputSchema = z.object({
  tag: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const CreateTagAliasInputSchema = z.object({
  alias: z.string().min(1),
  tag: z.string().min(1),
});

export const ClaimInputSchema = z.object({
  entityId: z.string().min(1),
  scope: z.string().min(1),
  ttl: z.string().min(1).default("2h"),
  role: z.string().min(1),
});

export const RefreshClaimInputSchema = z.object({
  claimId: z.string().min(1),
  ttl: z.string().min(1).default("2h"),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanPhase = z.infer<typeof PlanPhaseSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type MemoryLifecycle = z.infer<typeof MemoryLifecycleSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type RoadmapStatus = z.infer<typeof RoadmapStatusSchema>;
export type RoadmapItemStatus = z.infer<typeof RoadmapItemStatusSchema>;
export type Spike = z.infer<typeof SpikeSchema>;
export type SpikeStatus = z.infer<typeof SpikeStatusSchema>;
export type AgentStage = z.infer<typeof AgentStageSchema>;
export type AgentStageState = z.infer<typeof AgentStageStateSchema>;
export type MemoryEntityType = z.infer<typeof MemoryEntityTypeSchema>;
export type MemoryTag = z.infer<typeof MemoryTagSchema>;
export type TagCatalogEntry = z.infer<typeof TagCatalogEntrySchema>;
export type TagAlias = z.infer<typeof TagAliasSchema>;
export type MemoryClaim = z.infer<typeof MemoryClaimSchema>;
export type MemoryEvidenceRecord = z.infer<typeof MemoryEvidenceRecordSchema>;
export type RawMemoryEntity = z.infer<typeof RawMemoryEntitySchema>;
export type DoctorIssue = z.infer<typeof DoctorIssueSchema>;
export type DoctorReport = z.infer<typeof DoctorReportSchema>;
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type ContextDoc = z.infer<typeof ContextDocSchema>;
export type ContextDocSuggestion = z.infer<typeof ContextDocSuggestionSchema>;
export type ContextDocScope = z.infer<typeof ContextDocScopeSchema>;
export type ContextDocStatus = z.infer<typeof ContextDocStatusSchema>;
export type ContextDocConfidence = z.infer<typeof ContextDocConfidenceSchema>;
export type GitContext = z.infer<typeof GitContextSchema>;
export type FindingSummary = z.infer<typeof FindingSummarySchema>;
export type NextStep = z.infer<typeof NextStepSchema>;
export type NextStepKind = z.infer<typeof NextStepKindSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
export type ProjectBriefSummary = z.infer<typeof ProjectBriefSummarySchema>;
export type RoadmapSummary = z.infer<typeof RoadmapSummarySchema>;
export type SpikeSummary = z.infer<typeof SpikeSummarySchema>;
export type PhaseDetail = z.infer<typeof PhaseDetailSchema>;
export type SessionCompact = z.infer<typeof SessionCompactSchema>;
export type DecisionCompact = z.infer<typeof DecisionCompactSchema>;
export type ContextSnapshot = z.infer<typeof ContextSnapshotSchema>;
export type CompactContext = z.infer<typeof CompactContextSchema>;
export type ResumeContext = z.infer<typeof ResumeContextSchema>;
export type ContinuityReadiness = z.infer<typeof ContinuityReadinessSchema>;
export type ContextRoiReport = z.infer<typeof ContextRoiReportSchema>;
export type ActionBriefing = z.infer<typeof ActionBriefingSchema>;
export type ContinueResult = z.infer<typeof ContinueResultSchema>;
export type CheckpointInput = z.infer<typeof CheckpointInputSchema>;
export type ReadyInput = z.infer<typeof ReadyInputSchema>;
export type ReadyResult = z.infer<typeof ReadyResultSchema>;
export type CheckpointGitDraft = z.infer<typeof CheckpointGitDraftSchema>;
export type CheckpointFromGitResult = z.infer<typeof CheckpointFromGitResultSchema>;
export type NoteInput = z.infer<typeof NoteInputSchema>;
export type DecideInput = z.infer<typeof DecideInputSchema>;
export type DoneInput = z.infer<typeof DoneInputSchema>;
export type BlockedInput = z.infer<typeof BlockedInputSchema>;
export type DoneResult = z.infer<typeof DoneResultSchema>;
export type BlockedResult = z.infer<typeof BlockedResultSchema>;
export type PromptFormat = z.infer<typeof PromptFormatSchema>;
export type PromptRole = z.infer<typeof PromptRoleSchema>;
export type PromptSection = z.infer<typeof PromptSectionSchema>;
export type PromptResult = z.infer<typeof PromptResultSchema>;
export type DemoStep = z.infer<typeof DemoStepSchema>;
export type DemoGuideSummary = z.infer<typeof DemoGuideSummarySchema>;
export type DemoGuide = z.infer<typeof DemoGuideSchema>;
export type CreatePlanInput = z.infer<typeof CreatePlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanInputSchema>;
export type UpdatePhaseInput = z.infer<typeof UpdatePhaseInputSchema>;
export type RecordDecisionInput = z.infer<typeof RecordDecisionInputSchema>;
export type SetBriefInput = z.infer<typeof SetBriefInputSchema>;
export type CreateRoadmapInput = z.infer<typeof CreateRoadmapInputSchema>;
export type AddRoadmapItemInput = z.infer<typeof AddRoadmapItemInputSchema>;
export type UpdateRoadmapInput = z.infer<typeof UpdateRoadmapInputSchema>;
export type UpdateRoadmapItemInput = z.infer<typeof UpdateRoadmapItemInputSchema>;
export type ImportPlanToRoadmapInput = z.infer<typeof ImportPlanToRoadmapInputSchema>;
export type CreatePlanFromRoadmapInput = z.infer<typeof CreatePlanFromRoadmapInputSchema>;
export type CreateSpikeInput = z.infer<typeof CreateSpikeInputSchema>;
export type RecordSpikeInput = z.infer<typeof RecordSpikeInputSchema>;
export type ConcludeSpikeInput = z.infer<typeof ConcludeSpikeInputSchema>;
export type SessionSummaryInput = z.infer<typeof SessionSummaryInputSchema>;
export type RecordFindingInput = z.infer<typeof RecordFindingInputSchema>;
export type UpdateFindingInput = z.infer<typeof UpdateFindingInputSchema>;
export type StartSessionInput = z.infer<typeof StartSessionInputSchema>;
export type CaptureSessionInput = z.infer<typeof CaptureSessionInputSchema>;
export type EndSessionInput = z.infer<typeof EndSessionInputSchema>;
export type SetStageInput = z.infer<typeof SetStageInputSchema>;
export type SetMemoryTagsInput = z.infer<typeof SetMemoryTagsInputSchema>;
export type CreateTagInput = z.infer<typeof CreateTagInputSchema>;
export type CreateTagAliasInput = z.infer<typeof CreateTagAliasInputSchema>;
export type ClaimInput = z.infer<typeof ClaimInputSchema>;
export type RefreshClaimInput = z.infer<typeof RefreshClaimInputSchema>;
export type DocsTask = z.infer<typeof DocsTaskSchema>;
export type UpsertContextDocInput = z.infer<typeof UpsertContextDocInputSchema>;
export type Event = z.infer<typeof EventSchema>;
export type NextStepStaleness = z.infer<typeof NextStepStalenessSchema>;
export type AdvancePlanInput = z.infer<typeof AdvancePlanInputSchema>;
export type AdvanceResult = z.infer<typeof AdvanceResultSchema>;
export type PlanPathPhase = z.infer<typeof PlanPathPhaseSchema>;
export type PlanPath = z.infer<typeof PlanPathSchema>;
