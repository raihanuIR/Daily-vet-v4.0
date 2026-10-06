/* DailyVet — NASA POWER API Client
   Source: https://power.larc.nasa.gov/docs/services/api/
   Flow:   memory cache -> Firestore cache (24h) -> live NASA POWER call */
(function () {
'use strict';

/* ===== START: CONFIG (NASA endpoint, parameters, cache, timeout) ===== */
const POWER_BASE_URL   = 'https://power.larc.nasa.gov/api/temporal/daily/point';
/* T2M/T2M_MAX/RH2M -> THI | GWETTOP/GWETROOT -> forage | PRECTOTCORR -> disease risk */
const POWER_PARAMS     = ['T2M', 'T2M_MAX', 'RH2M', 'GWETTOP', 'GWETROOT', 'PRECTOTCORR'].join(',');
const CACHE_TTL_MS     = 24 * 60 * 60 * 1000;
const MEM_TTL_MS       = 30 * 60 * 1000;
const CACHE_COLLECTION = 'nasa_cache';
const API_TIMEOUT_MS   = 15000;
const RETRY_DELAY_MS   = 800;
const MISSING_VALUE    = -999;

const _fs  = () => firebase.firestore();
const _mem = new Map();
/* Where each parameter object came from: 'live' | 'firestore-cache' | 'stale-cache' */
const _meta = new WeakMap();
const _tag = (obj, source) => { if (obj && typeof obj === 'object') _meta.set(obj, source); return obj; };
/* ===== END: CONFIG (NASA endpoint, parameters, cache, timeout) ===== */

/* ===== START: HELPERS (date, cache key, -999 validation, retry check) ===== */
const _sleep = ms => new Promise(r => setTimeout(r, ms));

/** Date -> YYYYMMDD */
function _dateStr(d) {
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Coordinates rounded to 2 decimals (~1km) to maximise cache hits. */
function _cacheKey(lat, lng, start, end) {
    return `${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}_${start}_${end}`;
}

/** NASA uses -999 as the "missing data" sentinel. */
function _isValidValue(v) {
    return typeof v === 'number' && Number.isFinite(v) && v !== MISSING_VALUE;
}

/** Last-good snapshot per location (used as offline fallback). */
function _latestKey(lat, lng) {
    return `latest_${Number(lat).toFixed(2)}_${Number(lng).toFixed(2)}`;
}

/** Age of a YYYYMMDD date in whole days (UTC) -> number | null */
function ageDays(yyyymmdd) {
    if (!yyyymmdd || String(yyyymmdd).length !== 8) return null;
    const s = String(yyyymmdd);
    const t = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function _isRetryable(err) {
    return err.name === 'TypeError' || err.retryable === true ||
           err.status === 429 || err.status >= 500;
}
/* ===== END: HELPERS (date, cache key, -999 validation, retry check) ===== */

/* ===== START: NASA POWER API CALL - single request with timeout ===== */
async function _fetchOnce(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
            const e = new Error(`NASA POWER HTTP ${res.status}`);
            e.status = res.status;
            throw e;
        }
        const json = await res.json();
        if (!json || !json.properties || !json.properties.parameter) {
            throw new Error('NASA POWER: unexpected response format');
        }
        return json.properties.parameter;
    } catch (err) {
        if (err.name === 'AbortError') {
            const e = new Error('NASA POWER request timed out');
            e.retryable = true;
            throw e;
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}
/* ===== END: NASA POWER API CALL - single request with timeout ===== */

/* ===== START: NASA POWER API CALL - live fetch + one retry ===== */
/**
 * Live NASA POWER call (retries once on timeout / network / 429 / 5xx).
 * @returns {Promise<Object>} { T2M: { "20251001": 28.5, ... }, ... }
 */
async function fetchFromPowerAPI(lat, lng, startDate, endDate) {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
        throw new Error('NASA POWER: invalid coordinates');
    }

    /* ===== START: BUILD NASA URL ===== */
    const url = `${POWER_BASE_URL}?parameters=${POWER_PARAMS}&community=AG` +
                `&longitude=${lo}&latitude=${la}&start=${startDate}&end=${endDate}&format=JSON`;
    /* ===== END: BUILD NASA URL ===== */

    try {
        return await _fetchOnce(url);
    } catch (err) {
        if (!_isRetryable(err)) throw err;
        await _sleep(RETRY_DELAY_MS);
        return _fetchOnce(url);
    }
}
/* ===== END: NASA POWER API CALL - live fetch + one retry ===== */

/* ===== START: FIRESTORE CACHE - READ (24h TTL) ===== */
async function readCache(cacheKey, allowStale) {
    try {
        const doc = await _fs().collection(CACHE_COLLECTION).doc(cacheKey).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data || !data.cachedAtMs) return null;
        if (!allowStale && Date.now() - data.cachedAtMs > CACHE_TTL_MS) return null;
        return data.parameter || null;
    } catch (err) {
        console.warn('[NASA] Cache read failed:', err.message);
        return null;
    }
}
/* ===== END: FIRESTORE CACHE - READ (24h TTL) ===== */

/* ===== START: FIRESTORE CACHE - WRITE ===== */
async function writeCache(cacheKey, parameter) {
    try {
        await _fs().collection(CACHE_COLLECTION).doc(cacheKey).set({
            parameter,
            cachedAtMs: Date.now(),
            cachedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn('[NASA] Cache write failed:', err.message);
    }
}
/* ===== END: FIRESTORE CACHE - WRITE ===== */

/* ===== START: LOAD DATA (Firestore cache first, then NASA API) ===== */
async function _load(lat, lng, startStr, endStr, cacheKey) {
    /* ===== 1. FRESH FIRESTORE CACHE ===== */
    const cached = await readCache(cacheKey);
    if (cached) return _tag(cached, 'firestore-cache');

    try {
        /* ===== 2. LIVE NASA POWER CALL ===== */
        const parameter = await fetchFromPowerAPI(lat, lng, startStr, endStr);

        /* ===== 3. SAVE (never cache an empty response) ===== */
        if (getLatest(parameter, 'T2M')) {
            writeCache(cacheKey, parameter);
            writeCache(_latestKey(lat, lng), parameter);
        }
        return _tag(parameter, 'live');
    } catch (err) {
        /* ===== 4. OFFLINE FALLBACK: last good snapshot for this location ===== */
        const stale = await readCache(_latestKey(lat, lng), true);
        if (stale && getLatest(stale, 'T2M')) {
            console.warn('[NASA] Live call failed, using last saved snapshot:', err.message);
            return _tag(stale, 'stale-cache');
        }
        throw err;
    }
}
/* ===== END: LOAD DATA (Firestore cache first, then NASA API) ===== */

/* ===== START: MAIN GETTER - getPowerData (memory cache + shared request) ===== */
/**
 * Get NASA POWER data for coordinates (last N days).
 * Concurrent / repeated calls for the same key share one request.
 */
function getPowerData(lat, lng, daysBack) {
    daysBack = daysBack || 7;

    /* ===== START: DATE RANGE (last N days) ===== */
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    const startStr = _dateStr(start);
    const endStr = _dateStr(end);
    const key = _cacheKey(lat, lng, startStr, endStr);
    /* ===== END: DATE RANGE (last N days) ===== */

    /* ===== START: MEMORY CACHE CHECK ===== */
    const hit = _mem.get(key);
    if (hit && Date.now() - hit.at < MEM_TTL_MS) return hit.promise;
    /* ===== END: MEMORY CACHE CHECK ===== */

    /* ===== START: START REQUEST + SHARE WITH CONCURRENT CALLERS ===== */
    const promise = _load(lat, lng, startStr, endStr, key);
    _mem.set(key, { at: Date.now(), promise });
    promise.catch(() => {
        const cur = _mem.get(key);
        if (cur && cur.promise === promise) _mem.delete(key);
    });
    return promise;
    /* ===== END: START REQUEST + SHARE WITH CONCURRENT CALLERS ===== */
}
/* ===== END: MAIN GETTER - getPowerData (memory cache + shared request) ===== */

/* ===== START: DATA PARSERS - getLatest / getSeries ===== */
/** Latest valid value of a parameter -> { value, date } | null */
function getLatest(parameter, key) {
    if (!parameter || !parameter[key]) return null;
    const series = parameter[key];
    const dates = Object.keys(series).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
        if (_isValidValue(series[dates[i]])) {
            return { value: series[dates[i]], date: dates[i] };
        }
    }
    return null;
}

/** Valid time-series of a parameter -> [{ date, value }] */
function getSeries(parameter, key) {
    if (!parameter || !parameter[key]) return [];
    const series = parameter[key];
    return Object.keys(series)
        .sort()
        .map(d => ({ date: d, value: series[d] }))
        .filter(item => _isValidValue(item.value));
}
/* ===== END: DATA PARSERS - getLatest / getSeries ===== */

/* ===== START: PUBLIC API - window.NasaPower ===== */
window.NasaPower = {
    getPowerData,
    getLatest,
    getSeries,
    fetchFromPowerAPI,
    getSource: parameter => (parameter && _meta.get(parameter)) || 'unknown',
    ageDays,
    PARAMETERS: POWER_PARAMS.split(',')
};
/* ===== END: PUBLIC API - window.NasaPower ===== */

})();