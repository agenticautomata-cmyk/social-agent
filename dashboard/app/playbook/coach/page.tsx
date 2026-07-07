import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../../lib/opportunities-ui';
import { PlaybookCoachPanel } from './playbook-coach-panel';

export default function PlaybookCoachPage() {
  if (!isOpportunitiesUiEnabled) notFound();
  return <PlaybookCoachPanel />;
}
