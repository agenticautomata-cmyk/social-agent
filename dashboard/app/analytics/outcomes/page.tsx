import { OutcomesAnalyticsPanel } from './outcomes-analytics-panel';

export default function OutcomesAnalyticsPage() {
  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="page-title gradient-text">Outcome analytics</h1>
        <p className="page-subtitle">Recommendation → shoot → post → sponsor → revenue</p>
      </div>
      <OutcomesAnalyticsPanel />
    </div>
  );
}
