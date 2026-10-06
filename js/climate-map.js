/* DailyVet — Division Risk Map v8.0 (Disease Risk — NASA POWER × SEDAC)

   Bubbles  : DISEASE RISK % per area (0–100), coloured by level
              (0–30 কম · 30–50 মধ্যম · 50–70 উচ্চ · 70+ অতি উচ্চ)
   Click    : result panel -> risk %, rain/temp/humidity, top diseases,
              economic loss (division level, NASA SEDAC), prevention steps
   Drill    : Division -> District -> Upazila
   Search   : LocationIQ (Open-Meteo geocoding fallback)
   Same risk engine as the Disease Risk Alert page (NasaOutbreak), so the
   Dhaka bubble and the Disease Risk page always show the same number.

   Needs on the page (in this order): open-meteo-forecast.js is NOT needed here;
   nasa-power-api.js, nasa-outbreak-engine.js, nasa-sedac-mapper.js,
   leaflet-geojson-loader.js, then this file.
*/
(function () {
'use strict';
console.log('[Map] climate-map.js v8.0 (disease risk) loaded');

/* ============================================================
   DIVISIONS — fallback coords for AQI
   ============================================================ */
const DIVISIONS = {
    dhaka:      { lat: 23.8103, lng: 90.4125, name: 'Dhaka',      nameBn: 'ঢাকা',      emoji: '🏛️' },
    chittagong: { lat: 22.3569, lng: 91.7832, name: 'Chittagong', nameBn: 'চট্টগ্রাম', emoji: '⚓' },
    rajshahi:   { lat: 24.3745, lng: 88.6042, name: 'Rajshahi',   nameBn: 'রাজশাহী',   emoji: '🌾' },
    khulna:     { lat: 22.8456, lng: 89.5403, name: 'Khulna',     nameBn: 'খুলনা',     emoji: '🌊' },
    barisal:    { lat: 22.7010, lng: 90.3535, name: 'Barisal',    nameBn: 'বরিশাল',    emoji: '🚤' },
    sylhet:     { lat: 24.8949, lng: 91.8687, name: 'Sylhet',     nameBn: 'সিলেট',     emoji: '🍃' },
    rangpur:    { lat: 25.7439, lng: 89.2752, name: 'Rangpur',    nameBn: 'রংপুর',     emoji: '🌿' },
    mymensingh: { lat: 24.7471, lng: 90.4203, name: 'Mymensingh', nameBn: 'ময়মনসিংহ', emoji: '🌳' }
};

const MAP_CENTER = [23.7, 90.35];
const MAP_ZOOM = 6.4;
const MAP_ZOOM_MOBILE = 6;
const CONCURRENCY = 4;

/* Name variants used by different GeoJSON sources */
const DIV_ALIAS = { chattogram: 'chittagong', chattagram: 'chittagong', barishal: 'barisal', dacca: 'dhaka' };
const divKey = s => { const k = String(s || '').trim().toLowerCase(); return DIV_ALIAS[k] || k; };

/* Bubble sizes */
const BUBBLE_BASE = 30;
const BUBBLE_MAX  = 46;

/* Label offsets */
const LABEL_OFFSET_LAT = 0.28;

/* Level config */
const LEVEL = {
    critical: { color: '#dc2626', labelBn: 'অতি উচ্চ', emoji: '🚨' },
    alert:    { color: '#c2410c', labelBn: 'উচ্চ',     emoji: '⚠️' },
    watch:    { color: '#d97706', labelBn: 'মধ্যম',    emoji: '👀' },
    safe:     { color: '#059669', labelBn: 'কম',       emoji: '✅' },
    unknown:  { color: '#94a3b8', labelBn: 'ডেটা নেই', emoji: '⚪' }
};

/* Tiles */
const TILES = {
    light: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri | NASA POWER + SEDAC + Open-Meteo',
            maxZoom: 16,
            crossOrigin: true
        }
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri | NASA POWER + SEDAC + Open-Meteo',
            maxZoom: 19,
            crossOrigin: true
        }
    }
};

/* ============================================================
   STATE
   ============================================================ */
let map = null;
let markers = new Map();      // key -> bubble marker
let labelMarkers = new Map(); // key -> name label marker
let polygons = new Map();     // key -> polygon layer
let rowsCache = [];           // current level rows
let runToken = 0;
let selectedKey = null;

let currentLevel = 'division';
let selectedDivision = null;

/* ============================================================
   HELPERS
   ============================================================ */
const _el = id => document.getElementById(id);
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => _ESC[c]);

function polygonCentroid(coords) {
    if (!Array.isArray(coords) || !coords.length) return [0, 0];
    let sumLat = 0, sumLng = 0;
    coords.forEach(([lng, lat]) => { sumLat += lat; sumLng += lng; });
    return [sumLat / coords.length, sumLng / coords.length];
}

function getProp(props, ...keys) {
    for (const k of keys) {
        if (props[k] != null && props[k] !== '') return props[k];
    }
    return '';
}

function getFeatureCentroid(feature) {
    const g = feature.geometry;
    if (!g) return null;
    if (g.type === 'Polygon') return polygonCentroid(g.coordinates[0]);
    if (g.type === 'MultiPolygon') {
        let best = g.coordinates[0][0];
        g.coordinates.forEach(p => { if (p[0].length > best.length) best = p[0]; });
        return polygonCentroid(best);
    }
    if (g.type === 'Point') return [g.coordinates[1], g.coordinates[0]];
    return null;
}

function withTimeout(p, ms) {
    return Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);
}

const VECTOR_ICON = { mosquito: '🦟', fly: '🪰', water: '💧', air: '💨', contact: '🤝', environment: '🌍' };
const PREVENTION = [
    '🦟 পশুকে মশারির নিচে রাখুন',
    '💧 জমা পানি ও কাদা পরিষ্কার করুন',
    '🏠 গোয়াল ঘর শুকনো রাখুন',
    '💊 ভেটের পরামর্শে টিকা দিন'
];

/* Risk for one point: NASA POWER (last 7 days, latest day) -> NasaOutbreak engine.
   Results are cached per ~1km so bubble + result panel never refetch. */
const riskCache = new Map();
/* NASA POWER meteorology is a ~0.5° x 0.625° grid: every point inside one cell returns the
   same numbers. Snapping to the cell centre means all upazilas of a district share ONE request
   (instead of 30+ calls that NASA may rate-limit) — and gives identical results anyway. */
function snapToPowerGrid(lat, lng) {
    return [
        Math.round(lat / 0.5) * 0.5,
        Math.round((lng + 180) / 0.625) * 0.625 - 180
    ];
}

function computeRisk(rawLat, rawLng) {
    const [lat, lng] = snapToPowerGrid(rawLat, rawLng);
    const ck = lat.toFixed(3) + ',' + lng.toFixed(3);
    if (riskCache.has(ck)) return riskCache.get(ck);
    const p = (async () => {
        if (!window.NasaPower || !window.NasaOutbreak) return null;
        try {
            const parameter = await withTimeout(NasaPower.getPowerData(lat, lng, 7), 20000);
            if (!parameter) return null;
            const rain = NasaPower.getLatest(parameter, 'PRECTOTCORR');
            const temp = NasaPower.getLatest(parameter, 'T2M');
            const rh   = NasaPower.getLatest(parameter, 'RH2M');
            if (!rain || !temp || !rh) return null;
            const risk = NasaOutbreak.calculateRainfallRiskDetailed(rain.value, rh.value, temp.value);
            const diseases = NasaOutbreak.calculateDiseaseRisks({
                rainMm: rain.value, humidity: rh.value, temp: temp.value
            });
            return { risk, diseases, rainMm: rain.value, temp: temp.value, humidity: rh.value };
        } catch (_) { return null; }
    })();
    riskCache.set(ck, p);
    p.then(r => { if (!r) riskCache.delete(ck); });
    return p;
}

/* ============================================================
   MAP INIT
   ============================================================ */
function initMap() {
    const container = _el('divisionMap');
    if (!container) return null;
    if (map) return map;

    const isMobile = window.innerWidth <= 520;

    map = L.map(container, {
        center: MAP_CENTER,
        zoom: isMobile ? MAP_ZOOM_MOBILE : MAP_ZOOM,
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: false,
        minZoom: 5,
        maxZoom: 12,
        maxBounds: [[20.0, 87.0], [27.0, 93.5]]
    });

    const lightLayer = L.tileLayer(TILES.light.url, TILES.light.options);
    const satelliteLayer = L.tileLayer(TILES.satellite.url, TILES.satellite.options);
    lightLayer.addTo(map);

    L.control.layers(
        { '🗺️ Street': lightLayer, '🛰️ Satellite': satelliteLayer },
        null,
        { position: 'topright', collapsed: isMobile }
    ).addTo(map);

    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur',  () => map.scrollWheelZoom.disable());

    setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 300);

    return map;
}

/* ============================================================
   CLEAR ALL LAYERS
   ============================================================ */
function clearAll() {
    markers.forEach(m => { try { map.removeLayer(m); } catch (_) {} });
    markers.clear();
    labelMarkers.forEach(m => { try { map.removeLayer(m); } catch (_) {} });
    labelMarkers.clear();
    polygons.forEach(p => { try { map.removeLayer(p); } catch (_) {} });
    polygons.clear();
    selectedKey = null;
    runToken++;
    try { map.closePopup(); } catch (_) {}
}

/* ============================================================
   BUBBLES (v7 — self-contained: styles are injected from JS,
   so the bubbles never depend on css/style.css)
   ============================================================ */
function injectBubbleStyles() {
    if (document.getElementById('dvb-styles')) return;
    const s = document.createElement('style');
    s.id = 'dvb-styles';
    s.textContent =
        '.dvb-marker{background:transparent!important;border:none!important;}' +
        '.dvb-bubble{display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
            'border:2.5px solid #fff;border-radius:50%;color:#fff;font-weight:800;line-height:1;' +
            'text-shadow:0 1px 2px rgba(0,0,0,.45);box-shadow:0 2px 8px rgba(0,0,0,.35);' +
            'cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}' +
        '.dvb-marker:hover .dvb-bubble{transform:scale(1.2);box-shadow:0 4px 14px rgba(0,0,0,.45);}' +
        '.dvb-bubble.dvb-loading{opacity:.6;animation:dvbPulse 1.2s infinite ease-in-out;}' +
        '@keyframes dvbPulse{50%{opacity:.3;}}' +
        '.dvb-pop{min-width:150px;font-family:inherit;line-height:1.5;}' +
        '.dvb-pop-title{font-weight:700;font-size:14px;margin-bottom:2px;}' +
        '.dvb-pop-aqi{font-weight:800;font-size:15px;margin-bottom:4px;}' +
        '.dvb-pop-btn{margin-top:6px;width:100%;border:0;border-radius:8px;padding:6px 10px;' +
            'background:#7c3aed;color:#fff;font-weight:600;cursor:pointer;}';
    s.textContent +=
        '.dvr-score{text-align:center;border:2px solid;border-radius:14px;padding:10px 8px;margin:10px 0;}' +
        '.dvr-score b{display:block;font-size:34px;line-height:1.1;font-weight:800;}' +
        '.dvr-score span{font-size:13px;font-weight:700;}' +
        '.dvr-wx{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:13px;margin:6px 0 10px;color:#334155;}' +
        '.dvr-sec{margin-top:12px;}' +
        '.dvr-sec-title{font-weight:700;font-size:13px;margin-bottom:6px;color:#0f172a;}' +
        '.dvr-dis{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;margin-bottom:5px;border-radius:10px;background:#f8fafc;font-size:13px;}' +
        '.dvr-dis b{font-weight:800;}' +
        '.dvr-dis small{display:block;color:#64748b;font-size:11px;}' +
        '.dvr-eco{text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px;}' +
        '.dvr-eco-val{font-size:22px;font-weight:800;color:#b45309;}' +
        '.dvr-eco small{display:block;font-size:12px;color:#78350f;margin-top:3px;}' +
        '.dvr-prev{margin:0;padding-left:0;list-style:none;font-size:13px;line-height:1.8;}';
    document.head.appendChild(s);
}

function bubbleSize(value, maxValue) {
    if (!value || !maxValue) return BUBBLE_BASE;
    const ratio = Math.sqrt(value / Math.max(1, maxValue));
    return Math.round(BUBBLE_BASE + (BUBBLE_MAX - BUBBLE_BASE) * ratio);
}

function bubbleState(row) {
    const d = row.data;
    if (d && d.risk) {
        const lv = LEVEL[d.risk.level] || LEVEL.unknown;
        return { score: d.risk.score, color: lv.color, label: lv.labelBn, emoji: lv.emoji };
    }
    return { score: null, color: LEVEL.unknown.color, label: row.loading ? 'লোড হচ্ছে' : 'ডেটা নেই', emoji: '⚪' };
}

function makeBubbleIcon(row, ctx) {
    const st = bubbleState(row);
    const size = bubbleSize(st.score || 0, ctx.maxScore) + ctx.boost;
    const text = st.score != null ? st.score + '%' : (row.loading ? '…' : '—');
    const fontSize = Math.max(9, Math.min(13, size / 3.2));
    const html =
        '<div class="dvb-bubble' + (row.loading ? ' dvb-loading' : '') + '" style="' +
            'width:' + size + 'px;height:' + size + 'px;' +
            'background:' + st.color + ';font-size:' + fontSize + 'px;">' +
            '<span>' + esc(text) + '</span>' +
        '</div>';
    return L.divIcon({
        html,
        className: 'dvb-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
    });
}

function popupHTML(row) {
    const st = bubbleState(row);
    return '<div class="dvb-pop">' +
        '<div class="dvb-pop-title">' + esc(row.emoji || '📍') + ' ' + esc(row.nameBn) + '</div>' +
        '<div class="dvb-pop-aqi" style="color:' + st.color + ';">রোগ ঝুঁকি ' +
            (st.score != null ? st.score + '%' : '—') + ' · ' + esc(st.label) + '</div>' +
        (row.level !== 'upazila' && row.feature
            ? '<button class="dvb-pop-btn" onclick="window.__mapDrill(' + row.idx + ')">আরও দেখুন →</button>'
            : '') +
    '</div>';
}

function getCtx(rows, boost) {
    return {
        boost: boost || 0,
        maxScore: Math.max(1, ...rows.map(r => (r.data && r.data.risk ? r.data.risk.score : 0)))
    };
}

function upsertBubble(row, ctx) {
    const icon = makeBubbleIcon(row, ctx);
    let m = markers.get(row.key);
    if (m) {
        m.setIcon(icon);
        m.setPopupContent(popupHTML(row));
        return m;
    }
    m = L.marker(row.centroid, {
        icon,
        title: row.nameBn,
        riseOnHover: true,
        zIndexOffset: 1000
    });
    m.bindPopup(popupHTML(row), { autoPan: true });
    m.on('click', () => showResult(
        row.nameBn + (row.level === 'division' ? ' বিভাগ' : ''),
        row.aqiPoint ? row.aqiPoint[0] : row.centroid[0],
        row.aqiPoint ? row.aqiPoint[1] : row.centroid[1],
        row
    ));
    m.addTo(map);
    markers.set(row.key, m);
    return m;
}

/* Fetch risk a few areas at a time; each finished row updates its bubble immediately.
   Bubbles are already on the map BEFORE any network call, so a slow/failed API never hides them. */
async function loadRisk(rows, token, boost) {
    let next = 0;
    let anyOk = false;
    const worker = async () => {
        while (next < rows.length) {
            const row = rows[next++];
            if (token !== runToken) return;
            const pt = row.aqiPoint || row.centroid;
            row.data = await computeRisk(pt[0], pt[1]);
            row.loading = false;
            if (row.data) anyOk = true;
            if (token !== runToken) return;
            const ctx = getCtx(rows, boost);
            rows.forEach(r => { if (markers.has(r.key)) upsertBubble(r, ctx); });
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (token === runToken && !anyOk) {
        console.warn('[Map] No risk data came back — check NasaPower / network.');
    }
}

/* ============================================================
   LABEL + POLYGON
   ============================================================ */
function addLabelMarker(key, lat, lng, text, cssClass) {
    const labelIcon = L.divIcon({
        html: '<div class="' + cssClass + '">' + esc(text) + '</div>',
        className: 'dv-label-wrap',
        iconSize: [100, 22],
        iconAnchor: [50, 11]
    });
    const m = L.marker([lat, lng], {
        icon: labelIcon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -100
    }).addTo(map);
    labelMarkers.set(key, m);
    return m;
}

function addPolygon(key, feature, style, onClick) {
    const polygon = L.geoJSON(feature, {
        style: style,
        onEachFeature: (f, layer) => {
            layer.on('mouseover', () => {
                layer.setStyle({ weight: 2.2, opacity: 0.9, fillOpacity: 0.15 });
                layer.bringToFront();
            });
            layer.on('mouseout', () => {
                if (key === selectedKey) return;
                layer.setStyle(style);
            });
            layer.on('click', onClick);
        }
    }).addTo(map);
    polygons.set(key, polygon);
    return polygon;
}

/* Shared drawing for every level: polygon + label + bubble, then risk streams in */
function drawLevel(rows, cfg) {
    const token = runToken;
    rowsCache = rows;
    rows.forEach((row, i) => {
        row.idx = i;
        row.loading = true;
        row.data = null;
        if (row.feature) addPolygon(row.key, row.feature, cfg.style, () => cfg.onPolygonClick(row));
        addLabelMarker(row.key + '_label', row.centroid[0] - cfg.labelOffset, row.centroid[1], row.nameBn, cfg.labelClass);
    });
    const ctx = getCtx(rows, cfg.boost);
    rows.forEach(r => upsertBubble(r, ctx));
    loadRisk(rows, token, cfg.boost);
}

function fitToPolygons() {
    const layers = Array.from(polygons.values());
    if (!layers.length) return;
    const b = L.featureGroup(layers).getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
}

/* ============================================================
   RENDER: DIVISIONS
   ============================================================ */
function renderDivisions() {
    if (!map) return;
    clearAll();
    currentLevel = 'division';
    selectedDivision = null;
    updateBreadcrumb('division');

    const hasGeo = !!(window.BD_DIVISIONS && window.BD_DIVISIONS.features && window.BD_DIVISIONS.features.length);
    let rows;

    if (!hasGeo) {
        console.warn('[Map] BD_DIVISIONS missing (check data/bd-divisions.geojson path) — using built-in division points');
        rows = Object.keys(DIVISIONS).map(key => {
            const d = DIVISIONS[key];
            return {
                key,
                level: 'division',
                nameEn: d.name,
                nameBn: d.nameBn,
                emoji: d.emoji,
                aqiPoint: [d.lat, d.lng],
                centroid: [d.lat, d.lng],
                feature: null
            };
        });
    } else rows = window.BD_DIVISIONS.features.map(feature => {
        const props = feature.properties;
        const nameEn = getProp(props, 'ADM1_EN', 'name', 'NAME_1');
        const key = divKey(nameEn);
        const div = DIVISIONS[key] || {};
        const centroid = getFeatureCentroid(feature);
        return {
            key,
            level: 'division',
            nameEn,
            nameBn: getProp(props, 'ADM1_BN', 'nameBn') || div.nameBn || nameEn,
            emoji: div.emoji || '📍',
            aqiPoint: div.lat != null ? [div.lat, div.lng] : centroid,
            centroid,
            feature
        };
    }).filter(r => r.centroid);

    drawLevel(rows, {
        style: { color: '#7c3aed', weight: 1.2, opacity: 0.55, fillColor: '#a78bfa', fillOpacity: 0.06, dashArray: '3,3' },
        labelClass: 'dv-division-label',
        labelOffset: LABEL_OFFSET_LAT,
        boost: 8,
        onPolygonClick: row => drillToDistricts(row)
    });

    renderScoreReference();
    map.fitBounds([[20.6, 88.0], [26.7, 92.7]], { padding: [20, 20] });
}

/* ============================================================
   RENDER: DISTRICTS
   ============================================================ */
function drillToDistricts(divisionRow) {
    if (!map) return;

    const districts = (window.BD_DISTRICTS && window.BD_DISTRICTS.features || []).filter(f =>
        divKey(getProp(f.properties, 'ADM1_EN', 'division')) === divisionRow.key
    );

    if (!districts.length) {
        showResult(divisionRow.nameBn + ' বিভাগ', (divisionRow.aqiPoint || divisionRow.centroid)[0], (divisionRow.aqiPoint || divisionRow.centroid)[1], divisionRow);
        return;
    }

    clearAll();
    currentLevel = 'district';
    selectedDivision = divisionRow.key;
    updateBreadcrumb('district', divisionRow.nameBn);

    const rows = districts.map(feature => {
        const props = feature.properties;
        const nameEn = getProp(props, 'ADM2_EN', 'name', 'NAME_2');
        return {
            key: nameEn.toLowerCase(),
            level: 'district',
            nameEn,
            nameBn: getProp(props, 'ADM2_BN', 'nameBn') || nameEn,
            emoji: '📍',
            centroid: getFeatureCentroid(feature),
            feature
        };
    }).filter(r => r.centroid);

    drawLevel(rows, {
        style: { color: '#2563eb', weight: 1.5, opacity: 0.75, fillColor: '#60a5fa', fillOpacity: 0.10 },
        labelClass: 'dv-district-label',
        labelOffset: 0.10,
        boost: 0,
        onPolygonClick: row => drillToUpazilas(row)
    });

    fitToPolygons();
}

/* ============================================================
   RENDER: UPAZILAS
   ============================================================ */
function drillToUpazilas(districtRow) {
    if (!map) return;

    const upazilas = (window.BD_UPAZILAS && window.BD_UPAZILAS.features || []).filter(f =>
        getProp(f.properties, 'ADM2_EN', 'district').toLowerCase() === districtRow.key
    );

    if (!upazilas.length) {
        showResult(districtRow.nameBn, districtRow.centroid[0], districtRow.centroid[1]);
        return;
    }

    clearAll();
    currentLevel = 'upazila';
    updateBreadcrumb('upazila', districtRow.nameBn);

    const rows = upazilas.map(feature => {
        const props = feature.properties;
        const nameEn = getProp(props, 'ADM3_EN', 'name', 'NAME_3');
        return {
            key: nameEn.toLowerCase(),
            level: 'upazila',
            nameEn,
            nameBn: getProp(props, 'ADM3_BN', 'nameBn') || nameEn,
            emoji: '📍',
            centroid: getFeatureCentroid(feature),
            feature
        };
    }).filter(r => r.centroid);

    drawLevel(rows, {
        style: { color: '#0891b2', weight: 1, opacity: 0.65, fillColor: '#22d3ee', fillOpacity: 0.08 },
        labelClass: 'dv-upazila-label',
        labelOffset: 0.05,
        boost: 0,
        onPolygonClick: row => showResult(row.nameBn, row.centroid[0], row.centroid[1])
    });

    fitToPolygons();
}

/* Popup "আরও দেখুন" button */
window.__mapDrill = function (idx) {
    const row = rowsCache[idx];
    if (!row || !map) return;
    map.closePopup();
    if (currentLevel === 'division') drillToDistricts(row);
    else if (currentLevel === 'district') drillToUpazilas(row);
};

/* ============================================================
   RESULT PANEL
   ============================================================ */
async function showResult(placeName, lat, lng, row) {
    const result = _el('mapResult');
    if (!result) return;

    result.style.display = 'block';
    result.innerHTML =
        '<div class="map-result-loading">' +
            '<i class="fas fa-spinner fa-spin"></i>' +
            '<span>' + esc(placeName) + ' এর ডেটা লোড হচ্ছে...</span>' +
        '</div>';

    const data = await computeRisk(lat, lng);
    if (!data) {
        result.innerHTML =
            '<div class="map-result-loading"><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i>' +
            '<span>' + esc(placeName) + ' এর NASA ডেটা পাওয়া যায়নি</span></div>';
        return;
    }

    const risk = data.risk;
    const lv = LEVEL[risk.level] || LEVEL.unknown;

    /* Economic loss — NASA SEDAC is available per DIVISION only */
    let eco = null;
    if (row && row.level === 'division' && window.NasaSedac) {
        try {
            const sedac = await NasaSedac.fetchSedacData(row.key);
            if (sedac) {
                const impact = NasaSedac.calculateImpactDetailed(sedac, { level: risk.level, score: risk.score });
                if (impact) eco = impact;
            }
        } catch (err) { console.warn('[Map] SEDAC unavailable:', err.message); }
    }

    const diseasesHTML = data.diseases.length
        ? '<div class="dvr-sec"><div class="dvr-sec-title">🚨 সতর্ক থাকুন এই রোগগুলোর জন্য</div>' +
            data.diseases.map(d =>
                '<div class="dvr-dis"><span>' + (VECTOR_ICON[d.vector] || '🌍') + ' ' + esc(d.nameBn) + '</span>' +
                '<b style="color:' + (d.score >= 70 ? '#dc2626' : d.score >= 50 ? '#c2410c' : '#92400e') + ';">' + d.score + '%</b></div>'
            ).join('') + '</div>'
        : '';

    const ecoHTML = eco
        ? '<div class="dvr-sec"><div class="dvr-sec-title">💰 সম্ভাব্য আর্থিক ক্ষতি</div>' +
            '<div class="dvr-eco"><div class="dvr-eco-val">৳' + (eco.economicLoss.total / 10000000).toFixed(2) + ' কোটি</div>' +
            '<small>🐾 পশু ঝুঁকিতে ' + eco.livestockAtRisk.toLocaleString('en-US') + '</small>' +
            '<small>📊 রেঞ্জ ৳' + eco.economicLoss.minCrore + '–' + eco.economicLoss.maxCrore + ' কোটি</small></div></div>'
        : '';

    result.innerHTML =
        '<div class="map-result-card">' +
            '<div class="map-result-header">' +
                '<div class="map-result-icon" style="background:' + lv.color + ';">' + lv.emoji + '</div>' +
                '<div class="map-result-title">' +
                    '<h3>' + esc(placeName) + '</h3>' +
                    '<p>রোগ ঝুঁকি · NASA POWER</p>' +
                '</div>' +
                '<button class="map-result-close" onclick="window.__closeMapResult()">' +
                    '<i class="fas fa-times"></i>' +
                '</button>' +
            '</div>' +
            '<div class="dvr-score" style="border-color:' + lv.color + ';background:' + lv.color + '15;">' +
                '<b style="color:' + lv.color + ';">' + risk.score + '%</b>' +
                '<span style="color:' + lv.color + ';">রোগ ঝুঁকি · ' + esc(lv.labelBn) + '</span>' +
            '</div>' +
            '<div class="dvr-wx">' +
                '<span>🌧️ বৃষ্টি ' + Math.round(data.rainMm) + 'mm</span>' +
                '<span>🌡️ তাপ ' + Math.round(data.temp) + '°C</span>' +
                '<span>💧 আর্দ্রতা ' + Math.round(data.humidity) + '%</span>' +
            '</div>' +
            diseasesHTML +
            ecoHTML +
            '<div class="dvr-sec"><div class="dvr-sec-title">🛡️ প্রতিরোধমূলক ব্যবস্থা</div>' +
                '<ul class="dvr-prev">' + PREVENTION.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul></div>' +
        '</div>';
}

window.__closeMapResult = function () {
    const r = _el('mapResult');
    if (r) r.style.display = 'none';
};

/* ============================================================
   SCORE REFERENCE
   ============================================================ */
function renderScoreReference() {
    const ref = _el('mapScoreReference');
    if (!ref) return;

    ref.innerHTML =
        '<div class="map-ref-card">' +
            '<div class="map-ref-title"><i class="fas fa-clipboard-list"></i><span>রোগ ঝুঁকির মাত্রা (স্কোর রেঞ্জ)</span></div>' +
            '<div class="map-ref-group">' +
                '<div class="map-ref-label">🦠 Disease Risk Score</div>' +
                '<div class="map-ref-grid">' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#059669;"></span><span class="map-ref-range">🟢 0–30%</span><span class="map-ref-text" style="color:#059669;">কম</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#d97706;"></span><span class="map-ref-range">🟡 30–50%</span><span class="map-ref-text" style="color:#d97706;">মধ্যম</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#c2410c;"></span><span class="map-ref-range">🟠 50–70%</span><span class="map-ref-text" style="color:#c2410c;">উচ্চ</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#dc2626;"></span><span class="map-ref-range">🔴 70%+</span><span class="map-ref-text" style="color:#dc2626;">অতি উচ্চ</span></div>' +
                '</div>' +
            '</div>' +
        '</div>';
}

/* ============================================================
   BREADCRUMB
   ============================================================ */
function updateBreadcrumb(level, name) {
    const bc = _el('mapBreadcrumb');
    const backBtn = _el('mapBackBtn');
    if (!bc) return;

    if (level === 'division') {
        bc.innerHTML = '<span class="map-bc-active">বাংলাদেশ</span>';
        if (backBtn) backBtn.style.display = 'none';
        return;
    }

    if (backBtn) backBtn.style.display = 'flex';
    bc.innerHTML = '<span class="map-bc-link" onclick="window.__mapBackToDivisions()">বাংলাদেশ</span>' +
        '<span class="map-bc-sep">›</span>' +
        '<span class="map-bc-active">' + esc(name || '') + '</span>';
}

window.__mapBackToDivisions = function () {
    renderDivisions();
    const r = _el('mapResult');
    if (r) r.style.display = 'none';
};

/* ============================================================
   SEARCH
   ============================================================ */
const LOCATIONIQ_KEY = 'pk.6233e1f050e2472d37bc17cb18a3b519';
let searchAbort = null;
let searchPin = null;

/* Fallback if LocationIQ is down / rate-limited */
async function openMeteoSearch(query) {
    try {
        const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
                    encodeURIComponent(query) + '&country=BD&count=8&language=bn';
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return (data.results || []).map(r => ({
            name: r.name,
            sub: [r.admin1, r.admin2].filter(Boolean).join(', '),
            lat: r.latitude,
            lng: r.longitude
        }));
    } catch (err) {
        console.warn('[Map] Fallback search failed:', err.message);
        return [];
    }
}

/* LocationIQ Autocomplete — returns null when the request was superseded */
async function searchPlaces(query) {
    if (!query || query.length < 2) return [];

    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    try {
        const url = 'https://api.locationiq.com/v1/autocomplete' +
            '?key=' + LOCATIONIQ_KEY +
            '&q=' + encodeURIComponent(query) +
            '&countrycodes=bd&limit=8&dedupe=1&normalizecity=1&accept-language=bn';
        const res = await fetch(url, { signal: searchAbort.signal });

        if (res.status === 404) return [];            // LocationIQ: "no results"
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map(r => {
            const full = String(r.display_name || '');
            return {
                name: r.display_place || (r.address && r.address.name) || full.split(',')[0],
                sub: r.display_address || full,
                lat: parseFloat(r.lat),
                lng: parseFloat(r.lon)
            };
        }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    } catch (err) {
        if (err.name === 'AbortError') return null;
        console.warn('[Map] LocationIQ failed, using fallback:', err.message);
        return openMeteoSearch(query);
    }
}

function renderSearchResults(results) {
    const dd = _el('mapSearchResults');
    if (!dd) return;

    if (!results || !results.length) { dd.style.display = 'none'; return; }

    dd.style.display = 'block';
    dd.innerHTML = results.map(r =>
        '<div class="map-search-item" data-lat="' + r.lat + '" data-lng="' + r.lng + '" data-name="' + esc(r.name) + '">' +
            '<div class="map-search-icon"><i class="fas fa-map-marker-alt"></i></div>' +
            '<div class="map-search-text">' +
                '<div class="map-search-name">' + esc(r.name) + '</div>' +
                '<div class="map-search-sub">' + esc(r.sub || '') + '</div>' +
            '</div>' +
        '</div>'
    ).join('') +
    '<div style="padding:4px 12px;font-size:10px;color:#94a3b8;text-align:right;">Search by LocationIQ.com</div>';

    dd.querySelectorAll('.map-search-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lng = parseFloat(item.dataset.lng);
            const name = item.dataset.name;
            const input = _el('mapSearchInput');
            if (input) input.value = name;
            if (map) {
                map.flyTo([lat, lng], 10, { duration: 1 });
                if (searchPin) { try { map.removeLayer(searchPin); } catch (_) {} }
                searchPin = L.circleMarker([lat, lng], {
                    radius: 9, color: '#fff', weight: 3, fillColor: '#7c3aed', fillOpacity: 1
                }).addTo(map);
            }
            showResult(name, lat, lng);
            dd.style.display = 'none';
        });
    });
}

function initSearch() {
    const input = _el('mapSearchInput');
    if (!input) return;

    input.addEventListener('input', e => {
        const q = e.target.value.trim();
        clearTimeout(window.__mapSearchTimeout);
        if (q.length < 2) {
            const dd = _el('mapSearchResults');
            if (dd) dd.style.display = 'none';
            return;
        }
        window.__mapSearchTimeout = setTimeout(async () => {
            const results = await searchPlaces(q);
            if (results === null) return; // superseded by a newer keystroke
            renderSearchResults(results);
        }, 350);
    });

    document.addEventListener('click', e => {
        const dd = _el('mapSearchResults');
        if (dd && !dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
    });
}

/* ============================================================
   INIT
   ============================================================ */
function getUserPhone() {
    try {
        return sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    } catch (_) { return null; }
}

function start() {
    if (!getUserPhone()) {
        window.location.replace('login.html');
        return;
    }

    if (!window.NasaPower || !window.NasaOutbreak) {
        console.error('[Map] nasa-power-api.js / nasa-outbreak-engine.js not loaded — add them to climate-map.html');
    }
    injectBubbleStyles();
    initMap();
    initSearch();

    /* If GeoJSON already loaded, render now */
    if (window.BD_DIVISIONS) {
        const loading = _el('mapLoading');
        if (loading) loading.style.display = 'none';
        renderDivisions();
    }
}

/* Public hook for leaflet-geojson-loader.js */
window.__mapOnDataReady = function () {
    console.log('[Map] GeoJSON ready — rendering divisions');
    injectBubbleStyles();
    initMap();
    const loading = _el('mapLoading');
    if (loading) loading.style.display = 'none';
    renderDivisions();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
} else {
    start();
}

})();