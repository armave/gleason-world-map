#!/usr/bin/env node
/**
 * Inspect NOAA NGS EDMI Calibration Baseline state files.
 *
 * The NGS archive is public and does not require an API key. This script
 * extracts the published horizontal adjusted distance and the source
 * standard-error field into a review-only report. It never supplies endpoint
 * coordinates, computes distances from coordinates, or writes the fitting
 * dataset.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const NOAA_CBL_BASELINES_URL =
  'https://geodesy.noaa.gov/CBLINES/BASELINES/';
export const NOAA_CBL_PROGRAM_URL =
  'https://www.ngs.noaa.gov/CBLINES/index.shtml';
export const DEFAULT_REVIEW_OUTPUT =
  'tmp/noaa-cbl-baseline-review.json';

const DEFAULT_CONCURRENCY = 4;
const FLOAT_PATTERN = /[-+]?(?:\d+\.\d*|\.\d+)(?:[Ee][-+]?\d+)?/g;
const STATE_CODE_PATTERN = /^[a-z]{2}$/i;

function requireResponse(response, label) {
  if (!response || typeof response.text !== 'function') {
    throw new Error(label + ': invalid HTTP response');
  }
  if (!response.ok) {
    throw new Error(label + ': HTTP ' + response.status);
  }
}

export function buildNoaaCblStateUrl(stateCode) {
  if (typeof stateCode !== 'string' ||
      !STATE_CODE_PATTERN.test(stateCode.trim())) {
    throw new Error('NOAA CBL state code must be a two-letter code');
  }
  return new URL(stateCode.trim().toLowerCase(), NOAA_CBL_BASELINES_URL).toString();
}

export function discoverNoaaCblStateCodes(indexHtml) {
  if (typeof indexHtml !== 'string') {
    throw new Error('NOAA CBL archive index must be HTML text');
  }
  const codes = new Set();
  const linkPattern = /href\s*=\s*["']([a-z]{2})\/?["']/gi;
  for (const match of indexHtml.matchAll(linkPattern)) {
    codes.add(match[1].toLowerCase());
  }
  if (codes.size === 0) {
    throw new Error('NOAA CBL archive index did not expose current two-letter state files');
  }
  return [...codes].sort();
}

export async function fetchNoaaCblStateCodes(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation unavailable');
  }
  const response = await fetchImpl(NOAA_CBL_BASELINES_URL, {
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(options.timeoutMs ?? 30000)
  });
  requireResponse(response, 'NOAA CBL archive index');
  return discoverNoaaCblStateCodes(await response.text());
}

function parseMetadataLine(line, section) {
  const designation = line.match(/BASE\s*LINE\s*DESIGNATION\s*:\s*(.+)$/i);
  if (designation) section.designation = designation[1].trim();
  const accession = line.match(/PROJECT\s+ACCESSION\s+NUMBER\s*:\s*(.+)$/i);
  if (accession) section.projectAccessionNumber = accession[1].trim();
  const sourceNumber = line.match(/SOURCE\s+NO\.?\s*[:#-]?\s*(.+)$/i);
  if (sourceNumber) section.sourceNumber = sourceNumber[1].trim();
  const nearestTown = line.match(/NEAREST\s+TOWN\s*[:\-]\s*(.+)$/i);
  if (nearestTown) section.nearestTown = nearestTown[1].trim();
  const quad = line.match(/\bQUAD\s*[:\-]\s*(.+)$/i);
  if (quad) section.quad = quad[1].trim();
  const state = line.match(/^\s*STATE\s*[:\-]\s*(.+)$/i);
  if (state) section.state = state[1].trim();
  const county = line.match(/^\s*COUNTY\s*[:\-]\s*(.+)$/i) || line.match(/^\s*(.+?)\s+COUNTY\s*$/i);
  if (county) section.county = county[1].trim();
  const adjustedDate = line.match(/LIST\s+OF\s+ADJUSTED\s+DISTANCES\s*\\(([^)]+)\\)/i);
  if (adjustedDate) { section.adjustmentDate = adjustedDate[1].trim(); section.inDistanceTable = true; }
  else if (/LIST\s+OF\s+ADJUSTED\s+DISTANCES\b/i.test(line)) section.inDistanceTable = true;
  if (/^\s*EXPLANATION\b/i.test(line)) section.inDistanceTable = false;
}

function parseDistanceRow(line, context) {
  // Seven source columns: FROM STATION, ELEVATION (m), TO STATION, ELEVATION (m),
  // ADJUSTED DISTANCE HORIZONTAL (m), ADJUSTED DISTANCE MARK-MARK (m), S.E. (mm).
  // Station labels can contain integers. The five decimal columns delimit rows.
  const matches = [...line.matchAll(FLOAT_PATTERN)];
  if (matches.length !== 5) return null;
  const values = matches.map(match => Number(match[0]));
  if (!values.every(Number.isFinite)) return null;
  const fromStation = line.slice(0, matches[0].index).trim().replace(/\s+/g, ' ');
  const toStation = line.slice(matches[0].index + matches[0][0].length, matches[1].index).trim().replace(/\s+/g, ' ');
  const [fromElevationM, toElevationM, horizontalAdjustedDistanceM, markToMarkDistanceM, reportedStandardErrorMm] = values;
  if (!fromStation || !toStation || horizontalAdjustedDistanceM <= 0 || markToMarkDistanceM <= 0 || reportedStandardErrorMm <= 0) return null;
  const siteName = context.designation || 'UNNAMED CBL';
  const groupToken = context.projectAccessionNumber || context.sourceNumber || siteName;
  const groupSlug = String(groupToken).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    source: { provider: 'NOAA National Geodetic Survey EDMI Calibration Baselines', reference: context.sourceUrl, programReference: NOAA_CBL_PROGRAM_URL, groupId: 'NOAA-CBL-' + context.stateCode.toUpperCase() + '-' + groupSlug },
    baseline: { stateCode: context.stateCode.toUpperCase(), state: context.state ?? null, designation: context.designation ?? null, projectAccessionNumber: context.projectAccessionNumber ?? null, sourceNumber: context.sourceNumber ?? null, nearestTown: context.nearestTown ?? null, quad: context.quad ?? null, county: context.county ?? null, adjustmentDate: context.adjustmentDate ?? null },
    endpoints: { fromStation, fromElevationM, toStation, toElevationM, coordinates: null, coordinateStatus: 'not provided as exact per-monument coordinates by this file' },
    measurementType: 'direct-survey-baseline',
    measurementBasis: 'adjusted-horizontal',
    horizontalAdjustedDistanceM,
    horizontalAdjustedDistanceKmCandidate: horizontalAdjustedDistanceM / 1000,
    markToMarkDistanceM,
    reportedStandardErrorMm,
    reportedStandardErrorInterpretation: 'NOAA describes this as an estimated adjustment standard error; it may indicate instrument repeatability more than actual baseline accuracy and may be optimistic.',
    sourceLine: context.lineNumber,
    rawSourceLine: line.trim(),
    fitReady: false,
    fitBlockers: ['Exact coordinate records for both physical monuments are not attached.', 'The published station names are arbitrary and must be matched to exact physical monument identifiers.', 'Current condition of both monuments has not been verified.', 'The reported standard error is retained as source metadata, not assumed to be certified horizontal-distance uncertainty.']
  };
}
export function parseNoaaCblFile(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('NOAA CBL source file is empty');
  }

  const stateCode = String(options.stateCode ?? '??').toLowerCase();
  if (!STATE_CODE_PATTERN.test(stateCode)) {
    throw new Error('NOAA CBL stateCode must be a two-letter code');
  }
  const sourceUrl = options.sourceUrl ?? buildNoaaCblStateUrl(stateCode);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections = [];
  const records = [];
  let section = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (/CALIBRATION\s+BASE\s*LINE\s+DATA/i.test(line)) {
      section = {
        stateCode,
        sourceUrl,
        designation: null,
        projectAccessionNumber: null,
        sourceNumber: null,
        state: null,
        awaitingDesignation: true,
        nearestTown: null,
        quad: null,
        county: null,
        adjustmentDate: null,
        recordCount: 0,
        inDistanceTable: false
      };
      sections.push(section);
    }

    if (!section && /BASE\s*LINE\s*DESIGNATION\s*:/i.test(line)) {
      section = {
        stateCode,
        sourceUrl,
        designation: null,
        projectAccessionNumber: null,
        sourceNumber: null,
        state: null,
        awaitingDesignation: false,
        nearestTown: null,
        quad: null,
        county: null,
        adjustmentDate: null,
        recordCount: 0,
        inDistanceTable: false
      };
      sections.push(section);
    }

    if (!section) continue;

    parseMetadataLine(line, section);
    if (section.designation) section.awaitingDesignation = false;
    if (section.awaitingDesignation && line.trim() &&
        !/^CALIBRATION\s+BASE\s*LINE\s+DATA$/i.test(line.trim()) &&
        !/^SOURCE\s+NO\./i.test(line.trim()) && !line.includes(':') &&
        !/^\\*+/.test(line.trim())) {
      section.designation = line.trim();
      section.awaitingDesignation = false;
    }
    if (!section.inDistanceTable || !section.designation) continue;

    const record = parseDistanceRow(line, {
      ...section,
      sourceUrl,
      stateCode,
      lineNumber: index + 1
    });
    if (!record) continue;

    section.recordCount += 1;
    records.push(record);
  }

  const populatedSections = sections.filter(section => section.recordCount > 0);
  return {
    stateCode: stateCode.toUpperCase(),
    sourceUrl,
    fileFormat: 'NOAA NGS ASCII text state file',
    sectionCount: sections.length,
    baselineCount: populatedSections.length,
    recordCount: records.length,
    sections: sections.map(section => ({
      stateCode: section.stateCode.toUpperCase(),
      designation: section.designation,
      projectAccessionNumber: section.projectAccessionNumber,
      sourceNumber: section.sourceNumber,
      state: section.state,
      nearestTown: section.nearestTown,
      quad: section.quad,
      county: section.county,
      adjustmentDate: section.adjustmentDate,
      recordCount: section.recordCount
    })),
    records,
    warnings: records.length === 0
      ? ['No published distance rows were parsed; source layout may have changed or the file may contain no current baselines.']
      : []
  };
}

async function fetchStateFile(stateCode, fetchImpl, options = {}) {
  const url = buildNoaaCblStateUrl(stateCode);
  const response = await fetchImpl(url, {
    headers: { accept: 'text/plain, text/*;q=0.9, */*;q=0.1' },
    signal: AbortSignal.timeout(options.timeoutMs ?? 45000)
  });
  requireResponse(response, 'NOAA CBL ' + stateCode.toUpperCase());
  const text = await response.text();
  if (!/CALIBRATION\s+BASE\s*LINE\s+DATA/i.test(text)) {
    throw new Error('NOAA CBL ' + stateCode.toUpperCase() +
      ': response did not contain a calibration baseline data record');
  }
  return parseNoaaCblFile(text, { stateCode, sourceUrl: url });
}

export async function inspectNoaaCbl(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch implementation unavailable');
  }

  let stateCodes = options.states;
  if (!Array.isArray(stateCodes) || stateCodes.length === 0) {
    stateCodes = await fetchNoaaCblStateCodes({
      fetchImpl,
      timeoutMs: options.timeoutMs
    });
  }
  stateCodes = [...new Set(stateCodes.map(code => String(code).toLowerCase()))];
  for (const stateCode of stateCodes) {
    if (!STATE_CODE_PATTERN.test(stateCode)) {
      throw new Error('Invalid state code in NOAA_CBL_STATES: ' + stateCode);
    }
  }

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
    throw new Error('NOAA CBL concurrency must be an integer from 1 to 12');
  }

  const stateResults = [];
  for (let index = 0; index < stateCodes.length; index += concurrency) {
    const batch = stateCodes.slice(index, index + concurrency);
    const results = await Promise.all(batch.map(async stateCode => {
      try {
        return await fetchStateFile(stateCode, fetchImpl, options);
      } catch (error) {
        return {
          stateCode: stateCode.toUpperCase(),
          sourceUrl: buildNoaaCblStateUrl(stateCode),
          recordCount: 0,
          baselineCount: 0,
          sections: [],
          records: [],
          error: String(error?.message ?? error)
        };
      }
    }));
    stateResults.push(...results);
  }

  const records = stateResults.flatMap(result => result.records ?? []);
  const baselineGroups = new Set(records.map(record => record.source.groupId));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'NOAA National Geodetic Survey',
      programUrl: NOAA_CBL_PROGRAM_URL,
      archiveUrl: NOAA_CBL_BASELINES_URL,
      access: 'public state files; no API key required',
      fileConvention: 'two-letter lowercase state files; .his files are historical archives and are not automatically requested',
      licenseNote: 'NOAA NGS source data is published as downloadable ASCII text; retain source attribution and original units.'
    },
    summary: {
      stateFilesRequested: stateCodes.length,
      stateFilesParsed: stateResults.filter(result => !result.error).length,
      stateFilesWithErrors: stateResults.filter(result => result.error).length,
      baselineGroups: baselineGroups.size,
      distanceRecordsExtracted: records.length,
      fitReadyRecords: 0,
      reviewOnly: true,
      fitDatasetWritten: false
    },
    stateResults: stateResults.map(result => ({
      stateCode: result.stateCode,
      sourceUrl: result.sourceUrl,
      baselineCount: result.baselineCount,
      recordCount: result.recordCount,
      sections: result.sections,
      warnings: result.warnings ?? [],
      ...(result.error ? { error: result.error } : {})
    })),
    records,
    admissionNote: 'NOAA site files provide adjusted horizontal distances, but this review does not attach exact coordinates for each physical mark. The reported standard error is preserved as metadata and is not automatically treated as baseline accuracy. No record is fit-ready until exact physical endpoints, traceable coordinates, monument condition, and defensible distance uncertainty are independently confirmed.'
  };
}

async function main() {
  const stateArgIndex = process.argv.indexOf('--state');
  const stateArg = stateArgIndex >= 0 ? process.argv[stateArgIndex + 1] : null;
  const stateEnv = process.env.NOAA_CBL_STATES || null;
  const statesRaw = stateArg || stateEnv;
  const states = statesRaw
    ? statesRaw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
    : undefined;
  const outputPath = process.env.NOAA_CBL_REVIEW_OUTPUT || DEFAULT_REVIEW_OUTPUT;

  const report = await inspectNoaaCbl({ states });
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    outputPath,
    summary: report.summary,
    reminder: report.admissionNote
  }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
