#!/usr/bin/env node
/**
 * Inspect LINZ Antarctic geodetic marks and their linked reduced observations.
 *
 * This is a review/export step only. It never writes the fitting dataset and
 * never calculates distances from coordinates. Potential distance elements
 * are reported with their raw source value, units, variance and provenance for
 * manual review before any record can become a calibration observation.
 *
 * Required environment: LINZ_LDS_API_KEY
 * Optional environment: LINZ_REVIEW_OUTPUT (defaults to tmp/...)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const LINZ_TABLES = Object.freeze({
  antarcticMarksLayer: 'layer-50789',
  marks: 'table-51989',
  markNames: 'table-51991',
  markPhysicalStates: 'table-51990',
  setups: 'table-51742',
  observations: 'table-51725',
  observationAccuracy: 'table-51724',
  observationTypes: 'table-51732',
  observationElementTypes: 'table-51730',
  units: 'table-51748',
  adoptions: 'table-51706',
  reductionRuns: 'table-51737'
});

const DEFAULT_PAGE_SIZE = 5000;
const MAX_RECORDS_PER_TABLE = 1000000;
const ID_CHUNK_SIZE = 50;
const asNumber = value => value === null || value === undefined || value === ''
  ? null : Number(value);
const unique = values => [...new Set(values.filter(value =>
  value !== null && value !== undefined && value !== ''
))];

export function buildLdsWfsUrl(apiKey, typeName, options = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('A LINZ LDS API key is required');
  }
  if (typeof typeName !== 'string' || !/^(layer|table)-[0-9]+$/.test(typeName)) {
    throw new Error('Invalid LINZ typeName');
  }

  const key = encodeURIComponent(apiKey.trim());
  const url = new URL(`https://data.linz.govt.nz/services;key=${key}/wfs`);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '2.0.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeNames', typeName);
  url.searchParams.set('outputformat', 'json');
  url.searchParams.set('startIndex', String(options.startIndex ?? 0));
  url.searchParams.set('count', String(options.count ?? DEFAULT_PAGE_SIZE));
  if (options.cqlFilter) url.searchParams.set('cql_filter', options.cqlFilter);
  return url.toString();
}

export function recordsFromWfsPayload(payload, typeName = 'LINZ dataset') {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.features)) {
    const message = typeof payload?.message === 'string'
      ? payload.message : 'Response did not contain a GeoJSON features array';
    throw new Error(`${typeName}: ${message}`);
  }
  return payload.features.map((feature, index) => {
    if (!feature || typeof feature !== 'object' || !feature.properties ||
        typeof feature.properties !== 'object') {
      throw new Error(`${typeName}: feature ${index} has no properties object`);
    }
    return feature.properties;
  });
}

export async function fetchLdsFeatures(apiKey, typeName, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Fetch implementation unavailable');
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRecords = options.maxRecords ?? MAX_RECORDS_PER_TABLE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250000) {
    throw new Error('LINZ WFS pageSize must be an integer from 1 to 250000');
  }

  const records = [];
  let startIndex = 0;
  let totalMatched = null;
  while (true) {
    const url = buildLdsWfsUrl(apiKey, typeName, {
      startIndex,
      count: pageSize,
      cqlFilter: options.cqlFilter
    });
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 60000)
    });
    const text = await response.text();
    if (!response.ok) {
      const safeBody = text.replace(/.{0,80}key=[^/\s]+/gi, 'key=[REDACTED]').slice(0, 1000);
      throw new Error(`LINZ WFS request failed (${response.status}) for ${typeName}: ${safeBody}`);
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`LINZ WFS response for ${typeName} was not JSON; check API-key access and WFS response format`);
    }
    const page = recordsFromWfsPayload(payload, typeName);
    records.push(...page);

    if (Number.isFinite(Number(payload.numberMatched))) {
      totalMatched = Number(payload.numberMatched);
    }
    if (records.length > maxRecords) {
      throw new Error(`${typeName} exceeded the safety cap of ${maxRecords} records; narrow the query before retrying`);
    }
    if (page.length < pageSize) break;
    startIndex += page.length;
    if (totalMatched !== null && startIndex >= totalMatched) break;
  }
  return records;
}

function idFilter(field, ids) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(field)) throw new Error('Invalid LINZ field name');
  const values = unique(ids).map(value => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new Error(`Invalid numeric ID for ${field}`);
    }
    return String(number);
  });
  return values.length ? `${field} IN (${values.join(',')})` : null;
}

async function fetchByIds(apiKey, typeName, field, ids, options = {}) {
  const values = unique(ids);
  const output = [];
  for (let index = 0; index < values.length; index += ID_CHUNK_SIZE) {
    const filter = idFilter(field, values.slice(index, index + ID_CHUNK_SIZE));
    if (!filter) continue;
    output.push(...await fetchLdsFeatures(apiKey, typeName, {
      ...options,
      cqlFilter: filter
    }));
  }
  // Keep one-to-many relationships intact (names, physical states and accuracy
  // covariance rows can have multiple records for the same foreign key).
  return output;
}

function mapBy(rows, field) {
  return new Map(rows.map(row => [String(row[field]), row]));
}

function featuresById(rows, field = 'id') {
  return mapBy(rows, field);
}

function lookupObservationType(observation, typeRows) {
  return typeRows.find(row =>
    String(row.TYPE) === String(observation.OBT_TYPE) &&
    String(row.SUB_TYPE) === String(observation.OBT_SUB_TYPE)
  ) ?? null;
}

function buildElementCandidates(observation, observationType, elementRows, unitRows) {
  if (!observationType) return [];
  const elementByType = mapBy(elementRows, 'TYPE');
  const unitByCode = mapBy(unitRows, 'CODE');
  const output = [];
  for (let index = 1; index <= 3; index++) {
    const elementCode = observationType[`OET_TYPE_${index}`];
    if (!elementCode) continue;
    const element = elementByType.get(String(elementCode));
    if (!element) continue;
    const description = String(element.DESCRIPTION ?? '');
    const unit = unitByCode.get(String(element.UOM_CODE ?? '')) ?? null;
    if (!/distance|length/i.test(description)) continue;
    const rawValue = asNumber(observation[`VALUE_${index}`]);
    if (rawValue === null || !Number.isFinite(rawValue) || rawValue <= 0) continue;
    const unitDescription = String(unit?.DESCRIPTION ?? '');
    const unitCode = String(element.UOM_CODE ?? '');
    const normalizedUnit = `${unitCode} ${unitDescription}`.toLowerCase();
    let distanceKmCandidate = null;
    if (/\b(km|kilomet(er|re)s?)\b/.test(normalizedUnit)) {
      distanceKmCandidate = rawValue;
    } else if (/\b(m|met(er|re)s?)\b/.test(normalizedUnit) ||
               ['M', 'MET', 'MTR'].includes(unitCode.toUpperCase())) {
      distanceKmCandidate = rawValue / 1000;
    }
    const context = `${observationType.DESCRIPTION ?? ''} ${description}`.toLowerCase();
    const explicitlyHorizontal = /horizontal/.test(context);
    const explicitlySeaLevel = /sea[ -]?level/.test(context);
    output.push({
      valueElement: `VALUE_${index}`,
      elementType: elementCode,
      description,
      unitCode,
      unitDescription,
      rawValue,
      distanceKmCandidate,
      explicitHorizontalBasis: explicitlyHorizontal,
      explicitSeaLevelBasis: explicitlySeaLevel,
      possibleBasis: explicitlyHorizontal && explicitlySeaLevel
        ? 'sea-level-horizontal'
        : explicitlyHorizontal ? 'horizontal-basis-needs-review'
          : 'distance-basis-unresolved'
    });
  }
  return output;
}

function makeMarkEndpoint(layerFeature, markRow, nameRows, stateRows) {
  if (!layerFeature || !markRow) return null;
  const markId = String(markRow.ID);
  const names = nameRows.filter(item => String(item.MRK_ID) === markId);
  const states = stateRows.filter(item => String(item.MRK_ID) === markId);
  const latitude = asNumber(layerFeature.latitude);
  const longitude = asNumber(layerFeature.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: String(layerFeature.geodetic_code || markRow.ID),
    markId: asNumber(markRow.ID),
    nodeId: asNumber(markRow.NOD_ID),
    geodeticCode: layerFeature.geodetic_code ?? null,
    name: layerFeature.current_mark_name ??
      names.find(item => /current/i.test(String(item.TYPE)))?.NAME ??
      names[0]?.NAME ?? null,
    latitude,
    longitude,
    coordinateSource: {
      provider: 'LINZ Antarctic Geodetic Marks layer 50789',
      reference: `feature id ${layerFeature.id}; mark id ${markRow.ID}`,
      coordinateSystem: 'RSRGD2000 / EPSG:4764'
    },
    markStatus: markRow.STATUS ?? null,
    markCategory: markRow.CATEGORY ?? null,
    disturbed: markRow.DISTURBED ?? null,
    replaced: markRow.REPLACED ?? null,
    markConditionFromLayer: layerFeature.mark_condition ?? null,
    physicalStates: states.map(item => ({
      status: item.STATUS ?? null,
      condition: item.CONDITION ?? null,
      latestCondition: item.LATEST_CONDITION ?? null,
      latestConditionDate: item.LATEST_COND_DATE ?? null,
      referenceDate: item.REF_DATETIME ?? null
    }))
  };
}

export function buildObservationReviewRecord({
  observation,
  observationType,
  elementRows,
  unitRows,
  accuracyRows,
  adoptionRows,
  localEndpoint,
  remoteEndpoint,
  localSetup,
  remoteSetup,
  reductionRun
}) {
  const elements = buildElementCandidates(observation, observationType, elementRows, unitRows);
  const accuracy = accuracyRows.find(row =>
    String(row.OBN_ID1) === String(observation.ID) &&
    String(row.OBN_ID2) === String(observation.ID)
  ) ?? null;
  const varianceM2 = asNumber(accuracy?.VALUE_11);
  const accuracyMultiplier = asNumber(observation.ACC_MULTIPLIER) ?? 1;
  const sigmaMeters = varianceM2 !== null && varianceM2 >= 0
    ? Math.sqrt(varianceM2) * Math.abs(accuracyMultiplier) : null;
  const adoptionLinks = adoptionRows.filter(row =>
    String(row.OBN_ID_NEW) === String(observation.ID)
  );
  const workIds = unique([localSetup?.WRK_ID, remoteSetup?.WRK_ID])
    .map(value => String(value)).sort();
  const groupId = workIds.length
    ? `LINZ-WORK-${workIds.join('-')}`
    : `LINZ-OBS-SET-${observation.OBS_ID ?? observation.ID}`;

  return {
    id: `LINZ-OBS-${observation.ID}`,
    endpoints: { a: localEndpoint, b: remoteEndpoint },
    candidateDistanceElements: elements,
    candidateMeasurementType: elements.some(item => item.possibleBasis === 'sea-level-horizontal')
      ? 'direct-survey-reduced-horizontal' : null,
    candidateMeasurementBasis: elements.some(item => item.possibleBasis === 'sea-level-horizontal')
      ? 'sea-level-horizontal' : null,
    confidenceEvidence: {
      observationAccuracyVarianceM2: varianceM2,
      accuracyMultiplier: accuracyMultiplier,
      standardDeviationMeters: sigmaMeters,
      uncertaintyKmCandidate: sigmaMeters === null ? null : sigmaMeters / 1000,
      exactSelfVarianceRecordPresent: !!accuracy
    },
    observation: {
      type: observation.OBT_TYPE ?? null,
      subType: observation.OBT_SUB_TYPE ?? null,
      status: observation.STATUS ?? null,
      geodeticClass: observation.GEODETIC_CLASS ?? null,
      surveyedClassBearingAnnotation: observation.SURVEYED_CLASS ?? null,
      referenceDateTime: observation.REF_DATETIME ?? null,
      observationSetId: observation.OBS_ID ?? null,
      reductionRunId: observation.RDN_ID ?? null,
      amendmentId: observation.OBN_ID_AMENDMENT ?? null,
      coordinateSystemId: observation.COS_ID ?? null,
      vectorId: observation.VCT_ID ?? null,
      values: [observation.VALUE_1, observation.VALUE_2, observation.VALUE_3]
    },
    observationType: observationType ? {
      description: observationType.DESCRIPTION ?? null,
      vectorType: observationType.VECTOR_TYPE ?? null,
      elementCodes: [
        observationType.OET_TYPE_1,
        observationType.OET_TYPE_2,
        observationType.OET_TYPE_3
      ]
    } : null,
    localSetup: localSetup ? {
      id: asNumber(localSetup.ID),
      workId: asNumber(localSetup.WRK_ID),
      equipmentType: localSetup.EQUIPMENT_TYPE ?? null,
      validFlag: localSetup.VALID_FLAG ?? null
    } : null,
    remoteSetup: remoteSetup ? {
      id: asNumber(remoteSetup.ID),
      workId: asNumber(remoteSetup.WRK_ID),
      equipmentType: remoteSetup.EQUIPMENT_TYPE ?? null,
      validFlag: remoteSetup.VALID_FLAG ?? null
    } : null,
    reductionRun: reductionRun ? {
      dateTime: reductionRun.DATETIME ?? null,
      description: reductionRun.DESCRIPTION ?? null,
      softwareUsed: reductionRun.SOFTWARE_USED ?? null
    } : null,
    adoptionLinks: adoptionLinks.map(row => ({
      originalObservationId: asNumber(row.OBN_ID_ORIG),
      originalSurveyWorkId: asNumber(row.SUR_WRK_ID_ORIG),
      factors: [row.FACTOR_1, row.FACTOR_2, row.FACTOR_3]
    })),
    source: {
      provider: 'LINZ Landonline reduced survey observations',
      reference: `Observation table 51725 row ${observation.ID}; Accuracy table 51724 row(s) for that observation`,
      groupId
    },
    reviewFlags: [
      ...(elements.length ? [] : ['No distance-like observation element was identified from current type metadata']),
      ...(!accuracy ? ['No self-variance record was found'] : []),
      ...(adoptionLinks.length ? ['An element-level adoption record exists; exclude unless the distance element can be proven not to be adopted'] : []),
      ...(observation.SURVEYED_CLASS ? ['SURVEYED_CLASS annotates bearing derivation; it is not proof that the distance element was measured'] : []),
      ...(!observationType ? ['Observation type metadata did not resolve'] : []),
      ...(!localEndpoint || !remoteEndpoint ? ['Both endpoints did not resolve to current Antarctic physical marks'] : []),
      ...(elements.some(item => item.possibleBasis !== 'sea-level-horizontal')
        ? ['Horizontal/sea-level distance basis is not explicit in the type metadata'] : []),
      'Measured-vs-calculated distance component still requires authoritative element-level confirmation'
    ]
  };
}

export async function inspectLinzAntarctic(apiKey, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const queryOptions = { fetchImpl, pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE };
  const markFeatures = await fetchLdsFeatures(
    apiKey, LINZ_TABLES.antarcticMarksLayer, { ...queryOptions, pageSize: 1000 }
  );
  const layerById = featuresById(markFeatures, 'id');
  const layerMarkIds = unique(markFeatures.map(row => row.id));
  if (!layerMarkIds.length) throw new Error('LINZ Antarctic mark layer returned no mark IDs');

  const markRows = await fetchByIds(
    apiKey, LINZ_TABLES.marks, 'ID', layerMarkIds, queryOptions
  );
  const markById = mapBy(markRows, 'ID');
  const missingMarkRowCount = layerMarkIds.filter(id => !markById.has(String(id))).length;
  if (!markRows.length) {
    throw new Error('Antarctic layer IDs did not match Mark table IDs; refusing to guess a join');
  }
  const nodeIds = unique(markRows.map(row => row.NOD_ID));
  const setupRows = await fetchByIds(
    apiKey, LINZ_TABLES.setups, 'NOD_ID', nodeIds, queryOptions
  );
  const antarcticSetupIds = unique(setupRows.map(row => row.ID));
  const observationRows = [];
  for (let index = 0; index < antarcticSetupIds.length; index += ID_CHUNK_SIZE) {
    const filterIds = unique(antarcticSetupIds.slice(index, index + ID_CHUNK_SIZE))
      .map(value => Number(value));
    if (!filterIds.length) continue;
    const filter = `STP_ID_LOCAL IN (${filterIds.join(',')}) OR STP_ID_REMOTE IN (${filterIds.join(',')})`;
    observationRows.push(...await fetchLdsFeatures(
      apiKey, LINZ_TABLES.observations, { ...queryOptions, cqlFilter: filter }
    ));
  }
  const observations = [...new Map(observationRows.map(row => [String(row.ID), row])).values()];
  const allSetupIds = unique(observations.flatMap(row => [
    row.STP_ID_LOCAL, row.STP_ID_REMOTE
  ]));
  const allSetups = await fetchByIds(
    apiKey, LINZ_TABLES.setups, 'ID', allSetupIds, queryOptions
  );
  const setupById = mapBy(allSetups, 'ID');
  const marksByNode = new Map();
  for (const mark of markRows) {
    const key = String(mark.NOD_ID);
    if (!marksByNode.has(key)) marksByNode.set(key, []);
    marksByNode.get(key).push(mark);
  }
  const ambiguousNodeCount = [...marksByNode.values()].filter(rows => rows.length !== 1).length;
  const uniqueMarkForNode = nodeId => {
    const rows = marksByNode.get(String(nodeId)) ?? [];
    return rows.length === 1 ? rows[0] : null;
  };
  const paired = observations.map(observation => {
    const local = setupById.get(String(observation.STP_ID_LOCAL));
    const remote = setupById.get(String(observation.STP_ID_REMOTE));
    const localMark = local && uniqueMarkForNode(local.NOD_ID);
    const remoteMark = remote && uniqueMarkForNode(remote.NOD_ID);
    return { observation, local, remote, localMark, remoteMark };
  }).filter(row => row.localMark && row.remoteMark);

  const pairedObservationIds = unique(paired.map(row => row.observation.ID));
  const pairedMarkIds = unique(paired.flatMap(row => [
    row.localMark.ID, row.remoteMark.ID
  ]));
  const [names, states, accuracy, adoptions, typeRows, elementRows, unitRows, reductionRows] =
    await Promise.all([
      fetchByIds(apiKey, LINZ_TABLES.markNames, 'MRK_ID', pairedMarkIds, queryOptions),
      fetchByIds(apiKey, LINZ_TABLES.markPhysicalStates, 'MRK_ID', pairedMarkIds, queryOptions),
      fetchByIds(apiKey, LINZ_TABLES.observationAccuracy, 'OBN_ID1', pairedObservationIds, queryOptions),
      fetchByIds(apiKey, LINZ_TABLES.adoptions, 'OBN_ID_NEW', pairedObservationIds, queryOptions),
      fetchLdsFeatures(apiKey, LINZ_TABLES.observationTypes, queryOptions),
      fetchLdsFeatures(apiKey, LINZ_TABLES.observationElementTypes, queryOptions),
      fetchLdsFeatures(apiKey, LINZ_TABLES.units, queryOptions),
      fetchByIds(apiKey, LINZ_TABLES.reductionRuns, 'ID',
        unique(paired.map(row => row.observation.RDN_ID)), queryOptions)
    ]);
  const typeByComposite = new Map(typeRows.map(row =>
    [`${row.TYPE}|${row.SUB_TYPE}`, row]
  ));
  const reductionById = mapBy(reductionRows, 'ID');

  const reviewedRecords = paired.map(row => {
    const observation = row.observation;
    const markLayerA = layerById.get(String(row.localMark.ID));
    const markLayerB = layerById.get(String(row.remoteMark.ID));
    const endpointA = makeMarkEndpoint(markLayerA, row.localMark, names, states);
    const endpointB = makeMarkEndpoint(markLayerB, row.remoteMark, names, states);
    const observationType = typeByComposite.get(
      `${observation.OBT_TYPE}|${observation.OBT_SUB_TYPE}`
    ) ?? null;
    return buildObservationReviewRecord({
      observation,
      observationType,
      elementRows,
      unitRows,
      accuracyRows: accuracy,
      adoptionRows: adoptions,
      localEndpoint: endpointA,
      remoteEndpoint: endpointB,
      localSetup: row.local,
      remoteSetup: row.remote,
      reductionRun: reductionById.get(String(observation.RDN_ID)) ?? null
    });
  });

  const potentialElements = reviewedRecords.flatMap(row =>
    row.candidateDistanceElements.map(element => ({ rowId: row.id, ...element }))
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: 'LINZ Data Service / Full Landonline Dataset',
      antarcticMarksLayer: '50789',
      records: {
        marks: 51989,
        markNames: 51991,
        markPhysicalStates: 51990,
        setups: 51742,
        observations: 51725,
        observationAccuracy: 51724,
        observationTypes: 51732,
        observationElementTypes: 51730,
        units: 51748,
        adoptions: 51706,
        reductionRuns: 51737
      },
      license: 'Creative Commons Attribution 4.0 International; attribution to LINZ required'
    },
    summary: {
      antarcticLayerMarkCount: markFeatures.length,
      physicalMarkRowsMatched: markRows.length,
      layerMarkIdsWithoutMarkRow: missingMarkRowCount,
      markNodeCount: nodeIds.length,
      nodeIdsWithAmbiguousPhysicalMarks: ambiguousNodeCount,
      setupRowsForAntarcticNodes: setupRows.length,
      observationRowsTouchingAntarcticSetups: observations.length,
      observationRowsWithBothEndpointsInAntarcticLayer: paired.length,
      observationRowsWithDistanceLikeElements: reviewedRecords.filter(row =>
        row.candidateDistanceElements.length > 0
      ).length,
      distanceLikeElements: potentialElements.length,
      observationsWithVariance: reviewedRecords.filter(row =>
        row.confidenceEvidence.exactSelfVarianceRecordPresent
      ).length,
      observationsWithAdoptionLinks: reviewedRecords.filter(row =>
        row.adoptionLinks.length > 0
      ).length,
      reviewOnly: true,
      fitDatasetWritten: false
    },
    records: reviewedRecords
  };
}

async function main() {
  const apiKey = process.env.LINZ_LDS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing LINZ_LDS_API_KEY. Create a data-access-only key in your LINZ Data Service account and set it as an environment variable. Do not commit the key.'
    );
  }
  const outputPath = process.env.LINZ_REVIEW_OUTPUT ||
    'tmp/linz-antarctic-observation-review.json';
  const report = await inspectLinzAntarctic(apiKey);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    outputPath,
    summary: report.summary,
    reminder: 'This is a review report only. It does not write calibration observations or activate a map warp.'
  }, null, 2));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
