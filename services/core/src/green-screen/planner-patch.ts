import type { CoverageFormat } from '../coverage-format/constants.js';

export type GreenScreenPlannerPatch = {
  greenScreenStatus: 'prepared' | 'completed';
  status?: 'planned' | 'covered';
  visitReminderAt?: Date | null;
  followUpAt?: Date | null;
};

/** Planner updates when green screen package status changes — keeps visit-later workflow active. */
export function buildGreenScreenPlannerPatch(input: {
  coverageFormat: CoverageFormat | null;
  status: 'prepared' | 'completed';
  eventStartsAt: Date | null;
}): GreenScreenPlannerPatch {
  const patch: GreenScreenPlannerPatch = { greenScreenStatus: input.status };

  if (input.coverageFormat === 'green_screen_then_visit') {
    patch.visitReminderAt = input.eventStartsAt ?? null;
    if (input.status === 'completed') {
      patch.status = 'planned';
      patch.followUpAt = input.eventStartsAt ?? null;
    }
  } else if (input.coverageFormat === 'green_screen' && input.status === 'completed') {
    patch.status = 'covered';
  }

  return patch;
}
