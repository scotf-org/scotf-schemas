// Table 2 of the deidentification method, as code rather than prose.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// One row per property path. The subtree rule applies: a row covers every path beneath it unless
// that path has a row of its own. Paths are written without array indices, because membership of
// an array is not part of a treatment.

export const SUPPRESS = 'suppress';
export const KEEP = 'keep';

export const TREATMENTS = [
  { path: '@context', cls: 'structure', action: KEEP },
  { path: 'type', cls: 'structure', action: KEEP },
  { path: 'action', cls: 'structure', action: KEEP },
  { path: 'bizStep', cls: 'structure', action: KEEP },
  { path: 'disposition', cls: 'structure', action: KEEP },
  { path: 'persistentDisposition', cls: 'structure', action: 'keep-controlled',
    note: 'Controlled disposition values only; anything else is suppressed.' },

  { path: 'eventTime', cls: 'time', action: 'shift-round-minute' },
  { path: 'eventTimeZoneOffset', cls: 'time', action: 'offset-utc',
    note: 'A time zone narrows the location, so it becomes +00:00 unless the site is only generalized to a region.' },
  { path: 'recordTime', cls: 'time', action: 'shift' },

  { path: 'eventID', cls: 'identifier', action: 'hash' },
  { path: 'errorDeclaration.declarationTime', cls: 'time', action: 'shift' },
  { path: 'errorDeclaration.correctiveEventIDs', cls: 'reference', action: 'hash-each',
    note: 'The same keyed hash as eventID, so a correction still points at its original.' },
  { path: 'errorDeclaration.reason', cls: 'structure', action: KEEP,
    note: 'A CBV vocabulary URI; carries no identity.' },

  { path: 'epcList', cls: 'identifier', action: 'sscc-pseudonym' },
  { path: 'quantityList.epcClass', cls: 'identifier', action: 'lgtin-pseudonym' },
  { path: 'quantityList.quantity', cls: 'quantity', action: 'band' },
  { path: 'quantityList.uom', cls: 'structure', action: KEEP },

  { path: 'readPoint.id', cls: 'location', action: 'site-role' },
  { path: 'bizLocation.id', cls: 'location', action: 'site-role' },
  { path: 'sourceList', cls: 'identifier', action: SUPPRESS,
    note: 'Trading-party identifiers name companies. Covers each entry type and value.' },
  { path: 'destinationList', cls: 'identifier', action: SUPPRESS },
  { path: 'bizTransactionList', cls: 'identifier', action: SUPPRESS,
    note: 'Order and shipment document numbers can be matched against the systems that issued them.' },
  { path: 'certificationInfo', cls: 'identifier', action: SUPPRESS },

  { path: 'sensorElementList.sensorMetadata.startTime', cls: 'time', action: 'shift' },
  { path: 'sensorElementList.sensorMetadata.endTime', cls: 'time', action: 'shift' },
  { path: 'sensorElementList.sensorMetadata.time', cls: 'time', action: 'shift' },
  { path: 'sensorElementList.sensorMetadata.deviceID', cls: 'identifier', action: 'hash' },
  { path: 'sensorElementList.sensorMetadata.deviceMetadata', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorMetadata.rawData', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorMetadata.dataProcessingMethod', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorMetadata.bizRules', cls: 'reference', action: SUPPRESS },

  { path: 'sensorElementList.sensorReport.type', cls: 'structure', action: KEEP },
  { path: 'sensorElementList.sensorReport.uom', cls: 'structure', action: KEEP },
  { path: 'sensorElementList.sensorReport.deviceID', cls: 'identifier', action: 'hash' },
  { path: 'sensorElementList.sensorReport.component', cls: 'structure', action: KEEP },
  { path: 'sensorElementList.sensorReport.coordinateReferenceSystem', cls: 'structure', action: KEEP },
  { path: 'sensorElementList.sensorReport.value', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.minValue', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.maxValue', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.meanValue', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.sDev', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.percRank', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.percValue', cls: 'measurement', action: KEEP },
  { path: 'sensorElementList.sensorReport.time', cls: 'time', action: 'shift' },
  { path: 'sensorElementList.sensorReport.stringValue', cls: 'free-text', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.uriValue', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.rawData', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.bizRules', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.deviceMetadata', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.exception', cls: 'free-text', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.dataProcessingMethod', cls: 'reference', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.microorganism', cls: 'free-text', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.chemicalSubstance', cls: 'free-text', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.booleanValue', cls: 'unconstrained', action: SUPPRESS },
  { path: 'sensorElementList.sensorReport.hexBinaryValue', cls: 'unconstrained', action: SUPPRESS },

  { path: 'scotf:trackerPlacement.description', cls: 'free-text', action: SUPPRESS },
  { path: 'scotf:trackerPlacement.photoRefs', cls: 'reference', action: SUPPRESS },

  { path: 'scotf:inspection.inspectedBy', cls: 'structure', action: KEEP },
  { path: 'scotf:inspection.acceptable', cls: 'finding', action: KEEP },
  { path: 'scotf:inspection.ripenessStage', cls: 'measurement', action: KEEP },
  { path: 'scotf:inspection.defects.type', cls: 'finding', action: 'group-rare' },
  { path: 'scotf:inspection.defects.unitsAffected', cls: 'quantity', action: 'band-if-large' },
  { path: 'scotf:inspection.temperature', cls: 'measurement', action: KEEP,
    note: 'Value and unit as stored. D-39 governs how a document displays temperature, not what an event stores.' },
  { path: 'scotf:inspection.photoRefs', cls: 'reference', action: SUPPRESS },
  { path: 'scotf:inspection.observedShelfLifeDays', cls: 'measurement', action: KEEP },
  { path: 'scotf:inspection.exceptions', cls: 'finding', action: KEEP,
    note: 'A fixed vocabulary of three codes. There is no free-text reason to carry, by construction.' }
];

// A Position sensor report is removed whole rather than field by field. A track is the strongest
// location signal in a pilot dataset, and its coordinates sit in the same value and component
// properties a temperature reading uses, so the report type decides the treatment.
export const POSITION_TYPE = 'https://ref.scotf.org/epcis-ext/Position';

// ilmd is the one standard property with no row, because it cannot appear: both profiles pin the
// action to OBSERVE and the standard permits ilmd only with ADD. A row would imply the method had
// seen the field in data. If a later profile allows another action, this entry goes away and ilmd
// needs a treatment of its own.
export const EXCLUDED = {
  ilmd: 'Cannot appear: both profiles pin action to OBSERVE, and EPCIS 2.0 permits ilmd only with ADD.'
};

export const isExcluded = (path) =>
  Object.keys(EXCLUDED).some((e) => path === e || path.startsWith(e + '.'));

// The subtree rule. The longest matching row wins, so a child row overrides its parent.
export const rowFor = (path) => {
  let best = null;
  for (const row of TREATMENTS) {
    if (path === row.path || path.startsWith(row.path + '.')) {
      if (!best || row.path.length > best.path.length) best = row;
    }
  }
  return best;
};
