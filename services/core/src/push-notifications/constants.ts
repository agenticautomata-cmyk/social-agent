export const PUSH_TOPICS = [
  {
    id: 'tiktok_pulse',
    label: 'TikTok progress',
    description: 'When your metrics shift and Benson writes a progress brief',
  },
  {
    id: 'local_discovery',
    label: 'Local finds',
    description: 'When Benson scouts new KC events and opportunities on the web',
  },
  {
    id: 'action_reminders',
    label: 'Action reminders',
    description: 'Due today and overdue tasks in your action center',
  },
  {
    id: 'top_picks',
    label: 'Top picks',
    description: 'When Benson scores new high-priority content opportunities',
  },
  {
    id: 'share_intake',
    label: 'Share intake',
    description: 'When something you shared needs your review',
  },
  {
    id: 'milestones',
    label: 'Milestones',
    description: 'Big moments — follower goals, breakthrough posts, and wins worth celebrating',
  },
  {
    id: 'sponsor_outreach',
    label: 'Sponsor email',
    description: 'When Benson drafts a pitch or a prospect replies',
  },
  {
    id: 'gmail_inbox_digest',
    label: 'Gmail inbox digest',
    description: 'Telegram summary of new Primary mail in your sponsor inbox',
  },
  {
    id: 'post_reminders',
    label: 'Post reminders',
    description: 'When your best posting window hits and Today has content ready to film',
  },
] as const;

export type PushTopicId = (typeof PUSH_TOPICS)[number]['id'];

export const DEFAULT_PUSH_TOPICS: Record<PushTopicId, boolean> = {
  tiktok_pulse: true,
  local_discovery: true,
  action_reminders: true,
  top_picks: false,
  share_intake: true,
  milestones: true,
  post_reminders: true,
  sponsor_outreach: true,
  gmail_inbox_digest: true,
};

export type PushNotificationPayload = {
  topic: PushTopicId;
  title: string;
  body: string;
  url?: string;
  celebration?: 'fireworks';
  milestone?: string;
  followerCount?: number;
};

export const FOLLOWERS_5000_MILESTONE = 'followers_5000' as const;
export const FOLLOWERS_5000_TARGET = 5000;
