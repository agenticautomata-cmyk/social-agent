# n8n Workflows

These workflows demonstrate the orchestration layer described in [../ARCHITECTURE.md](../ARCHITECTURE.md). The actual heavy lifting (LLM calls, video generation, post-production, publishing) lives in [services/workers](../services/workers) — they poll the database state machine directly. n8n's role here is:

- **Cron triggers** that kick off the planner on a schedule
- **Approval routing** — push HITL items to Slack with approve/reject buttons
- **External webhook receivers** — for IG/TikTok OAuth callbacks and post-back-events

You can run *either* the n8n workflows *or* the workers — they each consume the same API. Running both lets the workflows handle scheduling/notifications while workers do the work.

## Importing

```bash
# n8n CLI inside the container
docker compose exec n8n n8n import:workflow --input=/workflows/01-planner-cron.json
docker compose exec n8n n8n import:workflow --input=/workflows/02-approval-slack.json
docker compose exec n8n n8n import:workflow --input=/workflows/03-publishing-monitor.json
```

Or open <http://localhost:5678> → menu → Import from File.

## Files

| File | What |
|---|---|
| `01-planner-cron.json` | Daily 06:00 UTC: hits `POST /api/planner/run` to plan the next week across all active campaigns |
| `02-approval-slack.json` | Every 30 min: fetches pending approvals, posts each as a Slack message with approve/reject buttons |
| `03-publishing-monitor.json` | Every hour: checks failed publications and posts an alert to Slack if any |

## Why both n8n and TS workers?

The TS workers are the real production path — they run as a long-lived process, scale horizontally, and own the state machine. The n8n workflows show the orchestration layer **as a portfolio artifact** so reviewers can see the high-level flow visually. In a real deployment you'd pick one. Both work.
