import { STUDIO_ROUTES, type StudioRoute } from './studio-routes.js';
import type { OpenTaskForNavigation } from './open-tasks.js';

export type StudioNavigationAnswer = {
  answer: string;
  suggestedActions: string[];
  href: string | null;
  matchedRoute: string | null;
  matchedTask: string | null;
};

function isNavigationQuestion(message: string): boolean {
  const q = message.toLowerCase();
  return (
    /\b(where|how)\s+(can|do|should)\s+i\b/.test(q) ||
    /\b(where\s+is|where's|take me to|open the|find the|go to)\b/.test(q) ||
    /\bhow do i get to\b/.test(q) ||
    /\bwhat page\b/.test(q)
  );
}

function scoreRoute(message: string, route: StudioRoute): number {
  const q = message.toLowerCase();
  let score = 0;
  for (const kw of route.keywords) {
    if (q.includes(kw.toLowerCase())) score += kw.length > 6 ? 3 : 2;
  }
  if (q.includes(route.label.toLowerCase())) score += 4;
  if (q.includes(route.href.replace(/\//g, ' ').trim())) score += 2;
  return score;
}

function scoreTask(
  message: string,
  task: Pick<OpenTaskForNavigation, 'id' | 'title' | 'subtitle' | 'href' | 'section' | 'priority'>,
): number {
  const q = message.toLowerCase();
  let score = 0;
  const title = task.title.toLowerCase();
  if (q.includes(title)) score += 10;
  if (/pitch|email|outreach|sponsor/.test(q) && /pitch|email|outreach|sponsor/.test(title)) score += 5;
  if (/finish pitch|finish.*email/.test(q) && /finish pitch/.test(title)) score += 12;
  if (/pitch email/.test(q) && /finish pitch email/.test(title)) score += 10;
  if (/start sponsor pitch/.test(title) && /finish pitch|pitch email|finish.*email/.test(q)) score -= 6;
  if (/to[\s-]?do|todo|action/.test(q)) score += 2;
  if (task.href?.includes('/outreach/compose') && /finish pitch|pitch email|compose/.test(q)) score += 4;
  return score;
}

export function tryAnswerStudioNavigation(
  message: string,
  input: {
    openTasks: Array<Pick<OpenTaskForNavigation, 'id' | 'title' | 'subtitle' | 'href' | 'section' | 'priority'>>;
  },
): StudioNavigationAnswer | null {
  if (!isNavigationQuestion(message)) return null;

  const q = message.toLowerCase();

  const taskScores = input.openTasks
    .map((task) => ({ task, score: scoreTask(message, task) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const routeScores = STUDIO_ROUTES.map((route) => ({ route, score: scoreRoute(message, route) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestTask = taskScores[0];
  const bestRoute = routeScores[0];

  if (bestTask && (!bestRoute || bestTask.score >= bestRoute.score)) {
    const href = bestTask.task.href ?? '/actions';
    const path = href.startsWith('/') ? href : `/${href}`;
    return {
      answer: `That's on your **Actions** list as “${bestTask.task.title}.”\n\nOpen **${path}** — ${bestTask.task.subtitle ?? 'your pitch workflow lives under Email → Compose or Approvals.'}`,
      suggestedActions: [`Open ${path}`, 'View all actions at /actions'],
      href: path,
      matchedRoute: null,
      matchedTask: bestTask.task.title,
    };
  }

  if (bestRoute) {
    const { route } = bestRoute;
    return {
      answer: `Head to **${route.label}** (${route.section}) — ${route.description}.\n\nOpen **${route.href}**`,
      suggestedActions: [`Open ${route.href}`],
      href: route.href,
      matchedRoute: route.href,
      matchedTask: null,
    };
  }

  if (/pitch|outreach|sponsor email|finish.*email/.test(q)) {
    return {
      answer:
        'Pitch emails live in a few places:\n\n• **Finish or start a draft** → `/outreach/compose` (or open **Email → Compose** in the sidebar)\n• **Approve a Benson draft** → `/email/approvals`\n• **See the to-do** → `/actions`\n• **Pick who to pitch** → `/sponsor-intelligence`',
      suggestedActions: [
        'Open /outreach/compose',
        'Open /email/approvals',
        'Open /actions',
      ],
      href: '/outreach/compose',
      matchedRoute: '/outreach/compose',
      matchedTask: null,
    };
  }

  if (/to[\s-]?do|todo|action center|actions list/.test(q)) {
    return {
      answer: 'Your to-do list is **Actions** — follow-ups, pitch emails, and approvals in one place.\n\nOpen **/actions**',
      suggestedActions: ['Open /actions'],
      href: '/actions',
      matchedRoute: '/actions',
      matchedTask: null,
    };
  }

  return null;
}
