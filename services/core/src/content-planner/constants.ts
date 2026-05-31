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
