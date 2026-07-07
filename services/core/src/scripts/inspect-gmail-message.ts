import { gmailApiFetch, headerValue } from '../gmail-inbox/client.js';

async function main() {
  const messageId = process.argv[2] ?? '19f2a269764cc5a3';
  const msg = await gmailApiFetch<{
    labelIds?: string[];
    snippet?: string;
    payload?: { headers?: Array<{ name?: string; value?: string }> };
  }>(`/messages/${messageId}?format=full`);

  const headers = msg.payload?.headers ?? [];
  console.log('=== Sent message headers ===');
  for (const h of ['From', 'To', 'Subject', 'Date', 'Message-Id', 'Reply-To']) {
    const v = headerValue(headers, h);
    if (v) console.log(`${h}: ${v}`);
  }
  console.log('Labels:', msg.labelIds?.join(', '));
  console.log('Snippet:', msg.snippet);

  console.log('\n=== Bounce / delivery failure search ===');
  const bounce = await gmailApiFetch<{ messages?: Array<{ id: string; threadId: string }> }>(
    '/messages?q=from:mailer-daemon+OR+from:postmaster+OR+subject:"Delivery Status Notification"&maxResults=10',
  );
  if (!bounce.messages?.length) {
    console.log('No bounce messages found in inbox.');
  } else {
    for (const m of bounce.messages) {
      const detail = await gmailApiFetch<{ snippet?: string; payload?: { headers?: Array<{ name?: string; value?: string }> } }>(
        `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To`,
      );
      console.log('-', headerValue(detail.payload?.headers, 'Subject'), '|', detail.snippet?.slice(0, 120));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
