import { PartnershipsPanel } from './partnerships-panel';

export default function PartnershipsPage() {
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Creator Partnerships</h1>
        <p className="page-subtitle">
          Benson researches brand fit, creator programs, local filming options, and builds Creator Plays — not just inventory rows.
        </p>
      </header>
      <PartnershipsPanel />
    </div>
  );
}
