import { ShootStartPanel } from './shoot-panels';

export default function ShootPage() {
  return (
    <div className="page-shell space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="page-title gradient-text">Shoot mode</h1>
        <p className="page-subtitle">Field workflow for on-location filming</p>
      </div>
      <ShootStartPanel />
    </div>
  );
}
