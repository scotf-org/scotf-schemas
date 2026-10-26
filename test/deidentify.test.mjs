// Test 2 of two: the run-time behaviour of the deidentification method.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// The completeness test in coverage.test.mjs checks that the table describes every field the
// schemas allow. This one checks what actually happens to data: that identity goes, that the
// relationships the pilots study survive, and that a field nobody has considered is removed
// rather than carried.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { deriveKeys, deidentifyDocument } from '../src/deidentify.mjs';
import { runRiskReview } from '../src/risk-review.mjs';
import { validateDocument } from '../src/validate.mjs';
import { fetchGs1Schema } from '../scripts/fetch-gs1-schema.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IN = join(ROOT, 'examples', 'deidentify', 'input');
const SEED = 'scot-22-worked-example';

const read = (f) => JSON.parse(readFileSync(join(IN, f), 'utf8'));
const siteRoles = read('site-roles.synthetic.json').roles;
const treat = (doc, seed = SEED) =>
  deidentifyDocument(doc, deriveKeys(seed), { siteRoles });

const strings = (value, out = []) => {
  if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (k !== '@context') strings(v, out);
  } else if (typeof value === 'string') out.push(value);
  return out;
};

let gs1;
before(async () => { gs1 = await fetchGs1Schema(); });

describe('deidentification, run-time behaviour', () => {
  test('the same seed gives the same dataset, a different seed does not', () => {
    const a = treat(read('profile-1-transit.synthetic.json')).doc;
    const b = treat(read('profile-1-transit.synthetic.json')).doc;
    assert.deepEqual(a, b, 'the worked example has to be reproducible from its seed');

    const c = treat(read('profile-1-transit.synthetic.json'), 'a-different-seed').doc;
    assert.notEqual(
      c.epcisBody.eventList[0].epcList[0],
      a.epcisBody.eventList[0].epcList[0],
      'two datasets released with different seeds must not share an identifier, or they can be joined'
    );
  });

  test('a pallet keeps one identifier across events and across profiles', () => {
    const p1 = treat(read('profile-1-transit.synthetic.json')).doc;
    const p2 = treat(read('profile-2-inspections.synthetic.json')).doc;
    const input = 'urn:epc:id:sscc:0614141.1000000001';
    const fromP1 = p1.epcisBody.eventList[0].epcList[0];
    const fromP2 = p2.epcisBody.eventList[0].epcList[0];

    assert.notEqual(fromP1, input, 'the published identifier must not be the input one');
    assert.equal(fromP1, fromP2,
      'the join the pilots depend on is two companies recognising the same pallet');
    assert.match(fromP1, /^urn:epc:id:sscc:0000000\.[0-9]{10}$/,
      'the pseudonym must still be a well formed SSCC, or the output stops being EPCIS');
  });

  test('no input identifier survives anywhere in the output', () => {
    for (const f of ['profile-1-transit.synthetic.json', 'profile-2-inspections.synthetic.json']) {
      const input = read(f);
      const out = treat(input).doc;
      const published = strings(out).join('\n');
      // Every real identifier in the input, by its distinguishing part rather than in full, so a
      // partially rewritten identifier is caught too.
      for (const fragment of ['0614141', '0629999', '1000000001', '012345', 'L2609', 'L2612',
        'tracker-a1', 'tracker-a2', 'tracker-b1', 'tracker-b2']) {
        assert.ok(!published.includes(fragment),
          `${f}: the fragment ${fragment} from the input survived into the output`);
      }
    }
  });

  test('trading-party, transaction, location and free-text fields are gone', () => {
    const out = treat(read('profile-1-transit.synthetic.json')).doc;
    const dirty = out.epcisBody.eventList[2];
    for (const key of ['sourceList', 'destinationList', 'bizTransactionList', 'certificationInfo']) {
      assert.ok(!(key in dirty), `${key} names a company and must not survive`);
    }
    const published = strings(out).join('\n');
    assert.ok(!/https?:\/\//.test(published), 'a link survived treatment');
    assert.ok(!published.includes('door left open'), 'free text survived treatment');
    assert.ok(!published.includes('Salinas'), 'a place name survived treatment');
    assert.ok(!('scotf:trackerPlacement' in out.epcisBody.eventList[1]),
      'the placement description and its photographs must both go');
  });

  test('a field with no row is suppressed by the run-time default', () => {
    // The point of the default. This field is not in the treatment table, is not in either
    // profile, and nobody has considered it; the standard lets an event carry it anyway.
    const doc = read('profile-1-transit.synthetic.json');
    doc.epcisBody.eventList[0]['example:internalNote'] = 'picked by the night crew at the depot';
    doc.epcisBody.eventList[0]['example:buyerContact'] = 'someone@example.org';

    const { doc: out, report } = treat(doc);
    const event = out.epcisBody.eventList[0];
    assert.ok(!('example:internalNote' in event), 'an unrowed field must be removed, not carried');
    assert.ok(!('example:buyerContact' in event), 'an unrowed field must be removed, not carried');
    assert.deepEqual(
      report.suppressedByDefault,
      ['example:buyerContact', 'example:internalNote'],
      'the default must record what it removed, so a reader can see the table was incomplete'
    );
  });

  test('a Position report is removed and the measurements stay', () => {
    const out = treat(read('profile-1-transit.synthetic.json')).doc;
    const reports = out.epcisBody.eventList[1].sensorElementList[0].sensorReport;
    const types = reports.map((r) => r.type);
    assert.ok(!types.some((t) => String(t).includes('Position')), 'the track must be gone');
    assert.deepEqual(types, ['Temperature', 'Illuminance'],
      'dropping the track must not take the readings with it');
  });

  test('exception codes are kept, and the inspection findings with them', () => {
    const out = treat(read('profile-2-inspections.synthetic.json')).doc;
    const events = out.epcisBody.eventList;
    assert.deepEqual(events[1]['scotf:inspection'].exceptions, ['no-photo']);
    assert.deepEqual(events[3]['scotf:inspection'].exceptions, ['label-not-read', 'unmatched']);
    assert.equal(events[1]['scotf:inspection'].ripenessStage, 4,
      'the measurements the pilots study must survive');
    assert.ok(!('photoRefs' in events[0]['scotf:inspection']),
      'photograph references must not survive, even though the verdict does');
  });

  test('every time moves by the same whole number of days', () => {
    const input = read('profile-1-transit.synthetic.json');
    const out = treat(input).doc;
    const shifts = new Set();
    input.epcisBody.eventList.forEach((e, i) => {
      const before = new Date(e.eventTime);
      const after = new Date(out.epcisBody.eventList[i].eventTime);
      // eventTime is rounded to the minute, so compare whole days.
      shifts.add(Math.round((before - after) / 86400000));
    });
    assert.equal(shifts.size, 1, 'one offset for the whole dataset, or intervals stop meaning anything');
    assert.ok([...shifts][0] >= 1, 'the shift must actually move the dates');
    for (const e of out.epcisBody.eventList) {
      assert.equal(e.eventTimeZoneOffset, '+00:00', 'a time zone narrows the location');
    }
  });

  test('intervals survive the shift, to the minute', () => {
    const input = read('profile-1-transit.synthetic.json');
    const out = treat(input).doc;
    const gap = (list, a, b) =>
      (new Date(list[b].eventTime) - new Date(list[a].eventTime)) / 60000;
    const beforeGap = gap(input.epcisBody.eventList, 0, 1);
    const afterGap = gap(out.epcisBody.eventList, 0, 1);
    // Rounding eventTime to the minute moves an interval by up to 30 seconds either way. The
    // pilots measure transit in hours, so a minute is immaterial - but "unchanged" is too strong
    // a word for it, and this test records which of the two the method actually delivers.
    assert.ok(Math.abs(beforeGap - afterGap) <= 1,
      `interval moved by more than a minute: ${beforeGap} -> ${afterGap}`);
  });

  test('the treated output is still a conforming EPCIS document', async () => {
    for (const [f, profile] of [
      ['profile-1-transit.synthetic.json', 'profile-1'],
      ['profile-2-inspections.synthetic.json', 'profile-2']
    ]) {
      const out = treat(read(f)).doc;
      const result = await validateDocument(out, profile, gs1);
      assert.equal(result.valid, true,
        `${f}: treated output failed ${result.stage}:\n` +
        (result.errors ?? []).map((e) => `  ${e.text}`).join('\n'));
    }
  });

  test('the risk review fails loudly when text survives', () => {
    const out = treat(read('profile-2-inspections.synthetic.json')).doc;
    // A negative control: the check has to be able to fail, or it proves nothing.
    out.epcisBody.eventList[0]['scotf:inspection'].inspectedBy = 'checked by the duty supervisor';
    const review = runRiskReview([out]);
    const residual = review.checks.find((c) => c.check === 'residual text and references');
    assert.equal(residual.outcome, 'failed');
    assert.equal(review.failed.length, 1);
  });

  test('the risk review passes on the dataset as published', () => {
    const docs = [
      treat(read('profile-1-transit.synthetic.json')).doc,
      treat(read('profile-2-inspections.synthetic.json')).doc
    ];
    const review = runRiskReview(docs);
    assert.deepEqual(review.failed, [], 'the published sample must not carry residual text');
  });
});
