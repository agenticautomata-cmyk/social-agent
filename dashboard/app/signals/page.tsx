import { SignalsPanel } from './signals-panel';

export default function SignalsPage() {
  return (
    <div className="page-shell max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="page-title">Early Signals</h1>
        <p className="page-subtitle">KC openings, closings, and changes before local news.</p>
      </header>
      <SignalsPanel />
    </div>
  );
}
