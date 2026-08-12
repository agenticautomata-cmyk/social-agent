import { DiscoveriesPanel } from './discoveries-panel';

export default function DiscoveriesPage() {
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Discoveries</h1>
        <p className="page-subtitle">
          Tell Benson what you want more of, less of, or not at all.
        </p>
      </header>
      <DiscoveriesPanel />
    </div>
  );
}
