import { CalendarPanel } from './calendar-panel';

export const dynamic = 'force-dynamic';

export default function CalendarPage() {
  return (
    <div className="space-y-12">
      <section>
        <div className="section-mark mb-3">
          <span>// § creator calendar</span>
        </div>
        <h1 className="text-5xl font-bold tracking-tightest cursor lowercase">calendar</h1>
        <p className="text-paper-muted mt-2 italic">
          // Benson plans here first — Google Calendar only gets what you approve
        </p>
      </section>
      <CalendarPanel />
    </div>
  );
}
