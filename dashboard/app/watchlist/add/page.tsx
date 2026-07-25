import { AddSourcePanel } from './add-source-panel';

export default function AddWatchlistSourcePage() {
  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Add source</h1>
        <p className="page-subtitle">Paste a page, account, post, feed, or document URL.</p>
      </header>
      <AddSourcePanel />
    </div>
  );
}
