import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { CommandCenterPanel } from './command-center-panel';

export default function EditorPage() {
  if (!isOpportunitiesUiEnabled) {
    notFound();
  }

  return <CommandCenterPanel />;
}
