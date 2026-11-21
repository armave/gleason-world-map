import { norm } from '../core/format.js';

const TYPE_PRIORITY = Object.freeze({ capital: 0, country: 1, county: 2 });

/**
 * Prepare searchable strings once. The index retains source objects so selection
 * can use the original geographic records without duplicating them.
 */
export function buildSearchIndex({
  countries = [],
  capitals = [],
  counties = [],
  stateNames = {},
  antarctica = null
} = {}) {
  const entries = [];
  const add = (type, obj, fields, exactField, stateCode = '', sortKey = '') => {
    const searchFields = [...new Set(fields.map(norm).filter(Boolean))];
    if (!searchFields.length) return;
    entries.push({
      type,
      obj,
      searchFields,
      exactField: norm(exactField),
      stateCode,
      sortKey: norm(sortKey || exactField)
    });
  };

  for (const country of countries) {
    add('country', country, [country.name], country.name, '', country.name);
  }
  if (antarctica) {
    add('country', antarctica, [antarctica.name, 'Antarctica ice wall'], antarctica.name, '', antarctica.name);
  }
  for (const capital of capitals) {
    add('capital', capital, [capital.city, capital.countryName], capital.city, '', capital.city);
  }
  for (const county of counties) {
    add('county', county, [county.name, county.stateCode, stateNames[county.stateCode] || ''],
      county.name, county.stateCode || '', county.name);
  }

  entries.sort((a, b) =>
    TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] ||
    a.stateCode.localeCompare(b.stateCode) ||
    a.sortKey.localeCompare(b.sortKey)
  );
  return entries;
}

/** Exact-name matches are ranked first; partial matches retain a stable sort. */
export function findSearchMatches(index, query, limit = 10) {
  const needle = norm(query);
  if (!needle || !Array.isArray(index) || !Number.isInteger(limit) || limit <= 0) return [];
  const exact = [];
  const partial = [];
  for (const entry of index) {
    if (!entry.searchFields.some(field => field.includes(needle))) continue;
    if (entry.exactField === needle) {
      if (exact.length < limit) exact.push(entry);
    } else if (partial.length < limit) {
      partial.push(entry);
    }
  }
  return exact.length >= limit ? exact : exact.concat(partial.slice(0, limit - exact.length));
}
