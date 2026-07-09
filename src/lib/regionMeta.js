export const REGION_TOKENS = {
  sea: 'SEA',
  southeast_asia: 'SEA',
  southeastasia: 'SEA',
  global: 'Global',
  gl: 'Global',
  worldwide: 'Global',
  europe: 'Europe',
  eu: 'Europe',
  euw: 'Europe',
  eune: 'Europe',
  turkey: 'Turkey',
  tr: 'Turkey',
  korea: 'Korea',
  kr: 'Korea',
  na: 'North America',
  north_america: 'North America',
  america: 'North America',
  us: 'North America',
  usa: 'North America',
  latam: 'Latin America',
  latin_america: 'Latin America',
  mena: 'MENA',
  middle_east: 'Middle East',
  japan: 'Japan',
  jp: 'Japan',
  india: 'India',
  indonesia: 'Indonesia',
  id: 'Indonesia',
  russia: 'Russia',
  ru: 'Russia',
  china: 'China',
  cn: 'China',
  brazil: 'Brazil',
  br: 'Brazil',
  oceania: 'Oceania',
  oce: 'Oceania',
  taiwan: 'Taiwan',
  tw: 'Taiwan',
  hk: 'Hong Kong',
  hong_kong: 'Hong Kong',
  sg: 'Singapore',
  singapore: 'Singapore',
  ph: 'Philippines',
  philippines: 'Philippines',
  my: 'Malaysia',
  malaysia: 'Malaysia',
  mlysia: 'Malaysia',
  th: 'Thailand',
  thailand: 'Thailand',
  vn: 'Vietnam',
  vietnam: 'Vietnam',
  kh: 'Cambodia',
  cambodia: 'Cambodia',
  uae: 'UAE',
  emirates: 'UAE',
  saudi: 'Saudi Arabia',
  saudi_arabia: 'Saudi Arabia',
  ksa: 'Saudi Arabia',
  pakistan: 'Pakistan',
  pk: 'Pakistan',
  uk: 'United Kingdom',
  united_kingdom: 'United Kingdom',
  gb: 'United Kingdom',
  germany: 'Germany',
  de: 'Germany',
  france: 'France',
  fr: 'France',
  italy: 'Italy',
  es: 'Spain',
  spain: 'Spain',
  mx: 'Mexico',
  mexico: 'Mexico',
  argentina: 'Argentina',
  ar: 'Argentina',
  egypt: 'Egypt',
  eg: 'Egypt',
  iraq: 'Iraq',
  iq: 'Iraq',
  syria: 'Syria',
  sy: 'Syria',
  jordan: 'Jordan',
  jo: 'Jordan',
  lebanon: 'Lebanon',
  lb: 'Lebanon',
  morocco: 'Morocco',
  ma: 'Morocco',
  algeria: 'Algeria',
  dz: 'Algeria',
  tunisia: 'Tunisia',
  tn: 'Tunisia',
  qatar: 'Qatar',
  qa: 'Qatar',
  kuwait: 'Kuwait',
  kw: 'Kuwait',
  bahrain: 'Bahrain',
  bh: 'Bahrain',
  oman: 'Oman',
  om: 'Oman',
  bd: 'Bangladesh',
  bangladesh: 'Bangladesh',
  nepal: 'Nepal',
  np: 'Nepal',
  sri_lanka: 'Sri Lanka',
  srilanka: 'Sri Lanka',
  lk: 'Sri Lanka',
  aus: 'Australia',
  australia: 'Australia',
  nz: 'New Zealand',
  new_zealand: 'New Zealand',
  canada: 'Canada',
  ca: 'Canada',
};

const TRAILING_REGION_WORD_COUNTS = [3, 2, 1];

export function normalizeRegionToken(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function normalizeRegionLabel(value = '') {
  const token = normalizeRegionToken(value);
  if (REGION_TOKENS[token]) return REGION_TOKENS[token];

  const cleaned = String(value).trim();
  if (!cleaned) return 'Global';
  return cleaned
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function slugifyBaseKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'game';
}

function extractRegionFromTrailingWords(displayName = '') {
  const words = String(displayName).trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  for (const count of TRAILING_REGION_WORD_COUNTS) {
    if (words.length <= count) continue;
    const tail = words.slice(-count).join(' ');
    const token = normalizeRegionToken(tail);
    if (REGION_TOKENS[token]) {
      const baseName = words.slice(0, -count).join(' ').trim();
      if (!baseName) return null;
      return {
        regionLabel: REGION_TOKENS[token],
        baseName,
      };
    }
  }

  return null;
}

function stripRegionSuffixFromCode(normalizedCode = '') {
  const parts = normalizedCode.split(/[_-]+/).filter(Boolean);
  if (parts.length < 2) return { baseKey: normalizedCode, regionLabel: null };

  const suffix = parts[parts.length - 1];
  if (REGION_TOKENS[suffix]) {
    return {
      baseKey: parts.slice(0, -1).join('_'),
      regionLabel: REGION_TOKENS[suffix],
    };
  }

  return { baseKey: normalizedCode, regionLabel: null };
}

export function parseG2BulkGameMeta(code = '', name = '') {
  const normalizedCode = String(code || '').trim().toLowerCase();
  const displayName = String(name || code || '').trim();
  const codeSplit = stripRegionSuffixFromCode(normalizedCode);

  let regionLabel = codeSplit.regionLabel;
  let baseKey = codeSplit.baseKey || normalizedCode;
  let baseName = displayName;

  if (!regionLabel) {
    const paren = displayName.match(/\(([^)]+)\)\s*$/);
    if (paren) regionLabel = normalizeRegionLabel(paren[1]);
  }

  if (!regionLabel) {
    const dash = displayName.match(/[-–—]\s*([^(-]+)\s*$/);
    if (dash) regionLabel = normalizeRegionLabel(dash[1]);
  }

  if (!regionLabel) {
    const trailing = extractRegionFromTrailingWords(displayName);
    if (trailing) {
      regionLabel = trailing.regionLabel;
      baseName = trailing.baseName;
    }
  }

  if (regionLabel) {
    baseName = displayName
      .replace(/\s*\([^)]+\)\s*$/, '')
      .replace(/\s*[-–—]\s*[^-–—]+$/, '')
      .trim() || baseName;

    const trailing = extractRegionFromTrailingWords(displayName);
    if (trailing?.baseName) baseName = trailing.baseName;
  }

  if (!codeSplit.regionLabel && regionLabel && regionLabel !== 'Global') {
    baseKey = slugifyBaseKey(baseName || baseKey);
  }

  if (!regionLabel) regionLabel = 'Global';

  return {
    baseKey: baseKey || normalizedCode,
    baseName: baseName || displayName || normalizedCode,
    regionLabel,
  };
}

export function parseRegionFromText(text = '') {
  const value = String(text || '').trim();
  if (!value) return { baseName: '', regionLabel: 'Global' };

  const meta = parseG2BulkGameMeta('', value);
  return {
    baseName: meta.baseName,
    regionLabel: meta.regionLabel,
  };
}