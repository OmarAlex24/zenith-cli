import type { Plan, Roadmap } from "../domain/schemas";

export type FocusCandidate = {
  roadmapId: string;
  roadmapTitle: string;
  planId: string;
  planTitle: string;
};

export type FocusResolution = {
  activePlan: Plan | null;
  focusRoadmapId: string | null;
  ambiguous: boolean;
  candidates: FocusCandidate[];
};

export function resolveActivePlan(input: {
  roadmaps: Roadmap[];
  activePlans: Plan[];
  focusRoadmapId: string | null;
}): FocusResolution {
  const { roadmaps, activePlans, focusRoadmapId } = input;

  if (focusRoadmapId) {
    const activePlan = activePlans.find((plan) => plan.sourceRoadmapId === focusRoadmapId) ?? null;
    return { activePlan, focusRoadmapId, ambiguous: false, candidates: [] };
  }

  if (activePlans.length <= 1) {
    return { activePlan: activePlans[0] ?? null, focusRoadmapId: null, ambiguous: false, candidates: [] };
  }

  const candidates: FocusCandidate[] = activePlans.map((plan) => {
    const roadmap = plan.sourceRoadmapId ? roadmaps.find((entry) => entry.id === plan.sourceRoadmapId) : undefined;
    return {
      roadmapId: plan.sourceRoadmapId ?? "",
      roadmapTitle: roadmap?.title ?? "Standalone",
      planId: plan.id,
      planTitle: plan.title,
    };
  });

  return { activePlan: null, focusRoadmapId: null, ambiguous: true, candidates };
}
