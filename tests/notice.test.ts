import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const notice = read('NOTICE');
const manifest = JSON.parse(read('package.json')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('NOTICE', () => {
  it.each(Object.entries(manifest.dependencies))(
    'credits runtime dependency %s %s',
    (name, version) => {
      expect(notice).toContain(`${name} ${version}`);
    },
  );

  it.each(Object.entries(manifest.devDependencies))(
    'lists development dependency %s %s',
    (name, version) => {
      expect(notice).toContain(`${name} ${version}`);
    },
  );
});

describe('package.json', () => {
  it('pins every dependency to an exact version', () => {
    const versions = [
      ...Object.values(manifest.dependencies),
      ...Object.values(manifest.devDependencies),
    ];
    for (const version of versions) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
