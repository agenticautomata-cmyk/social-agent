import { getDecryptedGmailTokens } from '../gmail-oauth/connections.js';

async function main() {
  const t = await getDecryptedGmailTokens();
  if (!t) {
    console.log('NOT_CONNECTED');
    process.exit(1);
  }
  const info = await fetch(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(t.accessToken)}`,
  );
  console.log(JSON.stringify(await info.json(), null, 2));
}

main();
