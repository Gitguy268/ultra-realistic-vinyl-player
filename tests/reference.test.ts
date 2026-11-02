import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * docs/REFERENCE.md's claims are the deal with the reference photographs: every visible feature names
 * grade-A evidence and the code that implements it. This keeps both honest as the code moves.
 */
const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const text = read('docs/REFERENCE.md');
const claims = text.slice(text.indexOf('## Claims'), text.indexOf('## Plan measurements'));
const rows = claims
  .split('\n')
  .filter(
    (line) => line.startsWith('| ') && !line.startsWith('| Feature') && !line.startsWith('| --'),
  )
  .map((line) => line.split('|').map((cell) => cell.trim()))
  .map((cells) => ({ feature: cells[1]!, evidence: cells[2]!, code: cells[3]! }));

// Quoted fields hold commas.
const csv = (line: string): string[] =>
  [...line.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].map((m) => m[2] ?? m[1] ?? '');
const index = read('docs/reference/INDEX.csv').split('\n');
const header = csv(index[0] ?? '');
const gradeAt = header.indexOf('grade');
const fileAt = header.indexOf('file');
const gradeOf = new Map<string, string | undefined>(
  index.slice(1).map((line) => {
    const cells = csv(line);
    const id = /v(\d+)\./.exec(cells[fileAt] ?? '')?.[1];
    return [`v${id}`, cells[gradeAt]] as const;
  }),
);

describe('reference claims', () => {
  it('finds the claims table', () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  it.each(rows)('$feature', ({ evidence, code }) => {
    // At least one photograph cited is grade A; gaps are filled from the ones the document names.
    const cited = [...new Set(evidence.match(/\bv\d+\b/g) ?? [])];
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.some((v) => gradeOf.get(v) === 'A')).toBe(true);
    for (const crop of evidence.match(/`[^`]+`/g) ?? []) {
      expect(
        existsSync(new URL(`../docs/reference/crops/${crop.slice(1, -1)}.jpg`, import.meta.url)),
      ).toBe(true);
    }
    const refs = [...code.matchAll(/`([^`]+)`(?: › `([^`]+)`)?/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, path, symbol] of refs) {
      const source = `src/${path!.trim()}`;
      expect(existsSync(new URL(`../${source}`, import.meta.url)), source).toBe(true);
      if (symbol) {
        const name = symbol.trim().split(/[ .(]/)[0]!;
        expect(read(source).includes(name), `${source} › ${name}`).toBe(true);
      }
    }
  });
});
