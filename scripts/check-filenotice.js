// The app build needs a server, and says so when opened as a file. The single file needs nothing and
// must never say it. Usage: npm run build && npm run build:single, then: node scripts/check-filenotice.js
import { fileURLToPath } from 'node:url';
import { check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1000, height: 700 });
const app = fileURLToPath(new URL('../dist/index.html', import.meta.url));
const single = fileURLToPath(new URL('../dist-single/index.html', import.meta.url));
await page.goto(`file://${app}`);
await page.waitForTimeout(300);
check('the app build, opened as a file, explains itself', await page.isVisible('#file-notice'));
errors.length = 0; // Its scripts cannot load from a file: that is what the notice is about.
await page.goto(`file://${single}`);
await page.waitForTimeout(800);
check('the single file opens without the notice', !(await page.isVisible('#file-notice')));

finish(errors);
await browser.close();
