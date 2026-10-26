# SCOTF Schemas

Open event and data schemas for the fresh produce supply chain: GS1 EPCIS 2.0 and CBV 2.0 event profiles for quality, temperature and handling, with examples and validators.

Part of [Supply Chain of the Future](https://www.scotf.org) (SCOTF). Documentation and explainers are published on The Shelf, SCOTF's open resource library.

## What is here

Two EPCIS 2.0 event profiles from the SCOTF pilots, as JSON Schemas with worked examples and a
validator.

| Profile | Event | Carries |
| --- | --- | --- |
| `profile-1` | Sensor-enabled `ObjectEvent` for transit monitoring | Tracker readings against a pallet SSCC, in a `sensorElementList` |
| `profile-2` | Quality observation at a hand-off | Inspection verdict, ripeness stage, defects, photograph references and exception codes |

The profiles **extend** the GS1 standard and never fork it. A document must satisfy the official
GS1 EPCIS 2.0 JSON Schema *and* the profile. Fields the standard does not define live under the
SCOTF namespace `https://ref.scotf.org/epcis-ext/`, which a document has to declare in its
`@context`.

The GS1 schema is not stored here, because it is GS1's to publish and to version. It is fetched on
demand into `vendor/`, which is not committed.

## Quick start

```bash
npm install
npm test                       # fetches the GS1 schema, then runs the suite

# validate your own events
npx scotf-validate --profile profile-1 my-event.json
npx scotf-validate --profile profile-2 my-inspection.json
```

A passing run prints `ok` per document. A failure names which of the two checks rejected it, the
GS1 schema or the SCOTF profile, and the path to the field at fault.

## What the profiles add

The GS1 schema answers "is this a valid EPCIS 2.0 document". It does not check everything a
receiver needs, and two gaps are worth naming because the profiles close them:

- **Units are not checked against a code list.** A temperature in `KGM` satisfies the standard.
  Each measured property here is pinned to the UN/CEFACT codes that can express it.
- **An extension prefix need not be declared.** `scotf:ripenessStage` is accepted even when nothing
  binds `scotf` to a namespace, which leaves a receiver unable to resolve it. The profiles require
  the declaration.

### Position and light

Pilot 1 measures temperature, location and light. Two of the three are named by the standard:
`Temperature` and `Illuminance` are tokens in the GS1 EPCIS 2.0 `measurementType` vocabulary, so
the profile uses them as they stand.

The vocabulary has **no geographic position type**. The standard's own extension point for this is
a measurement type named by a non-GS1 vocabulary URI, so position is
`https://ref.scotf.org/epcis-ext/Position` rather than an invented bare token, and it must carry
`coordinateReferenceSystem` (`EPSG:4326` is WGS 84) and a `uom` of `DD`, decimal degrees. A
coordinate without its reference frame cannot be placed on a map, and the standard does not
require the frame, so the profile does. The frame is not the unit: a bare `36.7378` could be
degrees, radians or grads, so position is pinned to a unit code in the same way the three GS1
measurement types are.

### Exceptions

A check does not always complete the way the capture protocol describes: a case label will not
scan, a photograph is not taken, an arrival check cannot be matched to the inspection that
shipped with the pallet. `scotf:inspection.exceptions` carries those as a closed list of codes
(`label-not-read`, `no-photo`, `unmatched`) rather than as free text.

Two reasons. An exception has to be countable, so that "how often does a label fail to scan"
is a query and not a reading exercise. And a free-text reason collects names, sites and notes,
which anyone publishing the data then has to find and strip out again. A new exception is a new
code, not a new field.

Absence of the field means no exception, and the array is never empty, so "nothing went wrong"
cannot be confused with "something went wrong and we did not say what".

`examples/*/invalid/` holds documents that are wrong on purpose. Each has a sidecar saying which
error it should produce and why, so the rule it documents cannot quietly stop being enforced.

## Status

In development for the SCOTF Batch 2 release (November 2026). Interfaces may change until v1.0.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Questions: hello@scotf.org.

## License

Code: Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE); attribution is required.
Documentation: CC BY-NC 4.0 unless a file states otherwise.

SCOTF Schemas, contributed by TOTEM LLC.
