import Link from 'next/link';

export default function EarlySignalsHelpPage() {
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-6 prose prose-invert prose-sm">
      <header>
        <h1 className="page-title">Early Signals help</h1>
        <p className="page-subtitle">How Benson finds KC leads before local news.</p>
      </header>

      <section className="glass-panel p-5 space-y-3 text-sm text-paper-dim">
        <h2 className="text-base font-semibold text-paper-ink">What early signals are</h2>
        <p>
          A <strong>signal</strong> is a lead — a permit, hiring post, “coming soon” page, or calendar change. It is not
          confirmed until Benson collects evidence or you verify it.
        </p>
        <p>
          An <strong>opportunity</strong> is when you approve a signal (or Benson has enough proof) and it becomes a
          normal inventory item you can plan, film, and post.
        </p>
      </section>

      <section className="glass-panel p-5 space-y-3 text-sm text-paper-dim">
        <h2 className="text-base font-semibold text-paper-ink">Confidence & urgency</h2>
        <p>Every score shows its factors on the detail page — no mystery AI numbers.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Low / weak</strong> — stored, no alert</li>
          <li><strong>Medium + early opportunity</strong> — worth watching</li>
          <li><strong>High / breaking</strong> — push + Telegram when preferences allow</li>
          <li><strong>Confirmed</strong> — official first-party announcement or multiple consistent sources</li>
        </ul>
      </section>

      <section className="glass-panel p-5 space-y-3 text-sm text-paper-dim">
        <h2 className="text-base font-semibold text-paper-ink">What to do</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Review sources and evidence on the signal detail page</li>
          <li>Approve as opportunity when you are ready to act</li>
          <li>Dismiss junk or snooze noisy items</li>
          <li>Use recommended actions (Weekend 5, Before You Go KC, outreach first, etc.)</li>
          <li>Adjust alerts at <Link href="/settings/alerts" className="text-accent">Alert settings</Link></li>
        </ul>
        <p>Permits and job listings are <em>leads</em>, not automatic announcements.</p>
      </section>

      <Link href="/signals" className="btn-ghost text-xs inline-flex">← Early Signals</Link>
    </div>
  );
}
