import { notFound } from 'next/navigation';
import { isOpportunitiesUiEnabled } from '../../lib/opportunities-ui';
import { MyInfoPanel } from './my-info-panel';

export default function MyInfoPage() {
  if (!isOpportunitiesUiEnabled) notFound();

  return (
    <main className="page-shell max-w-5xl">
      <div className="section-mark mb-3"><span>// § my info</span></div>
      <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">my info</h1>
      <p className="text-paper-muted mt-2 max-w-2xl">
        Routed contact addresses, Gmail send-as, and where Benson uses each one.
      </p>
      <div className="mt-8">
        <MyInfoPanel />
      </div>
    </main>
  );
}
