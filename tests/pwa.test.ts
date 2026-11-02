import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = (file: string): URL => new URL(`../${file}`, import.meta.url);
const read = (file: string): string => readFileSync(path(file), 'utf8');

const CANONICAL = 'https://gitguy268-ultra-realistic-vinyl-player.vercel.app/';
const html = read('index.html');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

/** Width and height from a PNG file's IHDR chunk. */
function pngSize(file: string): string {
  const data = readFileSync(path(file));
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
}

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest')) as Manifest;
  const darkBackground = /--bg:\s*light-dark\(#[0-9a-f]{6},\s*(#[0-9a-f]{6})\)/.exec(
    read('src/styles/tokens.css'),
  )?.[1];

  it('has the required fields', () => {
    expect(manifest.name).toBe('Ultra-Realistic Vinyl Player');
    expect(manifest.short_name).toBe('Vinyl Player');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('takes its theme and background colours from the tokens', () => {
    expect(darkBackground).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.theme_color).toBe(darkBackground);
    expect(manifest.background_color).toBe(darkBackground);
    expect(html).toContain(`<meta name="theme-color" content="${darkBackground}"`);
  });

  it('declares 192 and 512 px icons and a maskable icon', () => {
    const find = (sizes: string, purpose: string): ManifestIcon | undefined =>
      manifest.icons.find((icon) => icon.sizes === sizes && icon.purpose === purpose);
    expect(find('192x192', 'any')).toBeDefined();
    expect(find('512x512', 'any')).toBeDefined();
    expect(find('512x512', 'maskable')).toBeDefined();
  });

  it('points every icon at a committed PNG of the declared size', () => {
    for (const icon of manifest.icons) {
      const file = `public${icon.src}`;
      expect(existsSync(path(file)), file).toBe(true);
      expect(icon.type).toBe('image/png');
      expect(pngSize(file)).toBe(icon.sizes);
    }
  });

  it('is linked from index.html', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
  });
});

describe('structured data and social tags', () => {
  it('embeds valid WebApplication JSON-LD for the canonical URL', () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(json).toBeDefined();
    const data = JSON.parse(json ?? '') as Record<string, unknown>;
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBe('WebApplication');
    expect(data.name).toBe('Ultra-Realistic Vinyl Player');
    expect(data.url).toBe(CANONICAL);
  });

  it('references a committed 1200×630 Open Graph image', () => {
    expect(html).toContain(`content="${CANONICAL}og.png"`);
    expect(pngSize('public/og.png')).toBe('1200x630');
  });
});

describe('crawler files', () => {
  it('robots.txt allows crawling and names the sitemap on the canonical domain', () => {
    const robots = read('public/robots.txt');
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toContain(`Sitemap: ${CANONICAL}sitemap.xml`);
  });

  it('sitemap.xml lists exactly the canonical URL', () => {
    const locations = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)];
    expect(locations.map((match) => match[1])).toEqual([CANONICAL]);
  });

  it('llms.txt describes the app and references the canonical domain', () => {
    const llms = read('public/llms.txt');
    expect(llms).toMatch(/^# Ultra-Realistic Vinyl Player$/m);
    expect(llms).toContain(CANONICAL);
  });
});
