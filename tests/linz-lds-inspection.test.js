import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLdsWfsUrl,
  recordsFromWfsPayload,
  fetchLdsFeatures,
  buildObservationReviewRecord
} from '../scripts/inspect-linz-antarctic-observations.mjs';

test('LINZ WFS URLs keep the API key in the path and encode the filter', () => {
  const url = new URL(buildLdsWfsUrl('test-key-123', 'table-51725', {
    startIndex: 250,
    count: 500,
    cqlFilter: 'STP_ID_LOCAL IN (1,2,3)'
  }));
  assert.equal(url.hostname, 'data.linz.govt.nz');
  assert.equal(url.pathname, '/services;key=test-key-123/wfs');
  assert.equal(url.searchParams.get('version'), '2.0.0');
  assert.equal(url.searchParams.get('typeNames'), 'table-51725');
  assert.equal(url.searchParams.get('startIndex'), '250');
  assert.equal(url.searchParams.get('count'), '500');
  assert.equal(url.searchParams.get('cql_filter'), 'STP_ID_LOCAL IN (1,2,3)');
  assert.throws(() => buildLdsWfsUrl('', 'table-51725'), /API key is required/);
  assert.throws(() => buildLdsWfsUrl('key', 'invalid-layer'), /Invalid LINZ typeName/);
});

test('WFS GeoJSON records are read from feature properties and malformed payloads fail closed', () => {
  const rows = recordsFromWfsPayload({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { ID: 10, VALUE_1: 42 }, geometry: null },
      { type: 'Feature', properties: { ID: 11, VALUE_1: 43 }, geometry: null }
    ]
  }, 'table-51725');
  assert.deepEqual(rows, [
    { ID: 10, VALUE_1: 42 },
    { ID: 11, VALUE_1: 43 }
  ]);
  assert.throws(() => recordsFromWfsPayload({ type: 'FeatureCollection' }), /features array/);
  assert.throws(() => recordsFromWfsPayload({
    features: [{ type: 'Feature', geometry: null }]
  }), /no properties object/);
});

test('WFS paging collects each page without exposing credentials in diagnostics', async () => {
  const starts = [];
  const fakeFetch = async url => {
    const parsed = new URL(url);
    starts.push(Number(parsed.searchParams.get('startIndex')));
    const rows = Number(parsed.searchParams.get('startIndex')) === 0
      ? [{ ID: 1 }, { ID: 2 }]
      : [{ ID: 3 }];
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        type: 'FeatureCollection',
        numberMatched: 3,
        features: rows.map(properties => ({ type: 'Feature', properties, geometry: null }))
      })
    };
  };
  const rows = await fetchLdsFeatures('secret-test-key', 'table-51725', {
    fetchImpl: fakeFetch,
    pageSize: 2
  });
  assert.deepEqual(rows, [{ ID: 1 }, { ID: 2 }, { ID: 3 }]);
  assert.deepEqual(starts, [0, 2]);
});

test('distance review uses the stored observation value and source variance, not endpoint coordinates', () => {
  const row = buildObservationReviewRecord({
    observation: {
      ID: 9001,
      OBT_TYPE: 'R',
      OBT_SUB_TYPE: 'LINE',
      STP_ID_LOCAL: 101,
      STP_ID_REMOTE: 102,
      STATUS: 'CURRENT',
      REF_DATETIME: '2020-01-01',
      RDN_ID: 88,
      ACC_MULTIPLIER: 1.2,
      VALUE_1: 1000,
      VALUE_2: null,
      VALUE_3: null
    },
    observationType: {
      TYPE: 'R',
      SUB_TYPE: 'LINE',
      VECTOR_TYPE: 'L',
      DESCRIPTION: 'Reduced line observation',
      OET_TYPE_1: 'HD',
      OET_TYPE_2: null,
      OET_TYPE_3: null
    },
    elementRows: [{
      TYPE: 'HD',
      DESCRIPTION: 'Horizontal distance reduced to sea level',
      UOM_CODE: 'M'
    }],
    unitRows: [{ CODE: 'M', DESCRIPTION: 'metres' }],
    accuracyRows: [{
      OBN_ID1: 9001,
      OBN_ID2: 9001,
      VALUE_11: 0.25
    }],
    adoptionRows: [],
    localEndpoint: { id: 'A', latitude: -77, longitude: 166 },
    remoteEndpoint: { id: 'B', latitude: -77.1, longitude: 166.1 },
    localSetup: { ID: 101, WRK_ID: 2001, VALID_FLAG: 'Y' },
    remoteSetup: { ID: 102, WRK_ID: 2001, VALID_FLAG: 'Y' },
    reductionRun: { ID: 88, SOFTWARE_USED: 'survey software' }
  });

  assert.equal(row.candidateDistanceElements[0].rawValue, 1000);
  assert.equal(row.candidateDistanceElements[0].distanceKmCandidate, 1);
  assert.equal(row.candidateMeasurementBasis, 'sea-level-horizontal');
  assert.equal(row.confidenceEvidence.observationAccuracyVarianceM2, 0.25);
  assert.equal(row.confidenceEvidence.standardDeviationMeters, 0.6);
  assert.equal(row.confidenceEvidence.uncertaintyKmCandidate, 0.0006);
  assert.equal(row.source.groupId, 'LINZ-WORK-2001');
  assert.ok(row.reviewFlags.some(item => item.includes('Measured-vs-calculated')));
  assert.equal(row.adoptionLinks.length, 0);
});

test('adopted observation rows are flagged for exclusion from automatic import', () => {
  const row = buildObservationReviewRecord({
    observation: { ID: 5, VALUE_1: 20, ACC_MULTIPLIER: 1 },
    observationType: {
      TYPE: 'R', SUB_TYPE: 'D', VECTOR_TYPE: 'L',
      DESCRIPTION: 'Horizontal distance', OET_TYPE_1: 'HD'
    },
    elementRows: [{ TYPE: 'HD', DESCRIPTION: 'Horizontal distance', UOM_CODE: 'M' }],
    unitRows: [{ CODE: 'M', DESCRIPTION: 'metres' }],
    accuracyRows: [{ OBN_ID1: 5, OBN_ID2: 5, VALUE_11: 1 }],
    adoptionRows: [{ OBN_ID_NEW: 5, OBN_ID_ORIG: 3, FACTOR_1: 1 }],
    localEndpoint: { id: 'A' },
    remoteEndpoint: { id: 'B' },
    localSetup: { WRK_ID: 70 },
    remoteSetup: { WRK_ID: 70 },
    reductionRun: null
  });
  assert.equal(row.adoptionLinks.length, 1);
  assert.ok(row.reviewFlags.some(item => item.includes('element-level adoption')));
  assert.equal(row.candidateMeasurementType, null);
});
