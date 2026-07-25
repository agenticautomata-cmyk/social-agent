export const DISCOVERY_SUBSCRIPTION_STATUSES = [
  'signup_submitted',
  'awaiting_confirmation',
  'confirmation_received',
  'verified',
  'verification_failed',
  'manual_action_required',
  'active',
  'unsubscribed',
] as const;

export type DiscoverySubscriptionStatus = (typeof DISCOVERY_SUBSCRIPTION_STATUSES)[number];

export const DISCOVERY_MESSAGE_KINDS = [
  'opportunity_signal',
  'discovery_subscription_confirmation',
  'verified_source_newsletter',
] as const;

export type DiscoveryMessageKind = (typeof DISCOVERY_MESSAGE_KINDS)[number];

/** Legitimate email-service providers used for list confirmations. */
export const EMAIL_SERVICE_PROVIDER_DOMAINS = new Set([
  'mailchimp.com',
  'list-manage.com',
  'us1.list-manage.com',
  'us2.list-manage.com',
  'us3.list-manage.com',
  'us4.list-manage.com',
  'us5.list-manage.com',
  'us6.list-manage.com',
  'us7.list-manage.com',
  'us8.list-manage.com',
  'us9.list-manage.com',
  'us10.list-manage.com',
  'us11.list-manage.com',
  'us12.list-manage.com',
  'us13.list-manage.com',
  'us14.list-manage.com',
  'us15.list-manage.com',
  'us16.list-manage.com',
  'us17.list-manage.com',
  'us18.list-manage.com',
  'us19.list-manage.com',
  'us20.list-manage.com',
  'us21.list-manage.com',
  'constantcontact.com',
  'confirmsubscription.com',
  'sendgrid.net',
  'sendgrid.com',
  'beehiiv.com',
  'substack.com',
  'campaign-archive.com',
  'createsend.com',
  'cmail1.com',
  'cmail2.com',
  'hubspotlinks.com',
  'click.email',
  'e.customeriomail.com',
  'sendinblue.com',
  'brevo.com',
  'klaviyo.com',
  'mailgun.net',
  'sparkpostmail.com',
]);

export const URL_SHORTENER_DOMAINS = new Set([
  'bit.ly',
  't.co',
  'tinyurl.com',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'rb.gy',
  'cutt.ly',
]);

export const CONFIRMATION_WINDOW_DAYS = 14;
export const VERIFICATION_CODE_EXPIRY_HOURS = 72;
export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 512_000;
export const FETCH_TIMEOUT_MS = 15_000;

export const CONFIRMATION_SUBJECT_PATTERNS = [
  /\bconfirm(?:ation)?\s+(?:your\s+)?(?:email|subscription|registration|signup|sign-up|address|list)\b/i,
  /\bverify(?:\s+your)?\s+(?:email|subscription|registration|address)\b/i,
  /\bcomplete\s+your\s+(?:signup|sign-up|registration|subscription)\b/i,
  /\bactivate\s+your\s+(?:subscription|account|membership|list)\b/i,
  /\bdouble\s+opt-?in\b/i,
  /\bconfirm\s+email\b/i,
  /\bone\s+(?:more\s+)?step\b/i,
  /\bplease\s+confirm\b/i,
];

export const CONFIRMATION_BODY_PATTERNS = [
  /\bconfirm(?:\s+your)?\s+(?:subscription|email|registration|signup|sign-up|address)\b/i,
  /\bverify(?:\s+your)?\s+(?:email|subscription|registration|address)\b/i,
  /\bactivate\s+your\s+(?:subscription|membership|list)\b/i,
  /\bdouble\s+opt-?in\b/i,
  /\benter\s+(?:this\s+)?verification\s+code\b/i,
  /\bclick(?:\s+the\s+link|\s+below|\s+here)\s+to\s+confirm\b/i,
];

export const BLOCKED_CONFIRMATION_PATTERNS = [
  /\bpassword\s+reset\b/i,
  /\breset\s+your\s+password\b/i,
  /\bchange\s+your\s+password\b/i,
  /\bpayment\s+confirm/i,
  /\bpurchase\s+confirm/i,
  /\border\s+confirm/i,
  /\breceipt\s+for\s+your\s+(?:order|purchase)\b/i,
  /\boauth\b/i,
  /\bauthorize\s+(?:access|permissions|app)\b/i,
  /\bgrant\s+access\b/i,
  /\bidentity\s+verif/i,
  /\bbank(?:ing)?\s+verif/i,
  /\bfinancial\s+verif/i,
  /\bgovernment\s+id\b/i,
  /\bmedical\s+record/i,
  /\bphone\s+(?:number\s+)?verif/i,
  /\bsms\s+verif/i,
  /\bcaptcha\b/i,
  /\bdownload\s+(?:the\s+)?(?:app|software|attachment)\b/i,
  /\bwire\s+transfer\b/i,
  /\bcredit\s+card\b/i,
  /\bsocial\s+security\b/i,
];

export const UNSAFE_LINK_PATH_PATTERNS = [
  /\/oauth/i,
  /\/authorize/i,
  /\/login\/oauth/i,
  /password/i,
  /reset/i,
  /payment/i,
  /checkout/i,
  /billing/i,
  /subscribe\/paid/i,
  /account\/recover/i,
  /\.(exe|dmg|zip|apk|msi)(\?|$)/i,
];
