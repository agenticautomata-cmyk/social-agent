import { DraftInboxPanel } from './draft-inbox-panel';

export default function DraftsPage() {
  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3">
          <span>// §1 unposted drafts</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">drafts</h1>
        <p className="text-paper-muted mt-2 italic">
          // unposted videos Benson has watched — share from Ask Benson or your phone
        </p>
      </section>
      <DraftInboxPanel />
    </div>
  );
}
