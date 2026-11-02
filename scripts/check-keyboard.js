// Walks the keyboard path: tutorial, tab order, focus rings, shortcuts, focus mode,
// dialogs, keyboard tonearm, themes, reduced motion and responsive layout.
// Usage: npm run build && npm run preview, then: node scripts/check-keyboard.js
import { BASE_URL, BROWSER, check, finish, openPage, wavFile } from './lib.js';

// Safari only tabs to form fields unless Option is held; that is a system setting.
const TAB = BROWSER === 'webkit' ? 'Alt+Tab' : 'Tab';

const allErrors = [];
const focusedId = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const pressed = (page, id) => page.getAttribute(`#${id}`, 'aria-pressed');
const settle = (page) => page.waitForTimeout(120);

// --- First run: the tutorial -------------------------------------------------
{
  const { browser, page, errors } = await openPage({ showTutorial: true });
  await page.goto(`${BASE_URL}?debug`);
  await page.waitForSelector('#coach[open]');
  check('tutorial opens on first run', true);
  check(
    'tutorial starts at "Load a record"',
    (await page.textContent('#coach-title')) === 'Load a record',
  );
  check(
    'tutorial highlights its target',
    (await page.locator('#add-files.coach-target').count()) === 1,
  );
  const titles = [];
  for (let i = 0; i < 3; i++) {
    await page.focus('#coach-next');
    await page.keyboard.press('Enter');
    titles.push(await page.textContent('#coach-title'));
  }
  check(
    `tutorial steps run load → play or drag → lever → speed (${titles.join(' → ')})`,
    titles.join('|') === 'Play, or drag the tonearm|The cue lever|Speed and pitch',
  );
  await page.keyboard.press('Enter');
  check('finishing closes the tutorial', (await page.locator('#coach[open]').count()) === 0);
  await page.reload();
  await page.waitForTimeout(400);
  check(
    'tutorial is remembered as done after a reload',
    (await page.locator('#coach[open]').count()) === 0,
  );
  await page.focus('#help-menu summary');
  await page.keyboard.press('Enter');
  await page.focus('#open-coach');
  await page.keyboard.press('Enter');
  check('tutorial reopens from the Help menu', (await page.locator('#coach[open]').count()) === 1);
  await page.keyboard.press('Escape');
  check('Escape dismisses the tutorial', (await page.locator('#coach[open]').count()) === 0);
  allErrors.push(...errors);
  await browser.close();
}

// --- Main walk ---------------------------------------------------------------
const { browser, page, errors } = await openPage();
await page.goto(`${BASE_URL}?debug`);
await page.setInputFiles('#file', [
  wavFile('First Tone.wav', 40),
  wavFile('Second Tone.wav', 40, 660),
]);
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));

// Tab through the whole page, recording each stop.
const stops = [];
await page.evaluate(() => document.body.focus());
for (let i = 0; i < 60; i++) {
  await page.keyboard.press(TAB);
  const stop = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    const label =
      el.getAttribute('aria-label') ||
      [...(el.labels ?? [])].map((l) => l.textContent.trim()).join(' ') ||
      el.closest('label')?.textContent.trim() ||
      el.textContent.trim();
    return {
      key: el.id || `${el.tagName.toLowerCase()}.${el.className}`,
      name: label.replace(/\s+/g, ' '),
      ring: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2,
    };
  });
  if (!stop || stops.some((s) => s.key === stop.key && s.name === stop.name)) break;
  stops.push(stop);
}
const reached = stops.map((s) => s.key);
const expected = [
  'mode',
  'plinth',
  'play',
  'motor',
  'lever',
  'cover',
  'focus-mode',
  'pitch',
  'volume',
  'noise',
  'wear',
  'mains',
  'add-files',
  'add-folder',
  'clear-library',
  'prev',
  'next',
  'shuffle',
  'repeat',
  'auto-advance',
];
const missing = expected.filter((id) => !reached.includes(id));
check(
  `Tab reaches every control (${stops.length} stops${missing.length ? `, missing ${missing}` : ''})`,
  missing.length === 0,
);
check(
  'Tab reaches the Help menu, speed radios and queue tracks',
  reached.some((k) => k.startsWith('summary')) &&
    stops.some((s) => s.name.includes('33')) &&
    reached.some((k) => k.includes('track')),
);
const unnamed = stops.filter((s) => !s.name).map((s) => s.key);
check(
  `every tab stop has an accessible name${unnamed.length ? ` (unnamed: ${unnamed})` : ''}`,
  unnamed.length === 0,
);
const ringless = stops.filter((s) => !s.ring).map((s) => s.key);
check(
  `every tab stop shows a focus ring${ringless.length ? ` (none on: ${ringless})` : ''}`,
  ringless.length === 0,
);
for (const id of ['pitch', 'volume', 'noise', 'wear']) {
  check(
    `#${id} slider exposes aria-valuetext`,
    Boolean(await page.getAttribute(`#${id}`, 'aria-valuetext')),
  );
}

// Shortcuts from the page body.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('Space');
await settle(page);
check('Space drops the needle', (await pressed(page, 'play')) === 'true');
await page.waitForFunction(() => document.querySelector('#time-current')?.textContent === '0:02');
await page.keyboard.press('ArrowRight');
await settle(page);
const afterSeek = await page.textContent('#time-current');
check(`→ seeks forward 5 s (now ${afterSeek})`, ['0:07', '0:08'].includes(afterSeek));
await page.keyboard.press('ArrowLeft');
await settle(page);
check('← seeks back 5 s', ['0:02', '0:03'].includes(await page.textContent('#time-current')));
await page.keyboard.press('ArrowUp');
check('↑ raises the volume', (await page.inputValue('#volume')) === '85');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
check('↓ lowers the volume', (await page.inputValue('#volume')) === '75');
await page.keyboard.press('s');
check('S toggles shuffle', (await pressed(page, 'shuffle')) === 'true');
await page.keyboard.press('r');
check('R cycles repeat', (await page.textContent('#repeat')) === 'Repeat: all');
await page.waitForTimeout(1100);
const label = await page.getAttribute('#platter', 'aria-label');
check(
  `canvas label describes the deck ("${label}")`,
  /Record: First Tone\. Needle down, playing at/.test(label),
);
const announced = await page.textContent('#announcer');
check(
  `needle drop was announced politely ("${announced}")`,
  (await page.getAttribute('#announcer', 'aria-live')) === 'polite' && announced.length > 0,
);

await page.keyboard.press('l');
await settle(page);
check(
  'L raises the cue lever and lifts the needle',
  (await pressed(page, 'lever')) === 'true' && (await pressed(page, 'play')) === 'false',
);
await page.keyboard.press('m');
await settle(page);
check('M switches the motor off', (await pressed(page, 'motor')) === 'false');

// Shortcuts are ignored inside form fields.
await page.focus('#pitch');
await page.keyboard.press('m');
await settle(page);
check('shortcut keys are ignored inside form fields', (await pressed(page, 'motor')) === 'false');

// Keyboard tonearm: lever up and focused, arrows move the arm.
await page.focus('#lever');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
await page.keyboard.press('ArrowLeft');
await page.waitForFunction(() =>
  /Tonearm at \d+ percent/.test(document.querySelector('#announcer')?.textContent ?? ''),
);
const first = Number(/(\d+) percent/.exec(await page.textContent('#announcer'))[1]);
for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(100);
const second = Number(/(\d+) percent/.exec(await page.textContent('#announcer'))[1]);
check(
  `← on the raised lever moves the arm inward 1 % per press (${first} % → ${second} %)`,
  second - first === 10,
);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
check(
  '→ moves it back outward',
  Number(/(\d+) percent/.exec(await page.textContent('#announcer'))[1]) === second - 1,
);
await page.keyboard.press('Enter');
await settle(page);
check(
  'lowering the lever drops the needle where the arm was placed',
  (await pressed(page, 'play')) === 'true',
);
await page.waitForTimeout(400);
const cued = await page.textContent('#time-current');
check(
  `playback starts near the cued position (${cued} of 0:40)`,
  ['0:06', '0:07', '0:08'].includes(cued),
);

// Focus mode.
await page.focus('#add-files');
await page.keyboard.press('f');
await settle(page);
check(
  'F enters focus mode',
  await page.evaluate(() => document.body.classList.contains('focus-mode')),
);
check(
  'focus mode hides the library and top bar',
  !(await page.isVisible('#add-files')) && !(await page.isVisible('.topbar')),
);
check(
  'focus mode keeps the platter and transport bar',
  ((await page.isVisible('#scene')) || (await page.isVisible('#platter'))) &&
    (await page.isVisible('#play')),
);
check('focus moves to a visible control', (await focusedId(page)) === 'focus-mode');
await page.keyboard.press('Escape');
await settle(page);
check(
  'Escape leaves focus mode',
  !(await page.evaluate(() => document.body.classList.contains('focus-mode'))),
);
check('focus returns to where it was', (await focusedId(page)) === 'add-files');

// Shortcuts dialog with a focus trap.
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('?');
check(
  '? opens the shortcuts dialog',
  (await page.locator('#shortcuts-dialog[open]').count()) === 1,
);
check('the dialog lists the shortcuts', (await page.locator('#shortcuts-body tr').count()) >= 10);
let trapped = true;
for (let i = 0; i < 6; i++) {
  await page.keyboard.press(TAB);
  trapped &&= await page.evaluate(() => {
    const active = document.activeElement;
    return active === document.body || Boolean(active?.closest('#shortcuts-dialog'));
  });
}
check('Tab stays inside the open dialog', trapped);
await page.keyboard.press('m');
await settle(page);
check('shortcuts do not fire behind an open dialog', (await pressed(page, 'motor')) === 'true');
await page.keyboard.press('Escape');
check('Escape closes the dialog', (await page.locator('#shortcuts-dialog[open]').count()) === 0);

// Credits, dust cover, themes.
await page.click('#help-menu summary');
await page.click('#open-credits');
const credits = await page.textContent('#credits-text');
check(
  'credits dialog shows NOTICE',
  credits.includes('Ultra-Realistic Vinyl Player') && credits.includes('music-metadata'),
);
await page.keyboard.press('Escape');
await page.focus('#cover');
await page.keyboard.press('Enter');
check(
  'dust cover closes from the keyboard',
  (await pressed(page, 'cover')) === 'true' &&
    (await page.locator('.plinth.cover-closed').count()) === 1,
);
await page.keyboard.press('Enter');
const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
await page.selectOption('#mode', 'dark');
const dark = await background();
await page.selectOption('#mode', 'light');
const light = await background();
check(
  `manual light mode overrides the system setting (${dark} → ${light})`,
  dark !== light && light === 'rgb(232, 229, 224)',
);
// The finishes are materials of the 3D plinth; the 2D deck draws them in CSS (PARITY.md §7).
const plinth = () =>
  page.evaluate(() => {
    const m = window.__deck?.stage?.world.materials.plinth;
    return m
      ? `${m.color.getHexString()}|${m.metalness}|${m.map?.uuid ?? ''}|${m.anisotropy}`
      : getComputedStyle(document.querySelector('.plinth')).backgroundImage;
  });
const walnut = await plinth();
await page.selectOption('#plinth', 'aluminium');
const aluminium = await plinth();
await page.selectOption('#plinth', 'gloss');
check(
  'three plinth themes render differently',
  new Set([walnut, aluminium, await plinth()]).size === 3,
);
// Deck settings are remembered too.
await page.check('input[name="speed"][value="single"]');
await page.fill('#pitch', '2.5');
await page.dispatchEvent('#pitch', 'change');
await page.fill('#noise', '60');
await page.dispatchEvent('#noise', 'change');
await page.selectOption('#mains', '60');
await page.uncheck('#wow-flutter');
await page.selectOption('#sound', 'warm');
await page.fill('#mid', '5');
await page.dispatchEvent('#mid', 'change');
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('ArrowUp');
const volumeBefore = await page.inputValue('#volume');
await page.reload();
await page.waitForTimeout(400);
check(
  'speed, pitch, volume, noise, mains and switches persist across a reload',
  (await page.isChecked('input[name="speed"][value="single"]')) &&
    (await page.inputValue('#pitch')) === '2.5' &&
    (await page.inputValue('#volume')) === volumeBefore &&
    (await page.inputValue('#noise')) === '60' &&
    (await page.inputValue('#mains')) === '60' &&
    !(await page.isChecked('#wow-flutter')) &&
    (await page.inputValue('#sound')) === 'warm' &&
    (await page.inputValue('#mid')) === '5',
);
check(
  'restored settings reach the readouts and aria-valuetext',
  (await page.textContent('#pitch-value')) === '+2.5 %' &&
    (await page.getAttribute('#pitch', 'aria-valuetext')) === '+2.5 percent' &&
    (await page.textContent('#noise-value')) === '60',
);
await page.waitForTimeout(1100);
check(
  'the restored speed reaches the deck',
  (await page.getAttribute('#platter', 'aria-label')).includes('45 RPM'),
);
await page.evaluate(() =>
  localStorage.setItem(
    'realistic-vinyl-player.settings',
    JSON.stringify({
      speed: 'warp',
      pitch: 900,
      volume: 'loud',
      mains: 55,
      equalisation: 7,
      bass: 'x',
    }),
  ),
);
await page.reload();
await page.waitForTimeout(400);
check(
  'corrupt stored settings fall back safely',
  (await page.isChecked('input[name="speed"][value="lp"]')) &&
    // 900 % is clamped to the wheel's range: ±6 %, the real deck's (DECISIONS.md, Pitch).
    (await page.inputValue('#pitch')) === (await page.getAttribute('#pitch', 'max')) &&
    (await page.inputValue('#volume')) === '80' &&
    (await page.inputValue('#mains')) === '50' &&
    (await page.inputValue('#sound')) === 'flat' &&
    (await page.inputValue('#bass')) === '0',
);
// Custom colours.
await page.locator('details:has(#colour-accent) summary').click();
await page.fill('#colour-accent-hex', '#20304A');
await page.locator('#colour-accent-hex').blur();
const custom = await page.evaluate(() => {
  const style = getComputedStyle(document.documentElement);
  return [style.getPropertyValue('--accent').trim(), style.getPropertyValue('--accent-ink').trim()];
});
check(
  `a custom accent applies, with ink chosen to stay readable (${custom.join(' / ')})`,
  custom[0] === '#20304a' && custom[1] === '#ffffff',
);
await page.fill('#colour-accent-hex', 'not a colour');
await page.locator('#colour-accent-hex').blur();
check(
  'an invalid hex code is rejected and marked',
  (await page.getAttribute('#colour-accent-hex', 'aria-invalid')) === 'true' &&
    (await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    )) === '#20304a',
);
await page.fill('#colour-bg-hex', '#303030');
await page.locator('#colour-bg-hex').blur();
await page.fill('#colour-text-hex', '#555555');
await page.locator('#colour-text-hex').blur();
check(
  'unreadable text and background colours show a warning',
  (await page.textContent('#colour-warning')).includes('Low contrast'),
);
await page.reload();
await page.waitForTimeout(400);
check(
  'custom colours persist and override the page mode',
  (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) ===
    'rgb(48, 48, 48)',
);
await page.locator('details:has(#colour-accent) summary').click();
await page.click('#colours-reset');
check(
  'Reset restores the theme colours and clears the warning',
  (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) !==
    'rgb(48, 48, 48)' &&
    (await page.textContent('#colour-warning')) === '' &&
    (await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    )) === '#e8562a',
);
check(
  'mode and plinth choices persist',
  (await page.inputValue('#mode')) === 'light' && (await page.inputValue('#plinth')) === 'gloss',
);
allErrors.push(...errors);
await browser.close();

// --- Reduced motion and responsive layout -----------------------------------
{
  const { browser: b, page: p, errors: e } = await openPage({ reducedMotion: 'reduce' });
  await p.goto(BASE_URL);
  const motion = await p.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--motion-slow').trim(),
  );
  check(`reduced motion zeroes the transition tokens (${motion})`, Number.parseFloat(motion) === 0);
  await p.click('#cover');
  const duration = await p.evaluate(
    () => getComputedStyle(document.querySelector('.dust-cover')).transitionDuration,
  );
  check(
    `dust cover snaps under reduced motion (${duration})`,
    duration.split(',').every((d) => Number.parseFloat(d) === 0),
  );
  allErrors.push(...e);
  await b.close();
}
for (const [width, height] of [
  [360, 800],
  [768, 1024],
  [1440, 900],
]) {
  const { browser: b, page: p, errors: e } = await openPage({ width, height });
  await p.goto(BASE_URL);
  await p.waitForTimeout(300);
  const layout = await p.evaluate(() => {
    const deck = document.querySelector('.deck').getBoundingClientRect();
    const controls = document.querySelector('.controls').getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      sideBySide: controls.left >= deck.right - 1,
      stacked: controls.top >= deck.bottom - 1,
    };
  });
  check(`${width} px: no horizontal overflow`, layout.overflow <= 0);
  check(
    width > height
      ? `${width} px landscape: platter left, controls right`
      : `${width} px portrait: platter above controls`,
    width > height ? layout.sideBySide : layout.stacked,
  );
  allErrors.push(...e);
  await b.close();
}

finish(allErrors);
