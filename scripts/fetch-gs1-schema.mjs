// Fetches the official GS1 EPCIS 2.0 JSON Schema into vendor/, which is not committed.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// The profiles here extend the GS1 schema and never fork it, so the normative artefact is not
// copied into this repository: it stays GS1's to publish and to version. The tests need it, so it
// is fetched on demand and cached. ref.gs1.org occasionally times out, hence the retries; a miss
// must fail loudly rather than let the suite quietly skip the check that matters most.
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const GS1_SCHEMA_URL = 'https://ref.gs1.org/standards/epcis/2.0.0/epcis-json-schema.json';
export const GS1_SCHEMA_PATH = join(ROOT, 'vendor', 'gs1', 'epcis-json-schema.json');

const fresh = async (p) => {
  try { return (await stat(p)).size > 1000; } catch { return false; }
};

export async function fetchGs1Schema({ force = false, attempts = 3 } = {}) {
  if (!force && (await fresh(GS1_SCHEMA_PATH))) return GS1_SCHEMA_PATH;
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(GS1_SCHEMA_URL, { signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = await r.text();
      JSON.parse(body); // a truncated download is worse than no download
      await mkdir(join(ROOT, 'vendor', 'gs1'), { recursive: true });
      await writeFile(GS1_SCHEMA_PATH, body);
      return GS1_SCHEMA_PATH;
    } catch (e) {
      last = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, i * 2000));
    }
  }
  throw new Error(
    `Could not fetch the GS1 EPCIS 2.0 JSON Schema from ${GS1_SCHEMA_URL}: ${last?.message}. ` +
    'The schema is not stored in this repository because it belongs to GS1. Run `npm run fetch:gs1` ' +
    'again when the host is reachable.',
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetch-gs1-schema.mjs')) {
  const path = await fetchGs1Schema({ force: process.argv.includes('--force') });
  console.log(`gs1 schema: ${path}`);
}
