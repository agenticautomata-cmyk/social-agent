import {
  approveOutreachEmail,
  simulateSendOutreachEmail,
  setOutreachFollowUpDue,
} from '../sponsor-outreach/outreach.js';
import {
  sendOutreachEmail,
  getOutreachSendConfig,
} from '../sponsor-outreach/send.js';
import { updateSponsorContact } from '../sponsor-outreach/contacts.js';
import {
  getSponsorOpportunity,
  updateSponsorOpportunity,
} from '../sponsor-pipeline/opportunities.js';
import { getSponsorContact } from '../sponsor-outreach/contacts.js';
import { upsertPlannerItem } from '../content-planner/items.js';
import { createDraftOutreachFromOpportunity } from '../sponsor-intelligence/actions.js';
import type { SponsorPipelineStatus } from '../sponsor-pipeline/constants.js';
import type { ExecuteActionInput, ExecuteActionResult } from './types.js';

export async function executeActionCenterAction(
  input: ExecuteActionInput,
): Promise<ExecuteActionResult> {
  const { action, entityType, entityId } = input;

  switch (action) {
    case 'start_pitch': {
      if (entityType !== 'planner') {
        throw new Error('start_pitch requires planner entity (content item id)');
      }
      const { draftSponsorOutreachFromOpportunity } = await import('../sponsor-outreach/benson-drafting/draft.js');
      const result = await draftSponsorOutreachFromOpportunity(entityId);
      if (result.emailId) {
        return {
          ok: true,
          action,
          entityType: 'outreach',
          entityId: result.emailId,
          message: 'Benson drafted a pitch for your approval',
          href: `/email/approvals?id=${result.emailId}`,
        };
      }
      const { contact, emailId } = await createDraftOutreachFromOpportunity(entityId);
      return {
        ok: true,
        action,
        entityType: 'outreach',
        entityId: emailId,
        message: `Draft pitch ready for ${contact.businessName}`,
        href: `/email/approvals?id=${emailId}`,
      };
    }

    case 'send_email': {
      if (entityType !== 'outreach') {
        throw new Error('send_email requires outreach entity');
      }
      const config = await getOutreachSendConfig();
      if (config.mode === 'live' && config.liveReady) {
        await sendOutreachEmail(entityId);
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Email sent via live provider',
        };
      }
      await simulateSendOutreachEmail(entityId);
      return {
        ok: true,
        action,
        entityType,
        entityId,
        message: 'Email sent (simulated)',
      };
    }

    case 'approve_email': {
      if (entityType !== 'outreach') {
        throw new Error('approve_email requires outreach entity');
      }
      await approveOutreachEmail(entityId);
      return {
        ok: true,
        action,
        entityType,
        entityId,
        message: 'Email approved for send',
      };
    }

    case 'schedule_follow_up':
    case 'assign_due_date': {
      let due = input.dueDate ?? input.followUpAt;
      if (!due && action === 'schedule_follow_up') {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        due = d.toISOString();
      }
      if (!due && action === 'assign_due_date') {
        throw new Error('dueDate or followUpAt required');
      }

      if (entityType === 'planner') {
        const iso = due!.includes('T') ? due! : `${due!}T12:00:00.000Z`;
        await upsertPlannerItem(entityId, {
          dueDate: due!.slice(0, 10),
          followUpAt: iso,
        });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Planner due date updated',
        };
      }

      if (entityType === 'pipeline') {
        await updateSponsorOpportunity(entityId, {
          dueDate: due ?? null,
        });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Pipeline due date updated',
        };
      }

      if (entityType === 'outreach') {
        await setOutreachFollowUpDue(entityId, due ?? null);
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Outreach follow-up due set',
        };
      }

      if (entityType === 'sponsor_contact') {
        await updateSponsorContact(entityId, {
          nextFollowUpAt: due ?? null,
        });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Sponsor follow-up scheduled',
        };
      }

      throw new Error(`Cannot set due date on ${entityType}`);
    }

    case 'mark_covered': {
      if (entityType === 'planner') {
        await upsertPlannerItem(entityId, { action: 'mark_covered' });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Marked covered in planner',
        };
      }
      throw new Error('mark_covered only supported for planner items');
    }

    case 'move_opportunity_stage': {
      if (entityType !== 'pipeline') {
        throw new Error('move_opportunity_stage requires pipeline entity');
      }
      if (!input.status) {
        throw new Error('status required for move_opportunity_stage');
      }
      await updateSponsorOpportunity(entityId, {
        status: input.status as SponsorPipelineStatus,
      });
      return {
        ok: true,
        action,
        entityType,
        entityId,
        message: `Stage updated to ${input.status}`,
      };
    }

    case 'create_planner_item': {
      if (entityType === 'planner') {
        await upsertPlannerItem(entityId, {
          action: input.plannerAction ?? 'plan_today',
          listName: input.listName,
        });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Planner item updated',
        };
      }
      if (entityType === 'pipeline') {
        const opp = await getSponsorOpportunity(entityId);
        if (!opp) throw new Error('Pipeline opportunity not found');
        const contact = await getSponsorContact(opp.sponsorContactId);
        if (!contact?.sourceOpportunityId) {
          throw new Error('No source opportunity linked to this sponsor');
        }
        await upsertPlannerItem(contact.sourceOpportunityId, {
          action: input.plannerAction ?? 'save',
          listName: input.listName ?? opp.plannerListName ?? 'Sponsors',
        });
        return {
          ok: true,
          action,
          entityType,
          entityId,
          message: 'Added sponsor content to planner',
        };
      }
      throw new Error('create_planner_item requires planner or pipeline entity');
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
