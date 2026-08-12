import { headers } from 'next/headers';
import { ControlTowerPanel } from './control-tower-panel';
import { evaluateControlTowerAccess } from '../../../lib/control-tower-auth.server';

export default async function ControlTowerPage() {
  const access = evaluateControlTowerAccess(await headers());

  if (!access.authorized) {
    return (
      <div className="page-shell space-y-6">
        <div>
          <h1 className="page-title gradient-text">Production control tower</h1>
          <p className="page-subtitle">Workers, dependencies, and operational health</p>
        </div>
        <div className="glass-panel p-6 space-y-2">
          <h2 className="text-lg font-bold">Admin access required</h2>
          <p className="text-sm text-paper-dim">
            Control Tower is limited to authorized Benson operators. Normal Kellie navigation still works
            without this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="page-title gradient-text">Production control tower</h1>
        <p className="page-subtitle">Workers, dependencies, and operational health</p>
      </div>
      <ControlTowerPanel />
    </div>
  );
}
