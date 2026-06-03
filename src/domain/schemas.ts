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
export const PhaseStatusSchema = z.enum(["pending", "in_progress", "completed", "blocked"]);
export const BriefStatusSchema = z.enum(["current", "archived"]);
export const RoadmapStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
export const RoadmapItemStatusSchema = z.enum(["planned", "in_progress", "done", "deferred"]);
export const SpikeStatusSchema = z.enum(["open", "concluded", "abandoned"]);

export const EvidenceSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.enum(["note", "commit", "file", "pr", "command", "link"]).default("note"),
  value: z.string().min(1),
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
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  evidence: z.array(StoredEvidenceSchema).default([]),
});

export const PlanSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: PlanStatusSchema,
  priority: z.enum(["low", "medium", "high"]).optional(),
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
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const RoadmapItemSchema = z.object({
  id: z.string().min(1),
  roadmapId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: RoadmapItemStatusSchema,
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
  createdAt: z.string().min(1),
  closedAt: z.string().min(1).optional(),
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
});

export const GitContextSchema = z.object({
  isGitRepo: z.boolean(),
  rootPath: z.string().min(1),
  branch: z.string().min(1).optional(),
  repositoryUrl: z.string().min(1).optional(),
  headCommit: z.string().min(1).optional(),
  changedFiles: z.array(z.string().min(1)).default([]),
  dirty: z.boolean(),
});

export const FindingSummarySchema = FindingSchema.pick({
  id: true,
  severity: true,
  title: true,
});

export const NextStepSchema = z.object({
  recommendation: z.string().min(1).nullable(),
  reason: z.string().min(1),
  planId: z.string().min(1).optional(),
  phaseId: z.string().min(1).optional(),
  evidence: z.array(z.string().min(1)).default([]),
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
  next: NextStepSchema,
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
        status: PhaseStatusSchema.default("pending"),
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
      value.evidence !== undefined,
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
        status: RoadmapItemStatusSchema.default("planned"),
        evidence: z.array(EvidenceSchema).default([]),
      }),
    )
    .min(1),
});

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
});

export type Project = z.infer<typeof ProjectSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type PlanPhase = z.infer<typeof PlanPhaseSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type Roadmap = z.infer<typeof RoadmapSchema>;
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type RoadmapStatus = z.infer<typeof RoadmapStatusSchema>;
export type RoadmapItemStatus = z.infer<typeof RoadmapItemStatusSchema>;
export type Spike = z.infer<typeof SpikeSchema>;
export type SpikeStatus = z.infer<typeof SpikeStatusSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type GitContext = z.infer<typeof GitContextSchema>;
export type FindingSummary = z.infer<typeof FindingSummarySchema>;
export type NextStep = z.infer<typeof NextStepSchema>;
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
export type CreatePlanInput = z.infer<typeof CreatePlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof UpdatePlanInputSchema>;
export type UpdatePhaseInput = z.infer<typeof UpdatePhaseInputSchema>;
export type RecordDecisionInput = z.infer<typeof RecordDecisionInputSchema>;
export type SetBriefInput = z.infer<typeof SetBriefInputSchema>;
export type CreateRoadmapInput = z.infer<typeof CreateRoadmapInputSchema>;
export type UpdateRoadmapInput = z.infer<typeof UpdateRoadmapInputSchema>;
export type UpdateRoadmapItemInput = z.infer<typeof UpdateRoadmapItemInputSchema>;
export type ImportPlanToRoadmapInput = z.infer<typeof ImportPlanToRoadmapInputSchema>;
export type CreateSpikeInput = z.infer<typeof CreateSpikeInputSchema>;
export type RecordSpikeInput = z.infer<typeof RecordSpikeInputSchema>;
export type ConcludeSpikeInput = z.infer<typeof ConcludeSpikeInputSchema>;
export type SessionSummaryInput = z.infer<typeof SessionSummaryInputSchema>;
