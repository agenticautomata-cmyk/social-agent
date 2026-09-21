import { OpeningsRadarPanel } from './openings-radar-panel';

export default function OpeningsRadarPage() {
  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Openings Radar</h1>
        <p className="page-subtitle">
          Establishments, relocations, and soft openings discovered from editorial and social
          sources — before they become Opportunities or Calendar events.
        </p>
      </header>
      <OpeningsRadarPanel />
    </div>
  );
}
