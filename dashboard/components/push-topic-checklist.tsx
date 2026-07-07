'use client';

import type { PushTopic } from '../lib/use-push-notifications';

export function PushTopicChecklist({
  topics,
  selected,
  masterEnabled,
  disabled,
  onToggle,
  compact,
}: {
  topics: PushTopic[];
  selected: Record<string, boolean>;
  masterEnabled: boolean;
  disabled?: boolean;
  onToggle: (topicId: string, enabled: boolean) => void;
  compact?: boolean;
}) {
  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'}>
      {topics.map((topic) => (
        <li key={topic.id} className="flex items-start gap-3">
          <input
            type="checkbox"
            id={`push-topic-${topic.id}`}
            checked={selected[topic.id] ?? false}
            disabled={disabled || !masterEnabled}
            onChange={(e) => onToggle(topic.id, e.target.checked)}
            className="mt-1 h-4 w-4 accent-accent shrink-0"
          />
          <label htmlFor={`push-topic-${topic.id}`} className="min-w-0 cursor-pointer">
            <span className={`block ${compact ? 'text-xs font-medium' : 'text-sm font-medium'}`}>
              {topic.label}
            </span>
            {!compact && (
              <span className="text-xs text-paper-muted">{topic.description}</span>
            )}
          </label>
        </li>
      ))}
    </ul>
  );
}
