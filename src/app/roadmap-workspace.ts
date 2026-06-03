import type { Plan, Roadmap, RoadmapItem, RoadmapStatus } from "../domain/schemas";

export type WorkspaceProgress = { done: number; total: number };

export type WorkspaceItem = {
  item: RoadmapItem;
  linkedPlans: Plan[];
  phaseProgress: WorkspaceProgress;
};

export type WorkspaceGroup = {
  roadmapId: string | null;
  title: string;
  status: RoadmapStatus | "standalone";
  isFocused: boolean;
  itemProgress: WorkspaceProgress;
  items: WorkspaceItem[];
  standalonePlans: Plan[];
};

export type RoadmapWorkspace = { groups: WorkspaceGroup[] };

export function buildRoadmapWorkspace(
  roadmaps: Roadmap[],
  plans: Plan[],
  focusRoadmapId: string | null = null,
): RoadmapWorkspace {
  const groups: WorkspaceGroup[] = roadmaps.map((roadmap) => {
    const items: WorkspaceItem[] = roadmap.items.map((item) => {
      const linkedPlans = plans.filter((plan) => plan.sourceRoadmapItemId === item.id);
      return { item, linkedPlans, phaseProgress: phaseProgress(linkedPlans) };
    });

    return {
      roadmapId: roadmap.id,
      title: roadmap.title,
      status: roadmap.status,
      isFocused: focusRoadmapId !== null && focusRoadmapId === roadmap.id,
      itemProgress: itemProgress(roadmap.items),
      items,
      standalonePlans: [],
    };
  });

  const standalonePlans = plans.filter((plan) => !plan.sourceRoadmapId);
  if (standalonePlans.length > 0) {
    groups.push({
      roadmapId: null,
      title: "Unlinked plans",
      status: "standalone",
      isFocused: false,
      itemProgress: { done: 0, total: 0 },
      items: [],
      standalonePlans,
    });
  }

  return { groups };
}

function phaseProgress(plans: Plan[]): WorkspaceProgress {
  let done = 0;
  let total = 0;
  for (const plan of plans) {
    for (const phase of plan.phases) {
      total += 1;
      if (phase.status === "done") {
        done += 1;
      }
    }
  }
  return { done, total };
}

function itemProgress(items: RoadmapItem[]): WorkspaceProgress {
  return { done: items.filter((item) => item.status === "done").length, total: items.length };
}
