/* DailyVet — Air Quality & UV Interactive Map v1.0
   
   Purpose: Show AQI bubbles on Bangladesh map + allow search by location
   Same drill-down pattern as climate-map.js, but result panel shows
   DETAILED Air Quality data (PM2.5, PM10, O3, NO2, UV, etc.)
   
   Data:
   • window.BD_DIVISIONS, BD_DISTRICTS, BD_UPAZILAS (GeoJSON)
   • OpenMeteo.getAQI / classifyAQI (via open-meteo-forecast.js)
   • LocationIQ for search
*/
(function () {
'use strict';
console.log('[AirMap] climate-air-map.js v1.0 loaded');

/* ============================================================
   DIVISIONS — fallback coords
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

const DIV_ALIAS = { chattogram: 'chittagong', chattagram: 'chittagong', barishal: 'barisal', dacca: 'dhaka' };
const divKey = s => { const k = String(s || '').trim().toLowerCase(); return DIV_ALIAS[k] || k; };

const BUBBLE_BASE = 22;
const BUBBLE_MAX  = 40;
const LABEL_OFFSET_LAT = 0.28;

const TILES = {
    light: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri | Air Quality: Open-Meteo | Boundaries: GADM',
            maxZoom: 16,
            crossOrigin: true
        }
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: {
            attribution: 'Tiles &copy; Esri | Air Quality: Open-Meteo | Boundaries: GADM',
            maxZoom: 19,
            crossOrigin: true
        }
    }
};

/* ============================================================
   STATE
   ============================================================ */
let map = null;
let markers = new Map();
let labelMarkers = new Map();
let polygons = new Map();
let rowsCache = [];
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

function levelOfAqi(aqi) {
    if (window.OpenMeteo && typeof OpenMeteo.classifyAQI === 'function') {
        return OpenMeteo.classifyAQI(aqi);
    }
    if (!Number.isFinite(aqi)) return { label: 'অজানা', color: '#94a3b8', icon: '⚪' };
    if (aqi <= 50)  return { label: 'ভালো', color: '#059669', icon: '🟢' };
    if (aqi <= 100) return { label: 'মধ্যম', color: '#d97706', icon: '🟡' };
    if (aqi <= 150) return { label: 'সংবেদনশীল', color: '#ea580c', icon: '🟠' };
    if (aqi <= 200) return { label: 'অস্বাস্থ্যকর', color: '#dc2626', icon: '🔴' };
    if (aqi <= 300) return { label: 'খুব খারাপ', color: '#991b1b', icon: '🟣' };
    return { label: 'বিপজ্জনক', color: '#7f1d1d', icon: '☠️' };
}

function withTimeout(p, ms) {
    return Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);
}

async function safeGetAQI(lat, lng) {
    if (!window.OpenMeteo || typeof OpenMeteo.getAQI !== 'function') return null;
    try {
        const aqi = await withTimeout(OpenMeteo.getAQI(lat, lng), 8000);
        return aqi && Number.isFinite(aqi.usAqi) ? aqi.usAqi : null;
    } catch (_) { return null; }
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
   CLEAR
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
   BUBBLE STYLES (self-contained)
   ============================================================ */
function injectBubbleStyles() {
    if (document.getElementById('airb-styles')) return;
    const s = document.createElement('style');
    s.id = 'airb-styles';
    s.textContent =
        '.airb-marker{background:transparent!important;border:none!important;}' +
        '.airb-bubble{display:flex;align-items:center;justify-content:center;box-sizing:border-box;' +
            'border:2.5px solid #fff;border-radius:50%;color:#fff;font-weight:800;line-height:1;' +
            'text-shadow:0 1px 2px rgba(0,0,0,.45);box-shadow:0 2px 8px rgba(0,0,0,.35);' +
            'cursor:pointer;transition:transform .15s ease,box-shadow .15s ease;}' +
        '.airb-marker:hover .airb-bubble{transform:scale(1.2);box-shadow:0 4px 14px rgba(0,0,0,.45);}' +
        '.airb-bubble.airb-loading{opacity:.6;animation:airbPulse 1.2s infinite ease-in-out;}' +
        '@keyframes airbPulse{50%{opacity:.3;}}' +
        /* Result panel */
        '.air-result-panel{display:none;}' +
        '.air-result-card{background:#fff;border:1.5px solid #67e8f9;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;animation:airFade .3s ease;}' +
        '@keyframes airFade{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}' +
        '.air-result-header{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1.5px solid #f1f5f9;}' +
        '.air-result-icon{width:42px;height:42px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}' +
        '.air-result-title{flex:1;min-width:0;}' +
        '.air-result-title h3{font-size:15px;font-weight:800;color:#035D69;margin:0 0 2px;line-height:1.2;}' +
        '.air-result-title p{font-size:11px;color:#94a3b8;margin:0;font-weight:600;}' +
        '.air-result-close{width:30px;height:30px;border-radius:50%;background:#f8fcfd;border:none;color:#64748b;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0;}' +
        '.air-result-close:hover{background:#fee;color:#dc2626;}' +
        '.air-result-aqi{padding:16px;border:2px solid;border-radius:14px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;}' +
        '.air-result-aqi-value{font-size:42px;font-weight:900;line-height:1;letter-spacing:-1px;}' +
        '.air-result-aqi-label{font-size:13px;font-weight:800;letter-spacing:.3px;}' +
        '.air-result-aqi-advice{font-size:12px;font-weight:600;line-height:1.5;padding:0 4px;}' +
        /* Pollutant grid */
        '.air-result-pollutants{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
        '.air-result-pollutant{background:#f8fcfd;border:1.5px solid #e0f0f2;border-radius:10px;padding:10px 8px;text-align:center;display:flex;flex-direction:column;gap:3px;}' +
        '.air-result-pollutant .label{font-size:9.5px;font-weight:700;color:#8ab8be;text-transform:uppercase;letter-spacing:.3px;}' +
        '.air-result-pollutant .value{font-size:14px;font-weight:900;color:#035D69;line-height:1;}' +
        '.air-result-pollutant .unit{font-size:9px;color:#94a3b8;font-weight:600;}' +
        /* Stats */
        '.air-result-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}' +
        '.air-result-stat{background:#f8fcfd;border:1.5px solid #e0f0f2;border-radius:10px;padding:10px 6px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:3px;}' +
        '.air-result-stat-icon{font-size:16px;}' +
        '.air-result-stat-value{font-size:16px;font-weight:900;color:#035D69;line-height:1;}' +
        '.air-result-stat-label{font-size:9.5px;font-weight:700;color:#8ab8be;text-transform:uppercase;}' +
        /* Section */
        '.air-result-section-title{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800;color:#035D69;padding-bottom:8px;border-bottom:1px solid #e0f0f2;}' +
        '.air-result-section-title i{color:#0891b2;}' +
        /* UV advice */
        '.air-result-advice{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:12px;border-left:4px solid;font-size:12.5px;line-height:1.5;}';
    document.head.appendChild(s);
}

function bubbleSize(value, maxValue) {
    if (!value || !maxValue) return BUBBLE_BASE;
    const ratio = Math.sqrt(value / Math.max(1, maxValue));
    return Math.round(BUBBLE_BASE + (BUBBLE_MAX - BUBBLE_BASE) * ratio);
}

function bubbleState(row) {
    const aqi = Number.isFinite(row.aqi) ? row.aqi : null;
    const info = aqi != null
        ? levelOfAqi(aqi)
        : { label: row.loading ? 'লোড হচ্ছে' : 'ডেটা নেই', color: '#94a3b8', icon: '⚪' };
    return { aqi, info };
}

function makeBubbleIcon(row, ctx) {
    const { aqi, info } = bubbleState(row);
    const size = bubbleSize(aqi || 0, ctx.maxAqi) + ctx.boost;
    const score = aqi != null ? Math.round(aqi) : (row.loading ? '…' : '—');
    const fontSize = Math.max(9, Math.min(14, size / 3));
    const html =
        '<div class="airb-bubble' + (row.loading ? ' airb-loading' : '') + '" style="' +
            'width:' + size + 'px;height:' + size + 'px;' +
            'background:' + info.color + ';font-size:' + fontSize + 'px;">' +
            '<span>' + esc(score) + '</span>' +
        '</div>';
    return L.divIcon({
        html,
        className: 'airb-marker',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
    });
}

function popupHTML(row) {
    const { aqi, info } = bubbleState(row);
    return '<div style="min-width:150px;font-family:inherit;line-height:1.5;">' +
        '<div style="font-weight:700;font-size:14px;margin-bottom:2px;">' + esc(row.emoji || '📍') + ' ' + esc(row.nameBn) + '</div>' +
        '<div style="font-weight:800;font-size:15px;color:' + info.color + ';">AQI ' +
            (aqi != null ? Math.round(aqi) : '—') + ' · ' + esc(info.label) + '</div>' +
        (row.level !== 'upazila' && row.feature
            ? '<button onclick="window.__airDrill(' + row.idx + ')" style="margin-top:6px;width:100%;border:0;border-radius:8px;padding:6px 10px;background:#0891b2;color:#fff;font-weight:600;cursor:pointer;">আরও দেখুন →</button>'
            : '') +
    '</div>';
}

function getCtx(rows, boost) {
    return {
        boost: boost || 0,
        maxAqi: Math.max(1, ...rows.map(r => (Number.isFinite(r.aqi) ? r.aqi : 0)))
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
    m = L.marker(row.centroid, { icon, title: row.nameBn, riseOnHover: true, zIndexOffset: 1000 });
    m.bindPopup(popupHTML(row), { autoPan: true });
    m.on('click', () => showAirResult(
        row.nameBn + (row.level === 'division' ? ' বিভাগ' : ''),
        row.centroid[0], row.centroid[1]
    ));
    m.addTo(map);
    markers.set(row.key, m);
    return m;
}

async function loadAqi(rows, token, boost) {
    let next = 0;
    let anyOk = false;
    const worker = async () => {
        while (next < rows.length) {
            const row = rows[next++];
            if (token !== runToken) return;
            const pt = row.aqiPoint || row.centroid;
            row.aqi = await safeGetAQI(pt[0], pt[1]);
            row.loading = false;
            if (row.aqi != null) anyOk = true;
            if (token !== runToken) return;
            const ctx = getCtx(rows, boost);
            rows.forEach(r => { if (markers.has(r.key)) upsertBubble(r, ctx); });
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (token === runToken && !anyOk) {
        console.warn('[AirMap] No AQI data came back');
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

function drawLevel(rows, cfg) {
    const token = runToken;
    rowsCache = rows;
    rows.forEach((row, i) => {
        row.idx = i;
        row.loading = true;
        row.aqi = null;
        if (row.feature) addPolygon(row.key, row.feature, cfg.style, () => cfg.onPolygonClick(row));
        addLabelMarker(row.key + '_label', row.centroid[0] - cfg.labelOffset, row.centroid[1], row.nameBn, cfg.labelClass);
    });
    const ctx = getCtx(rows, cfg.boost);
    rows.forEach(r => upsertBubble(r, ctx));
    loadAqi(rows, token, cfg.boost);
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
        console.warn('[AirMap] BD_DIVISIONS missing — using built-in points');
        rows = Object.keys(DIVISIONS).map(key => {
            const d = DIVISIONS[key];
            return {
                key, level: 'division',
                nameEn: d.name, nameBn: d.nameBn, emoji: d.emoji,
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
            key, level: 'division',
            nameEn,
            nameBn: getProp(props, 'ADM1_BN', 'nameBn') || div.nameBn || nameEn,
            emoji: div.emoji || '📍',
            aqiPoint: div.lat != null ? [div.lat, div.lng] : centroid,
            centroid,
            feature
        };
    }).filter(r => r.centroid);

    drawLevel(rows, {
        style: { color: '#0891b2', weight: 1.2, opacity: 0.55, fillColor: '#22d3ee', fillOpacity: 0.08, dashArray: '3,3' },
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
        showAirResult(divisionRow.nameBn + ' বিভাগ', divisionRow.centroid[0], divisionRow.centroid[1]);
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
        showAirResult(districtRow.nameBn, districtRow.centroid[0], districtRow.centroid[1]);
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
        style: { color: '#0e7490', weight: 1, opacity: 0.65, fillColor: '#67e8f9', fillOpacity: 0.08 },
        labelClass: 'dv-upazila-label',
        labelOffset: 0.05,
        boost: 0,
        onPolygonClick: row => showAirResult(row.nameBn, row.centroid[0], row.centroid[1])
    });

    fitToPolygons();
}

window.__airDrill = function (idx) {
    const row = rowsCache[idx];
    if (!row || !map) return;
    map.closePopup();
    if (currentLevel === 'division') drillToDistricts(row);
    else if (currentLevel === 'district') drillToUpazilas(row);
};

/* ============================================================
   RESULT PANEL — Air Quality SPECIFIC
   Shows: AQI + PM2.5 + PM10 + O3 + NO2 + UV + Wind + Solar
   ============================================================ */
async function showAirResult(placeName, lat, lng) {
    const result = _el('airResult');
    if (!result) return;

    result.style.display = 'block';
    result.innerHTML =
        '<div class="map-result-loading">' +
            '<i class="fas fa-spinner fa-spin"></i>' +
            '<span>' + esc(placeName) + ' এর বাতাসের অবস্থা লোড হচ্ছে...</span>' +
        '</div>';

    try {
        const [aqi, weather] = await Promise.all([
            OpenMeteo.getAQI(lat, lng),
            OpenMeteo.getWeek(lat, lng)
        ]);

        const aqiInfo = levelOfAqi(aqi ? aqi.usAqi : null);
        const today = weather && weather[0] ? weather[0] : null;
        const uv = today ? today.uvIndexMax : null;
        const uvInfo = (window.OpenMeteo && OpenMeteo.classifyUV)
            ? OpenMeteo.classifyUV(uv)
            : { color: '#94a3b8', label: '—', icon: '⚪' };
        const wind = today ? today.windMax : null;
        const solar = today ? today.solarRadiation : null;

        const aqiValue = aqi ? Math.round(aqi.usAqi) : '—';
        const pm25 = aqi && Number.isFinite(aqi.pm25) ? aqi.pm25.toFixed(1) : '—';
        const pm10 = aqi && Number.isFinite(aqi.pm10) ? aqi.pm10.toFixed(1) : '—';
        const o3   = aqi && Number.isFinite(aqi.o3)   ? aqi.o3.toFixed(1)   : '—';
        const no2  = aqi && Number.isFinite(aqi.no2)  ? aqi.no2.toFixed(1)  : '—';
        const so2  = aqi && Number.isFinite(aqi.so2)  ? aqi.so2.toFixed(1)  : '—';
        const co   = aqi && Number.isFinite(aqi.co)   ? aqi.co.toFixed(1)   : '—';

        result.innerHTML =
            '<div class="air-result-card">' +
                '<div class="air-result-header">' +
                    '<div class="air-result-icon" style="background:' + aqiInfo.color + ';">' +
                        (aqiInfo.icon || '🟠') +
                    '</div>' +
                    '<div class="air-result-title">' +
                        '<h3>' + esc(placeName) + '</h3>' +
                        '<p>বাতাসের অবস্থা · বাস্তব সময়</p>' +
                    '</div>' +
                    '<button class="air-result-close" onclick="window.__closeAirResult()">' +
                        '<i class="fas fa-times"></i>' +
                    '</button>' +
                '</div>' +

                /* AQI MAIN */
                '<div class="air-result-aqi" style="border-color:' + aqiInfo.color + ';background:' + aqiInfo.color + '15;">' +
                    '<div class="air-result-aqi-value" style="color:' + aqiInfo.color + ';">' + aqiValue + '</div>' +
                    '<div class="air-result-aqi-label" style="color:' + aqiInfo.color + ';">US AQI · ' + esc(aqiInfo.label || '') + '</div>' +
                    (aqiInfo.advice ? '<div class="air-result-aqi-advice" style="color:' + aqiInfo.color + ';">' + esc(aqiInfo.advice) + '</div>' : '') +
                '</div>' +

                /* POLLUTANTS */
                '<div class="air-result-section-title">' +
                    '<i class="fas fa-flask"></i>' +
                    '<span>বাতাসের উপাদান</span>' +
                '</div>' +
                '<div class="air-result-pollutants">' +
                    '<div class="air-result-pollutant"><div class="label">PM2.5</div><div class="value">' + pm25 + '</div><div class="unit">μg/m³</div></div>' +
                    '<div class="air-result-pollutant"><div class="label">PM10</div><div class="value">' + pm10 + '</div><div class="unit">μg/m³</div></div>' +
                    '<div class="air-result-pollutant"><div class="label">O₃</div><div class="value">' + o3 + '</div><div class="unit">μg/m³</div></div>' +
                    '<div class="air-result-pollutant"><div class="label">NO₂</div><div class="value">' + no2 + '</div><div class="unit">μg/m³</div></div>' +
                    '<div class="air-result-pollutant"><div class="label">SO₂</div><div class="value">' + so2 + '</div><div class="unit">μg/m³</div></div>' +
                    '<div class="air-result-pollutant"><div class="label">CO</div><div class="value">' + co + '</div><div class="unit">μg/m³</div></div>' +
                '</div>' +

                /* UV + WIND + SOLAR */
                '<div class="air-result-section-title">' +
                    '<i class="fas fa-sun"></i>' +
                    '<span>UV, বাতাস ও সৌর</span>' +
                '</div>' +
                '<div class="air-result-stats">' +
                    '<div class="air-result-stat">' +
                        '<div class="air-result-stat-icon">' + (uvInfo.icon || '☀️') + '</div>' +
                        '<div class="air-result-stat-value" style="color:' + uvInfo.color + ';">' + (uv != null ? uv.toFixed(1) : '—') + '</div>' +
                        '<div class="air-result-stat-label">UV · ' + esc(uvInfo.label || '') + '</div>' +
                    '</div>' +
                    '<div class="air-result-stat">' +
                        '<div class="air-result-stat-icon">💨</div>' +
                        '<div class="air-result-stat-value">' + (wind != null ? wind.toFixed(1) : '—') + '</div>' +
                        '<div class="air-result-stat-label">km/h</div>' +
                    '</div>' +
                    '<div class="air-result-stat">' +
                        '<div class="air-result-stat-icon">🔆</div>' +
                        '<div class="air-result-stat-value">' + (solar != null ? solar.toFixed(1) : '—') + '</div>' +
                        '<div class="air-result-stat-label">MJ/m²</div>' +
                    '</div>' +
                '</div>' +

                /* UV ADVICE */
                (uv != null ? '<div class="air-result-advice" style="background:' + uvInfo.color + '15;border-left-color:' + uvInfo.color + ';">' +
                    '<i class="fas fa-sun" style="color:' + uvInfo.color + ';"></i>' +
                    '<div><strong style="color:' + uvInfo.color + ';">UV পরামর্শ:</strong> ' + esc(uvInfo.advice || '') + '</div>' +
                '</div>' : '') +

                /* ANIMAL ADVICE */
                '<div class="air-result-advice" style="background:#f0fdf4;border-left-color:#10b981;">' +
                    '<i class="fas fa-paw" style="color:#10b981;"></i>' +
                    '<div><strong style="color:#047857;">🐾 পশুর জন্য পরামর্শ:</strong> ' + getAnimalAdvice(aqi ? aqi.usAqi : null) + '</div>' +
                '</div>' +
            '</div>';
    } catch (err) {
        console.error('[AirMap] Result load failed:', err);
    }
}

function getAnimalAdvice(aqi) {
    if (!Number.isFinite(aqi)) return 'ডেটা পাওয়া যায়নি।';
    if (aqi <= 50)  return 'বাতাস নিরাপদ। পশুদের স্বাভাবিক রাখুন।';
    if (aqi <= 100) return 'সংবেদনশীল পশুদের (বাচ্চা, অসুস্থ) ঘরে রাখুন।';
    if (aqi <= 150) return 'পশুদের দীর্ঘ সময় বাইরে রাখবেন না। পানি বেশি দিন।';
    if (aqi <= 200) return 'পশুদের ঘরে রাখুন, জানালা বন্ধ রাখুন।';
    return '🚨 জরুরি — পশুদের ঘরে রাখুন, ভেটের সাথে যোগাযোগ করুন।';
}

window.__closeAirResult = function () {
    const r = _el('airResult');
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
            '<div class="map-ref-title">' +
                '<i class="fas fa-clipboard-list"></i>' +
                '<span>স্কোর রেঞ্জ (কোন score স্বাস্থ্যকর)</span>' +
            '</div>' +
            '<div class="map-ref-group">' +
                '<div class="map-ref-label">🌬️ AQI (US EPA)</div>' +
                '<div class="map-ref-grid">' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#059669;"></span><span class="map-ref-range">0–50</span><span class="map-ref-text" style="color:#059669;">ভালো</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#d97706;"></span><span class="map-ref-range">51–100</span><span class="map-ref-text" style="color:#d97706;">মধ্যম</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#ea580c;"></span><span class="map-ref-range">101–150</span><span class="map-ref-text" style="color:#ea580c;">সংবেদনশীল</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#dc2626;"></span><span class="map-ref-range">151–200</span><span class="map-ref-text" style="color:#dc2626;">অস্বাস্থ্যকর</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#991b1b;"></span><span class="map-ref-range">201–300</span><span class="map-ref-text" style="color:#991b1b;">খুব খারাপ</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#7f1d1d;"></span><span class="map-ref-range">301+</span><span class="map-ref-text" style="color:#7f1d1d;">বিপজ্জনক</span></div>' +
                '</div>' +
            '</div>' +
            '<div class="map-ref-group">' +
                '<div class="map-ref-label">☀️ UV Index (WHO)</div>' +
                '<div class="map-ref-grid">' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#059669;"></span><span class="map-ref-range">0–2</span><span class="map-ref-text" style="color:#059669;">কম</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#d97706;"></span><span class="map-ref-range">3–5</span><span class="map-ref-text" style="color:#d97706;">মধ্যম</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#ea580c;"></span><span class="map-ref-range">6–7</span><span class="map-ref-text" style="color:#ea580c;">উচ্চ</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#dc2626;"></span><span class="map-ref-range">8–10</span><span class="map-ref-text" style="color:#dc2626;">খুব উচ্চ</span></div>' +
                    '<div class="map-ref-item"><span class="map-ref-dot" style="background:#7f1d1d;"></span><span class="map-ref-range">11+</span><span class="map-ref-text" style="color:#7f1d1d;">চরম</span></div>' +
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
        bc.innerHTML = '<span class="map-bc-active">বাংলাদেশ · বাতাসের মানচিত্র</span>';
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
    const r = _el('airResult');
    if (r) r.style.display = 'none';
};

/* ============================================================
   SEARCH (LocationIQ + Open-Meteo fallback)
   ============================================================ */
const LOCATIONIQ_KEY = 'pk.6233e1f050e2472d37bc17cb18a3b519';
let searchAbort = null;
let searchPin = null;

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
        console.warn('[AirMap] Fallback search failed:', err.message);
        return [];
    }
}

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
        if (res.status === 404) return [];
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
        console.warn('[AirMap] LocationIQ failed, using fallback:', err.message);
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
            '<div class="map-search-icon" style="background:linear-gradient(135deg,#0891b2,#0e7490);"><i class="fas fa-wind"></i></div>' +
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
                    radius: 9, color: '#fff', weight: 3, fillColor: '#0891b2', fillOpacity: 1
                }).addTo(map);
            }
            showAirResult(name, lat, lng);
            dd.style.display = 'none';
        });
    });
}

function initSearch() {
    const input = _el('mapSearchInput');
    if (!input) return;

    input.addEventListener('input', e => {
        const q = e.target.value.trim();
        clearTimeout(window.__airSearchTimeout);
        if (q.length < 2) {
            const dd = _el('mapSearchResults');
            if (dd) dd.style.display = 'none';
            return;
        }
        window.__airSearchTimeout = setTimeout(async () => {
            const results = await searchPlaces(q);
            if (results === null) return;
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

    injectBubbleStyles();
    initMap();
    initSearch();

    if (window.BD_DIVISIONS) {
        const loading = _el('mapLoading');
        if (loading) loading.style.display = 'none';
        renderDivisions();
    }
}

window.__mapOnDataReady = function () {
    console.log('[AirMap] GeoJSON ready — rendering divisions');
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