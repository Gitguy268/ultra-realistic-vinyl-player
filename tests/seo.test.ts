import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CANONICAL = 'https://gitguy268-ultra-realistic-vinyl-player.vercel.app/';

describe('index.html', () => {
  it('has the required head tags', () => {
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<meta charset="UTF-8"/i);
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/<meta name="theme-color" content="#[0-9a-f]{6}"/);
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/favicon\.png"/);
    expect(html).toMatch(/<link rel="icon"[^>]*href="\/favicon\.ico"/);
    expect(html).toContain('<title>Ultra-Realistic Vinyl Player — A Browser Turntable</title>');
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{50,}"/);
    expect(html).toContain(`<link rel="canonical" href="${CANONICAL}"`);
    for (const property of ['og:type', 'og:title', 'og:description', 'og:url']) {
      expect(html).toContain(`property="${property}"`);
    }
    expect(html).toContain(`<meta property="og:url" content="${CANONICAL}"`);
  });
});
