// The list of property paths a Profile 1 or Profile 2 event may carry.
// Part of SCOTF Schemas, contributed by TOTEM LLC. Licensed under Apache-2.0.
// Built with TOTEM Agentic OS (TAO) · https://url.totemltd.com/tao
//
// The profiles extend the GS1 standard and do not restate it, so a list taken from the profiles
// alone is not the list of fields an event can actually carry: eventTime and eventTimeZoneOffset
// are required by both profiles but declared only by GS1, and Profile 2 expresses the choice
// between epcList and quantityList through anyOf rather than properties. The union of the GS1
// ObjectEvent properties and the properties the profiles add or constrain is the honest list.
import { readFileSync } from 'node:fs';

// Array membership is not part of a treatment: sourceList[0] and sourceList[1] are the same field.
// Paths are therefore written without indices, which is also how the method's table writes them.
const leafPaths = (defs, root, extra = []) => {
  const deref = (n) => {
    if (n && n.$ref) {
      const m = n.$ref.match(/#\/(?:\$defs|definitions)\/(.+)$/);
      if (m) return defs[decodeURIComponent(m[1])];
    }
    return n;
  };
  const out = new Set(extra);
  const walk = (node, prefix, depth) => {
    node = deref(node);
    if (!node || typeof node !== 'object' || depth > 7) return false;
    let described = false;
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(node[key])) {
        for (const sub of node[key]) if (walk(sub, prefix, depth)) described = true;
      }
    }
    if (node.then && walk(node.then, prefix, depth)) described = true;
    if (node.type === 'array' && node.items) return walk(node.items, prefix, depth) || described;
    if (node.properties) {
      described = true;
      for (const [k, v] of Object.entries(node.properties)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (!walk(v, path, depth + 1)) out.add(path);
      }
    }
    return described;
  };
  walk(defs[root], '', 0);
  return [...out].sort();
};

// Extension fields live under the SCOTF namespace, so the GS1 schema cannot declare them and the
// profiles carry them instead. Enumerated from the profile schemas rather than hard-coded, so a
// field added to a profile shows up here without anyone remembering to add it.
const scotfPaths = (profileSchema) => {
  const out = [];
  const walk = (node, prefix) => {
    if (!node || typeof node !== 'object') return;
    if (node.$ref) {
      const m = node.$ref.match(/#\/\$defs\/(.+)$/);
      if (m) return walk(profileSchema.$defs[m[1]], prefix);
    }
    if (node.type === 'array' && node.items) return walk(node.items, prefix);
    if (node.properties) {
      for (const [k, v] of Object.entries(node.properties)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (k.startsWith('scotf:') || prefix) out.push(path);
        walk(v, path);
      }
    }
  };
  for (const def of Object.values(profileSchema.$defs ?? {})) {
    if (!def.properties) continue;
    for (const [k, v] of Object.entries(def.properties)) {
      if (k.startsWith('scotf:')) walk(v, k);
    }
  }
  return out;
};

export const unionPaths = ({ gs1Path, profilePaths }) => {
  const gs1 = JSON.parse(readFileSync(gs1Path, 'utf8'));
  const defs = gs1.$defs ?? gs1.definitions;
  const extras = [];
  for (const p of profilePaths) extras.push(...scotfPaths(JSON.parse(readFileSync(p, 'utf8'))));
  const all = leafPaths(defs, 'ObjectEvent', extras);
  // Keep only leaves. A path that is a strict prefix of another describes a container, and a
  // container carries no value of its own, so giving it a treatment would be meaningless.
  return all.filter((a) => !all.some((b) => b !== a && b.startsWith(a + '.')));
};
