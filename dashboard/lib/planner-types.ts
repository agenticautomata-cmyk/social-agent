import type { CommandCenterCard, LinkedPipelineOpportunity } from './command-center-types';

export const PLANNER_BOARDS = [
  'Today',
  'This Week',
  'Weekend',
  'Sponsors',
  'Date Night',
  'Shopping',
  'World Cup',
  'Saved For Later',
] as const;

export type PlannerBoard = (typeof PLANNER_BOARDS)[number];

export const PLANNER_STATUSES = [
  'saved',
  'considering',
  'planned',
  'covered',
  'skipped',
] as const;

export type PlannerItemStatus = (typeof PLANNER_STATUSES)[number];

export type PlannerQuickAction =
  | 'save'
  | 'plan_today'
  | 'plan_weekend'
  | 'mark_covered'
  | 'skip';

export type PlannerCard = CommandCenterCard & {
  planner: {
    listName: string;
    notes: string | null;
    priority: number;
    plannedDate: string | null;
    contentAngle: string | null;
    status: PlannerItemStatus;
    followUpAt: string | null;
  };
  linkedPipelineOpportunities?: LinkedPipelineOpportunity[];
};

export type PlannerHubResponse = {
  demoMode: boolean;
  generatedAt: string;
  counts: {
    saved: number;
    plannedThisWeek: number;
    covered: number;
    skipped: number;
  };
  boards: Array<{ name: PlannerBoard; count: number }>;
  recentItems: PlannerCard[];
};

export type WeeklyDayColumn = {
  date: string;
  label: string;
  weekday: string;
  items: PlannerCard[];
};

export type WeeklyPlanResponse = {
  weekStart: string;
  weekEnd: string;
  days: WeeklyDayColumn[];
  unscheduled: PlannerCard[];
};
