import type { Metadata } from 'next';
import { PublicPage } from '../../components/public-page';

export const metadata: Metadata = {
  title: 'Privacy Policy — Benson',
  description: 'How Benson collects, uses, and stores data for the Kellie KC creator assistant.',
};

export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy Policy"
      description="Last updated: June 12, 2026. This policy describes how Benson handles information."
    >
      <p>
        Benson is a private creator operations tool for Kellie KC. This site and application are
        operated for internal content planning and analytics.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>TikTok account data (with your consent):</strong> When you connect TikTok through
          OAuth, Benson may access profile information, video metadata, and performance metrics
          permitted by the scopes you approve.
        </li>
        <li>
          <strong>Usage data:</strong> Basic logs needed to operate the service (errors, request
          timestamps, sync status).
        </li>
        <li>
          <strong>Content you add:</strong> Notes, planner items, sponsor records, and uploaded
          images you submit inside the dashboard.
        </li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Display analytics and posting insights inside the dashboard.</li>
        <li>Recommend Kansas City content opportunities and sponsor leads.</li>
        <li>Improve reliability of data sync and planning workflows.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        We do not sell personal information. Data is shared only with service providers required to
        run Benson (hosting, database, TikTok API) and only as needed to operate the product.
      </p>

      <h2>Retention and security</h2>
      <p>
        Data is stored on secured infrastructure. You may disconnect TikTok at any time from the
        analytics settings page, which stops future syncs. Historical records may remain until
        deleted from the dashboard.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Disconnect TikTok OAuth to revoke API access.</li>
        <li>Request correction or deletion of stored dashboard data by contacting us.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:support@kckellie.com">support@kckellie.com</a>
      </p>
    </PublicPage>
  );
}
