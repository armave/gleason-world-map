import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchIndex, findSearchMatches } from '../src/data/search-index.js';

const stateNames = { CA: 'California', TX: 'Texas', AK: 'Alaska' };

test('search index includes Antarctica and preserves its source record', () => {
  const antarctica = { iso: 'ATA', name: 'Antarctica' };
  const index = buildSearchIndex({ antarctica });
  const [match] = findSearchMatches(index, 'ice wall');
  assert.equal(match.type, 'country');
  assert.equal(match.obj, antarctica);
});

test('exact names rank before partial matches while preserving type priority', () => {
  const countries = [{ name: 'United States' }, { name: 'United States Minor Outlying Islands' }];
  const capitals = [{ city: 'Washington', countryName: 'United States' }];
  const index = buildSearchIndex({ countries, capitals });
  const results = findSearchMatches(index, 'United States');
  assert.equal(results[0].obj, countries[0]);
  assert.equal(results[0].type, 'country');
  assert.ok(results.some(result => result.obj === capitals[0]));
  assert.ok(results.findIndex(result => result.obj === countries[1]) > 0);
});

test('county search supports county names, postal abbreviations and full state names', () => {
  const counties = [
    { name: 'Los Angeles County', stateCode: 'CA' },
    { name: 'Harris County', stateCode: 'TX' },
    { name: 'Fairbanks North Star Borough', stateCode: 'AK' }
  ];
  const index = buildSearchIndex({ counties, stateNames });
  assert.equal(findSearchMatches(index, 'los angeles')[0].obj, counties[0]);
  assert.ok(findSearchMatches(index, 'california').some(result => result.obj === counties[0]));
  assert.ok(findSearchMatches(index, 'TX').some(result => result.obj === counties[1]));
});

test('empty queries and invalid limits return no matches, and results respect the limit', () => {
  const countries = Array.from({ length: 15 }, (_, i) => ({ name: `Testland ${i}` }));
  const index = buildSearchIndex({ countries });
  assert.deepEqual(findSearchMatches(index, '   '), []);
  assert.deepEqual(findSearchMatches(index, 'testland', 0), []);
  assert.equal(findSearchMatches(index, 'testland', 7).length, 7);
});
