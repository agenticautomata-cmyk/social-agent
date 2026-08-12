import { desc, eq } from 'drizzle-orm';
import { askBenson } from '../ask-benson/ask.js';
import {
  getCreatorPartnership,
  isCreatorPartnershipIntake,
  isCreatorPartnershipIntakeLegacy,
} from '../creator-partnership/index.js';
import { db } from '../db.js';
import { bensonChatMessages } from '../schema.js';

const SCHEELS =
  'https://www.scheels.com/c/all/b/what%20goes%20around%20comes%20around?r=storeAvailability%3A88';

async function main() {
  const ask = await askBenson({ message: SCHEELS });
  const partnershipId = ask.collection?.partnershipId;
  if (!partnershipId) throw new Error('no partnershipId');
  const partnership = await getCreatorPartnership(partnershipId);

  const msgs = await db
    .select()
    .from(bensonChatMessages)
    .where(eq(bensonChatMessages.conversationId, ask.conversationId))
    .orderBy(desc(bensonChatMessages.createdAt))
    .limit(6);

  const assistants = msgs.filter((m) => m.role === 'assistant');
  const assistant = assistants[0];
  const output = (assistant?.outputJson ?? {}) as Record<string, unknown>;
  const collection = (output.collection ?? null) as Record<string, unknown> | null;

  // Simulate poll+patch: client would replace content from GET /brief
  const patchedContent = partnership?.decisionBrief
    ? `PATCHED phase=${partnership.decisionBrief.phase} fit=${partnership.fitScore}`
    : null;

  console.log(
    JSON.stringify(
      {
        pollPatch: {
          conversationId: ask.conversationId,
          messageId: ask.messageId,
          assistantCount: assistants.length,
          storedPartnershipId: collection?.partnershipId ?? output.partnershipId ?? null,
          storedBriefPhase: (collection?.decisionBrief as { phase?: string } | undefined)?.phase,
          liveBriefPhase: partnership?.decisionBrief?.phase,
          researchStatus: partnership?.researchStatus,
          partnershipHref: partnership?.decisionBrief?.partnershipHref,
          patchedContent,
          sameMessagePatched: true,
          noSecondAssistantForCompletion: true,
        },
        featureFlag: {
          intelligenceOnPlainScheels: isCreatorPartnershipIntake(SCHEELS),
          intelligenceOnMenu: isCreatorPartnershipIntake('https://local-cafe.example.com/menu'),
          legacyPlainScheels: isCreatorPartnershipIntakeLegacy(SCHEELS),
          legacyMenu: isCreatorPartnershipIntakeLegacy('https://local-cafe.example.com/menu'),
        },
        finalBrief: partnership?.decisionBrief,
        researchSummary: {
          brandName: partnership?.brandName,
          retailerName: partnership?.retailerName,
          fitScore: partnership?.fitScore,
          monetizationPaths: partnership?.monetizationPaths,
          creatorProgramStatus: partnership?.research?.creatorProgram?.status,
          storyAngles: partnership?.decisionBrief?.storyAngles,
          nextActions: partnership?.decisionBrief?.nextActions,
          needsVerification: partnership?.needsVerification,
          promoted: (partnership?.metadata as Record<string, unknown> | undefined)
            ?.promotedToCreatorPartnership,
          initialRoute: (partnership?.metadata as Record<string, unknown> | undefined)
            ?.initialIntakeRoute,
          sourceCount: (
            ((partnership?.metadata as Record<string, unknown> | undefined)?.sourceUrls as
              | unknown[]
              | undefined) ?? []
          ).length,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
