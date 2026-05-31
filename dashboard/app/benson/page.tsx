import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { BensonHubPanel } from './benson-hub-panel';

export default function BensonPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return <BensonHubPanel />;
}
