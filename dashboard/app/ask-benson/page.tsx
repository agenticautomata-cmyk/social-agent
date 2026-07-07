import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { BensonChatPanel } from '../../components/benson-chat-panel';

export default function AskBensonPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold lowercase">ask benson</h1>
        <p className="text-sm text-paper-muted mt-2 max-w-3xl">
          Chat with Benson about your analytics, content, sponsors, posting times, and
          recommendations. Every answer is grounded in your live creator data.
        </p>
      </div>
      <BensonChatPanel variant="page" pageContext="/ask-benson" />
    </div>
  );
}
