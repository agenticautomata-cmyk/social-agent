import { ControlTowerPanel } from './control-tower-panel';

export default function ControlTowerPage() {
  const adminKey = process.env.BENSON_CONTROL_TOWER_KEY ?? undefined;
  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="page-title gradient-text">Production control tower</h1>
        <p className="page-subtitle">Workers, dependencies, and operational health</p>
      </div>
      <ControlTowerPanel adminKey={adminKey} />
    </div>
  );
}
