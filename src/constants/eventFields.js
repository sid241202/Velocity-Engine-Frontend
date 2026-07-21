/**
 * eventFields.js
 *
 * Static field-mapping for the fixed Kafka auth-event schema (single schema —
 * no multi-schema support). Powers the Rule Builder / Visual Filter Builder
 * dropdowns so analysts pick from the real schema instead of typing dot-paths
 * freehand.
 *
 * `value` is the real path submitted/stored, unchanged from the free-text
 * era: `_data.<key>` for fields inside `_data`, or the bare envelope key
 * (`_event_timestamp`, etc.) for the five top-level fields. `label` is that
 * key converted to snake_case for display only.
 */

// Five envelope (top-level) fields — `_data` itself is a container, not selectable.
const ENVELOPE_KEYS = [
  '_event_timestamp',
  '_event_id',
  '_category',
  '_event_type',
  '_version',
];

// Every key inside `_data`, in schema order.
const DATA_KEYS = [
  'authCode', 'subRequestId', 'aua', 'sa', 'asa', 'ver', 'tid', 'licenseId',
  'reqDateTime', 'tknUsedFlag', 'tknType', 'pidTs', 'pidVersion', 'piUsesFlag',
  'paUsesFlag', 'pfaUsesFlag', 'bioUsesFlag', 'btFMRUsesFlag', 'btFIRUsesFlag',
  'btIIRUsesFlag', 'pinUsesFlag', 'otpUsesFlag', 'piUsedFlag', 'paUsedFlag',
  'pfaUsedFlag', 'bioUsedFlag', 'btFMRUsedFlag', 'btFIRUsedFlag', 'btIIRUsedFlag',
  'pinUsedFlag', 'otpUsedFlag', 'otpIdentifier', 'lang', 'piNameUsedFlag',
  'piMs', 'piMv', 'piMatchScore', 'piLNameUsedFlag', 'piLNameMs', 'piLNameMv',
  'piLNameMatchScore', 'piPhoneUsedFlag', 'piEmailUsedFlag', 'piGenderUsedFlag',
  'piGender', 'piDOBUsedFlag', 'piDOB', 'pi_DOBTUsedFlag', 'piDOBT',
  'piAgeUsed_flag', 'piAge', 'pfaAddressUsedFlag', 'pfaAddressMs',
  'pfaAddressMv', 'pfaMatchScore', 'pfaLaddrUsedFlag', 'pfaLocalAddressMs',
  'pfaLocalAddressMv', 'pfaLocalAddressMatcScore', 'paMs', 'paCareOfUsedFlag',
  'paHouseUsedFlag', 'paStreetUsedFlag', 'paLmUsedFlag', 'paLOCUsedFlag',
  'paVTCUsedFlag', 'paVTC', 'paPOUsedFlag', 'paPO', 'paSubDistrictUsedFlag',
  'paSubDistrict', 'paDistrictUsedFlag', 'paDistrict', 'paStateUsedFlag',
  'paState', 'paPCUsedFlag', 'paPC', 'fmrCount', 'firCount', 'iirCount',
  'fingerMatchScore', 'uidaiTFMR', 'auaTFMR', 'fingerMatchThreshold',
  'fmrGalleryType', 'fmrGalleryVendor', 'fmrSDKVendor', 'fmrSDKVersion',
  'firGalleryType', 'firGalleryVendor', 'firSDKVendor', 'firSDKVersion',
  'iirGalleryType', 'iirGalleryVendor', 'iirSDKVendor', 'iirSDKVersion',
  'authResult', 'errorCode', 'errorClassification', 'responseDateTime',
  'authDuration', 'fdc', 'idc', 'udc', 'locationLat', 'locationLong',
  'locationVTCCode', 'locationSubDistrictCode', 'locationDistrictCode',
  'locationStateCode', 'locationPC', 'enrolmentReferenceId', 'residentGender',
  'residentBirth_Day', 'residentBirthMonth', 'residentBirthYear',
  'residentDOB', 'residentDOBT', 'residentAge', 'residentPincode',
  'residentVTCCode', 'residentVTCName', 'residentPOName',
  'residentSubDistrictCode', 'residentSubDistrictName', 'residentDistrictCode',
  'residentDistrictName', 'residentStateCode', 'residentStateName',
  'uidGenerationDate', 'txn', 'authType', 'hashUID', 'locationAlt', 'lot',
  'bfdDoneFlag', 'fingerMatchingType', 'fingerFusionPerfomed',
  'irisMatchScore', 'irisThreshold', 'irisMatchingType', 'irisFusionPerfomed',
  'authXMLSize', 'pidSize', 'dataType', 'skeyScheme', 'sskType', 'ki',
  'kycFlag', 'actionCodes', 'registeredDeviceSoftwareId',
  'registeredDeviceSoftwareVersion', 'deviceProviderId', 'deviceCode',
  'modelId', 'certExpiryDate', 'subErrorCode', 'authenticationMode',
  'faceUses', 'faceUsed', 'faceMatchScore', 'faceMatchThreshold',
  'faceMatchType', 'faceFusionDone', 'faceMultimodalityFusionScore',
  'faceMultimodalityFusionThreshold', 'faceSdkVendor', 'faceSdkVersion',
  'deviceMetaData', 'deepPrintGalleryType', 'deepPrintGalleryVendor',
  'deepPrintSdkVendor', 'deepPrintSdkVersion', 'deepPrintMatchScoreFinger1',
  'deepPrintMatchScoreFinger2', 'deepPrintMatchIsPerfomed',
  'deepPrintMatchResult', 'serverId',
];

/**
 * camelCase (with occasional acronym runs / stray underscores) -> clean
 * single-underscore snake_case. Also strips a leading underscore, which is
 * what turns envelope keys like `_event_timestamp` into `event_timestamp`.
 */
export function toSnakeCase(key) {
  let s = key;
  // Acronym run followed by a new capitalized word: split before the run's
  // last letter, e.g. "authXMLSize" -> "authXML_Size" (not "auth_X_M_L_Size").
  s = s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
  // Standard boundary: lowercase/digit followed by uppercase.
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  s = s.toLowerCase();
  s = s.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return s;
}

function buildFieldOptions() {
  const raw = [
    ...ENVELOPE_KEYS.map(key => ({ value: key, label: toSnakeCase(key), group: 'envelope' })),
    ...DATA_KEYS.map(key => ({ value: `_data.${key}`, label: toSnakeCase(key), group: 'data' })),
  ];

  // Number colliding labels in order of first appearance (_1, _2, ...).
  const countByLabel = new Map();
  raw.forEach(f => countByLabel.set(f.label, (countByLabel.get(f.label) || 0) + 1));
  const seenByLabel = new Map();
  const deduped = raw.map(f => {
    if (countByLabel.get(f.label) <= 1) return f;
    const n = (seenByLabel.get(f.label) || 0) + 1;
    seenByLabel.set(f.label, n);
    return { ...f, label: `${f.label}_${n}` };
  });

  return deduped;
}

export const FIELD_OPTIONS = buildFieldOptions();

export const ENVELOPE_FIELD_OPTIONS = FIELD_OPTIONS
  .filter(f => f.group === 'envelope')
  .sort((a, b) => a.label.localeCompare(b.label));

export const DATA_FIELD_OPTIONS = FIELD_OPTIONS
  .filter(f => f.group === 'data')
  .sort((a, b) => a.label.localeCompare(b.label));

export const pathToLabel = new Map(FIELD_OPTIONS.map(f => [f.value, f.label]));
export const labelToPath = new Map(FIELD_OPTIONS.map(f => [f.label, f.value]));
