import Link from 'next/link';
import { GmailConnectionPanel } from '../../../components/gmail-connection-panel';
import { GoogleCalendarConnectionPanel } from './google-calendar-connection-panel';

export default function CalendarSettingsPage() {
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-10">
      <header>
        <Link href="/calendar" className="btn-ghost text-xs inline-flex mb-4">
          ← Calendar
        </Link>
        <h1 className="page-title">Calendar settings</h1>
        <p className="page-subtitle">Gmail and Google Calendar are authorized separately.</p>
      </header>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Gmail</h2>
        <GmailConnectionPanel />
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Google Calendar</h2>
        <GoogleCalendarConnectionPanel />
      </section>
    </div>
  );
}
