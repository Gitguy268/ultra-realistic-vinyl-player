# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The player becomes a 3D model of a Thorens TD 115 MK II. Everything below this first group came from
the 2D player this project grew out of, and is kept.

### Added

- A Three.js model of the deck, every part at spec dimensions from graded photographs
  ([docs/REFERENCE.md](docs/REFERENCE.md)): moulded top plate, brushed strip with its silkscreen,
  slotted platter, ringed mat, gimbal arm, headshell and cartridge, acrylic cover on sprung hinges,
  rear panel. Procedural GPU textures, no image files.
- A room with daylight and dusk lighting in physical units, real reflections, depth of field, an
  opening camera move, orbit within the room, a focus view and a four-stop tour.
- The real controls: speed plate 33 / OFF / 45 with 78 behind its unlock pin, M / START plate with
  the end stop, a damped cue plate, ±6 % pitch wheel with a centre detent.
- From the earlier single-file player: the whole queue laid out on one record with gaps, lead-in,
  run-out and locked groove; sides that turn over; record size by speed; a cut-record sound chain;
  mechanism sounds; scratches that tick as their drawn mark passes the stylus; conditions from Mint
  to Beat-up; `?demo` and `?selftest`; a page-wide drop with a cover image.
- A single-file build from the same source (`npm run build:single`), which keeps the earlier
  single-file player's storage and passes its test suite.
- Recovery from a lost WebGL context, an idle frame rate, and a resolution that steps down under load.

### Changed

- Pitch is ±6 % as on the real deck; **Extended pitch** gives the old ±8 %.
- Clicking a track plays it with the cue lever down, and only cues it with the lever raised.
- The strobe stands still at 33⅓ only, as on the real rim; the 45 adapter has its own marks.

### Fixed

- A speed change alone was not remembered.
- Clicking the arm on its rest did nothing.
- A finished side could start itself again from its first track.

- Label visualizer: choose MilkDrop ([butterchurn](https://github.com/jberg/butterchurn))
  or Bars (a spectrum after [Musializer](https://github.com/tsoding/musializer)) and
  it replaces the label while a record plays. It stays upright as the record
  turns and is loaded only when chosen. It is off by default, stays off under
  reduced motion, and without WebGL 2 only Bars is offered.
- Four more label visualizers, drawn from scratch after ideas in
  [awesome-audio-visualization](https://github.com/willianjusten/awesome-audio-visualization):
  Lines (a ridgeline in the Unknown Pleasures style), Oscilloscope,
  Spectrogram and Radial spectrum.
- Graphic EQ: Winamp's ten bands with a preamp, its 17 built-in presets (values
  from [Webamp](https://github.com/captbaritone/webamp)) and loading of Winamp
  `.eqf` preset files. It sits after the tone controls, is off by default and
  is included in the headroom calculation, so boosts do not clip.
- Library desktop, after [Winampify](https://github.com/remigallego/winampify):
  artists and albums open as folders in movable windows, and a track plays on a
  double-click or when dragged onto the Turntable icon.

### Changed

- The copyright holder in `LICENSE`, `NOTICE`, `package.json` and the page's
  structured data is written "Lucas Van De Weerd".
- Inter's licence text (SIL Open Font License 1.1) ships with every build as
  `licenses/Inter-OFL.txt`.
- Added `.github/CODEOWNERS`.

### Fixed

- Firefox: importing no longer hangs. The import waited for the answer to the
  browser's "store data persistently?" prompt before showing anything.
- Safari and other WebKit browsers: importing works where the browser refuses
  to store audio Blobs in IndexedDB (private windows); the bytes are stored
  instead.
- Safari: files over 150 MiB play. Safari stalls a stream for over a second on
  every speed change, so a stream now follows the speed the motor is heading
  for and no longer glides while the platter spins up.
- Firefox: a stream now ends its side normally instead of stopping on a decode
  error with the needle left down.
- Bass no longer clips. With RIAA equalisation on, a full-scale 30 Hz tone left
  the worklet at 3.3 times full scale. The phono stage now runs at a derived
  gain of -19.9 dB, which bounds the output by the input for any signal. Music
  is about 12 dB quieter than in 0.1.0 as a result.
- Switching RIAA equalisation off no longer changes the loudness: the bypass is
  level-matched at 1 kHz.
- Pressing Next or Previous faster than tracks decode no longer leaves the
  needle down on a silent record, and no longer flashes the wrong title.
- A needle dropped while a track is still loading now starts playing when the
  track is ready.

### Added

- A new look. The deck is redrawn after a 1980s belt-drive turntable: textured
  anthracite top plate, ringed rubber mat (bare until a record is loaded),
  strobe slots in the platter rim, a straight black tonearm, and a
  brushed-aluminium strip of plate keys for speed, pitch, motor, start and
  lift. The page uses the grey and orange palette of the earlier Vinyl-Player.
- Deck finishes: Anthracite (default), Walnut, Aluminium, Gloss black, Clear.
- A bass-reactive glow around the label, a position slider, custom accent,
  background, panel and text colours, and a Record Info panel with editable
  details and liner notes.

- Sound modes. **Flat**, the new default, plays music as recorded at full
  level; the RIAA curve only shapes needle sounds. **Warm** is the previous
  behaviour, with the curve on the music.
- Bass, Mid and Treble controls (±12 dB). Music is turned down by the largest
  boost so the result does not clip.

- Cover art is printed on the record label, with the title on a plate that
  stays readable over any artwork.
- Deck settings (speed, pitch, volume, surface noise, wear, mains and the
  equalisation and wow and flutter switches) are remembered between visits.
- Single tracks can be removed from the library.
- The headless checks run in Firefox, WebKit and Edge as well as Chromium
  (`BROWSER=firefox npm run check:browser`), and a new check imports and plays
  real WAV, FLAC, MP3, M4A and AIFF files.
- `npm run check:browser` runs every headless check, including new ones that
  measure the built audio worklet and exercise streaming mode.

### Changed

- The "RIAA playback equalisation" switch is replaced by the Sound modes. The
  level-matched bypass is gone: Flat is now at full level instead.
- Wow and flutter use four-point interpolation. With the old two-point
  interpolation the treble level rose and fell with the wow, by up to 2 dB at
  10 kHz; it now stays within 0.5 dB.
- Surface noise gets its own room in the mix: music is turned down by exactly
  what the noise setting needs (0.7 dB at the default).

- The deck no longer redraws when nothing moves, and its static parts are
  painted once and reused. In headless Chromium at 1440 px a resting deck fell
  from 29 % of a CPU core to under 1 %, and a playing one from 35 % to 12 %.
- An unpowered platter now comes to a complete stop instead of slowing forever.
- The saved track is decoded on its first play, not when the page opens, so
  startup no longer decodes audio or creates an audio context.
- README screenshots show a record playing.

- Surface noise and the cue lever sound are scaled with the phono stage gain,
  so their balance against the music is unchanged.

## [0.1.0] - 2026-10-09

First release.

### Added

- Project scaffold: Vite, strict TypeScript, Vitest, ESLint, Prettier,
  commitlint, link checking, CI, and community files.
- Audio mathematics as pure, unit-tested modules: RIAA playback curve, wow and
  flutter, position tracking, motor, strobe, and tonearm geometry with the cue
  state machine.
- Audio engine: an AudioWorklet with RIAA equalisation and a wow and flutter
  delay line, decode and streaming playback, and synthesized needle and lever
  sounds.
- Turntable UI: a canvas deck with platter, strobe ring, record and tonearm;
  drag-to-cue, play, motor and cue lever controls; speed, pitch, volume and
  strobe mains settings.
- Scratching: drag the record to play it by hand, forward or backward, with a
  short return to motor speed on release.
- Surface noise: synthesized hiss and clicks with level and wear controls.
- Library: import files or whole folders into IndexedDB with tags and cover
  art, a persistent queue with shuffle, repeat and reordering, optional
  auto-advance, Media Session controls, and an accent colour from cover art.
- Interface: light and dark modes, three plinth finishes, a dust cover, VU
  meters, focus mode, keyboard shortcuts with a help dialog, a first-run
  tutorial, a keyboard-operable tonearm, and a credits dialog.
- Installable PWA that works offline, with an update prompt that waits for the
  user; web manifest and icons, Open Graph image, JSON-LD, `robots.txt`,
  `sitemap.xml` and `llms.txt`.
- Documentation: full README with an audio-graph diagram and FAQ, a manual
  browser test matrix, and credits for every dependency, asset and inspiration.
- Switches for RIAA equalisation and for wow and flutter.

[Unreleased]: https://github.com/Gitguy268/realistic-vinyl-player/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Gitguy268/realistic-vinyl-player/releases/tag/v0.1.0
