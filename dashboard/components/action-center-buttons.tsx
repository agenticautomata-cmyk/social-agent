'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ActionCenterItem, ExecuteActionBody } from '../lib/action-center-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const PIPELINE_STAGES = [
  'lead',
  'contacted',
  'interested',
  'meeting_scheduled',
  'proposal_sent',
  'negotiating',
] as const;

export async function executeAction(body: ExecuteActionBody): Promise<void> {
  const res = await fetch(`${API}/api/action-center/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
}

export function ActionCenterButtons({
  item,
  onDone,
}: {
  item: ActionCenterItem;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [dueInput, setDueInput] = useState('');
  const [stage, setStage] = useState('contacted');
  const [error, setError] = useState<string | null>(null);

  async function run(body: ExecuteActionBody, key: string) {
    setBusy(key);
    setError(null);
    try {
      await executeAction(body);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {item.actions.map((action) => {
          if (action.href) {
            return (
              <Link
                key={action.kind}
                href={action.href}
                className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink"
              >
                {action.label}
              </Link>
            );
          }

          if (action.kind === 'move_opportunity_stage' && item.entityType === 'pipeline') {
            return null;
          }

          return (
            <button
              key={action.kind}
              type="button"
              disabled={!!busy}
              onClick={() => {
                if (action.kind === 'assign_due_date' || action.kind === 'schedule_follow_up') {
                  const due = dueInput || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
                  void run(
                    {
                      action: action.kind,
                      entityType: item.entityType,
                      entityId: item.entityId,
                      dueDate: due,
                      followUpAt: `${due}T12:00:00.000Z`,
                    },
                    action.kind,
                  );
                  return;
                }
                if (action.kind === 'create_planner_item' && item.entityType === 'planner') {
                  void run(
                    {
                      action: 'create_planner_item',
                      entityType: 'planner',
                      entityId: item.entityId,
                      plannerAction: 'plan_today',
                    },
                    action.kind,
                  );
                  return;
                }
                void run(
                  {
                    action: action.kind,
                    entityType: item.entityType,
                    entityId: item.entityId,
                  },
                  action.kind,
                );
              }}
              className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-50"
            >
              {busy === action.kind ? '…' : action.label}
            </button>
          );
        })}
      </div>

      {item.entityType === 'pipeline' &&
        item.actions.some((a) => a.kind === 'move_opportunity_stage') && (
          <div className="flex flex-wrap gap-2 items-center text-2xs">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="border border-paper-edge px-1 py-0.5 bg-paper"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                void run(
                  {
                    action: 'move_opportunity_stage',
                    entityType: 'pipeline',
                    entityId: item.entityId,
                    status: stage,
                  },
                  'stage',
                )
              }
              className="border border-paper-edge px-2 py-1 hover:border-paper-ink"
            >
              update stage
            </button>
          </div>
        )}

      {(item.actions.some((a) => a.kind === 'assign_due_date') ||
        item.actions.some((a) => a.kind === 'schedule_follow_up')) && (
        <label className="flex gap-2 items-center text-2xs text-paper-muted">
          <span>due</span>
          <input
            type="date"
            value={dueInput}
            onChange={(e) => setDueInput(e.target.value)}
            className="border border-paper-edge px-1 py-0.5 bg-paper"
          />
        </label>
      )}

      {error && <p className="text-2xs text-accent">// {error}</p>}
    </div>
  );
}
