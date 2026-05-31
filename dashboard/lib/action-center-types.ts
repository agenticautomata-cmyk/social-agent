export type BensonPriority = 'critical' | 'important' | 'suggested';

export type ActionEntityType =
  | 'planner'
  | 'pipeline'
  | 'outreach'
  | 'sponsor_contact'
  | 'intake';

export type ActionKind =
  | 'send_email'
  | 'schedule_follow_up'
  | 'mark_covered'
  | 'move_opportunity_stage'
  | 'create_planner_item'
  | 'assign_due_date'
  | 'approve_email';

export type ActionCenterAction = {
  kind: ActionKind;
  label: string;
  href?: string;
};

export type ActionCenterItem = {
  id: string;
  section: string;
  entityType: ActionEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  dueBucket: 'overdue' | 'due_today' | 'due_this_week' | 'later' | 'none';
  priority: BensonPriority;
  actions: ActionCenterAction[];
  href: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

export type ActionCenterResponse = {
  demoMode: boolean;
  generatedAt: string;
  sections: {
    pendingFollowUps: ActionCenterItem[];
    pendingSponsorEmails: ActionCenterItem[];
    contentWaitingForApproval: ActionCenterItem[];
    upcomingPlannedContent: ActionCenterItem[];
    sponsorOpportunitiesNeedingUpdates: ActionCenterItem[];
  };
  notifications: {
    overdue: ActionCenterItem[];
    dueToday: ActionCenterItem[];
    dueThisWeek: ActionCenterItem[];
  };
  priorities: {
    critical: ActionCenterItem[];
    important: ActionCenterItem[];
    suggested: ActionCenterItem[];
  };
  doNow: ActionCenterItem[];
  counts: {
    total: number;
    overdue: number;
    dueToday: number;
  };
};

export type ExecuteActionBody = {
  action: ActionKind;
  entityType: ActionEntityType;
  entityId: string;
  dueDate?: string | null;
  followUpAt?: string | null;
  status?: string;
  plannerAction?: 'save' | 'plan_today' | 'plan_weekend';
  listName?: string;
};
