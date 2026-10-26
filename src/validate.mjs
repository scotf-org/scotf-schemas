// Validates an EPCIS document against the GS1 EPCIS 2.0 schema and a SCOTF profile.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// Two checks, in order, because they answer different questions. The GS1 schema answers "is this a
// valid EPCIS 2.0 document", which is the standard's to decide. The profile answers "does it carry
// what the SCOTF pilots agreed to exchange". A document that fails the first is not worth checking
// against the second, so the standard runs first and its errors are reported on their own.
import Ajv2020 from 'ajv/dist/2020.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const PROFILES = {
  'profile-1': {
    id: 'profile-1',
    title: 'Sensor-enabled ObjectEvent for transit monitoring',
    schema: join(ROOT, 'schemas', 'profile-1-sensor-event.schema.json'),
  },
  'profile-2': {
    id: 'profile-2',
    title: 'Quality observation event with inspection attributes',
    schema: join(ROOT, 'schemas', 'profile-2-quality-observation.schema.json'),
  },
};

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

// The GS1 schema is draft-07 and the profiles are 2020-12, so each needs its own compiler.
const compilers = new Map();
async function compilerFor(kind, schemaPath) {
  const key = `${kind}:${schemaPath}`;
  if (compilers.has(key)) return compilers.get(key);
  const ajv = kind === 'gs1'
    ? new Ajv({ allErrors: true, strict: false })
    : new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(await readJson(schemaPath));
  compilers.set(key, validate);
  return validate;
}

const describe = (errors) => (errors ?? []).map((e) => ({
  path: e.instancePath || '/',
  keyword: e.keyword,
  message: e.message,
  params: e.params,
  text: `${e.instancePath || '/'} ${e.message}`,
}));

/**
 * @param {object} doc      the EPCIS document
 * @param {string} profile  a key of PROFILES
 * @param {string} gs1SchemaPath  path to the official GS1 EPCIS 2.0 JSON Schema
 * @returns {Promise<{valid: boolean, stage: 'gs1'|'profile'|null, errors: object[]}>}
 */
export async function validateDocument(doc, profile, gs1SchemaPath) {
  const p = PROFILES[profile];
  if (!p) throw new Error(`Unknown profile "${profile}". Known profiles: ${Object.keys(PROFILES).join(', ')}.`);

  const gs1 = await compilerFor('gs1', gs1SchemaPath);
  if (!gs1(doc)) return { valid: false, stage: 'gs1', errors: describe(gs1.errors) };

  const prof = await compilerFor('profile', p.schema);
  if (!prof(doc)) return { valid: false, stage: 'profile', errors: describe(prof.errors) };

  return { valid: true, stage: null, errors: [] };
}

export async function validateFile(path, profile, gs1SchemaPath) {
  return validateDocument(await readJson(path), profile, gs1SchemaPath);
}
