# Contributing

Thanks for helping. By taking part you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```sh
npm ci
npm run dev
```

## Before you open a pull request

```sh
npm run verify
npm run check:links
npm run check:browser
```

## Code style

- TypeScript strict mode, explicit types, no `any`.
- Pure logic goes in modules with no DOM or Web Audio dependency and gets a
  Vitest unit test in `tests/`. Engine, UI and worklet code stays thin.
- No `console.log`, commented-out code, or task markers in committed code.
- Dependencies are exact-pinned and listed in [NOTICE](NOTICE); a unit test
  fails otherwise. Add one only with a clear reason, and prefer MIT, BSD,
  Apache-2.0, ISC or OFL licences.
- Derive numeric test expectations with a throwaway script before writing
  them, and keep test helpers in the same units as the code under test.
- No runtime requests to other origins. Fonts are self-hosted.
- Every control is keyboard-operable with a visible focus ring and an
  accessible name. Every animation respects `prefers-reduced-motion`.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), checked
by commitlint in CI. Keep the subject lowercase and each commit small, with the
tree building and tests passing. Wrap body lines at 100 characters. Never
commit secrets, `.env` files or personal data.

## Manual tests

Automated checks run in headless Chromium and cannot hear. After a change to
audio, pointer handling, storage or the service worker, run the relevant steps
by hand on a production build (`npm run build && npm run preview`).

### Browser matrix

Fill in a row per browser you tested and paste it into the pull request.

| Browser                | Scratch | Noise | Keyboard tonearm | Import | Offline | Reduced motion |
| ---------------------- | ------- | ----- | ---------------- | ------ | ------- | -------------- |
| Chrome (desktop)       |         |       |                  |        |         |                |
| Edge (desktop)         |         |       |                  |        |         |                |
| Firefox (desktop)      |         |       |                  |        |         |                |
| Safari (desktop)       |         |       |                  |        |         |                |
| Chrome (Android phone) |         |       |                  |        |         |                |
| Safari (iPhone)        |         |       |                  |        |         |                |

On phones, serve the build over HTTPS or use the deployed preview: service
workers and AudioWorklet need a secure context.

### Scratch

1. Load a track smaller than 150 MiB and press Play.
2. Drag the record surface (not the headshell) clockwise, then anticlockwise.
   The pitch should follow your hand, and anticlockwise should play backward.
3. Hold the record still: the sound should stop, with the needle still down.
4. Let go: the record should pick up to motor speed within about a third of a
   second, continuing from where your hand left it.
5. Load a file larger than 150 MiB. Dragging the record should do nothing
   except show the "Scratching is disabled" notice.
6. On a phone, repeat steps 2 to 4 with a finger. The page must not scroll
   while you drag on the platter.

### Surface noise

1. With the needle up, no hiss or clicks should be audible at any setting.
2. Drop the needle: hiss and occasional clicks fade in. Lift it or switch the
   motor off: they fade out.
3. "Surface noise" at 0 is silent; at 100 it is clearly audible but must not
   clip.
4. Move "Wear" from 0 to 1 and release the slider: clicks should become much
   more frequent.
5. Play a bass-heavy track, then silence: the noise must not sound boomy,
   because it is mixed in after the RIAA stage.

### Sound modes and tone

1. In **Flat**, a track should sound like it does in any other player, at a
   similar level.
2. Switch to **Warm** while it plays: clearly more bass, less treble, and much
   quieter. Switching back must not leave a click or a stuck level.
3. Push Bass, Mid and Treble to +12 one at a time on a loud track: the overall
   level drops and nothing distorts. Pull them to −12: no level drop.
4. Drop the needle in both modes: the thump should be audible but not louder
   than the music.

### Keyboard tonearm path

Use the keyboard only.

1. Tab to **Add files**, import a track, and wait for "Ready".
2. Tab to **Cue lever** and press Enter. The lever shows as raised.
3. Press the left arrow about thirty times. The arm should step across the
   record, and a screen reader should announce "Tonearm at N percent".
4. Press the right arrow a few times: the arm steps back outward. Stepping
   outward past the first groove parks the arm on its rest.
5. Step back over the record and press Enter. The needle drops and playback
   starts at that point of the track.
6. Press Space away from any button: the needle lifts. Press it again: it drops.
7. Press `?`, check that Tab stays inside the dialog, and close it with Escape.
8. Press `F`, check that only the platter and the transport bar remain, and
   leave with Escape. Focus should return to where it was.

### Import

1. **Add files**: pick several files of mixed formats (MP3, FLAC, M4A, OGG,
   WAV). Each appears in the queue with its tagged title and artist; files
   without tags use "Artist - Title" from the file name.
2. **Add folder**: pick a folder with subfolders and non-audio files. Only the
   audio is imported; progress reads "Importing 3 / 40…" and **Cancel** stops
   it, keeping what was already imported.
3. Drag files, and then a folder, from the file manager onto the page.
4. Include one corrupt or mislabelled file: the import must finish, and that
   track must show a "Could not load" message only when selected.
5. Reload. The library, queue order, current track and platter label persist.
   The saved track is only decoded when you first play it, so the page should
   open quickly even with a long track; Play, or dragging the arm onto the
   record, should start it from where the needle lands.
6. Select a track with cover art: the accent colour changes if it stays
   readable. Select one without: the default accent returns.
7. Press the ✕ on one track: it leaves the queue, focus moves to the next
   track, and it stays gone after a reload. A record on the platter keeps
   playing.
8. **Clear library**, confirm, reload: the library is empty.
9. Change speed, pitch, volume and the other deck settings, then reload: they
   are restored.

### Colours and record info

1. Open **Colours**, pick an accent: buttons, sliders, the label and the glow
   follow it, and the text on accent-coloured buttons stays readable.
2. Choose a text colour close to the background: a low-contrast warning
   appears. **Reset colours** restores the theme.
3. Open **Record info** with a track on the platter, edit the artist and the
   notes, and tab away: the queue updates, and both survive a reload.
4. Type in one field and move straight to the next: nothing you type may be
   overwritten.

### Offline

1. Load the page once and wait a few seconds.
2. Switch the network off (DevTools, or airplane mode on a phone) and reload.
   The page, fonts and deck render, and a track already in the library plays.
3. Go back online, deploy or build a new version, and reload twice. A toast
   reading "A new version is available — Reload" appears. Nothing changes
   until you press **Reload**.
4. Install the app (browser menu, or "Add to Home Screen") and start it from
   its icon.

### Reduced motion

1. Turn on "Reduce motion" in the operating system settings and reload.
2. Start a track: the platter and strobe stay parked, the tonearm still moves
   to follow playback, and audio is unaffected.
3. Toggle the dust cover: it snaps instead of swinging.
4. The VU needles jump a few times a second instead of swinging.
5. Turn the setting off again without reloading: motion resumes.

### Headless checks

The same flows, without sound, in Chromium:

```sh
npm run check:browser
```

It builds, serves the build on port 4174 and runs every `scripts/check-*.js`
in turn. To run one alone, start `npm run preview` and call it with `node`.

`check-audio.js` renders test signals through the built worklet offline and
measures them (peak level, frequency response, speed deviation, reverse
playback). It proves the signal is right, not that it sounds right.

`check-loading.js` writes about 280 MB of generated audio to `.scratch/` and
deletes it afterwards. `check-offline.js` edits `dist/sw.js` to simulate a new
deploy; `check:browser` rebuilds afterwards, and you should too if you run it
alone.
