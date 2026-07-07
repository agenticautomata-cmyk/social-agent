import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { PlaybookOverviewPanel } from './playbook-overview-panel';

export default function PlaybookPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <PlaybookOverviewPanel />;
}
