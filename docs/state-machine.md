# Content State Machine

Each row in `content_items` walks the states below. State transitions are owned by exactly one n8n workflow; workers are stateless and idempotent.

## States

| State | Set by | Next worker | Notes |
|---|---|---|---|
| `planned` | `planner` | `script_writer` | Planner has decided this slot exists (date, type, industry, language) but no script yet |
| `script_drafted` | `script_writer` | `approval_gate` | Topic, hook, script, CTA written and embedded; dedup check passed |
| `script_approved` | `approval_gate` (HITL) or auto | `persona_picker` | Operator approved (or autonomy_mode='auto' bypassed the gate) |
| `script_rejected` | `approval_gate` | `script_writer` | Operator rejected with reason; worker regenerates with feedback |
| `assets_ready` | `persona_picker` | `avatar_render` | Persona chosen (existing or freshly generated); HeyGen avatar+voice IDs resolved |
| `video_generating` | `avatar_render` | (polling) | HeyGen render in flight; polling worker checks status |
| `video_ready` | `avatar_render` polling | `post_production` | Raw HeyGen MP4 downloaded to asset storage |
| `post_production` | `post_production` | (same) | Adding subtitles, captions, CTA overlays, B-roll |
| `ready_to_publish` | `post_production` | `scheduler` | Final 9:16 MP4 ready; per-platform captions generated |
| `scheduled` | `scheduler` | `publisher` | Slot picked from posting_schedule; publication rows created |
| `published` | `publisher` | — | Terminal success |
| `failed` | any worker | (manual) | Terminal failure after retries exhausted |
| `cancelled` | operator | — | Terminal — operator killed it |

## Transition rules

1. Workers query for items in their input state with `FOR UPDATE SKIP LOCKED` to allow horizontal scaling.
2. On success, workers `UPDATE state = 'next_state', updated_at = now()` and insert a `workflow_runs` row.
3. On retryable failure (rate limit, transient API error), workers increment `retry_count` and leave state unchanged. After `retry_count >= 5`, advance to `failed`.
4. On permanent failure (bad config, missing creds), workers advance directly to `failed` and write `last_error`.

## Approval gate behavior

`approval_gate` is the only worker whose behavior depends on campaign config:

```
SELECT autonomy_mode FROM campaigns WHERE id = :campaign_id;

IF autonomy_mode = 'auto':
  UPDATE content_items SET state = 'script_approved' WHERE id = :id;
ELSE:
  -- Send Slack message with Approve / Reject buttons + dashboard link
  -- Wait for webhook callback (n8n waitForWebhook)
  -- On approve:  state = 'script_approved'
  -- On reject:   state = 'script_rejected', script_rejection_reason = ...
END;
```

`manual` mode adds approval gates at additional transitions (script + video + publish). For Phase 1 we only implement the script gate.

## Recovery patterns

- **Stuck in `video_generating` for >30 min**: HeyGen polling worker treats this as a transient failure and retries.
- **Item in `failed`**: operator can dashboard-click "retry from state X". This sets state to X-1 and clears `last_error`.
- **Bulk re-run**: `UPDATE content_items SET state = 'planned' WHERE id IN (...)` re-enters the pipeline. Idempotency in workers makes this safe.
