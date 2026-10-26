// Every valid example validates; every invalid one fails with the error it claims to show.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// The invalid examples carry their expected error in a sidecar, so a test failure says which
// example stopped failing and why it was meant to. An invalid example that merely fails is not
// enough: it could be failing for a reason nobody intended, which hides the rule it documents.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { validateFile, PROFILES } from '../src/validate.mjs';
import { fetchGs1Schema } from '../scripts/fetch-gs1-schema.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXAMPLES = join(ROOT, 'examples');
let gs1;

before(async () => { gs1 = await fetchGs1Schema(); });

const listDocs = async (dir) =>
  (await readdir(dir).catch(() => []))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.expect.json'))
    .sort();

for (const profile of Object.keys(PROFILES)) {
  describe(`${profile} · ${PROFILES[profile].title}`, () => {
    test('has at least one valid and one invalid example', async () => {
      const valid = await listDocs(join(EXAMPLES, profile, 'valid'));
      const invalid = await listDocs(join(EXAMPLES, profile, 'invalid'));
      assert.ok(valid.length > 0, `${profile} has no valid examples`);
      assert.ok(invalid.length > 0, `${profile} has no invalid examples`);
    });

    test('every valid example passes the GS1 schema and the profile', async () => {
      const dir = join(EXAMPLES, profile, 'valid');
      for (const f of await listDocs(dir)) {
        const r = await validateFile(join(dir, f), profile, gs1);
        assert.equal(r.valid, true,
          `${profile}/valid/${f} should validate but failed at the ${r.stage} stage:\n` +
          r.errors.map((e) => `  ${e.text}`).join('\n'));
      }
    });

    test('every invalid example fails, with the error its sidecar claims', async () => {
      const dir = join(EXAMPLES, profile, 'invalid');
      for (const f of await listDocs(dir)) {
        const r = await validateFile(join(dir, f), profile, gs1);
        assert.equal(r.valid, false, `${profile}/invalid/${f} should not validate, but it did`);

        const sidecar = join(dir, f.replace(/\.json$/, '.expect.json'));
        const expected = JSON.parse(await readFile(sidecar, 'utf8'));
        const messages = r.errors.map((e) => e.text).join('\n');
        assert.ok(messages.includes(expected.error),
          `${profile}/invalid/${f} failed, but not for the documented reason.\n` +
          `  expected to contain: ${expected.error}\n  actual errors:\n${r.errors.map((e) => `    ${e.text}`).join('\n')}`);
      }
    });

    test('every invalid example explains itself', async () => {
      const dir = join(EXAMPLES, profile, 'invalid');
      for (const f of await listDocs(dir)) {
        const sidecar = join(dir, f.replace(/\.json$/, '.expect.json'));
        const expected = JSON.parse(await readFile(sidecar, 'utf8'));
        assert.ok(expected.error, `${f} sidecar has no expected error`);
        assert.ok((expected.why ?? '').length > 30,
          `${f} sidecar does not say why the document is invalid`);
      }
    });
  });
}

describe('examples are publishable as they stand', () => {
  test('no example carries test scaffolding or real company data', async () => {
    for (const profile of Object.keys(PROFILES)) {
      for (const kind of ['valid', 'invalid']) {
        const dir = join(EXAMPLES, profile, kind);
        for (const f of await listDocs(dir)) {
          const raw = await readFile(join(dir, f), 'utf8');
          assert.ok(!raw.includes('$expect'),
            `${profile}/${kind}/${f} carries test scaffolding; expectations belong in the sidecar`);
          // Synthetic data only: the GS1 documentation prefix and the reserved example domains.
          for (const m of raw.matchAll(/https?:\/\/([^/"]+)/g)) {
            assert.match(m[1], /(^|\.)(example\.(com|net|org)|ref\.gs1\.org|ref\.scotf\.org)$/,
              `${profile}/${kind}/${f} points at ${m[1]}; examples use reserved documentation hosts only`);
          }
        }
      }
    }
  });
});
