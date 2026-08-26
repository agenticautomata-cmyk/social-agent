/**
 * Voice read of the operator Weekend List.
 * Authority remains planner_items.listName = 'Weekend' via loadWeekendList().
 * No membership writes.
 */
import { loadWeekendList, type WeekendListResponse } from '../creator-calendar/weekend-list.js';
import { formatWeekendListSpeech, stripVoiceUnsafeText } from './formatter.js';
import {
  type VoiceWeekendListItem,
  type VoiceWeekendListResponse,
} from './types.js';

const DAY_SPOKEN: Record<string, string> = {
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export function shapeWeekendListVoice(list: WeekendListResponse): VoiceWeekendListResponse {
  const items: VoiceWeekendListItem[] = list.days.flatMap((day) =>
    day.items.map((item) => ({
      title: stripVoiceUnsafeText(item.title),
      day: DAY_SPOKEN[day.key] ?? day.heading,
      time: item.startTimeLabel,
      venue: item.venue ? stripVoiceUnsafeText(item.venue) : null,
    })),
  );
  return {
    operation: 'weekend_list',
    count: list.selectedCount,
    items,
    speech: formatWeekendListSpeech({ count: list.selectedCount, items }),
  };
}

export async function loadWeekendListVoice(
  now: Date = new Date(),
  load: (now: Date) => Promise<WeekendListResponse> = loadWeekendList,
): Promise<VoiceWeekendListResponse> {
  const list = await load(now);
  return shapeWeekendListVoice(list);
}
