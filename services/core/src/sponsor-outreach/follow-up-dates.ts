import { env } from '../env.js';

export function outreachFollowUpDays(): number {
  const days = env.OUTREACH_FOLLOW_UP_DAYS;
  return Number.isFinite(days) && days > 0 ? days : 5;
}

export function computeFollowUpDueAt(from: Date = new Date()): Date {
  const due = new Date(from);
  due.setDate(due.getDate() + outreachFollowUpDays());
  return due;
}
