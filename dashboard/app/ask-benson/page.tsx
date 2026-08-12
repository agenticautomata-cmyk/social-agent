import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { BensonWorkspace } from '../../components/benson-workspace';

export default function AskBensonPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return <BensonWorkspace />;
}
