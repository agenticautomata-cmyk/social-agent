/** Short “how to use this” copy for ? help buttons across the studio. */

export const SECTION_HELP = {
  home: {
    startHere:
      'Benson’s ranked priorities for today. Tap any line to jump straight to where you finish it — pitch email, approvals, planner, and more.',
    doNow:
      'Urgent tasks on one screen. Use the buttons on each card to act inline; open All actions for the full list.',
    studioPulse:
      'Live email and TikTok counts. Tap a tile to open approvals, inbox replies, or TikTok analytics.',
    bensonPulse:
      'Benson syncs TikTok every 4 hours and writes a progress brief when metrics move. Check now runs an immediate sync.',
    sourceHealth:
      'Feeds that power KC opportunities. Healthy sources stay green; broken ones need attention under Manage sources.',
    quickLinks: 'Shortcuts to the main areas of the studio — website, TikTok, Today, sponsors, and more.',
  },
  actions: {
    page: 'Your full to-do list across follow-ups, pitches, approvals, and planner. Tap a title to open the item; use action buttons to complete or defer.',
    doNow: 'Highest-priority items Benson wants you to handle first — same cards as Home, with room for everything else below.',
    notifications:
      'Grouped by due date. Overdue items need attention today; this week is a heads-up, not necessarily urgent.',
    priorities:
      'Critical = do today. Important = strong nudge. Suggested = worth a look when you have bandwidth.',
    pendingFollowUps:
      'CRM and planner follow-ups with due dates. Open the link, then mark done when handled.',
    pendingSponsorEmails:
      'Draft pitches and scheduled sends. Finish in Compose or approve under Email before they go out.',
    contentWaitingForApproval:
      'Intake shares and outreach drafts waiting on your sign-off. Approve or edit before Benson sends.',
    upcomingPlannedContent:
      'What’s on your shortlist or weekly plan. Move items in Planner if dates shift.',
    sponsorOpportunities:
      'Deals or pitches that need a nudge — finish a pitch email or update pipeline stage.',
    pipelineStale:
      'Sponsor deals with no recent movement. Update stage or log a follow-up in Pipeline.',
    tiktokOperator:
      'TikTok-specific next steps from your analytics — sequels, sponsor proof posts, and follow-ups.',
  },
  editor: {
    page: 'What you actually need to do today — your plan, one strong move, anything waiting on you, and the next seven days.',
    tabs: {
      today: 'Today’s lanes: post picks, businesses to contact, follow-ups, and fresh discoveries.',
      week: 'Events and angles for the next seven days — good for batch planning.',
      saved: 'Opportunities you bookmarked from inventory or Today. Plan or cover when ready.',
      covered: 'Items you already handled — reference so Benson doesn’t re-suggest them.',
    },
    refreshSources:
      'Source refresh lives under Sources / Admin, not on Today.',
  },
  commandCenter: {
    postToday: 'Best post candidates for today based on timing, score, and your categories.',
    postWeekend: 'Weekend-friendly picks when Fri–Sun posting fits the event.',
    contactBusinesses: 'Sponsor or business angles tied to recent content — start or finish a pitch from here.',
    followUpsDue: 'Planner and CRM reminders due now. Tap through and mark done when complete.',
    discoveredToday: 'New inventory from feeds since the last refresh — review and save or plan.',
    highestConfidence: 'Highest composite scores when you want one strong pick fast.',
    trending: 'Topics gaining traction in your inventory or analytics — good for timely posts.',
    worldCupVisitors: 'Visitor-economy and event spikes — KC content tied to big crowds.',
    weekDeck: 'This week tab — events, discoveries, and sponsor angles for the next 7 days.',
    savedShortlist: 'Saved tab — your bookmarked opportunities waiting for a plan or post.',
    covered: 'Covered tab — items you’ve already posted or handled.',
  },
} as const;

export type CommandCenterHelpId = keyof typeof SECTION_HELP.commandCenter;
