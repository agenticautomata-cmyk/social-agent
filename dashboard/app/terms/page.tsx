import type { Metadata } from 'next';
import { PublicPage } from '../../components/public-page';

export const metadata: Metadata = {
  title: 'Terms of Service — Benson',
  description: 'Terms governing use of the Benson creator assistant.',
};

export default function TermsPage() {
  return (
    <PublicPage
      title="Terms of Service"
      description="Last updated: June 12, 2026. By using Benson you agree to these terms."
    >
      <p>
        Benson is provided as a private creator operations tool. These terms apply to access and use
        of the Benson website and dashboard at benson.kckellie.com.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Use Benson only for lawful content planning and creator operations.</li>
        <li>Do not attempt to disrupt, reverse engineer, or abuse the service.</li>
        <li>Connect third-party accounts (such as TikTok) only if you have the right to do so.</li>
      </ul>

      <h2>Third-party services</h2>
      <p>
        Benson integrates with third-party platforms including TikTok. Your use of those platforms is
        also governed by their own terms and privacy policies. Benson is not affiliated with or
        endorsed by TikTok.
      </p>

      <h2>No warranty</h2>
      <p>
        Benson is provided &quot;as is&quot; during pre-release development. Analytics, recommendations,
        and opportunity data may be incomplete or inaccurate. Do not rely on Benson as the sole basis
        for business, legal, or financial decisions.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Benson and its operators are not liable for indirect,
        incidental, or consequential damages arising from use of the service.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms from time to time. Continued use after changes are posted
        constitutes acceptance of the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href="mailto:support@kckellie.com">support@kckellie.com</a>
      </p>
    </PublicPage>
  );
}
