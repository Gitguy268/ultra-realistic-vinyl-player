import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The single-file build: the same source as the app, as one self-contained index.html that runs
 * from file:// (docs/DECISIONS.md, Single-file feasibility). Everything is inlined: scripts,
 * styles, fonts and the audio worklet (as a data: URL). There is no service worker.
 */

/**
 * three.js keeps two URL comments inside GLSL strings and logs through console.log. Neither may
 * appear in a file that must reference nothing outside itself and carry no debug output.
 */
function scrubThree(): Plugin {
  return {
    name: 'scrub-three',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/node_modules/three/')) return null;
      return code
        .replace(/^[ \t]*\/\/[ \t]*https?:\/\/\S+[ \t]*$/gm, '')
        .replace(/console\.log\(/g, 'console.warn(');
    },
  };
}

/**
 * The worklet is its own chunk, reached by URL. Its code becomes a data: URL in place of that
 * URL, so the page carries it (src/audio/load-worklet.ts loads it from there).
 */
function inlineWorklet(): Plugin {
  return {
    name: 'inline-worklet',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, output] of Object.entries(bundle)) {
        if (!/vinyl\.worklet-[\w-]+\.js$/.test(fileName)) continue;
        const code = output.type === 'chunk' ? output.code : String(output.source);
        const url = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
        delete bundle[fileName];
        for (const other of Object.values(bundle)) {
          if (other.type !== 'chunk') continue;
          const before = other.code;
          // Rolldown writes new URL(`file`, import.meta.url); an absolute data: URL ignores the base.
          for (const quoted of [`\`${fileName}\``, `"./${fileName}"`, `"/${fileName}"`]) {
            other.code = other.code.split(quoted).join(JSON.stringify(url));
          }
          if (other.code === before && before.includes(fileName))
            this.error(
              `unrecognised reference to ${fileName}: ${before.slice(before.indexOf(fileName) - 60, before.indexOf(fileName) + 40)}`,
            );
        }
      }
    },
  };
}

/** Where the single file is published; its link-preview tags point there. */
const PAGES_URL = 'https://gitguy268.github.io/ultra-realistic-vinyl-player-html/';

/**
 * The app's head carries a manifest, a canonical address, JSON-LD and a note for file:// visitors.
 * The single file needs none of them: it works from file:// and installs nothing. Its icon is the
 * SVG favicon as a data: URL, and its link-preview tags name its own address.
 */
function singleFileHead(): Plugin {
  const svg = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)), 'utf8');
  const icon = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const spec = readFileSync(
    fileURLToPath(new URL('./src/spec/deck.json', import.meta.url)),
    'utf8',
  ).trim();
  return {
    name: 'single-file-head',
    transformIndexHtml(html) {
      return (
        html
          .replace(/\s*<link rel="(manifest|canonical|apple-touch-icon)"[^>]*>/g, '')
          .replace(/\s*<link rel="icon"[^>]*>/g, '')
          .replace(
            '</title>',
            `</title>\n    <link rel="icon" type="image/svg+xml" href="${icon}" />`,
          )
          .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
          // The shared spec travels with the page, so check-spec can compare the two builds.
          .replace(
            '</head>',
            `  <script type="application/json" id="deck-spec">${spec}</script>\n  </head>`,
          )
          .replace(/\s*<p id="file-notice"[\s\S]*?<\/p>\s*<script>[\s\S]*?<\/script>/, '')
          .replace(/https:\/\/gitguy268-ultra-realistic-vinyl-player\.vercel\.app\//g, PAGES_URL)
          // One line per meta tag, as html-1's lint reads link-preview tags.
          .replace(
            /<meta\s+([^>]*?)\s*\/?>/g,
            (_, attrs: string) => `<meta ${attrs.replace(/\s+/g, ' ')} />`,
          )
      );
    },
  };
}

/**
 * The credits dialog shows NOTICE. Its addresses stay readable without their scheme, so the page
 * holds no URL it could ever request (html-1's lint rule).
 */
function plainNoticeAddresses(): Plugin {
  return {
    name: 'plain-notice-addresses',
    transform(code, id) {
      return id.endsWith('/NOTICE?raw') ? code.replace(/https?:\/\//g, '') : null;
    },
  };
}

/** Fails the build if the page could reach outside itself or prints debug output. */
function auditSingleFile(outDir: string): Plugin {
  return {
    name: 'audit-single-file',
    closeBundle(error) {
      // After a failed build there is nothing to audit; the build's own error is reported.
      if (error || !existsSync(outDir)) return;
      const files = readdirSync(outDir);
      if (files.length !== 1 || files[0] !== 'index.html') {
        this.error(`the single-file build must emit only index.html, not ${files.join(', ')}`);
      }
      const html = readFileSync(`${outDir}/index.html`, 'utf8');
      const problems: string[] = [];
      if (/<script\b[^>]*\bsrc=/.test(html)) problems.push('an external <script src>');
      const outside = html
        .replace(/<meta property="og:[^>]*>/g, '')
        .replace(/https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xhtml|1999\/xlink)/g, '')
        .match(/(https?:)?\/\/[a-z0-9-]+\.[a-z]{2,}[^\s"'<>)]*/gi);
      for (const url of new Set(outside ?? [])) problems.push(`an outside address: ${url}`);
      for (const call of html.match(
        /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\s*\(/g,
      ) ?? []) {
        problems.push(`a network call: ${call}`);
      }
      // `?selftest` logs its verdict: that is its contract with html-1's tests (H37).
      const code = html.replace(/console\.log\([^;{}]*?selftest ok[^;{}]*?\)/, '');
      for (const call of code.match(/console\.(log|debug|info)\(/g) ?? [])
        problems.push(`debug output: ${call}`);
      if (problems.length) this.error(`single file:\n  ${[...new Set(problems)].join('\n  ')}`);
    },
  };
}

const OUT_DIR = fileURLToPath(new URL('./dist-single', import.meta.url));

export default defineConfig({
  define: { __PROFILE__: JSON.stringify('html') },
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./src/ui/no-service-worker.ts', import.meta.url),
      ),
    },
  },
  base: './',
  plugins: [
    scrubThree(),
    singleFileHead(),
    plainNoticeAddresses(),
    inlineWorklet(),
    viteSingleFile({ removeViteModuleLoader: true }),
    auditSingleFile(OUT_DIR),
  ],
  worker: { format: 'es' },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    copyPublicDir: false,
    assetsInlineLimit: () => true,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 5000,
  },
});
