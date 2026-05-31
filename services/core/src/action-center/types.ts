import type { SponsorPipelineStatus } from '../sponsor-pipeline/constants.js';
import type { DueBucket } from './dates.js';

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
  section:
    | 'pending_follow_ups'
    | 'pending_sponsor_emails'
    | 'content_waiting_for_approval'
    | 'upcoming_planned_content'
    | 'sponsor_opportunities_needing_updates';
  entityType: ActionEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  dueAt: string | null;
  dueBucket: DueBucket;
  priority: BensonPriority;
  actions: ActionCenterAction[];
  href: string | null;
  meta?: Record<string, string | number | boolean | null>;
};

export type ActionCenterSections = {
  pendingFollowUps: ActionCenterItem[];
  pendingSponsorEmails: ActionCenterItem[];
  contentWaitingForApproval: ActionCenterItem[];
  upcomingPlannedContent: ActionCenterItem[];
  sponsorOpportunitiesNeedingUpdates: ActionCenterItem[];
};

export type NotificationCenter = {
  overdue: ActionCenterItem[];
  dueToday: ActionCenterItem[];
  dueThisWeek: ActionCenterItem[];
};

export type BensonPriorityGroups = {
  critical: ActionCenterItem[];
  important: ActionCenterItem[];
  suggested: ActionCenterItem[];
};

export type ActionCenterResponse = {
  demoMode: boolean;
  generatedAt: string;
  sections: ActionCenterSections;
  notifications: NotificationCenter;
  priorities: BensonPriorityGroups;
  doNow: ActionCenterItem[];
  counts: {
    total: number;
    overdue: number;
    dueToday: number;
  };
};

export type ExecuteActionInput = {
  action: ActionKind;
  entityType: ActionEntityType;
  entityId: string;
  dueDate?: string | null;
  followUpAt?: string | null;
  status?: SponsorPipelineStatus;
  plannerAction?: 'save' | 'plan_today' | 'plan_weekend';
  listName?: string;
  scheduledSendAt?: string;
};

export type ExecuteActionResult = {
  ok: boolean;
  action: ActionKind;
  entityType: ActionEntityType;
  entityId: string;
  message: string;
};
