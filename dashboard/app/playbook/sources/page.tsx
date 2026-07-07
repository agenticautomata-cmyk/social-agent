import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { PlaybookSourcesPanel } from './playbook-sources-panel';

export default function PlaybookSourcesPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <PlaybookSourcesPanel />;
}
