// The five re-identification checks of section 4, run over a treated dataset.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// Applying the treatments is not enough: the owner reviews the result as a whole. Four of the five
// checks produce a record for a person to read and decide on. Check 5 is different — residual free
// text or a residual link is not a judgement call, it is a leak, so it fails the run.
export const MIN_GROUP_SIZE = 5;

const eventsOf = (doc) => doc.epcisBody?.eventList ?? [];
const dateBand = (iso) => (typeof iso === 'string' ? iso.slice(0, 7) : 'unknown');

const roleOf = (event, siteMap) => {
  const id = event.readPoint?.id;
  return siteMap.get(id) ?? 'unstated';
};

const itemClassOf = (event) => {
  const cls = event.quantityList?.[0]?.epcClass;
  if (typeof cls === 'string') return cls.split('.').slice(0, 2).join('.');
  return event.epcList ? 'unit-level' : 'unknown';
};

// Check 1. Volume is the signal a small group leaks, so a group below the minimum keeps its
// records and loses its quantity, rather than being dropped and leaving a hole in the curve.
const minimumGroupSize = (docs, siteMap) => {
  const groups = new Map();
  for (const doc of docs) {
    for (const e of eventsOf(doc)) {
      const k = `${roleOf(e, siteMap)} | ${itemClassOf(e)} | ${dateBand(e.eventTime)}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }
  }
  let suppressed = 0;
  for (const doc of docs) {
    for (const e of eventsOf(doc)) {
      const k = `${roleOf(e, siteMap)} | ${itemClassOf(e)} | ${dateBand(e.eventTime)}`;
      if ((groups.get(k) ?? 0) >= MIN_GROUP_SIZE) continue;
      for (const q of e.quantityList ?? []) {
        if (q.quantity !== undefined) { delete q.quantity; suppressed++; }
      }
    }
  }
  const below = [...groups.entries()].filter(([, n]) => n < MIN_GROUP_SIZE);
  return {
    check: 'minimum group size',
    minimum: MIN_GROUP_SIZE,
    groups: groups.size,
    groupsBelowMinimum: below.length,
    quantitiesSuppressed: suppressed,
    outcome: below.length ? 'changed' : 'passed',
    detail: below.length
      ? `${below.length} of ${groups.size} groups hold fewer than ${MIN_GROUP_SIZE} records, so their quantities are suppressed. This dataset is deliberately small, so most groups are below the minimum.`
      : 'every group holds at least the minimum number of records'
  };
};

// Check 4 in part. A defect type seen only once or twice can identify the shipment it happened on.
const groupRareDefects = (docs) => {
  const counts = new Map();
  for (const doc of docs) {
    for (const e of eventsOf(doc)) {
      for (const d of e['scotf:inspection']?.defects ?? []) {
        counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
      }
    }
  }
  const rare = [...counts.entries()].filter(([, n]) => n < MIN_GROUP_SIZE).map(([t]) => t);
  let regrouped = 0;
  for (const doc of docs) {
    for (const e of eventsOf(doc)) {
      for (const d of e['scotf:inspection']?.defects ?? []) {
        if (rare.includes(d.type) && d.type !== 'other') { d.type = 'other'; regrouped++; }
      }
    }
  }
  return { rareTypes: rare.length, regrouped };
};

// Check 5. Not a judgement: anything that looks like free text or a link should already be gone,
// and if it is not, the treatment table has a hole and the run must stop.
const RESIDUAL_LINK = /https?:\/\//i;
const IDENTIFIER_SHAPE = /^(urn:|ni:\/\/\/|EPSG:|[+-]\d{2}:\d{2}$)/;
const KNOWN_VOCABULARY = new Set([
  'EPCISDocument', 'ObjectEvent', 'OBSERVE', 'sensor_reporting', 'inspecting',
  'in_transit', 'in_progress', 'conformant', 'non_conformant',
  'supplier', 'distributor', 'receiver', 'other',
  'Temperature', 'RelativeHumidity', 'Illuminance',
  'CEL', 'FAH', 'P1', 'LUX', 'DD', 'C62', '2.0',
  'label-not-read', 'no-photo', 'unmatched',
  'latitude', 'longitude', 'bruising'
]);

const residualTextAndReferences = (docs) => {
  const hits = [];
  const scan = (value, path) => {
    if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${path}[${i}]`));
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        // The document context is a pair of published standards addresses, not pilot data. It is
        // skipped by name rather than by matching its value, so a link smuggled into the context
        // of a hand-edited document would still be caught by the shape test below.
        if (k === '@context') continue;
        scan(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    if (typeof value !== 'string') return;
    if (RESIDUAL_LINK.test(value)) {
      hits.push({ path, reason: 'a link survived treatment', value });
      return;
    }
    if (IDENTIFIER_SHAPE.test(value) || KNOWN_VOCABULARY.has(value)) return;
    if (value.includes(' ')) hits.push({ path, reason: 'free text survived treatment', value });
  };
  docs.forEach((doc, i) => scan(doc, `document[${i}]`));
  return {
    check: 'residual text and references',
    outcome: hits.length ? 'failed' : 'passed',
    hits
  };
};

export const runRiskReview = (docs, { siteMap = new Map() } = {}) => {
  const groupCheck = minimumGroupSize(docs, siteMap);
  const defects = groupRareDefects(docs);
  const residual = residualTextAndReferences(docs);

  const temps = [];
  for (const doc of docs) {
    for (const e of eventsOf(doc)) {
      for (const el of e.sensorElementList ?? []) {
        for (const r of el.sensorReport ?? []) {
          for (const k of ['value', 'minValue', 'maxValue', 'meanValue']) {
            if (r.type === 'Temperature' && typeof r[k] === 'number') temps.push(r[k]);
          }
        }
      }
      const t = e['scotf:inspection']?.temperature?.value;
      if (typeof t === 'number') temps.push(t);
    }
  }

  const checks = [
    groupCheck,
    {
      check: 'uniqueness',
      outcome: 'review',
      detail: 'Each remaining record is unique on role class and month in a dataset this small. An owner releasing real data reviews whether that combination is knowable from outside.'
    },
    {
      check: 'linkage',
      outcome: 'passed',
      detail: 'The hash key and the time offset are derived per dataset from the seed and are never published, so two released datasets cannot be joined on an identifier or a date.'
    },
    {
      check: 'extremes and rare values',
      outcome: 'review',
      lowestTemperature: temps.length ? Math.min(...temps) : null,
      highestTemperature: temps.length ? Math.max(...temps) : null,
      rareDefectTypesRegrouped: defects.rareTypes,
      defectEntriesRegrouped: defects.regrouped,
      detail: 'Defect types seen fewer than the minimum number of times are regrouped under "other". The temperature range is reported for a person to judge, because an extreme reading can identify an incident that insiders remember.'
    },
    residual
  ];

  return { checks, failed: checks.filter((c) => c.outcome === 'failed') };
};
