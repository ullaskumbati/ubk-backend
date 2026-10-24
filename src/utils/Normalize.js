import crypto from 'node:crypto';
 
// "Tomatoes, onion ,CHICKEN" -> ["chicken", "onion", "tomato"]
export function normalizeList(input = '', { singularize = false } = {}) {
  const items = String(input)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => (singularize ? singular(s) : s));
  return [...new Set(items)].sort();
}
 
// Very basic singularizer; good enough for cache-key matching.
function singular(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}
 
export function makeKey(prefix, params) {
  const hash = crypto.createHash('sha1').update(JSON.stringify(params)).digest('hex');
  return `${prefix}:${hash}`;
}