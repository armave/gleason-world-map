import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOAA_CBL_BASELINES_URL,
  buildNoaaCblStateUrl,
  discoverNoaaCblStateCodes,
  parseNoaaCblFile,
  inspectNoaaCbl
} from '../scripts/inspect-noaa-cbl-baselines.mjs';

const bellevilleSample = [
  'CALIBRATION BASELINE DATA',
  'Beltsville Base Line',
  'Source No. 13204',
  'Quad - 390763',
  'State - Maryland',
  'County - Prince Georges',
  'List of Adjusted Distances',
  'FROM STA. NAME  ELEV. (m)  TO STA. NAME  ELEV. (m)  ADJ. DIST. (m) HORIZONTAL  ADJ. DIST. (m) MARK - MARK  STD. ERROR (mm)',
  'BELTSVILLE 150  47.44  BELTSVILLE 300  46.21  149.9929  149.9979  0.2',
  'BELTSVILLE 150  47.44  BELTSVILLE 600  44.38  449.9990  450.0094  0.2',
  'BELTSVILLE 150  47.44  BELTSVILLE 1800  50.54  1649.9959  1649.9988  0.2'
].join('\n');

test('NOAA state URLs accept only two-letter state codes', () => {
  assert.equal(buildNoaaCblStateUrl('MD'), NOAA_CBL_BASELINES_URL + 'md');
  assert.throws(() => buildNoaaCblStateUrl('maryland'), /two-letter code/);
  assert.throws(() => buildNoaaCblStateUrl('../md'), /two-letter code/);
});

test('archive discovery selects current two-letter state files and ignores historical suffixes', () => {
  const index = '<a href="ak">ak</a><a href="ak.his">ak.his</a>' +
    '<a href="md">md</a><a href="md.his">md.his</a>';
  assert.deepEqual(discoverNoaaCblStateCodes(index), ['ak', 'md']);
  assert.throws(() => discoverNoaaCblStateCodes('<html>empty</html>'), /did not expose/);
});

test('parser reads the horizontal adjusted column, not mark-to-mark distance', () => {
  const report = parseNoaaCblFile(bellevilleSample, { stateCode: 'md' });
  assert.equal(report.sectionCount, 1);
  assert.equal(report.baselineCount, 1);
  assert.equal(report.recordCount, 3);
  const first = report.records[0];
  assert.equal(first.baseline.designation, 'Beltsville Base Line');
  assert.equal(first.baseline.sourceNumber, '13204');
  assert.equal(first.baseline.state, 'Maryland');
  assert.equal(first.baseline.county, 'Prince Georges');
  assert.equal(first.endpoints.fromStation, 'BELTSVILLE 150');
  assert.equal(first.endpoints.toStation, 'BELTSVILLE 300');
  assert.equal(first.horizontalAdjustedDistanceM, 149.9929);
  assert.ok(Math.abs(first.horizontalAdjustedDistanceKmCandidate - 0.1499929) < 1e-12);
  assert.equal(first.markToMarkDistanceM, 149.9979);
  assert.equal(first.reportedStandardErrorMm, 0.2);
  assert.match(first.reportedStandardErrorInterpretation, /may be optimistic/);
  assert.equal(first.uncertaintyKm, undefined);
  assert.equal(first.fitReady, false);
  assert.equal(first.endpoints.coordinates, null);
});

test('parser handles tagged metadata and numeric station identifiers with CRLF', () => {
  const content = [
    'CALIBRATION BASELINE DATA',
    'BASE LINE DESIGNATION: EXAMPLE CBL',
    'PROJECT ACCESSION NUMBER: G16309',
    'NEAREST TOWN: BUTLER',
    'QUAD: N400794',
    'BUTLER COUNTY',
    'LIST OF ADJUSTED DISTANCES (JULY 29, 1987)',
    '0 100.000 150 99.472 149.9983 149.9992 0.1'
  ].join('\r\n');
  const report = parseNoaaCblFile(content, { stateCode: 'pa' });
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].endpoints.fromStation, '0');
  assert.equal(report.records[0].endpoints.toStation, '150');
  assert.equal(report.records[0].horizontalAdjustedDistanceM, 149.9983);
  assert.equal(report.records[0].markToMarkDistanceM, 149.9992);
  assert.equal(report.records[0].source.groupId, 'NOAA-CBL-PA-g16309');
});

test('live inspection runner can be exercised without credentials using a fake archive', async () => {
  const calls = [];
  const fakeFetch = async url => {
    calls.push(url);
    if (url === NOAA_CBL_BASELINES_URL) {
      return { ok: true, status: 200, text: async () =>
        '<a href="md">md</a><a href="md.his">md.his</a>' };
    }
    return { ok: true, status: 200, text: async () => bellevilleSample };
  };
  const result = await inspectNoaaCbl({ fetchImpl: fakeFetch });
  assert.equal(result.summary.stateFilesRequested, 1);
  assert.equal(result.summary.stateFilesParsed, 1);
  assert.equal(result.summary.distanceRecordsExtracted, 3);
  assert.equal(result.summary.fitReadyRecords, 0);
  assert.equal(result.summary.fitDatasetWritten, false);
  assert.equal(calls.length, 2);
});
