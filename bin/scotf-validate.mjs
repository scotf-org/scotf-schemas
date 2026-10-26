#!/usr/bin/env node
// Command line validator: checks EPCIS documents against the GS1 schema and a SCOTF profile.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
import { validateFile, PROFILES } from '../src/validate.mjs';
import { fetchGs1Schema } from '../scripts/fetch-gs1-schema.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--profile');
const profile = flag('--profile');

if (!files.length || !profile) {
  console.error(`usage: scotf-validate --profile <${Object.keys(PROFILES).join('|')}> <file.json> [...]

Validates each document against the GS1 EPCIS 2.0 JSON Schema first, then against the SCOTF
profile. The GS1 schema is fetched on first use and cached; it is not stored in this repository.

Profiles:
${Object.values(PROFILES).map((p) => `  ${p.id}  ${p.title}`).join('\n')}`);
  process.exit(2);
}

if (!PROFILES[profile]) {
  console.error(`Unknown profile "${profile}". Known profiles: ${Object.keys(PROFILES).join(', ')}.`);
  process.exit(2);
}

const gs1 = await fetchGs1Schema();
let failed = 0;

for (const file of files) {
  let result;
  try {
    result = await validateFile(file, profile, gs1);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${file}\n      could not be read or parsed: ${e.message}`);
    continue;
  }
  if (result.valid) {
    console.log(`ok    ${file}`);
    continue;
  }
  failed++;
  const where = result.stage === 'gs1' ? 'GS1 EPCIS 2.0 schema' : `SCOTF ${profile}`;
  console.error(`FAIL  ${file}  (${where})`);
  for (const e of result.errors) console.error(`      ${e.text}`);
}

console.log(`\nscotf-validate: ${files.length} document(s), ${failed} failing`);
process.exit(failed ? 1 : 0);
