import { VisualStudioPanel } from './visual-studio-panel';

export const dynamic = 'force-dynamic';

export default function VisualStudioPage() {
  return (
    <div className="space-y-8">
      <VisualStudioPanel />
    </div>
  );
}
