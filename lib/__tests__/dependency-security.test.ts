import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lock = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8'),
) as { packages: Record<string, { version?: string }> };

/** Compare two semver strings: returns 1 if a>b, -1 if a<b, 0 if equal. */
function cmpSemver(a: string, b: string): number {
  const pa = a.replace(/^\D*/, '').split('.').map((n) => parseInt(n, 10));
  const pb = b.replace(/^\D*/, '').split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/** Installed version of a top-level dependency, from the lockfile. */
function installedVersion(pkg: string): string {
  const v = lock.packages[`node_modules/${pkg}`]?.version;
  if (!v) throw new Error(`${pkg} not found in package-lock.json`);
  return v;
}

describe('security dependency floors', () => {
  it('dompurify is patched against the 8 XSS/pollution GHSA advisories (>=3.4.11)', () => {
    expect(cmpSemver(installedVersion('dompurify'), '3.4.11')).toBeGreaterThanOrEqual(0);
  });

  it('next includes the June security backports (>=16.2.10)', () => {
    expect(cmpSemver(installedVersion('next'), '16.2.10')).toBeGreaterThanOrEqual(0);
  });
});
