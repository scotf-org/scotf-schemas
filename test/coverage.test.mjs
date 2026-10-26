// Test 1 of two: schema-time completeness of the deidentification treatment table.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// This test exists because the acceptance criterion "the method covers every field" can be met by
// a test that proves nothing. A list of fields taken from the profile schemas alone does not
// include eventTime, eventTimeZoneOffset, or the choice between epcList and quantityList, because
// the profiles extend the standard and do not restate it. Such a test passes while never checking
// the field the whole time-shift rule exists for. The list here is therefore the union of the GS1
// ObjectEvent property paths and the properties the profiles add.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { unionPaths } from '../src/union-paths.mjs';
import { TREATMENTS, rowFor, isExcluded, EXCLUDED } from '../src/treatments.mjs';
import { fetchGs1Schema, GS1_SCHEMA_PATH } from '../scripts/fetch-gs1-schema.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let paths;
let checked;

before(async () => {
  await fetchGs1Schema();
  paths = unionPaths({
    gs1Path: GS1_SCHEMA_PATH,
    profilePaths: [
      join(ROOT, 'schemas', 'profile-1-sensor-event.schema.json'),
      join(ROOT, 'schemas', 'profile-2-quality-observation.schema.json')
    ]
  });
  checked = paths.filter((p) => !isExcluded(p));
});

describe('deidentification coverage', () => {
  test('the union list is built from both the standard and the profiles', () => {
    // Guards against the list quietly narrowing to one source, which is how this test would
    // become vacuous. Each of these comes from a different place.
    for (const p of ['eventTime', 'eventTimeZoneOffset', 'bizLocation.id', 'sourceList.source']) {
      assert.ok(paths.includes(p), `${p} is a standard EPCIS path and must be in the union list`);
    }
    for (const p of ['scotf:inspection.exceptions', 'scotf:trackerPlacement.description']) {
      assert.ok(paths.includes(p), `${p} is added by a profile and must be in the union list`);
    }
    assert.ok(paths.length > 60, `union list looks too short: ${paths.length} paths`);
  });

  test('every property an event may carry has a treatment', () => {
    const missing = checked.filter((p) => !rowFor(p));
    assert.deepEqual(missing, [],
      'these property paths have no row in the treatment table:\n' +
      missing.map((m) => `  ${m}`).join('\n'));
  });

  test('ilmd is excluded by name, with a reason, and nothing else is', () => {
    const excluded = paths.filter(isExcluded);
    assert.deepEqual(excluded, ['ilmd'],
      'the exclusion list must stay narrow: it is the one way a field can leave this test');
    assert.ok((EXCLUDED.ilmd ?? '').length > 30, 'an excluded field must record why');
  });

  test('the subtree rule resolves to the most specific row', () => {
    // errorDeclaration has a child row with a different treatment from its siblings, so this is
    // where a parent-wins bug would show up.
    assert.equal(rowFor('errorDeclaration.reason').path, 'errorDeclaration.reason');
    assert.equal(rowFor('errorDeclaration.reason').action, 'keep');
    // sourceList covers its entries through one row, which is why the entries have no row.
    assert.equal(rowFor('sourceList.source').path, 'sourceList');
    assert.equal(rowFor('sourceList.source').action, 'suppress');
    // The temperature row covers both of its leaves.
    assert.equal(rowFor('scotf:inspection.temperature.value').path, 'scotf:inspection.temperature');
  });

  test('no row matches a property path that does not exist', () => {
    // A warning rather than a failure in the method, but the draft says it is reported, and a
    // stale row is how the table starts describing a schema that has moved on.
    const unmatched = TREATMENTS
      .filter((r) => !checked.some((p) => p === r.path || p.startsWith(`${r.path}.`)))
      .map((r) => r.path);
    if (unmatched.length) {
      console.warn('warning: treatment rows matching no property path: ' + unmatched.join(', '));
    }
    assert.ok(Array.isArray(unmatched));
  });

  test('the table has no duplicate rows', () => {
    const seen = new Set();
    const dupes = [];
    for (const r of TREATMENTS) {
      if (seen.has(r.path)) dupes.push(r.path);
      seen.add(r.path);
    }
    assert.deepEqual(dupes, [], 'two rows for one path make the winning treatment depend on order');
  });
});
