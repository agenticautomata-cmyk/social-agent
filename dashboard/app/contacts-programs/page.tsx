import { Suspense } from 'react';
import { ContactsProgramsPanel } from './contacts-programs-panel';

export default function ContactsProgramsPage() {
  return (
    <main className="studio-page-shell max-w-3xl mx-auto px-4 py-6">
      <Suspense fallback={<p className="text-sm text-paper-muted italic">Loading Contacts & Programs…</p>}>
        <ContactsProgramsPanel />
      </Suspense>
    </main>
  );
}
