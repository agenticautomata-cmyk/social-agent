import { WatchlistPanel } from './watchlist-panel';

export default function WatchlistPage() {
  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Watchlist</h1>
        <p className="page-subtitle">
          Add a source once — Benson watches for new posts, pages, flyers, and documents.
        </p>
      </header>
      <WatchlistPanel />
    </div>
  );
}
