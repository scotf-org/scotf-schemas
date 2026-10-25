#!/usr/bin/env node
// Runs the deidentification method over a directory of EPCIS documents.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// The six steps of the worked example, in order: validate the input, derive the keys from the
// seed, apply the treatments, run the risk review, validate the output, write the dataset with
// its notes and coverage report. Every step is deterministic from the seed.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { validateDocument, PROFILES } from '../src/validate.mjs';
import { fetchGs1Schema } from '../scripts/fetch-gs1-schema.mjs';
import { deriveKeys, deidentifyDocument } from '../src/deidentify.mjs';
import { runRiskReview } from '../src/risk-review.mjs';
import { unionPaths } from '../src/union-paths.mjs';
import { rowFor, isExcluded, EXCLUDED, TREATMENTS } from '../src/treatments.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const seed = flag('--seed');
const inDir = flag('--in', 'examples/deidentify/input');
const outDir = flag('--out', 'examples/deidentify/output');

if (!seed) {
  console.error(`usage: scotf-deidentify --seed <text> [--in <dir>] [--out <dir>]

Applies the SCOTF deidentification method to every EPCIS document in --in and writes the treated
dataset, its notes and a coverage report to --out. The seed derives the hash key and the time
offset, so the same seed always gives the same dataset. The seed and the keys it derives are not
written to the output: they stay with the data owner.`);
  process.exit(2);
}

// Which profile a document belongs to is decided by its business step, not by its file name, so a
// renamed file cannot be checked against the wrong profile.
const profileOf = (doc) => {
  const step = doc.epcisBody?.eventList?.[0]?.bizStep;
  if (step === 'sensor_reporting') return 'profile-1';
  if (step === 'inspecting') return 'profile-2';
  return null;
};

const gs1 = await fetchGs1Schema();
const roleFile = join(inDir, 'site-roles.synthetic.json');
let siteRoles = {};
try {
  siteRoles = JSON.parse(readFileSync(roleFile, 'utf8')).roles ?? {};
} catch {
  console.error(`note: no site role map at ${roleFile}; every site will be published as "unstated"`);
}

const inputs = readdirSync(inDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('site-roles'))
  .sort();

const keys = deriveKeys(seed);
const treated = [];
const reports = [];
const siteMap = new Map();
let failures = 0;

for (const file of inputs) {
  const doc = JSON.parse(readFileSync(join(inDir, file), 'utf8'));
  const profile = profileOf(doc);
  if (!profile) {
    console.error(`FAIL  ${file}: cannot tell which profile this is from its first bizStep`);
    failures++;
    continue;
  }

  // Step 1. An input that does not conform is not deidentified: the treatments assume the shapes
  // the profile guarantees, so a malformed input would be treated on a guess.
  const before = await validateDocument(doc, profile, gs1);
  if (!before.valid) {
    console.error(`FAIL  ${file}: input does not validate against ${profile} (${before.stage})`);
    for (const e of before.errors) console.error(`      ${e.text}`);
    failures++;
    continue;
  }

  const { doc: out, report } = deidentifyDocument(doc, keys, { siteRoles });
  for (const s of report.siteMap) siteMap.set(s.id, s.roleClass);
  treated.push({ file, profile, doc: out });
  reports.push({ file, profile, ...report });
  console.log(`ok    ${file} -> ${profile}, ${doc.epcisBody.eventList.length} event(s)`);
}

if (failures) {
  console.error(`\nscotf-deidentify: ${failures} input(s) rejected; nothing written`);
  process.exit(1);
}

// Step 4. The risk review may change the data, so it runs before the output is validated.
const review = runRiskReview(treated.map((t) => t.doc), { siteMap });

// Step 5. The point of rule 5: a deidentified event is still an EPCIS event.
for (const t of treated) {
  const after = await validateDocument(t.doc, t.profile, gs1);
  if (!after.valid) {
    console.error(`FAIL  ${t.file}: OUTPUT does not validate against ${t.profile} (${after.stage})`);
    for (const e of after.errors) console.error(`      ${e.text}`);
    failures++;
  }
}

if (review.failed.length) {
  for (const c of review.failed) {
    console.error(`FAIL  risk review check "${c.check}"`);
    for (const h of c.hits ?? []) console.error(`      ${h.path}: ${h.reason}`);
  }
  failures++;
}

if (failures) {
  console.error('\nscotf-deidentify: output rejected; nothing written');
  process.exit(1);
}

// Step 6.
mkdirSync(outDir, { recursive: true });
for (const t of treated) {
  const name = basename(t.file).replace(/\.json$/, '.deidentified.json');
  writeFileSync(join(outDir, name), JSON.stringify(t.doc, null, 2) + '\n');
}

const paths = unionPaths({
  gs1Path: new URL('../vendor/gs1/epcis-json-schema.json', import.meta.url).pathname.replace(/^\//, ''),
  profilePaths: [
    'schemas/profile-1-sensor-event.schema.json',
    'schemas/profile-2-quality-observation.schema.json'
  ]
});

const coverage = {
  synthetic: true,
  note: 'Every property path a Profile 1 or Profile 2 event may carry, with the treatment row that covers it.',
  rowsInTable: TREATMENTS.length,
  pathsChecked: paths.filter((p) => !isExcluded(p)).length,
  excluded: Object.entries(EXCLUDED).map(([path, reason]) => ({ path, reason })),
  paths: paths.map((p) => {
    if (isExcluded(p)) return { path: p, treatment: 'excluded', coveredBy: null };
    const row = rowFor(p);
    return { path: p, treatment: row ? row.action : 'MISSING', coveredBy: row ? row.path : null };
  })
};
const missing = coverage.paths.filter((p) => p.treatment === 'MISSING');

const notes = {
  synthetic: true,
  note: 'A synthetic dataset, shaped like the SCOTF pilots. No real company, site, shipment or reading appears in it.',
  method: 'SCOTF deidentification method, Table 2 treatments applied field by field.',
  reproducibility: 'Derived from a seed given on the command line. The same seed gives the same dataset.',
  keyCustody: 'The hash key and the time offset are derived from the seed and are not published. They stay with the data owner.',
  resolutions: {
    time: 'Every time is shifted by one whole number of days, the same for the whole dataset, and eventTime is rounded to the minute. Intervals, order and the shape of a curve are unchanged.',
    timeZone: 'eventTimeZoneOffset is published as +00:00 and times are published in UTC, because a time zone narrows the location.',
    location: 'Each site is published as a synthetic SGLN under the dataset prefix 0000000, with its role class listed below. The real facility identifier does not appear.',
    quantity: 'A quantity above 10 is published as the floor of its band. A group below the minimum size has its quantity suppressed.',
    position: 'Position reports are removed. A track is the strongest location signal in a pilot dataset.'
  },
  siteRoleClasses: [...siteMap.entries()].map(([id, roleClass]) => ({ id, roleClass })),
  riskReview: review.checks,
  documents: treated.map((t) => ({
    source: t.file,
    profile: t.profile,
    events: t.doc.epcisBody.eventList.length
  })),
  fieldsSuppressedByDefault: [...new Set(reports.flatMap((r) => r.suppressedByDefault))].sort()
};

writeFileSync(join(outDir, 'dataset-notes.json'), JSON.stringify(notes, null, 2) + '\n');
writeFileSync(join(outDir, 'coverage-report.json'), JSON.stringify(coverage, null, 2) + '\n');

console.log(`\nrisk review: ${review.checks.map((c) => `${c.check}=${c.outcome}`).join(', ')}`);
console.log(`coverage: ${coverage.pathsChecked} paths checked, ${missing.length} without a treatment`);
console.log(`written: ${outDir}`);
process.exit(missing.length ? 1 : 0);
