// Small behaviours of the two originals that nothing else exercises: the pitch detent, the 45 adapter,
// the lamp following the pointer, side badges and the flip, the media position, a removed track.
// Usage: npm run build && npm run preview, then: node scripts/check-details.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 15000,
});
const q = (fn, arg) => page.evaluate(fn, arg);

// Pitch: a key steps out of the centre; a double-click comes back; a hand near zero snaps to it.
await page.focus('#pitch');
await page.keyboard.press('ArrowRight');
check('an arrow key leaves the pitch centre', (await page.inputValue('#pitch')) === '0.1');
await page.keyboard.press('ArrowRight');
await page.dblclick('#pitch');
check('a double-click resets the pitch', (await page.inputValue('#pitch')) === '0');
const box = await page.locator('#pitch').boundingBox();
const y = box.y + box.height / 2;
const mid = box.x + box.width / 2;
await page.mouse.move(mid + box.width * 0.25, y);
await page.mouse.down();
await page.mouse.move(mid + 3, y, { steps: 4 });
await page.mouse.up();
check('a hand letting it near zero lands on zero', (await page.inputValue('#pitch')) === '0');

// The lamp's highlight leans toward the pointer.
const lamp = () => q(() => window.__deck.stage.world.lighting.lamp.position.x);
await page.mouse.move(40, 300);
await page.waitForTimeout(900);
const left = await lamp();
await page.mouse.move(980, 300);
await page.waitForTimeout(900);
const right = await lamp();
check(`the lamp's light follows the pointer (${(right - left).toFixed(3)} m)`, right - left > 0.02);

// The 45 adapter goes on a 7-inch only.
const adapter = () => q(() => window.__deck.stage.world.deck.adapter.visible);
await page.waitForTimeout(100);
check('no adapter on a 12-inch', !(await adapter()));
await page.click('#deck-settings > summary');
await page.check('#size-by-speed');
await page.check('input[name="speed"][value="single"]');
await page.waitForTimeout(200);
check('a 7-inch sits on the yellow adapter', await adapter());
await page.check('input[name="speed"][value="lp"]');
await page.uncheck('#size-by-speed');

// Sides: badges where each side begins, the Flip button, the turnover.
await q(() => {
  for (const t of window.__deck.player.tracks.values()) t.durationSec = 600;
  window.__deck.deck.rebuild();
});
check('with one side there is no Flip button', await page.isHidden('#flip'));
await page.check('#sides');
await page.waitForTimeout(100);
check('with sides on the Flip button shows', await page.isVisible('#flip'));
check(
  'a badge marks where each side begins',
  (await page.locator('.trk-side').allTextContents()).join() === 'Side A,Side B',
);
await page.click('#flip');
await page.waitForFunction(() => window.__deck.stage.flipping, null, { timeout: 3000 });
check('Flip turns the record over', true);
await page.waitForFunction(
  () => window.__deck.deck.program.side === 1 && !window.__deck.stage.flipping,
);
await page.waitForTimeout(100); // The turn's last frame ends at a full half turn.
check(
  'the record comes back down flat on the mat',
  await q(() => Math.abs(window.__deck.stage.world.deck.record.rotation.z) < 0.01),
);
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
check('Flip plays the other side', (await page.textContent('#flip')).includes('Side B'));

// Announcements and the lock screen.
await page
  .waitForFunction(
    () => /Now playing|Needle down/.test(document.querySelector('#announcer')?.textContent ?? ''),
    null,
    { timeout: 5000 },
  )
  .catch(() => {});
const position = await q(async () => {
  const calls = [];
  const original = navigator.mediaSession.setPositionState.bind(navigator.mediaSession);
  navigator.mediaSession.setPositionState = (state) => {
    calls.push(state);
    original(state);
  };
  await new Promise((r) => setTimeout(r, 1300));
  return calls.at(-1) ?? null;
});
check('the lock screen is told where the track is', position !== null && position.duration > 0);
check('…at the platter’s speed', position !== null && Math.abs(position.playbackRate - 1) < 0.02);

// A track removed while the stylus is in silence: it lifts.
await page.uncheck('#sides');
await q(() => {
  const { deck, player } = window.__deck;
  deck.groove.begin('runout', 0);
  void player.remove(player.queue.ids.at(-1));
});
await page.waitForFunction(() => !window.__deck.deck.groove.contact, null, { timeout: 3000 });
check('removing a track while in the run-out lifts the stylus', true);

// A library restored with its current track on side B: that side is simply up, no turnover. This is
// the real path, a reload, with track lengths long enough for two sides.
{
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await fresh.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.addInitScript(() => {
    sessionStorage.setItem('ultra-vinyl.intro-seen', '1');
    localStorage.setItem('realistic-vinyl-player.coachDone', 'true');
    // Whether the record ever turns over, from the very first frame.
    addEventListener('DOMContentLoaded', () => {
      window.flipped = false;
      const watch = () => {
        if (window.__deck?.stage.flipping) window.flipped = true;
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
  });
  await p.goto(`${BASE_URL}?debug`);
  await p.waitForFunction(() => window.__deck);
  await p.setInputFiles(
    '#file',
    ['One', 'Two', 'Three'].map((n) => wavFile(`${n}.wav`, 2, 440)),
  );
  await p.waitForFunction(() => window.__deck.player.queue.ids.length === 3, null, {
    timeout: 10000,
  });
  await p.click('#deck-settings > summary');
  await p.check('#sides');
  await p.evaluate(async () => {
    const { player, deck } = window.__deck;
    const put = [];
    for (const t of player.tracks.values()) {
      t.durationSec = 600;
      put.push(player.library.put(t));
    }
    await Promise.all(put);
    deck.rebuild();
  });
  await p.click('#lever'); // Raised, so a click only cues.
  await p.click('#tracks li:nth-child(3) .track');
  await p.waitForTimeout(900);
  await p.reload();
  await p.waitForFunction(() => window.__deck?.deck.program.sides.length === 2, null, {
    timeout: 10000,
  });
  await p.waitForTimeout(1500);
  check(
    'a restored record comes up on its side',
    await p.evaluate(() => window.__deck.deck.program.side === 1),
  );
  check('…without turning over', await p.evaluate(() => window.flipped === false));
  await fresh.close();
}

finish(errors);
await browser.close();
