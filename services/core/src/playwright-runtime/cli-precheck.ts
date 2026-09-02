import { playwrightBrowserStatus } from './index.js';

const json = process.argv.includes('--json');

const status = await playwrightBrowserStatus();
if (json) {
  console.log(JSON.stringify(status));
} else {
  const mb = status.installedBytes != null ? `${(status.installedBytes / (1024 * 1024)).toFixed(1)} MB` : 'unknown';
  console.log(`Playwright browsers: ${status.browsersPath}`);
  console.log(`Chromium executable: ${status.executablePath ?? '(missing)'}`);
  console.log(`Installed size: ${mb}`);
  console.log(status.ok ? 'Playwright browser: OK' : `Playwright browser: MISSING (${status.reason})`);
}
process.exit(status.ok ? 0 : 1);
