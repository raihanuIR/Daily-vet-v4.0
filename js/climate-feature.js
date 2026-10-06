/* DailyVet — Climate Feature Page Controller v3.0 (Production)
   Detects which feature this page is for (data-feature attr on container)
   and renders ONLY that feature.

   Features: thi | forage | outbreak | impact

   v3.0 additions:
   • Real 7-day forecast from Open-Meteo (real tomorrow, not trend estimate)
   • Fallback to NASA 3-day trend if forecast API fails
   • Air Quality (AQI) + UV + Wind bonus row in THI page
   • Tomorrow forecast card in Outbreak page
   • Source labels on every value (NASA POWER / Open-Meteo)
*/
(function () {
'use strict';

/* Safety: if the script tag is accidentally included twice, run only once */
if (window.__dvClimateFeatureLoaded) return;
window.__dvClimateFeatureLoaded = true;

/* ============================================================
   DISTRICT COORDINATES
   ============================================================ */
const DISTRICT_COORDS = {
    dhaka:      { lat: 23.8103, lng: 90.4125, name: 'Dhaka', nameBn: 'ঢাকা' },
    chittagong: { lat: 22.3569, lng: 91.7832, name: 'Chittagong', nameBn: 'চট্টগ্রাম' },
    rajshahi:   { lat: 24.3745, lng: 88.6042, name: 'Rajshahi', nameBn: 'রাজশাহী' },
    khulna:     { lat: 22.8456, lng: 89.5403, name: 'Khulna', nameBn: 'খুলনা' },
    barisal:    { lat: 22.7010, lng: 90.3535, name: 'Barisal', nameBn: 'বরিশাল' },
    sylhet:     { lat: 24.8949, lng: 91.8687, name: 'Sylhet', nameBn: 'সিলেট' },
    rangpur:    { lat: 25.7439, lng: 89.2752, name: 'Rangpur', nameBn: 'রংপুর' },
    mymensingh: { lat: 24.7471, lng: 90.4203, name: 'Mymensingh', nameBn: 'ময়মনসিংহ' }
};

const RISK_STYLE = {
    critical: { color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
    alert:    { color: '#c2410c', bg: '#fff7ed', icon: '⚠️' },
    watch:    { color: '#92400e', bg: '#fef9e7', icon: '👀' },
    safe:     { color: '#047857', bg: '#ecfdf5', icon: '✅' }
};

const VECTOR_ICON = { mosquito: '🦟', fly: '🪰', water: '💧', air: '💨', contact: '🤝', environment: '🌍' };

const SPECIES_IDS = ['cow', 'buffalo', 'goat', 'sheep', 'chicken', 'duck', 'dog', 'cat'];
const SPECIES_KEY = 'dvClimateSpecies';

let currentDistrict = 'dhaka';
let currentSpecies = (() => {
    try {
        const v = localStorage.getItem(SPECIES_KEY);
        return SPECIES_IDS.includes(v) ? v : 'cow';
    } catch (_) { return 'cow'; }
})();
let lastParameter = null;
let lastSedac = null;
let loadToken = 0;
let FEATURE = 'thi'; // set in init

/* ============================================================
   HELPERS
   ============================================================ */
const _el = id => document.getElementById(id);
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, c => _ESC[c]);

function formatDate(yyyymmdd) {
    if (!yyyymmdd) return '';
    const s = String(yyyymmdd);
    let d;
    if (s.length === 8) {
        d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    } else {
        d = new Date(yyyymmdd);
    }
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function fmtFull(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString('en-IN');
    return v == null ? '—' : String(v);
}

function showLoading(elementId) {
    const el = _el(elementId);
    if (!el) return;
    el.innerHTML = `
        <div class="climate-empty">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading...</span>
        </div>`;
}

function showError(elementId, message) {
    const el = _el(elementId);
    if (!el) return;
    el.innerHTML = `
        <div class="climate-empty">
            <i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i>
            <span>${escapeHtml(message)}</span>
        </div>`;
}

function safeRender(elementId, fn) {
    try { fn(); }
    catch (err) {
        console.error(`[Climate] ${elementId} render failed:`, err);
        showError(elementId, 'Failed to load NASA data');
    }
}

/* ============================================================
   THI RENDERER (v3.0 — real forecast + AQI/UV/Wind bonus)
   ============================================================ */
function renderThiCardHtml({
    placeName,
    isDivision,
    thiVal,
    yesterdayVal,
    tomorrowVal,
    tomorrowSource,
    tempVal,
    rhVal,
    rainVal,
    dataDate,
    ageDays,
    spId,
    airInfo,
    last7,
    economicHtml
}) {
    const spKey = spId || currentSpecies;
    const spNames = { cow: 'গরু', buffalo: 'মহিষ', goat: 'ছাগল', sheep: 'ভেড়া', chicken: 'মুরগি', duck: 'হাঁস', dog: 'কুকুর', cat: 'বিড়াল' };
    const spNameBn = spNames[spKey] || 'গরু';
    const cls = NasaClimate.classifyTHI(thiVal, spKey);
    const yesterdayCls = yesterdayVal != null ? NasaClimate.classifyTHI(yesterdayVal, spKey) : { color: '#94a3b8', labelBn: 'ডেটা নেই' };
    const tomorrowCls = tomorrowVal != null ? NasaClimate.classifyTHI(tomorrowVal, spKey) : { color: '#94a3b8', labelBn: 'পূর্বাভাস নেই' };

    const thiPct = Math.min(100, Math.max(10, (thiVal - 50) * 2));
    const yesterdayPct = yesterdayVal != null ? Math.min(100, Math.max(10, (yesterdayVal - 50) * 2)) : 0;
    const tomorrowPct = tomorrowVal != null ? Math.min(100, Math.max(10, (tomorrowVal - 50) * 2)) : 0;

    const delta = yesterdayVal != null ? thiVal - yesterdayVal : null;
    const trendText = delta == null ? '' : (Math.abs(delta) < 0.5 ? '➡️ গতকালের মতোই' : (delta > 0 ? `📈 গতকালের চেয়ে ${delta.toFixed(1)} বেশি` : `📉 গতকালের চেয়ে ${Math.abs(delta).toFixed(1)} কম`));

    /* Multi-species strip */
    const speciesPills = SPECIES_IDS.map(sp => {
        const c = NasaClimate.classifyTHI(thiVal, sp);
        const name = spNames[sp] || sp;
        const isCurrent = sp === spKey;
        const icon = sp === 'cow' ? '🐄' : sp === 'buffalo' ? '🐃' : sp === 'goat' ? '🐐' : sp === 'sheep' ? '🐑' : sp === 'chicken' ? '🐔' : sp === 'duck' ? '🦆' : sp === 'dog' ? '🐕' : '🐈';
        return `
            <div class="dvm-sp-pill" style="border-color:${c.color};background:${c.color}10;${isCurrent ? 'box-shadow:0 0 0 2px ' + c.color + ';' : ''}">
                <div class="dvm-sp-pill-name">
                    <span>${icon}</span>
                    <span style="color:#0f172a;">${name}</span>
                </div>
                <div class="dvm-sp-pill-val" style="color:${c.color};">${escapeHtml(c.labelBn)}</div>
            </div>`;
    }).join('');

    /* 7-day chart */
    const barsHtml = (last7 && last7.length > 1) ? last7.map(d => {
        const val = d.thi != null ? d.thi : (d.value != null ? d.value : null);
        if (val == null) return '';
        const c = NasaClimate.classifyTHI(val, spKey);
        const pct = Math.min(100, Math.max(10, (val - 50) * 2));
        const lb = formatDate(d.date);
        return `
            <div class="thi-bar-wrap" title="${escapeHtml(lb)}: THI ${val.toFixed(1)}">
                <div class="thi-bar" style="height:${pct}%;background:${c.color};"></div>
                <div class="thi-bar-label">${escapeHtml(lb.split(' ')[0])}</div>
            </div>`;
    }).join('') : '';

    return `
        <div class="dvf-result-card dvm-thi-card ${isDivision ? 'dvf-top-division-card' : ''}">
            <!-- Header -->
            <div class="dvf-result-header">
                <div class="dvf-result-title-group">
                    <span class="dvf-loc-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706);"><i class="fas fa-temperature-high"></i></span>
                    <div>
                        <h3 class="dvf-loc-name">${escapeHtml(placeName)}</h3>
                        <span class="dvf-loc-badge" style="color:#b45309;background:#fef3c7;">NASA POWER &bull; ${isDivision ? 'নির্বাচিত বিভাগীয় হিটস্ট্রেস বিশ্লেষণ' : 'লাইভ হিটস্ট্রেস টেলিমেট্রি'}</span>
                    </div>
                </div>
                ${!isDivision ? `
                    <button class="dvf-close-btn" onclick="window.__dvmCloseResult()" aria-label="বন্ধ">
                        <i class="fas fa-times"></i>
                    </button>
                ` : `
                    <div class="dvf-top-div-tag" style="color:#b45309;background:#fffbeb;border-color:#fde68a;">
                        <i class="fas fa-satellite text-amber-600"></i>
                        <span>${spNameBn}-এর হিটস্ট্রেস অবস্থা</span>
                    </div>
                `}
            </div>

            <!-- 3 Main KPI Cards -->
            <div class="dvf-kpi-grid">
                <!-- Yesterday -->
                <div class="dvf-kpi-card">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">⏳</span>
                        <span class="dvf-kpi-badge" style="background:${yesterdayCls.color}15;color:${yesterdayCls.color};border:1px solid ${yesterdayCls.color}30;">
                            ${escapeHtml(yesterdayCls.labelBn)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">গতকাল (NASA)</div>
                    <div class="dvf-kpi-score" style="color:${yesterdayCls.color};">${yesterdayVal != null ? yesterdayVal.toFixed(1) : '—'}</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${yesterdayPct}%;background:${yesterdayCls.color};"></div>
                    </div>
                    <div class="dvf-kpi-sub">${trendText || 'পূর্ববর্তী দিনের রেফারেন্স'}</div>
                </div>

                <!-- Today / Now (Highlighted) -->
                <div class="dvf-kpi-card active-layer" style="border-color:${cls.color};box-shadow:0 0 0 3px ${cls.color}25,0 8px 24px rgba(217,119,6,0.08);">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🌡️</span>
                        <span class="dvf-kpi-badge" style="background:${cls.color}18;color:${cls.color};border:1px solid ${cls.color}40;">
                            ${escapeHtml(cls.labelBn)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">বর্তমান THI (${spNameBn})</div>
                    <div class="dvf-kpi-score" style="color:${cls.color};">${thiVal.toFixed(1)}</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${thiPct}%;background:${cls.color};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        মাত্রা: <strong style="color:${cls.color};">${escapeHtml(cls.labelBn)}</strong> &bull; NASA POWER
                    </div>
                </div>

                <!-- Tomorrow Forecast -->
                <div class="dvf-kpi-card">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🔮</span>
                        <span class="dvf-kpi-badge" style="background:${tomorrowCls.color}15;color:${tomorrowCls.color};border:1px solid ${tomorrowCls.color}30;">
                            ${escapeHtml(tomorrowCls.labelBn)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">আগামীকাল (পূর্বাভাস)</div>
                    <div class="dvf-kpi-score" style="color:${tomorrowCls.color};">${tomorrowVal != null ? tomorrowVal.toFixed(1) : '—'}</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${tomorrowPct}%;background:${tomorrowCls.color};"></div>
                    </div>
                    <div class="dvf-kpi-sub">${tomorrowSource || 'Open-Meteo পূর্বাভাস'}</div>
                </div>
            </div>

            <!-- Advisory Callout -->
            <div class="dvf-advisory-box" style="background:${cls.bg || cls.color + '12'};border-left:4px solid ${cls.color};border-color:${cls.color}35;">
                <div class="dvf-advisory-icon" style="color:${cls.color};">
                    <i class="fas fa-shield-cat"></i>
                </div>
                <div class="dvf-advisory-content">
                    <div class="dvf-advisory-heading" style="color:${cls.color};">তাপ-স্ট্রেস ক্লিনিক্যাল ও খামার ব্যবস্থাপনা পরামর্শ (${escapeHtml(cls.labelBn)})</div>
                    <div class="dvf-advisory-text">${escapeHtml(cls.adviceBn)}</div>
                </div>
            </div>

            <!-- Weather & Atmosphere Telemetry Grid -->
            <div class="dvf-telemetry-grid">
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌡️</span>
                    <span class="dvf-telemetry-label">তাপমাত্রা</span>
                    <span class="dvf-telemetry-val">${tempVal.toFixed(1)}°C</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">💧</span>
                    <span class="dvf-telemetry-label">আর্দ্রতা</span>
                    <span class="dvf-telemetry-val">${Math.round(rhVal)}% RH</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌧️</span>
                    <span class="dvf-telemetry-label">বৃষ্টিপাত</span>
                    <span class="dvf-telemetry-val">${rainVal != null ? rainVal.toFixed(1) + ' mm' : '০.০ mm'}</span>
                </div>
                ${airInfo && airInfo.aqi != null ? `
                    <div class="dvf-telemetry-item">
                        <span class="dvf-telemetry-icon">🌬️</span>
                        <span class="dvf-telemetry-label">AQI বায়ুমান</span>
                        <span class="dvf-telemetry-val" style="color:${airInfo.aqiColor || '#059669'};">${Math.round(airInfo.aqi)}</span>
                    </div>
                ` : ''}
                ${airInfo && airInfo.uv != null ? `
                    <div class="dvf-telemetry-item">
                        <span class="dvf-telemetry-icon">☀️</span>
                        <span class="dvf-telemetry-label">UV সূচক</span>
                        <span class="dvf-telemetry-val" style="color:${airInfo.uvColor || '#d97706'};">${airInfo.uv.toFixed(1)}</span>
                    </div>
                ` : ''}
                ${airInfo && airInfo.wind != null ? `
                    <div class="dvf-telemetry-item">
                        <span class="dvf-telemetry-icon">💨</span>
                        <span class="dvf-telemetry-label">বাতাস</span>
                        <span class="dvf-telemetry-val">${airInfo.wind.toFixed(1)} km/h</span>
                    </div>
                ` : ''}
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🛰️</span>
                    <span class="dvf-telemetry-label">স্যাটেলাইট ফিড</span>
                    <span class="dvf-telemetry-val">${escapeHtml(formatDate(dataDate))}${ageDays != null ? ` (${ageDays} দিন)` : ''}</span>
                </div>
            </div>

            <!-- Multi-Species Status Strip -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-paw text-amber-600"></i>
                    <span>সকল প্রজাতির পশুর বর্তমান হিটস্ট্রেস অবস্থা (THI ${thiVal.toFixed(1)})</span>
                </div>
                <div class="dvm-sp-grid">
                    ${speciesPills}
                </div>
            </div>

            <!-- 7-Day Chart -->
            ${barsHtml ? `
                <div class="dvf-block">
                    <div class="dvf-block-title">
                        <i class="fas fa-chart-column text-teal"></i>
                        <span>গত ৭ দিনের THI ওঠানামা (${spNameBn})</span>
                    </div>
                    <div class="thi-mini-chart-card">
                        <div class="thi-mini-chart">${barsHtml}</div>
                    </div>
                </div>
            ` : ''}

            <!-- Economic Loss (if division) -->
            ${economicHtml || ''}

            <!-- Footer Disclaimer -->
            <div class="dvf-card-footer">
                <i class="fas fa-info-circle text-slate-400"></i>
                <span>THI হিসাব NASA POWER (T2M, RH2M) এর সমন্বিত বায়ুমণ্ডলীয় টেলিমেট্রি থেকে প্রাপ্ত (গ্রিড প্রায় ৫০ কিমি)। তীব্র গরম ও হিট-স্ট্রোকের ক্ষেত্রে দ্রুত লাইসেন্সপ্রাপ্ত রেজিস্ট্রার্ড ভেটেরিনারি চিকিৎসকের পরামর্শ নিন।</span>
            </div>
        </div>`;
}

async function renderTHI(parameter) {
    const body = _el('dvmResult') || _el('thiBody');
    if (!body) return;

    const tempLatest = NasaPower.getLatest(parameter, 'T2M');
    const rhLatest = NasaPower.getLatest(parameter, 'RH2M');

    if (!tempLatest || !rhLatest) {
        showError(body.id, 'THI data not available');
        return;
    }

    const thi = NasaClimate.calculateTHI(tempLatest.value, rhLatest.value);
    if (thi === null) {
        showError(body.id, 'THI data not available');
        return;
    }

    /* ===== Yesterday (NASA) ===== */
    const tempSeries = NasaPower.getSeries(parameter, 'T2M');
    const rhSeries = NasaPower.getSeries(parameter, 'RH2M');
    const rhMap = {};
    rhSeries.forEach(r => { rhMap[r.date] = r.value; });

    let yesterday = null;
    if (tempSeries.length >= 2) {
        const prev = tempSeries[tempSeries.length - 2];
        const prevRh = rhMap[prev.date] !== undefined ? rhMap[prev.date] : rhLatest.value;
        yesterday = NasaClimate.calculateTHI(prev.value, prevRh);
    }

    /* ===== Tomorrow (REAL forecast from Open-Meteo, fallback to NASA trend) ===== */
    const coords = DISTRICT_COORDS[currentDistrict];
    let tomorrow = null;
    let tomorrowSource = 'NASA trend';

    if (window.OpenMeteo && typeof OpenMeteo.getTomorrow === 'function') {
        try {
            const fc = await OpenMeteo.getTomorrow(coords.lat, coords.lng);
            if (fc && Number.isFinite(fc.tempMean) && Number.isFinite(fc.humidity)) {
                tomorrow = NasaClimate.calculateTHI(fc.tempMean, fc.humidity);
                tomorrowSource = 'Open-Meteo লাইভ পূর্বাভাস';
            }
        } catch (err) {
            console.warn('[THI] Forecast fetch failed:', err.message);
        }
    }

    if (tomorrow === null && tempSeries.length >= 3) {
        const recent = tempSeries.slice(-3);
        const avgTemp = recent.reduce((s, d) => s + d.value, 0) / recent.length;
        const avgRh = recent.reduce((s, d) =>
            s + (rhMap[d.date] !== undefined ? rhMap[d.date] : rhLatest.value), 0) / recent.length;
        tomorrow = NasaClimate.calculateTHI(avgTemp, avgRh);
        tomorrowSource = 'NASA প্রবণতা অনুমান';
    }

    /* ===== Air quality + UV + Wind (bonus) ===== */
    let airInfo = null;
    if (window.OpenMeteo) {
        try {
            const [aqiData, weatherWeek] = await Promise.all([
                OpenMeteo.getAQI(coords.lat, coords.lng),
                OpenMeteo.getWeek(coords.lat, coords.lng)
            ]);
            const todayW = weatherWeek && weatherWeek[0];
            const aqiObj = (aqiData && aqiData.usAqi != null) ? OpenMeteo.classifyAQI(aqiData.usAqi) : null;
            const uvObj = (todayW && todayW.uvIndexMax != null) ? OpenMeteo.classifyUV(todayW.uvIndexMax) : null;
            airInfo = {
                aqi: aqiData ? aqiData.usAqi : null,
                aqiColor: aqiObj ? aqiObj.color : '#059669',
                aqiLabel: aqiObj ? aqiObj.label : '',
                uv: todayW ? todayW.uvIndexMax : null,
                uvColor: uvObj ? uvObj.color : '#d97706',
                uvLabel: uvObj ? uvObj.label : '',
                wind: todayW ? todayW.windMax : null
            };
        } catch (err) {
            console.warn('[THI] Bonus data fetch failed:', err.message);
        }
    }

    const last7 = tempSeries.slice(-7).map(d => ({
        date: d.date,
        thi: NasaClimate.calculateTHI(d.value, rhMap[d.date] !== undefined ? rhMap[d.date] : rhLatest.value)
    }));

    const divInfo = DISTRICT_COORDS[currentDistrict] || { nameBn: 'ঢাকা', name: 'Dhaka' };
    const divNameBn = (divInfo.nameBn || 'ঢাকা') + ' বিভাগ';

    let economicHtml = '';
    if (window.NasaSedac && typeof NasaSedac.fetchSedacData === 'function') {
        try {
            const sedac = await NasaSedac.fetchSedacData(currentDistrict);
            if (sedac && sedac.livestock) {
                const m = computeImpactModel(sedac, thi);
                const body = m.episodeTotal === 0
                    ? `<div class="dvi-ok">✅ এখন ${escapeHtml(divInfo.nameBn)} বিভাগে তিন প্রজাতিই স্বাভাবিক স্তরে, তাই তাপ-জনিত আর্থিক ক্ষতি ধরা হয়নি।</div>`
                    : `<div class="dvi-card">
                        <div class="dvi-row"><span>🥛 দুধ কমা</span><b>${fmtTk(m.milkLoss)}/দিন</b></div>
                        <div class="dvi-row"><span>🥚 ডিম কমা</span><b>${fmtTk(m.eggLoss)}/দিন</b></div>
                        <div class="dvi-row"><span>⚠️ মৃত্যু+চিকিৎসা (${IMPACT_CFG.episodeDays} দিনে)</span><b>${fmtTk(m.deathTotal)}</b></div>
                      </div>
                      <div class="dvi-total"><div class="dvi-sub">${IMPACT_CFG.episodeDays} দিনের আনুমানিক মোট ক্ষতি</div><div class="big">${fmtTk(m.episodeTotal)}</div><div class="dvi-sub">পরিসর: ${fmtRange(m.episodeTotal)}</div></div>`;
                economicHtml = `
                    <div class="dvf-block">
                        <div class="dvf-block-title">
                            <i class="fas fa-coins text-amber-600"></i>
                            <span>💰 ${escapeHtml(divInfo.nameBn)} বিভাগের আনুমানিক আর্থিক প্রভাব</span>
                        </div>
                        ${body}
                    </div>`;
            }
        } catch (err) {
            console.warn('[THI] SEDAC load error in card:', err.message);
        }
    }

    const rainLatest = NasaPower.getLatest(parameter, 'PRECTOTCORR');

    body.innerHTML = renderThiCardHtml({
        placeName: divNameBn,
        isDivision: true,
        thiVal: thi,
        yesterdayVal: yesterday,
        tomorrowVal: tomorrow,
        tomorrowSource: tomorrowSource,
        tempVal: tempLatest.value,
        rhVal: rhLatest.value,
        rainVal: rainLatest ? rainLatest.value : 0,
        dataDate: tempLatest.date,
        ageDays: NasaPower.ageDays(tempLatest.date),
        spId: currentSpecies,
        airInfo: airInfo,
        last7: last7,
        economicHtml: economicHtml
    });
}

window.__changeSpecies = function (species) {
    if (!SPECIES_IDS.includes(species)) return;
    currentSpecies = species;
    try { localStorage.setItem(SPECIES_KEY, species); } catch (_) {}
    const sel = _el('thiSpecies');
    if (sel && sel.value !== species) sel.value = species;
    dvmOnSpeciesChange();
    if (lastParameter) {
        renderTHI(lastParameter).catch(err => console.error(err));
    } else {
        loadFeature();
    }
};

/* ============================================================
   THI ECONOMIC IMPACT  (Options A / B / C / D in one panel)
   Real inputs : live THI (NASA POWER T2M+RH2M) + division livestock (NasaSedac)
   Assumptions : IMPACT_CFG below (planning-level; cite before presenting as fact)
   ============================================================ */
const IMPACT_CFG = {
    episodeDays: 7,            /* one heat-episode */
    seasonDays: 90,            /* scenario: stress persists 90 days (production loss only) */
    rangePct: 0.30,            /* ±30% display range, same as NasaSedac */
    lactatingShare: 0.30,      /* share of cattle that are lactating */
    milkLitres: 4,             /* L / lactating cow / day */
    milkPrice: 60,             /* BDT / L */
    layerShare: 0.25,          /* share of poultry that are layers */
    eggsPerDay: 0.75,          /* eggs / layer / day */
    eggPrice: 12,              /* BDT / egg */
    milkDrop: { mild: 0.05, moderate: 0.15, severe: 0.25 },
    eggDrop:  { mild: 0.05, moderate: 0.10, severe: 0.20 },
    /* death + treatment cost, share of heads lost per 7-day episode */
    mortality: {
        cattle:  { mild: 0.0002, moderate: 0.001, severe: 0.004 },
        small:   { mild: 0.0002, moderate: 0.001, severe: 0.003 },
        poultry: { mild: 0.001,  moderate: 0.005, severe: 0.02 }
    },
    /* independent measures, combined multiplicatively */
    prevention: [
        { id: 'water', label: '💧 পানি ২ গুণ',        cut: 0.20 },
        { id: 'shade', label: '🌳 ছায়া',             cut: 0.25 },
        { id: 'fan',   label: '🌀 ফ্যান / বাতাস',     cut: 0.15 }
    ]
};
const LEVEL_BN = {
    normal:   { t: 'স্বাভাবিক', c: '#047857' },
    mild:     { t: 'মৃদু',      c: '#92400e' },
    moderate: { t: 'মধ্যম',     c: '#c2410c' },
    severe:   { t: 'তীব্র',     c: '#991b1b' },
    unknown:  { t: 'অজানা',     c: '#64748b' }
};
const IMPACT_TAB_KEY = 'dvImpactTab';
let impactTab = (() => {
    try { const v = sessionStorage.getItem(IMPACT_TAB_KEY); return ['A', 'B', 'C', 'D'].includes(v) ? v : 'C'; }
    catch (_) { return 'C'; }
})();
let impactState = null;
let impactNational = null;       /* { at, rows, failed } | { loading:true } */
let impactEventsBound = false;
const impactPrevOn = { water: true, shade: true, fan: true };

/* ---------- formatters ---------- */
function fmtTk(v) {
    const n = Math.abs(v);
    if (n >= 1e7) return '৳' + (v / 1e7).toFixed(2) + ' কোটি';
    if (n >= 1e5) return '৳' + (v / 1e5).toFixed(2) + ' লক্ষ';
    return '৳' + Math.round(v).toLocaleString('en-IN');
}
function fmtRange(v) {
    const r = IMPACT_CFG.rangePct;
    return fmtTk(v * (1 - r)) + ' – ' + fmtTk(v * (1 + r));
}
const fmtN = n => Math.round(n).toLocaleString('en-IN');
const lvBadge = l => {
    const d = LEVEL_BN[l] || LEVEL_BN.unknown;
    return `<span class="dvi-badge" style="background:${d.c};">${d.t}</span>`;
};

/* ---------- model ---------- */
function impactLevels(thi, force) {
    if (force) return { cow: force, poultry: force, small: force };
    const lv = sp => NasaClimate.classifyTHI(thi, sp).level;
    return { cow: lv('cow'), poultry: lv('chicken'), small: lv('goat') };
}

function computeImpactModel(sedac, thi, force) {
    const C = IMPACT_CFG, L = sedac.livestock || {};
    const V = Object.assign({ cattle: 80000, goat: 12000, sheep: 10000, poultry: 400 },
        (window.NasaSedac && NasaSedac.LIVESTOCK_VALUE_BDT) || {});
    const num = k => Number(L[k]) || 0;
    const n = { cattle: num('cattle'), goat: num('goat'), sheep: num('sheep'), poultry: num('poultry') };
    const lvl = impactLevels(thi, force);
    const r = (tbl, l) => tbl[l] || 0;

    const lactating = n.cattle * C.lactatingShare;
    const milkBase = lactating * C.milkLitres * C.milkPrice;
    const milkDrop = r(C.milkDrop, lvl.cow);
    const milkLoss = milkBase * milkDrop;

    const layers = n.poultry * C.layerShare;
    const eggBase = layers * C.eggsPerDay * C.eggPrice;
    const eggDrop = r(C.eggDrop, lvl.poultry);
    const eggLoss = eggBase * eggDrop;

    const mC = r(C.mortality.cattle, lvl.cow);
    const mP = r(C.mortality.poultry, lvl.poultry);
    const mS = r(C.mortality.small, lvl.small);
    const heads = { cattle: n.cattle * mC, poultry: n.poultry * mP, goat: n.goat * mS, sheep: n.sheep * mS };
    const death = {
        cattle: heads.cattle * V.cattle,
        poultry: heads.poultry * V.poultry,
        small: heads.goat * V.goat + heads.sheep * V.sheep
    };
    const deathTotal = death.cattle + death.poultry + death.small;
    const dailyProd = milkLoss + eggLoss;
    const episodeProd = dailyProd * C.episodeDays;
    return {
        n, V, lvl, lactating, milkBase, milkDrop, milkLoss, layers, eggBase, eggDrop, eggLoss,
        mortRate: { cattle: mC, poultry: mP, small: mS }, heads, death, deathTotal,
        dailyProd, episodeProd, episodeTotal: episodeProd + deathTotal,
        seasonProd: dailyProd * C.seasonDays,
        totalAnimals: n.cattle + n.goat + n.sheep + n.poultry
    };
}

function prevResult(m) {
    let rem = 1;
    IMPACT_CFG.prevention.forEach(p => { if (impactPrevOn[p.id]) rem *= (1 - p.cut); });
    return { rem, cut: 1 - rem, save: m.episodeTotal * (1 - rem) };
}

/* ---------- styles / events ---------- */
function ensureImpactStyles() {
    if (_el('dviStyles')) return;
    const st = document.createElement('style');
    st.id = 'dviStyles';
    st.textContent = ``;
    document.head.appendChild(st);
}

function bindImpactEvents() {
    if (impactEventsBound) return;
    impactEventsBound = true;
    document.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('[data-dvi-tab]');
        if (t) {
            impactTab = t.dataset.dviTab;
            try { sessionStorage.setItem(IMPACT_TAB_KEY, impactTab); } catch (_) {}
            renderImpactBox();
            return;
        }
        if (e.target.closest && e.target.closest('[data-dvi-national]')) loadImpactNational();
    });
    document.addEventListener('change', e => {
        const el = e.target;
        if (el && el.matches && el.matches('input[data-dvi-prev]')) {
            impactPrevOn[el.dataset.dviPrev] = el.checked;
            const holder = _el('dviPrevResult');
            if (holder && impactState) holder.innerHTML = prevResultHtml(impactState.model);
        }
    });
}

/* ---------- tab A : animal count ---------- */
function groupsOf(m) {
    const T = NasaClimate.THI_THRESHOLDS;
    return [
        { icon: '🐄', name: 'গরু ও গাভী', count: m.n.cattle, lv: m.lvl.cow, from: T.cow.mild },
        { icon: '🐔', name: 'মুরগি / পোল্ট্রি', count: m.n.poultry, lv: m.lvl.poultry, from: T.chicken.mild },
        { icon: '🐐', name: 'ছাগল ও ভেড়া', count: m.n.goat + m.n.sheep, lv: m.lvl.small, from: T.goat.mild }
    ];
}

function tabA(m, ctx) {
    const g = groupsOf(m);
    const atRisk = g.filter(x => x.lv !== 'normal' && x.lv !== 'unknown').reduce((s, x) => s + x.count, 0);
    const atRiskPct = m.totalAnimals > 0 ? Math.round((atRisk / m.totalAnimals) * 100) : 0;
    const rows = g.map(x => {
        const lvObj = LEVEL_BN[x.lv] || LEVEL_BN.unknown;
        const pct = m.totalAnimals > 0 ? Math.min(100, Math.max(8, Math.round((x.count / m.totalAnimals) * 100))) : 0;
        return `
            <div class="dvi-card">
                <div class="dvi-card-header">
                    <div class="dvi-card-title">
                        <span style="font-size:22px;">${x.icon}</span>
                        <span>${escapeHtml(x.name)}</span>
                    </div>
                    ${lvBadge(x.lv)}
                </div>
                <div class="dvi-row">
                    <span>আদমশুমারি সেন্সাস সংখ্যা</span>
                    <b style="font-size:16px;">${fmtN(x.count)} প্রাণী</b>
                </div>
                <div style="height:6px;background:#f1f5f9;border-radius:999px;overflow:hidden;margin:4px 0;">
                    <div style="width:${pct}%;background:${lvObj.c};height:100%;border-radius:999px;"></div>
                </div>
                <div class="dvi-row" style="font-size:11.5px;color:#64748b;border-bottom:none;">
                    <span>স্ট্রেস থ্রেশহোল্ড মান</span>
                    <span>THI ≥ ${x.from}</span>
                </div>
            </div>`;
    }).join('');

    return `
        <div class="dvi-card-grid">
            ${rows}
        </div>
        <div class="dvi-total" style="background:linear-gradient(135deg,#f5f3ff 0%,#faf5ff 100%);border-color:#ddd6fe;">
            <div class="dvi-total-title" style="color:#6d28d9;">📊 বিভাগের সামগ্রিক প্রাণী এক্সপোজার</div>
            <div class="big" style="color:#7c3aed;">${fmtN(atRisk)} <span style="font-size:18px;font-weight:700;color:#6d28d9;">প্রাণী (${atRiskPct}%)</span></div>
            <div class="dvi-total-sub" style="color:#5b21b6;">${escapeHtml(ctx.nameBn)} বিভাগে মোট ${fmtN(m.totalAnimals)} প্রাণীর মধ্যে বর্তমানে তাপ-স্ট্রেসে আক্রান্ত।</div>
        </div>`;
}

/* ---------- tab B : economic loss ---------- */
function assumptionsHtml(m) {
    const C = IMPACT_CFG;
    return `
        <details class="dvi-card" style="cursor:pointer;margin-top:12px;">
            <summary style="font-weight:800;color:#6d28d9;font-size:13px;">⚙️ মডেল প্যারামিটার ও বৈজ্ঞানিক অনুমিতি (Model Assumptions)</summary>
            <div class="dvi-sub" style="line-height:1.7;margin-top:10px;padding-top:10px;border-top:1px dashed #e2e8f0;">
                &bull; <b>দুগ্ধবতী গাভী:</b> মোট গরুর ${C.lactatingShare * 100}% &bull; গড় দুধ উৎপাদন ${C.milkLitres} লিটার/দিন &bull; বাজারমূল্য ৳${C.milkPrice}/লিটার<br>
                &bull; <b>ডিমপাড়া লেয়ার:</b> মোট মুরগির ${C.layerShare * 100}% &bull; গড় ডিম উৎপাদন ${C.eggsPerDay} টি/দিন &bull; বাজারমূল্য ৳${C.eggPrice}/টি<br>
                &bull; <b>দুধ হ্রাস হার (মৃদু/মধ্যম/তীব্র):</b> ${Object.values(C.milkDrop).map(v => v * 100 + '%').join(' / ')}<br>
                &bull; <b>ডিম হ্রাস হার (মৃদু/মধ্যম/তীব্র):</b> ${Object.values(C.eggDrop).map(v => v * 100 + '%').join(' / ')}<br>
                &bull; <b>প্রাণীর গড় বাজারমূল্য (SEDAC/DLS):</b> গরু ৳${fmtN(m.V.cattle)}, ছাগল ৳${fmtN(m.V.goat)}, ভেড়া ৳${fmtN(m.V.sheep)}, পোল্ট্রি ৳${fmtN(m.V.poultry)}<br>
                &bull; <b>পরিকল্পনা পরিসর:</b> সম্পূর্ণ প্রশাসনিক বিভাগের প্রাণিসম্পদের ওপর ভিত্তি করে নির্ণীত ম্যাক্রো-অর্থনৈতিক বিশ্লেষণ।
            </div>
        </details>`;
}

function tabB(m, ctx) {
    if (m.episodeTotal === 0) {
        return `
            <div class="dvi-ok">
                <i class="fas fa-circle-check text-emerald-600" style="font-size:24px;"></i>
                <div>
                    <div style="font-size:15px;font-weight:800;color:#065f46;">স্বাভাবিক অবস্থা &bull; কোনো প্রত্যক্ষ তাপজনিত আর্থিক ক্ষতি নেই</div>
                    <div style="font-size:12px;color:#047857;margin-top:2px;">বর্তমানে ${escapeHtml(ctx.nameBn)} বিভাগে সব প্রজাতির প্রাণী নিরাপদ তাপমাত্রায় রয়েছে।</div>
                </div>
            </div>
            ${assumptionsHtml(m)}`;
    }

    return `
        <!-- 3 KPI Cards -->
        <div class="dvf-kpi-grid">
            <div class="dvf-kpi-card">
                <div class="dvf-kpi-top">
                    <span class="dvf-kpi-icon">🥛</span>
                    <span class="dvf-kpi-badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;">-${m.milkDrop * 100}% দুধ</span>
                </div>
                <div class="dvf-kpi-title">দৈনিক দুধ উৎপাদন ক্ষতি</div>
                <div class="dvf-kpi-score" style="color:#b91c1c;">${fmtTk(m.milkLoss)}</div>
                <div class="dvf-kpi-sub">প্রতিদিন গাভী প্রতি দুধ হ্রাস</div>
            </div>

            <div class="dvf-kpi-card">
                <div class="dvf-kpi-top">
                    <span class="dvf-kpi-icon">🥚</span>
                    <span class="dvf-kpi-badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fecaca;">-${m.eggDrop * 100}% ডিম</span>
                </div>
                <div class="dvf-kpi-title">দৈনিক ডিম উৎপাদন ক্ষতি</div>
                <div class="dvf-kpi-score" style="color:#b91c1c;">${fmtTk(m.eggLoss)}</div>
                <div class="dvf-kpi-sub">প্রতিদিন লেয়ার মুরগির ড্রপ</div>
            </div>

            <div class="dvf-kpi-card">
                <div class="dvf-kpi-top">
                    <span class="dvf-kpi-icon">⚠️</span>
                    <span class="dvf-kpi-badge" style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;">৭ দিন</span>
                </div>
                <div class="dvf-kpi-title">মৃত্যু ও জরুরি চিকিৎসা</div>
                <div class="dvf-kpi-score" style="color:#b45309;">${fmtTk(m.deathTotal)}</div>
                <div class="dvf-kpi-sub">মর্টালিটি ও ড্রাগ খরচ</div>
            </div>
        </div>

        <!-- Hero 7-Day Episode Total -->
        <div class="dvi-total">
            <div class="dvi-total-title">🔥 ${IMPACT_CFG.episodeDays} দিনের হিট-এপিসোডে সর্বমোট আর্থিক ক্ষতি</div>
            <div class="big">${fmtTk(m.episodeTotal)}</div>
            <div class="dvi-total-sub">আনুমানিক ক্ষয়ক্ষতির রেঞ্জ: <b>${fmtRange(m.episodeTotal)}</b> (±৩০% নির্ভরযোগ্যতা)</div>
        </div>

        <!-- Season Projection -->
        <div class="dvi-card" style="background:#f8fafc;border-color:#e2e8f0;">
            <div class="dvi-row">
                <span style="font-weight:700;color:#334155;">🗓️ পূর্ণ মৌসুম অনুমান (${IMPACT_CFG.seasonDays} দিন দীর্ঘায়িত হলে)</span>
                <b style="font-size:16px;color:#7c3aed;">${fmtTk(m.seasonProd)}</b>
            </div>
            <div class="dvi-sub" style="margin-top:2px;">দীর্ঘমেয়াদী খরা ও উচ্চ তাপমাত্রায় শুধু উৎপাদন হ্রাসের প্রাক্কলন (মৃত্যু অন্তর্ভুক্ত নয়)।</div>
        </div>

        ${assumptionsHtml(m)}`;
}

/* ---------- tab C : animal + economic per species ---------- */
function tabC(m, ctx) {
    const hasLoss = m.episodeTotal > 0;
    const cattleCard = `
        <div class="dvi-card">
            <div class="dvi-card-header">
                <div class="dvi-card-title">
                    <span style="font-size:22px;">🐄</span>
                    <span>গরু ও গাভী সম্পদ</span>
                </div>
                ${lvBadge(m.lvl.cow)}
            </div>
            <div class="dvi-row"><span>মোট পশু সংখ্যা</span><b>${fmtN(m.n.cattle)}</b></div>
            <div class="dvi-row"><span>দুধ প্রদানকারী (Lactating)</span><b>${fmtN(m.lactating)}</b></div>
            <div class="dvi-row"><span>দুধ উৎপাদন হ্রাস</span><b style="color:#dc2626;">-${m.milkDrop * 100}%</b></div>
            <div class="dvi-row"><span>দৈনিক দুধের আর্থিক ক্ষতি</span><b>${fmtTk(m.milkLoss)} / দিন</b></div>
            <div class="dvi-row"><span>মৃত্যু ও চিকিৎসা (~${fmtN(m.heads.cattle)} পশু)</span><b style="color:#b91c1c;">${fmtTk(m.death.cattle)}</b></div>
        </div>`;

    const poultryCard = `
        <div class="dvi-card">
            <div class="dvi-card-header">
                <div class="dvi-card-title">
                    <span style="font-size:22px;">🐔</span>
                    <span>মুরগি ও পোল্ট্রি শিল্প</span>
                </div>
                ${lvBadge(m.lvl.poultry)}
            </div>
            <div class="dvi-row"><span>মোট পোল্ট্রি সংখ্যা</span><b>${fmtN(m.n.poultry)}</b></div>
            <div class="dvi-row"><span>ডিম উৎপাদনকারী (Layers)</span><b>${fmtN(m.layers)}</b></div>
            <div class="dvi-row"><span>ডিম উৎপাদন হ্রাস</span><b style="color:#dc2626;">-${m.eggDrop * 100}%</b></div>
            <div class="dvi-row"><span>দৈনিক ডিমের আর্থিক ক্ষতি</span><b>${fmtTk(m.eggLoss)} / দিন</b></div>
            <div class="dvi-row"><span>মৃত্যু ও চিকিৎসা (~${fmtN(m.heads.poultry)} মুরগি)</span><b style="color:#b91c1c;">${fmtTk(m.death.poultry)}</b></div>
        </div>`;

    const smallCard = `
        <div class="dvi-card">
            <div class="dvi-card-header">
                <div class="dvi-card-title">
                    <span style="font-size:22px;">🐐</span>
                    <span>ছাগল ও ভেড়া সম্পদ</span>
                </div>
                ${lvBadge(m.lvl.small)}
            </div>
            <div class="dvi-row"><span>মোট ছাগল ও ভেড়া</span><b>${fmtN(m.n.goat + m.n.sheep)}</b></div>
            <div class="dvi-row"><span>গরু/পোল্ট্রির তুলনায় সহনশীলতা</span><b style="color:#059669;">বেশি সহনশীল</b></div>
            <div class="dvi-row"><span>মৃত্যু ও চিকিৎসা ঝুঁকি (~${fmtN(m.heads.goat + m.heads.sheep)} প্রাণী)</span><b style="color:#b91c1c;">${fmtTk(m.death.small)}</b></div>
        </div>`;

    return `
        <div class="dvi-card-grid">
            ${cattleCard}
            ${poultryCard}
            ${smallCard}
        </div>
        <div class="dvi-total">
            <div class="dvi-total-title">💰 ${escapeHtml(ctx.nameBn)} বিভাগের সর্বমোট প্রাণিসম্পদ ক্ষতি</div>
            <div class="big">${hasLoss ? fmtTk(m.episodeTotal) : '৳০ (স্বাভাবিক স্তর)'}</div>
            ${hasLoss ? `<div class="dvi-total-sub">৭ দিনের রেঞ্জ: <b>${fmtRange(m.episodeTotal)}</b> &bull; মোট প্রাণী: ${fmtN(m.totalAnimals)}</div>` : ''}
        </div>`;
}

/* ---------- tab D : full detail + prevention ---------- */
function prevResultHtml(m) {
    const p = prevResult(m);
    return `
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <div>
                <div style="font-size:12px;font-weight:800;color:#065f46;text-transform:uppercase;letter-spacing:0.04em;">🛡️ প্রতিরোধ ব্যবস্থায় সম্ভাব্য আর্থিক সাশ্রয় (${IMPACT_CFG.episodeDays} দিন)</div>
                <div style="font-size:26px;font-weight:900;color:#047857;margin-top:2px;">${fmtTk(p.save)}</div>
                <div style="font-size:12px;color:#047857;font-weight:600;">ঝুঁকি হ্রাস: ${(p.cut * 100).toFixed(0)}% &bull; অবশিষ্ট সম্ভাব্য ক্ষতি: ${(p.rem * 100).toFixed(0)}%</div>
            </div>
            <div style="width:52px;height:52px;border-radius:16px;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 6px 16px rgba(16,185,129,0.3);flex-shrink:0;">
                <i class="fas fa-piggy-bank"></i>
            </div>
        </div>`;
}

function tabD(m, ctx) {
    const C = IMPACT_CFG;
    const steps = `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #e2e8f0;padding-bottom:6px;">
                <span>🐄 গাভী দুধ হিসাব: ${fmtN(m.n.cattle)} গরু × ${C.lactatingShare * 100}% = ${fmtN(m.lactating)} গাভী</span>
                <b style="color:#0f172a;">${fmtTk(m.milkLoss)} / দিন ক্ষতি</b>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px dashed #e2e8f0;padding-bottom:6px;">
                <span>🐔 লেয়ার ডিম হিসাব: ${fmtN(m.n.poultry)} মুরগি × ${C.layerShare * 100}% = ${fmtN(m.layers)} লেয়ার</span>
                <b style="color:#0f172a;">${fmtTk(m.eggLoss)} / দিন ক্ষতি</b>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span>⚠️ মৃত্যু ও চিকিৎসা ব্যয়: গরু ৳${fmtTk(m.death.cattle)} + মুরগি ৳${fmtTk(m.death.poultry)} + ছাগল-ভেড়া ৳${fmtTk(m.death.small)}</span>
                <b style="color:#b91c1c;">${fmtTk(m.deathTotal)} মোট</b>
            </div>
        </div>`;

    const timeline = `
        <div class="dvi-table-wrap">
            <table class="dvi-table">
                <tr><th>সময়কাল</th><th>উৎপাদন ক্ষতি</th><th>মৃত্যু ও চিকিৎসা</th><th>সর্বমোট ক্ষতি</th></tr>
                <tr><td>দৈনিক ক্ষতি</td><td>${fmtTk(m.dailyProd)}</td><td>—</td><td>${fmtTk(m.dailyProd)}</td></tr>
                <tr class="cur"><td>${C.episodeDays} দিন (হিট-এপিসোড)</td><td>${fmtTk(m.episodeProd)}</td><td>${fmtTk(m.deathTotal)}</td><td><b>${fmtTk(m.episodeTotal)}</b></td></tr>
                <tr><td>${C.seasonDays} দিন (মৌসুম প্রাক্কলন)</td><td>${fmtTk(m.seasonProd)}</td><td>আলাদা</td><td>${fmtTk(m.seasonProd)}+</td></tr>
            </table>
        </div>`;

    const levels = ['mild', 'moderate', 'severe'].map(l => {
        const mm = computeImpactModel(ctx.sedac, ctx.thi, l);
        const cur = m.lvl.cow === l;
        return `<tr class="${cur ? 'cur' : ''}"><td>${lvBadge(l)}${cur ? ' ← বর্তমান স্তর' : ''}</td>
            <td>${fmtTk(mm.dailyProd)}</td><td>${fmtTk(mm.deathTotal)}</td><td><b>${fmtTk(mm.episodeTotal)}</b></td></tr>`;
    }).join('');

    const prev = C.prevention.map(p => `
        <label class="dvi-prev-item">
            <input type="checkbox" data-dvi-prev="${p.id}" ${impactPrevOn[p.id] ? 'checked' : ''}>
            <span>${p.label} <b style="color:#047857;">(-${p.cut * 100}%)</b></span>
        </label>`).join('');

    return `
        ${tabC(m, ctx)}
        <div class="dvi-card">
            <div class="dvi-card-title">
                <i class="fas fa-calculator text-purple-600"></i>
                <span>গাণিতিক ফর্মুলা ও অ্যালগরিদম (ধাপে ধাপে)</span>
            </div>
            ${steps}
        </div>
        <div class="dvi-card">
            <div class="dvi-card-title">
                <i class="fas fa-clock text-amber-600"></i>
                <span>সময়ভেদে ক্ষতির প্রক্ষেপণ (Timeline Forecast)</span>
            </div>
            ${timeline}
        </div>
        <div class="dvi-card">
            <div class="dvi-card-title">
                <i class="fas fa-layer-group text-rose-600"></i>
                <span>THI তীব্রতা পরিবর্তনের সাথে ক্ষতির তুলনা (${C.episodeDays} দিন)</span>
            </div>
            <div class="dvi-table-wrap">
                <table class="dvi-table">
                    <tr><th>হিট-স্ট্রেস স্তর</th><th>দৈনিক উৎপাদন</th><th>মৃত্যু ও চিকিৎসা</th><th>সর্বমোট ক্ষতি</th></tr>
                    ${levels}
                </table>
            </div>
        </div>
        <div class="dvi-card">
            <div class="dvi-card-title">
                <i class="fas fa-shield-halved text-emerald-600"></i>
                <span>খামার ব্যবস্থাপনা ও আধুনিক সাশ্রয় সিমুলেটর</span>
            </div>
            <div class="dvi-prev-grid">${prev}</div>
            <div class="dvi-save-card" id="dviPrevResult">${prevResultHtml(m)}</div>
            <div class="dvi-sub">ব্যবস্থাগুলো গুণ করে হিসাব করা (০.৮০ × ০.৭৫ × ০.৮৫ = ০.৫১), যোগ করে নয়। বৈজ্ঞানিক ফিল্ড ট্রায়াল ভিত্তিক আনুমানিক মান।</div>
        </div>
        ${assumptionsHtml(m)}`;
}

/* ---------- national roll-up (8 divisions, each with its own live THI) ---------- */
async function loadImpactNational() {
    if (impactNational && impactNational.loading) return;
    impactNational = { loading: true };
    renderImpactBox();
    const keys = Object.keys(DISTRICT_COORDS);
    const res = await Promise.allSettled(keys.map(async k => {
        const c = DISTRICT_COORDS[k];
        const [param, sedac] = await Promise.all([
            NasaPower.getPowerData(c.lat, c.lng, 7),
            NasaSedac.fetchSedacData(k)
        ]);
        const t = NasaPower.getLatest(param, 'T2M'), h = NasaPower.getLatest(param, 'RH2M');
        if (!t || !h || !sedac || !sedac.livestock) throw new Error('no data');
        const thi = NasaClimate.calculateTHI(t.value, h.value);
        if (thi === null) throw new Error('no thi');
        return { key: k, name: c.nameBn, thi, m: computeImpactModel(sedac, thi) };
    }));
    const rows = res.filter(x => x.status === 'fulfilled').map(x => x.value)
        .sort((a, b) => b.m.episodeTotal - a.m.episodeTotal);
    impactNational = { at: Date.now(), rows, failed: res.length - rows.length };
    renderImpactBox();
}

function nationalHtml() {
    const n = impactNational;
    if (n && n.loading) {
        return `<div class="dvi-card" style="text-align:center;padding:24px;"><i class="fas fa-spinner fa-spin text-purple-600" style="font-size:24px;"></i><div style="font-size:13px;font-weight:700;color:#6d28d9;margin-top:8px;">৮ বিভাগের NASA ও SEDAC ডেটা লোড হচ্ছে...</div></div>`;
    }
    if (!n || (Date.now() - n.at) > 30 * 60 * 1000) {
        return `
            <button class="dvi-btn" data-dvi-national>
                <i class="fas fa-earth-asia"></i>
                <span>🇧🇩 সারা দেশের তুলনামূলক ক্ষতি দেখুন (৮টি বিভাগ একনজরে)</span>
            </button>`;
    }
    if (!n.rows.length) return `<div class="dvi-card">সারা দেশের ডেটা পাওয়া যায়নি।</div>`;
    const tot = n.rows.reduce((s, r) => s + r.m.episodeTotal, 0);
    const an = n.rows.reduce((s, r) => s + r.m.totalAnimals, 0);
    const body = n.rows.map(r => `
        <tr>
            <td><b>${escapeHtml(r.name)}</b></td>
            <td><b>${r.thi.toFixed(1)}</b></td>
            <td>${lvBadge(r.m.lvl.cow)}</td>
            <td>${fmtN(r.m.totalAnimals)}</td>
            <td style="color:#b91c1c;font-weight:800;">${fmtTk(r.m.episodeTotal)}</td>
        </tr>`).join('');
    return `
        <div class="dvi-card">
            <div class="dvi-card-title">
                <i class="fas fa-earth-asia text-indigo-600"></i>
                <span>🇧🇩 জাতীয় পর্যায়ে প্রাণিসম্পদ ক্ষয়ক্ষতি (${n.rows.length}/৮ বিভাগ, ${IMPACT_CFG.episodeDays} দিন)</span>
            </div>
            <div class="dvi-table-wrap">
                <table class="dvi-table">
                    <tr><th>বিভাগ</th><th>লাইভ THI</th><th>গরুর স্ট্রেস</th><th>প্রাণী সেন্সাস</th><th>ক্ষতির পরিমাণ</th></tr>
                    ${body}
                    <tr class="cur">
                        <td><b>সর্বমোট বাংলাদেশ</b></td>
                        <td>—</td>
                        <td>—</td>
                        <td><b>${fmtN(an)}</b></td>
                        <td style="color:#991b1b;font-size:15px;font-weight:900;">${fmtTk(tot)}</td>
                    </tr>
                </table>
            </div>
            ${n.failed ? `<div class="dvi-sub" style="color:#b45309;">⚠️ ${n.failed}টি বিভাগের স্যাটেলাইট সংযোগে বিলম্ব হয়েছে।</div>` : ''}
        </div>`;
}

/* ---------- panel render ---------- */
function renderImpactBox() {
    const box = _el('impactSubContent');
    if (!box || !impactState) return;
    const s = impactState, m = s.model;
    const tabs = [
        ['A', '<i class="fas fa-paw"></i> পশুর সংখ্যা'],
        ['B', '<i class="fas fa-coins"></i> আর্থিক ক্ষতি'],
        ['C', '<i class="fas fa-cow"></i> প্রজাতিভিত্তিক ক্ষতি'],
        ['D', '<i class="fas fa-calculator"></i> বিস্তারিত ও সাশ্রয়']
    ].map(([k, l]) => `<button class="dvi-tab ${impactTab === k ? 'on' : ''}" data-dvi-tab="${k}">${l}</button>`).join('');
    const fn = { A: tabA, B: tabB, C: tabC, D: tabD }[impactTab] || tabC;
    const ctx = { nameBn: s.nameBn, thi: s.thi, sedac: s.sedac };
    const age = NasaPower.ageDays(s.date);
    const srcTxt = s.source === 'firestore' ? 'Firestore (SEDAC/DLS)' : 'SEDAC GPW v4.11 + DLS';

    box.innerHTML = `
        <div class="dvi-box">
            <!-- Header -->
            <div class="dvi-header">
                <div class="dvi-header-title-group">
                    <span class="dvi-header-icon"><i class="fas fa-temperature-arrow-up"></i></span>
                    <div>
                        <h3 class="dvi-header-name">${escapeHtml(s.nameBn)} বিভাগ</h3>
                        <span class="dvi-header-badge">NASA POWER &bull; ${escapeHtml(srcTxt)} &bull; ${escapeHtml(formatDate(s.date))}${age != null ? ` (${age} দিন)` : ''}</span>
                    </div>
                </div>
                <div class="dvi-top-thi-tag">
                    <i class="fas fa-temperature-high text-amber-600"></i>
                    <span>বর্তমান THI: ${s.thi.toFixed(1)}</span>
                </div>
            </div>

            <!-- Tab Pills -->
            <div class="dvi-tabs">${tabs}</div>

            <!-- Tab Body -->
            ${fn(m, ctx)}

            <!-- National Button / Table -->
            <div style="margin-top:6px;">${nationalHtml()}</div>

            <!-- Card Footer -->
            <div class="dvf-card-footer">
                <i class="fas fa-info-circle text-slate-400"></i>
                <span>উৎস: NASA POWER বায়ুমণ্ডলীয় টেলিমেট্রি (T2M, RH2M → THI, NRC 1971) &bull; NASA SEDAC GPW v4.11 &bull; বাংলাদেশ প্রাণিসম্পদ অধিদপ্তর (DLS)। এটি পরিকল্পনা ও নীতিনির্ধারণী স্তরের প্রাক্কলন। খামারের অভ্যন্তরীণ তাপমাত্রা ও শেড ব্যবস্থাপনার ওপর নির্ভর করে স্থানীয় মান ভিন্ন হতে পারে।</span>
            </div>
        </div>`;
}

/* ============================================================
   AREA MAP  (ported from climate-map.js v8.0 and adapted for the THI page)
   • Leaflet map: Division → District → Upazila drill-down, bubbles = live THI
   • Search (LocationIQ, Open-Meteo geocoding fallback) → any place in Bangladesh
   • Click any area → THI now / yesterday / tomorrow, all species, weather, AQI/UV/wind,
     7-day THI chart, and the parent division's economic impact
   Everything is prefixed dvm* so it cannot clash with the rest of this file.
   ============================================================ */
const LOCATIONIQ_KEY = 'pk.6233e1f050e2472d37bc17cb18a3b519';
const DVM_CENTER = [23.7, 90.35];
const DVM_CONCURRENCY = 4;
const DVM_BUBBLE_BASE = 30, DVM_BUBBLE_MAX = 46;
const DVM_LABEL_OFFSET = { division: 0.28, district: 0.10, upazila: 0.05 };
const DVM_DIV_ALIAS = { chattogram: 'chittagong', chattagram: 'chittagong', barishal: 'barisal', dacca: 'dhaka' };
const dvmDivKey = s => { const k = String(s || '').trim().toLowerCase(); return DVM_DIV_ALIAS[k] || k; };
const DVM_TILES = {
    light: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri | NASA POWER + Open-Meteo', maxZoom: 16, crossOrigin: true }
    },
    satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri | NASA POWER + Open-Meteo', maxZoom: 19, crossOrigin: true }
    }
};
const DVM_EMOJI = { dhaka: '🏛️', chittagong: '⚓', rajshahi: '🌾', khulna: '🌊', barisal: '🚤', sylhet: '🍃', rangpur: '🌿', mymensingh: '🌳' };

const dvm = {
    map: null, markers: new Map(), labels: new Map(), polygons: new Map(),
    rows: [], token: 0, areaTok: 0, level: 'division', divisionKey: null,
    geo: { div: null, dist: null, upa: null }, upaTried: false,
    searchPin: null, searchAbort: null, lastArea: null, ready: false
};
const dvmPointCache = new Map();
let dvmMode = 'thi';      /* 'thi' (heat-stress page) | 'forage' (grass / soil / rearing) | 'outbreak' (disease risk) */
let dvmLayer = 'grass';   /* forage page only: 'grass' | 'soil' | 'rear' */

/* ---------- small helpers ---------- */
function dvmProp(props, ...keys) {
    for (const k of keys) { if (props && props[k] != null && props[k] !== '') return props[k]; }
    return '';
}
function dvmWithTimeout(p, ms) {
    return Promise.race([p, new Promise(res => setTimeout(() => res(null), ms))]);
}
function dvmCentroid(feature) {
    const ring = c => {
        if (!Array.isArray(c) || !c.length) return null;
        let la = 0, ln = 0;
        c.forEach(([x, y]) => { la += y; ln += x; });
        return [la / c.length, ln / c.length];
    };
    const g = feature && feature.geometry;
    if (!g) return null;
    if (g.type === 'Polygon') return ring(g.coordinates[0]);
    if (g.type === 'MultiPolygon') {
        let best = g.coordinates[0][0];
        g.coordinates.forEach(p => { if (p[0].length > best.length) best = p[0]; });
        return ring(best);
    }
    if (g.type === 'Point') return [g.coordinates[1], g.coordinates[0]];
    return null;
}
function dvmPointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}
function dvmFeatureContains(f, lat, lng) {
    const g = f && f.geometry;
    if (!g) return false;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(p => p[0] && dvmPointInRing(lng, lat, p[0]));
}
/* Which of the 8 divisions is this point in? (polygon test, else nearest division centre) */
function dvmDivisionAt(lat, lng) {
    const feats = (dvm.geo.div && dvm.geo.div.features) || [];
    for (const f of feats) {
        if (dvmFeatureContains(f, lat, lng)) {
            const k = dvmDivKey(dvmProp(f.properties, 'ADM1_EN', 'name', 'NAME_1'));
            if (DISTRICT_COORDS[k]) return k;
        }
    }
    let best = null, bd = Infinity;
    Object.keys(DISTRICT_COORDS).forEach(k => {
        const c = DISTRICT_COORDS[k];
        const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
        if (d < bd) { bd = d; best = k; }
    });
    return best;
}

/* NASA POWER is a ~0.5° x 0.625° grid; snapping makes every point in one cell share ONE request */
function dvmSnap(lat, lng) {
    return [Math.round(lat / 0.5) * 0.5, Math.round((lng + 180) / 0.625) * 0.625 - 180];
}

/* THI data for one point (NASA POWER), cached; resolves null on failure */
function dvmPointData(rawLat, rawLng) {
    const [lat, lng] = dvmSnap(rawLat, rawLng);
    const ck = lat.toFixed(3) + ',' + lng.toFixed(3);
    if (dvmPointCache.has(ck)) return dvmPointCache.get(ck);
    const p = (async () => {
        if (!window.NasaPower || !window.NasaClimate) return null;
        try {
            const parameter = await dvmWithTimeout(NasaPower.getPowerData(lat, lng, 7), 20000);
            if (!parameter) return null;
            const t = NasaPower.getLatest(parameter, 'T2M');
            const h = NasaPower.getLatest(parameter, 'RH2M');
            if (!t || !h) return null;
            const thi = NasaClimate.calculateTHI(t.value, h.value);
            if (thi === null) return null;
            const rhMap = {};
            NasaPower.getSeries(parameter, 'RH2M').forEach(r => { rhMap[r.date] = r.value; });
            const series = NasaPower.getSeries(parameter, 'T2M').map(d => ({
                date: d.date,
                thi: NasaClimate.calculateTHI(d.value, rhMap[d.date] !== undefined ? rhMap[d.date] : h.value)
            })).filter(x => x.thi !== null);
            const rain = NasaPower.getLatest(parameter, 'PRECTOTCORR');
            const gTop = NasaPower.getLatest(parameter, 'GWETTOP');
            const gRoot = NasaPower.getLatest(parameter, 'GWETROOT');
            /* Disease risk — same engine + inputs as the Disease Risk Alert card (NasaOutbreak) */
            let risk = null, diseases = [], yesterdayRisk = null;
            if (window.NasaOutbreak && rain && Number.isFinite(rain.value)) {
                try {
                    risk = NasaOutbreak.calculateRainfallRiskDetailed(rain.value, h.value, t.value);
                    diseases = NasaOutbreak.calculateDiseaseRisks({ rainMm: rain.value, humidity: h.value, temp: t.value });
                    const rSeries = NasaPower.getSeries(parameter, 'PRECTOTCORR');
                    const tSeries = NasaPower.getSeries(parameter, 'T2M');
                    const rhSeries = NasaPower.getSeries(parameter, 'RH2M');
                    if (rSeries.length >= 2 && tSeries.length >= 2 && rhSeries.length >= 2) {
                        const yr = rSeries[rSeries.length - 2].value;
                        const yt = tSeries[tSeries.length - 2].value;
                        const yh = rhSeries[rhSeries.length - 2].value;
                        if (Number.isFinite(yr) && Number.isFinite(yt) && Number.isFinite(yh)) {
                            yesterdayRisk = NasaOutbreak.calculateRainfallRiskDetailed(yr, yh, yt);
                        }
                    }
                } catch (_) { risk = null; diseases = []; yesterdayRisk = null; }
            }
            return {
                risk, diseases, yesterdayRisk,
                thi, temp: t.value, rh: h.value, date: t.date,
                rain: rain ? rain.value : null,
                soil: gTop ? gTop.value : null,          /* surface soil wetness 0-1 */
                root: gRoot ? gRoot.value : null,        /* root-zone wetness 0-1 */
                soilSeries: NasaPower.getSeries(parameter, 'GWETTOP'),
                series,
                yesterdayThi: series.length >= 2 ? series[series.length - 2].thi : null,
                source: NasaPower.getSource ? NasaPower.getSource(parameter) : 'unknown'
            };
        } catch (_) { return null; }
    })();
    dvmPointCache.set(ck, p);
    p.then(r => { if (!r) dvmPointCache.delete(ck); });
    return p;
}

/* ---------- styles ---------- */
function ensureMapStyles() {
    if (_el('dvmStyles')) return;
    const s = document.createElement('style');
    s.id = 'dvmStyles';
    s.textContent = `
.dvm-section{margin-top:16px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;padding:12px;position:relative;}
.dvm-search{position:relative;margin:8px 0;}
.dvm-search input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;}
.dvm-dd{display:none;position:absolute;left:0;right:0;top:100%;z-index:1200;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.15);max-height:260px;overflow:auto;}
.dvm-item{display:flex;gap:8px;padding:8px 12px;cursor:pointer;border-bottom:1px solid #f1f5f9;}
.dvm-item:hover{background:#f8fafc;}
.dvm-item-name{font-size:13px;font-weight:600;}
.dvm-item-sub{font-size:11px;color:#64748b;}
.dvm-bc{display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0;min-height:28px;}
.dvm-bc button{border:1px solid #cbd5e1;background:#f8fafc;border-radius:8px;padding:3px 10px;cursor:pointer;display:none;}
.dvm-bc .lnk{color:#7c3aed;cursor:pointer;font-weight:600;}
.dvm-map{height:420px;border-radius:12px;overflow:hidden;background:#f1f5f9;}
.dvm-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;margin:8px 0;color:#334155;}
.dvm-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;}
.dvm-marker{background:transparent!important;border:none!important;}
.dvm-bubble{display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2.5px solid #fff;border-radius:50%;color:#fff;font-weight:800;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,.45);box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer;transition:transform .15s ease;}
.dvm-marker:hover .dvm-bubble{transform:scale(1.2);}
.dvm-bubble.load{opacity:.6;animation:dvmPulse 1.2s infinite ease-in-out;}
@keyframes dvmPulse{50%{opacity:.3;}}
.dvm-label-wrap{background:transparent!important;border:none!important;}
.dvm-label{font-size:11px;font-weight:700;color:#1e293b;text-align:center;white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;}
.dvm-pop{min-width:150px;line-height:1.5;}
.dvm-pop-btn{margin-top:6px;width:100%;border:0;border-radius:8px;padding:6px 10px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer;}
.dvm-res-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
.dvm-res-head h3{margin:0;font-size:16px;}
.dvm-x{border:0;background:#f1f5f9;border-radius:50%;width:28px;height:28px;cursor:pointer;}
.dvm-score{text-align:center;border:2px solid;border-radius:14px;padding:10px 8px;margin:10px 0;}
.dvm-score b{display:block;font-size:34px;line-height:1.1;font-weight:800;}
.dvm-trio{display:flex;justify-content:space-around;text-align:center;gap:6px;margin:8px 0;}
.dvm-trio div{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:6px 4px;font-size:12px;}
.dvm-trio b{display:block;font-size:18px;}
.dvm-sp{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;}
.dvm-sp span{font-size:12px;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;background:#f8fafc;}
.dvm-wx{display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:13px;margin:8px 0;color:#334155;}
.dvm-sec{margin-top:12px;}
`;
    document.head.appendChild(s);
}

/* ---------- Leaflet + boundaries ---------- */
function dvmEnsureLeaflet() {
    if (window.L && L.map) return Promise.resolve(true);
    return new Promise(res => {
        if (!_el('dvmLeafletCss')) {
            const l = document.createElement('link');
            l.id = 'dvmLeafletCss'; l.rel = 'stylesheet';
            l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
            document.head.appendChild(l);
        }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = () => res(!!(window.L && L.map));
        s.onerror = () => res(false);
        document.head.appendChild(s);
    });
}
async function dvmGet(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    } catch (err) {
        console.warn('[Map] GeoJSON load failed:', url, err.message);
        return null;
    }
}
async function dvmLoadGeo() {
    const [a, b] = await Promise.all([
        dvmGet('data/bd-divisions.geojson'),
        dvmGet('data/bd-districts.geojson')
    ]);
    dvm.geo.div = a || window.BD_DIVISIONS || null;     /* inline bd-divisions.js is the fallback */
    dvm.geo.dist = b || window.BD_DISTRICTS || null;
    dvm.geo.upa = window.BD_UPAZILAS || null;
}
async function dvmEnsureUpazilas() {         /* big file: only fetched when someone drills that far */
    if (dvm.geo.upa || dvm.upaTried) return;
    dvm.upaTried = true;
    dvm.geo.upa = await dvmGet('data/bd-upazilas.geojson');
}

/* ---------- map init / clear ---------- */
function dvmInitMap() {
    const el = _el('dvmMap');
    if (!el || dvm.map) return dvm.map;
    const mobile = window.innerWidth <= 520;
    dvm.map = L.map(el, {
        center: DVM_CENTER, zoom: mobile ? 6 : 6.4, zoomControl: true, scrollWheelZoom: false,
        minZoom: 5, maxZoom: 12, maxBounds: [[20.0, 87.0], [27.0, 93.5]]
    });
    const light = L.tileLayer(DVM_TILES.light.url, DVM_TILES.light.options);
    const sat = L.tileLayer(DVM_TILES.satellite.url, DVM_TILES.satellite.options);
    light.addTo(dvm.map);
    L.control.layers({ '🗺️ Street': light, '🛰️ Satellite': sat }, null, { position: 'topright', collapsed: mobile }).addTo(dvm.map);
    dvm.map.on('focus', () => dvm.map.scrollWheelZoom.enable());
    dvm.map.on('blur', () => dvm.map.scrollWheelZoom.disable());
    setTimeout(() => { try { dvm.map.invalidateSize(); } catch (_) {} }, 300);
    return dvm.map;
}
function dvmClear() {
    const m = dvm.map;
    if (!m) return;
    [dvm.markers, dvm.labels, dvm.polygons].forEach(coll => {
        coll.forEach(layer => { try { m.removeLayer(layer); } catch (_) {} });
        coll.clear();
    });
    dvm.token++;
    try { m.closePopup(); } catch (_) {}
}

/* ---------- bubbles (colour = THI level of the selected species) ---------- */
function dvmBubbleState(row) {
    const d = row.data;
    if (d && Number.isFinite(d.thi)) {
        const c = NasaClimate.classifyTHI(d.thi, currentSpecies);
        return { thi: d.thi, color: c.color, label: c.labelBn };
    }
    return { thi: null, color: '#94a3b8', label: row.loading ? 'লোড হচ্ছে' : 'ডেটা নেই' };
}
function dvmIcon(row, boost) {
    if (dvmMode === 'forage') return dvfIcon(row, boost);
    if (dvmMode === 'outbreak') return dvoIcon(row, boost);
    const st = dvmBubbleState(row);
    const frac = st.thi == null ? 0 : Math.max(0, Math.min(1, (st.thi - 60) / 40));
    const size = Math.round(DVM_BUBBLE_BASE + (DVM_BUBBLE_MAX - DVM_BUBBLE_BASE) * frac) + boost;
    const text = st.thi != null ? Math.round(st.thi) : (row.loading ? '…' : '—');
    const fs = Math.max(9, Math.min(14, size / 2.8));
    return L.divIcon({
        html: `<div class="dvm-bubble${row.loading ? ' load' : ''}" style="width:${size}px;height:${size}px;background:${st.color};font-size:${fs}px;"><span>${escapeHtml(text)}</span></div>`,
        className: 'dvm-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2]
    });
}
function dvmPopup(row) {
    if (dvmMode === 'forage') return dvfPopup(row);
    if (dvmMode === 'outbreak') return dvoPopup(row);
    const st = dvmBubbleState(row);
    return `<div class="dvm-pop"><b>${escapeHtml(row.emoji || '📍')} ${escapeHtml(row.nameBn)}</b><br>` +
        `<span style="color:${st.color};font-weight:700;">THI ${st.thi != null ? st.thi.toFixed(1) : '—'} · ${escapeHtml(st.label)}</span>` +
        (row.level !== 'upazila' && row.feature
            ? `<button class="dvm-pop-btn" onclick="window.__dvmDrill(${row.idx})">আরও দেখুন →</button>` : '') +
        `</div>`;
}
function dvmUpsert(row, boost) {
    const icon = dvmIcon(row, boost);
    let m = dvm.markers.get(row.key);
    if (m) { m.setIcon(icon); m.setPopupContent(dvmPopup(row)); return m; }
    m = L.marker(row.centroid, { icon, title: row.nameBn, riseOnHover: true, zIndexOffset: 1000 });
    m.bindPopup(dvmPopup(row), { autoPan: true });
    m.on('click', () => {
        const pt = row.aqiPoint || row.centroid;
        dvmShowArea(row.nameBn + (row.level === 'division' ? ' বিভাগ' : ''), pt[0], pt[1], row);
    });
    m.addTo(dvm.map);
    dvm.markers.set(row.key, m);
    return m;
}
function dvmRefreshBubbles(boost) {
    dvm.rows.forEach(r => { if (dvm.markers.has(r.key)) dvmUpsert(r, boost != null ? boost : (r.level === 'division' ? 8 : 0)); });
}

/* Fetch THI a few areas at a time; each finished row repaints immediately.
   Bubbles are already on the map before any network call. */
async function dvmLoadRows(rows, token, boost) {
    let next = 0, anyOk = false;
    const worker = async () => {
        while (next < rows.length) {
            const row = rows[next++];
            if (token !== dvm.token) return;
            const pt = row.aqiPoint || row.centroid;
            row.data = await dvmPointData(pt[0], pt[1]);
            row.loading = false;
            if (row.data) anyOk = true;
            if (token !== dvm.token) return;
            dvmUpsert(row, boost);
        }
    };
    await Promise.all(Array.from({ length: DVM_CONCURRENCY }, worker));
    if (token === dvm.token && !anyOk) console.warn('[Map] No THI data came back — check NasaPower / network.');
    if (token === dvm.token && dvmMode === 'outbreak') dvxRank();
}

function dvmAddPolygon(key, feature, style, onClick) {
    const poly = L.geoJSON(feature, {
        style,
        onEachFeature: (f, layer) => {
            layer.on('mouseover', () => { layer.setStyle({ weight: 2.2, opacity: 0.9, fillOpacity: 0.15 }); layer.bringToFront(); });
            layer.on('mouseout', () => layer.setStyle(style));
            layer.on('click', onClick);
        }
    }).addTo(dvm.map);
    dvm.polygons.set(key, poly);
}
function dvmAddLabel(key, lat, lng, text) {
    const icon = L.divIcon({
        html: `<div class="dvm-label">${escapeHtml(text)}</div>`,
        className: 'dvm-label-wrap', iconSize: [100, 22], iconAnchor: [50, 11]
    });
    dvm.labels.set(key, L.marker([lat, lng], { icon, interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(dvm.map));
}
function dvmDraw(rows, cfg) {
    const token = dvm.token;
    dvm.rows = rows;
    rows.forEach((row, i) => {
        row.idx = i; row.loading = true; row.data = null;
        if (row.feature) dvmAddPolygon(row.key, row.feature, cfg.style, () => cfg.onPolygonClick(row));
        dvmAddLabel(row.key + '_label', row.centroid[0] - cfg.labelOffset, row.centroid[1], row.nameBn);
    });
    rows.forEach(r => dvmUpsert(r, cfg.boost));
    if (dvmMode === 'outbreak') dvxRank(true);
    dvmLoadRows(rows, token, cfg.boost);
}
function dvmFit() {
    const layers = Array.from(dvm.polygons.values());
    if (!layers.length) return;
    const b = L.featureGroup(layers).getBounds();
    if (b.isValid()) dvm.map.fitBounds(b, { padding: [20, 20] });
}

/* ---------- levels ---------- */
function dvmRenderDivisions() {
    if (!dvm.map) return;
    dvmClear();
    dvm.level = 'division'; dvm.divisionKey = null;
    dvmBreadcrumb('division');

    const feats = (dvm.geo.div && dvm.geo.div.features) || [];
    let rows;
    if (!feats.length) {
        rows = Object.keys(DISTRICT_COORDS).map(key => {
            const d = DISTRICT_COORDS[key];
            return { key, level: 'division', nameBn: d.nameBn, emoji: DVM_EMOJI[key], aqiPoint: [d.lat, d.lng], centroid: [d.lat, d.lng], feature: null };
        });
    } else {
        rows = feats.map(feature => {
            const nameEn = dvmProp(feature.properties, 'ADM1_EN', 'name', 'NAME_1');
            const key = dvmDivKey(nameEn);
            const dc = DISTRICT_COORDS[key];
            const centroid = dvmCentroid(feature);
            return {
                key, level: 'division', nameBn: dvmProp(feature.properties, 'ADM1_BN', 'nameBn') || (dc && dc.nameBn) || nameEn,
                emoji: DVM_EMOJI[key] || '📍', aqiPoint: dc ? [dc.lat, dc.lng] : centroid, centroid, feature
            };
        }).filter(r => r.centroid);
    }
    dvmDraw(rows, {
        style: { color: '#7c3aed', weight: 1.2, opacity: 0.55, fillColor: '#a78bfa', fillOpacity: 0.06, dashArray: '3,3' },
        labelOffset: DVM_LABEL_OFFSET.division, boost: 8,
        onPolygonClick: row => dvmDrillDistricts(row)
    });
    dvm.map.fitBounds([[20.6, 88.0], [26.7, 92.7]], { padding: [20, 20] });
}

function dvmDrillDistricts(divRow) {
    if (!dvm.map) return;
    const feats = ((dvm.geo.dist && dvm.geo.dist.features) || []).filter(f =>
        dvmDivKey(dvmProp(f.properties, 'ADM1_EN', 'division')) === divRow.key);
    const pt = divRow.aqiPoint || divRow.centroid;
    if (!feats.length) { dvmShowArea(divRow.nameBn + ' বিভাগ', pt[0], pt[1], divRow); return; }

    dvmClear();
    dvm.level = 'district'; dvm.divisionKey = divRow.key;
    dvmBreadcrumb('district', divRow.nameBn);
    const rows = feats.map(feature => {
        const nameEn = dvmProp(feature.properties, 'ADM2_EN', 'name', 'NAME_2');
        return { key: nameEn.toLowerCase(), level: 'district', nameBn: dvmProp(feature.properties, 'ADM2_BN', 'nameBn') || nameEn, emoji: '📍', centroid: dvmCentroid(feature), feature };
    }).filter(r => r.centroid);
    dvmDraw(rows, {
        style: { color: '#2563eb', weight: 1.5, opacity: 0.75, fillColor: '#60a5fa', fillOpacity: 0.10 },
        labelOffset: DVM_LABEL_OFFSET.district, boost: 0,
        onPolygonClick: row => dvmDrillUpazilas(row)
    });
    dvmFit();
    dvmShowArea(divRow.nameBn + ' বিভাগ', pt[0], pt[1], divRow);
}

async function dvmDrillUpazilas(distRow) {
    if (!dvm.map) return;
    await dvmEnsureUpazilas();
    const feats = ((dvm.geo.upa && dvm.geo.upa.features) || []).filter(f =>
        String(dvmProp(f.properties, 'ADM2_EN', 'district')).toLowerCase() === distRow.key);
    if (!feats.length) { dvmShowArea(distRow.nameBn, distRow.centroid[0], distRow.centroid[1], distRow); return; }

    dvmClear();
    dvm.level = 'upazila';
    dvmBreadcrumb('upazila', distRow.nameBn);
    const rows = feats.map(feature => {
        const nameEn = dvmProp(feature.properties, 'ADM3_EN', 'name', 'NAME_3');
        return { key: nameEn.toLowerCase(), level: 'upazila', nameBn: dvmProp(feature.properties, 'ADM3_BN', 'nameBn') || nameEn, emoji: '📍', centroid: dvmCentroid(feature), feature };
    }).filter(r => r.centroid);
    dvmDraw(rows, {
        style: { color: '#0891b2', weight: 1, opacity: 0.65, fillColor: '#22d3ee', fillOpacity: 0.08 },
        labelOffset: DVM_LABEL_OFFSET.upazila, boost: 0,
        onPolygonClick: row => dvmShowArea(row.nameBn, row.centroid[0], row.centroid[1], row)
    });
    dvmFit();
    dvmShowArea(distRow.nameBn, distRow.centroid[0], distRow.centroid[1], distRow);
}

window.__dvmDrill = function (idx) {
    const row = dvm.rows[idx];
    if (!row || !dvm.map) return;
    dvm.map.closePopup();
    if (dvm.level === 'division') dvmDrillDistricts(row);
    else if (dvm.level === 'district') dvmDrillUpazilas(row);
};
window.__dvmBack = function () {
    dvmRenderDivisions();
    window.__dvmCloseResult();
};
window.__dvmCloseResult = function () {
    const r = _el('dvmResult');
    if (r) {
        if (dvmMode === 'forage' && lastParameter) {
            renderForage(lastParameter);
        } else if (dvmMode === 'thi' && lastParameter) {
            renderTHI(lastParameter);
        } else if (dvmMode === 'outbreak' && lastParameter) {
            renderOutbreak(lastParameter, lastSedac);
        } else {
            r.innerHTML = '';
        }
    }
    dvm.lastArea = null;
};
function dvmBreadcrumb(level, name) {
    const bc = _el('dvmBreadcrumb'), back = _el('dvmBack');
    if (!bc) return;
    if (level === 'division') {
        bc.innerHTML = '<b>বাংলাদেশ</b>';
        if (back) back.style.display = 'none';
        return;
    }
    if (back) back.style.display = 'inline-block';
    bc.innerHTML = `<span class="lnk" onclick="window.__dvmBack()">বাংলাদেশ</span> › <b>${escapeHtml(name || '')}</b>`;
}

/* ---------- area panel: all the information for one place ---------- */
function dvmOpt(fn) {
    try { return Promise.resolve(fn()).catch(() => null); }
    catch (_) { return Promise.resolve(null); }
}
async function dvmShowArea(placeName, lat, lng, row) {
    const box = _el('dvmResult');
    if (!box) return;
    if (dvmMode === 'forage') return dvfShowArea(placeName, lat, lng, row);
    if (dvmMode === 'outbreak') return dvoShowArea(placeName, lat, lng, row);
    dvm.lastArea = { placeName, lat, lng, row };
    const tok = ++dvm.areaTok;
    box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-spinner fa-spin"></i><span>${escapeHtml(placeName)} এর ডেটা লোড হচ্ছে...</span></div>`;
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}

    const om = window.OpenMeteo;
    const [d, fc, aqi, week] = await Promise.all([
        dvmPointData(lat, lng),
        om ? dvmOpt(() => om.getTomorrow(lat, lng)) : null,
        om ? dvmOpt(() => om.getAQI(lat, lng)) : null,
        om ? dvmOpt(() => om.getWeek(lat, lng)) : null
    ]);
    if (tok !== dvm.areaTok) return;
    if (!d) {
        box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i><span>${escapeHtml(placeName)} এর NASA ডেটা পাওয়া যায়নি</span></div>`;
        return;
    }

    const tomorrowThi = fc && Number.isFinite(fc.tempMean) && Number.isFinite(fc.humidity)
        ? NasaClimate.calculateTHI(fc.tempMean, fc.humidity) : null;

    const todayW = week && week[0];
    const aqiObj = (aqi && Number.isFinite(aqi.usAqi) && om) ? om.classifyAQI(aqi.usAqi) : null;
    const uvObj = (todayW && Number.isFinite(todayW.uvIndexMax) && om) ? om.classifyUV(todayW.uvIndexMax) : null;
    const airInfo = {
        aqi: aqi && Number.isFinite(aqi.usAqi) ? aqi.usAqi : null,
        aqiColor: aqiObj ? aqiObj.color : '#059669',
        aqiLabel: aqiObj ? aqiObj.label : '',
        uv: todayW && Number.isFinite(todayW.uvIndexMax) ? todayW.uvIndexMax : null,
        uvColor: uvObj ? uvObj.color : '#d97706',
        uvLabel: uvObj ? uvObj.label : '',
        wind: todayW && Number.isFinite(todayW.windMax) ? todayW.windMax : null
    };

    /* parent division → economic impact */
    const divKey = (row && row.level === 'division') ? row.key : (dvm.divisionKey || dvmDivisionAt(lat, lng));
    let economicHtml = '';
    if (divKey && DISTRICT_COORDS[divKey] && window.NasaSedac) {
        try {
            const dc = DISTRICT_COORDS[divKey];
            const [dd, sedac] = await Promise.all([dvmPointData(dc.lat, dc.lng), NasaSedac.fetchSedacData(divKey)]);
            if (dd && sedac && sedac.livestock) {
                const m = computeImpactModel(sedac, dd.thi);
                const body = m.episodeTotal === 0
                    ? `<div class="dvi-ok">✅ এখন ${escapeHtml(dc.nameBn)} বিভাগে তিন প্রজাতিই স্বাভাবিক স্তরে, তাই তাপ-জনিত ক্ষতি ধরা হয়নি।</div>`
                    : `<div class="dvi-card">
                        <div class="dvi-row"><span>🥛 দুধ কমা</span><b>${fmtTk(m.milkLoss)}/দিন</b></div>
                        <div class="dvi-row"><span>🥚 ডিম কমা</span><b>${fmtTk(m.eggLoss)}/দিন</b></div>
                        <div class="dvi-row"><span>⚠️ মৃত্যু+চিকিৎসা (${IMPACT_CFG.episodeDays} দিনে)</span><b>${fmtTk(m.deathTotal)}</b></div>
                      </div>
                      <div class="dvi-total"><div class="dvi-sub">${IMPACT_CFG.episodeDays} দিনের আনুমানিক মোট ক্ষতি</div><div class="big">${fmtTk(m.episodeTotal)}</div><div class="dvi-sub">পরিসর: ${fmtRange(m.episodeTotal)}</div></div>`;
                economicHtml = `
                    <div class="dvf-block">
                        <div class="dvf-block-title">
                            <i class="fas fa-coins text-amber-600"></i>
                            <span>💰 ${escapeHtml(dc.nameBn)} বিভাগের আর্থিক প্রভাব</span>
                        </div>
                        ${body}
                    </div>`;
            }
        } catch (err) { console.warn('[Map] impact unavailable:', err.message); }
        if (tok !== dvm.areaTok) return;
    }

    box.innerHTML = renderThiCardHtml({
        placeName,
        isDivision: false,
        thiVal: d.thi,
        yesterdayVal: d.yesterdayThi,
        tomorrowVal: tomorrowThi,
        tomorrowSource: 'Open-Meteo লাইভ পূর্বাভাস',
        tempVal: d.temp,
        rhVal: d.rh,
        rainVal: d.rain,
        dataDate: d.date,
        ageDays: NasaPower.ageDays(d.date),
        spId: currentSpecies,
        airInfo,
        last7: d.series ? d.series.slice(-7) : [],
        economicHtml
    });
}

/* ---------- search (LocationIQ, Open-Meteo geocoding fallback) ---------- */
async function dvmFallbackSearch(query) {
    try {
        const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) + '&country=BD&count=8&language=bn';
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return (data.results || []).map(r => ({
            name: r.name, sub: [r.admin1, r.admin2].filter(Boolean).join(', '), lat: r.latitude, lng: r.longitude
        }));
    } catch (err) {
        console.warn('[Map] Fallback search failed:', err.message);
        return [];
    }
}
async function dvmSearch(query) {
    if (!query || query.length < 2) return [];
    if (dvm.searchAbort) dvm.searchAbort.abort();
    dvm.searchAbort = new AbortController();
    try {
        const url = 'https://api.locationiq.com/v1/autocomplete?key=' + LOCATIONIQ_KEY +
            '&q=' + encodeURIComponent(query) + '&countrycodes=bd&limit=8&dedupe=1&normalizecity=1&accept-language=bn';
        const res = await fetch(url, { signal: dvm.searchAbort.signal });
        if (res.status === 404) return [];
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map(r => {
            const full = String(r.display_name || '');
            return {
                name: r.display_place || (r.address && r.address.name) || full.split(',')[0],
                sub: r.display_address || full, lat: parseFloat(r.lat), lng: parseFloat(r.lon)
            };
        }).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
    } catch (err) {
        if (err.name === 'AbortError') return null;       /* superseded by a newer keystroke */
        console.warn('[Map] LocationIQ failed, using fallback:', err.message);
        return dvmFallbackSearch(query);
    }
}
function dvmRenderSearch(results) {
    const dd = _el('dvmSearchResults');
    if (!dd) return;
    if (!results || !results.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = results.map(r =>
        `<div class="dvm-item" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${escapeHtml(r.name)}">
            <div>📍</div><div><div class="dvm-item-name">${escapeHtml(r.name)}</div><div class="dvm-item-sub">${escapeHtml(r.sub || '')}</div></div>
        </div>`).join('') +
        '<div style="padding:4px 12px;font-size:10px;color:#94a3b8;text-align:right;">Search by LocationIQ.com</div>';
    dd.querySelectorAll('.dvm-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat), lng = parseFloat(item.dataset.lng), name = item.dataset.name;
            const input = _el('dvmSearchInput');
            if (input) input.value = name;
            if (dvm.map) {
                dvm.map.flyTo([lat, lng], 10, { duration: 1 });
                if (dvm.searchPin) { try { dvm.map.removeLayer(dvm.searchPin); } catch (_) {} }
                dvm.searchPin = L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#7c3aed', fillOpacity: 1 }).addTo(dvm.map);
            }
            dvmShowArea(name, lat, lng, null);
            dd.style.display = 'none';
        });
    });
}
function dvmInitSearch() {
    const input = _el('dvmSearchInput');
    if (!input) return;
    input.addEventListener('input', e => {
        const q = e.target.value.trim();
        clearTimeout(window.__dvmSearchTimeout);
        if (q.length < 2) { const dd = _el('dvmSearchResults'); if (dd) dd.style.display = 'none'; return; }
        window.__dvmSearchTimeout = setTimeout(async () => {
            const results = await dvmSearch(q);
            if (results === null) return;
            dvmRenderSearch(results);
        }, 350);
    });
    document.addEventListener('click', e => {
        const dd = _el('dvmSearchResults');
        if (dd && !dd.contains(e.target) && e.target !== input) dd.style.display = 'none';
    });
}

/* ---------- legend, species/district hooks, init ---------- */
function dvmRenderLegend() {
    if (dvmMode === 'forage') return dvfRenderLegend();
    if (dvmMode === 'outbreak') return dvoRenderLegend();
    const el = _el('dvmLegend');
    if (!el) return;
    const T = NasaClimate.THI_THRESHOLDS[currentSpecies] || NasaClimate.THI_THRESHOLDS.default;
    const item = (l, txt) => `<span><i style="background:${LEVEL_BN[l].c};"></i>${LEVEL_BN[l].t} ${txt}</span>`;
    el.innerHTML = `<b>${escapeHtml(T.label || '')}:</b> ` +
        item('normal', `&lt;${T.mild}`) + item('mild', `${T.mild}–${T.moderate}`) +
        item('moderate', `${T.moderate}–${T.severe}`) + item('severe', `≥${T.severe}`) +
        `<span class="dvi-sub">(বৃত্তের সংখ্যা = THI; পশু বদলালে রং বদলায়)</span>`;
}
function dvmOnSpeciesChange() {
    if (!dvm.ready) return;
    dvmRenderLegend();
    dvmRefreshBubbles();
    if (dvm.lastArea) {
        const a = dvm.lastArea;
        dvmShowArea(a.placeName, a.lat, a.lng, a.row);
    }
}
function dvmFocusDivision(key) {
    if (!dvm.ready || !dvm.map || !DISTRICT_COORDS[key]) return;
    if (dvm.level !== 'division') dvmRenderDivisions();
    const c = DISTRICT_COORDS[key];
    dvm.map.flyTo([c.lat, c.lng], 8, { duration: 0.8 });
}

async function dvmInit() {
    const container = document.querySelector('.climate-feature-container');
    if (!container || _el('dvmSection')) return;
    dvmMode = FEATURE === 'forage' ? 'forage' : FEATURE === 'outbreak' ? 'outbreak' : 'thi';
    ensureMapStyles();
    ensureImpactStyles();
    if (dvmMode !== 'thi') ensureForageMapStyles();      /* ranking styles are shared */
    if (dvmMode === 'outbreak') ensureOutbreakMapStyles();

    const sec = document.createElement('div');
    sec.id = 'dvmSection';
    sec.className = 'dvm-section dvf-section-premium' + (dvmMode === 'thi' ? ' dvm-sec-thi' : dvmMode === 'outbreak' ? ' dvm-sec-outbreak' : '');

    const headerBadge = dvmMode === 'forage'
        ? `<div class="dvm-header-badge" style="background:linear-gradient(135deg,#059669,#047857);box-shadow:0 6px 16px rgba(5,150,105,0.22);"><i class="fas fa-seedling"></i></div>`
        : dvmMode === 'outbreak'
        ? `<div class="dvm-header-badge" style="background:linear-gradient(135deg,#dc2626,#991b1b);box-shadow:0 6px 16px rgba(220,38,38,0.22);"><i class="fas fa-biohazard"></i></div>`
        : `<div class="dvm-header-badge" style="background:linear-gradient(135deg,#d97706,#b45309);box-shadow:0 6px 16px rgba(217,119,6,0.22);"><i class="fas fa-temperature-high"></i></div>`;

    const headerTitle = dvmMode === 'forage'
        ? 'এলাকা ও বিভাগ ভিত্তিক ঘাস, মাটি ও পশুপালন মানচিত্র'
        : dvmMode === 'outbreak'
        ? 'এলাকা ভিত্তিক রোগ ঝুঁকির মানচিত্র'
        : 'এলাকা ভিত্তিক তাপ-স্ট্রেস মানচিত্র';

    const headerTag = dvmMode === 'forage'
        ? `<span class="dvm-source-tag"><i class="fas fa-satellite"></i> NASA SMAP &bull; 10km Hydrology</span>`
        : dvmMode === 'outbreak'
        ? `<span class="dvm-source-tag" style="color:#b91c1c;background:#fef2f2;border-color:#fecaca;"><i class="fas fa-satellite"></i> NASA GPM &bull; Precipitation</span>`
        : `<span class="dvm-source-tag" style="color:#b45309;background:#fffbeb;border-color:#fde68a;"><i class="fas fa-satellite"></i> NASA POWER &bull; THI Telemetry</span>`;

    const headerSub = dvmMode === 'forage'
        ? 'বিভাগ নির্বাচন করুন, উপজেলা খুঁজুন অথবা আপনার অবস্থান (GPS) ব্যবহার করে লাইভ মাটির আর্দ্রতা ও উপযোগী ঘাসের তথ্য দেখুন।'
        : dvmMode === 'outbreak'
        ? 'বৃষ্টিপাত ও ভেক্টর সূচকের ভিত্তিতে রোগ বিস্তারের রিয়েল-টাইম ভৌগোলিক মানচিত্র।'
        : 'বিভাগ → জেলা → উপজেলা চাপুন, অথবা যেকোনো জায়গা খুঁজুন।';

    const divSelectorHtml = `
        <div class="dvf-toolbar-item dvf-div-box ${dvmMode === 'thi' ? 'dvm-div-thi' : dvmMode === 'outbreak' ? 'dvm-div-outbreak' : ''}">
            <label for="climateDistrict" class="dvf-toolbar-lbl">
                <i class="fas fa-earth-asia ${dvmMode === 'thi' ? 'text-amber-600' : dvmMode === 'outbreak' ? 'text-rose-600' : 'text-emerald-600'}"></i>
                <span>বিভাগ:</span>
            </label>
            <div class="dvf-select-wrap">
                <select id="climateDistrict" class="dvf-select">
                    <option value="dhaka" ${currentDistrict === 'dhaka' ? 'selected' : ''}>ঢাকা বিভাগ</option>
                    <option value="chittagong" ${currentDistrict === 'chittagong' ? 'selected' : ''}>চট্টগ্রাম বিভাগ</option>
                    <option value="rajshahi" ${currentDistrict === 'rajshahi' ? 'selected' : ''}>রাজশাহী বিভাগ</option>
                    <option value="khulna" ${currentDistrict === 'khulna' ? 'selected' : ''}>খুলনা বিভাগ</option>
                    <option value="barisal" ${currentDistrict === 'barisal' ? 'selected' : ''}>বরিশাল বিভাগ</option>
                    <option value="sylhet" ${currentDistrict === 'sylhet' ? 'selected' : ''}>সিলেট বিভাগ</option>
                    <option value="rangpur" ${currentDistrict === 'rangpur' ? 'selected' : ''}>রংপুর বিভাগ</option>
                    <option value="mymensingh" ${currentDistrict === 'mymensingh' ? 'selected' : ''}>ময়মনসিংহ বিভাগ</option>
                </select>
                <i class="fas fa-chevron-down dvf-select-arrow ${dvmMode === 'thi' ? 'text-amber-600' : dvmMode === 'outbreak' ? 'text-rose-600' : ''}"></i>
            </div>
        </div>`;

    const speciesSelectorHtml = dvmMode === 'thi' ? `
        <div class="dvf-toolbar-item dvf-div-box dvm-div-thi">
            <label for="thiSpecies" class="dvf-toolbar-lbl">
                <i class="fas fa-paw text-amber-600"></i>
                <span>পশু:</span>
            </label>
            <div class="dvf-select-wrap">
                <select id="thiSpecies" class="dvf-select">
                    <option value="cow" ${currentSpecies === 'cow' ? 'selected' : ''}>🐄 গরু</option>
                    <option value="buffalo" ${currentSpecies === 'buffalo' ? 'selected' : ''}>🐃 মহিষ</option>
                    <option value="goat" ${currentSpecies === 'goat' ? 'selected' : ''}>🐐 ছাগল</option>
                    <option value="sheep" ${currentSpecies === 'sheep' ? 'selected' : ''}>🐑 ভেড়া</option>
                    <option value="chicken" ${currentSpecies === 'chicken' ? 'selected' : ''}>🐔 মুরগি</option>
                    <option value="duck" ${currentSpecies === 'duck' ? 'selected' : ''}>🦆 হাঁস</option>
                    <option value="dog" ${currentSpecies === 'dog' ? 'selected' : ''}>🐕 কুকুর</option>
                    <option value="cat" ${currentSpecies === 'cat' ? 'selected' : ''}>🐈 বিড়াল</option>
                </select>
                <i class="fas fa-chevron-down dvf-select-arrow text-amber-600"></i>
            </div>
        </div>` : '';

    const toolbarHtml = `
        <div class="dvf-toolbar ${dvmMode === 'thi' ? 'dvm-toolbar-thi' : dvmMode === 'outbreak' ? 'dvm-toolbar-outbreak' : ''}">
            ${divSelectorHtml}
            ${speciesSelectorHtml}
            <div class="dvf-toolbar-item dvf-search-wrap">
                <i class="fas fa-search dvm-search-icon"></i>
                <input id="dvmSearchInput" type="search" autocomplete="off" placeholder="উপজেলা বা জেলা খুঁজুন (যেমন: সাভার, শেরপুর, বগুড়া)...">
                <div id="dvmSearchResults" class="dvm-dd"></div>
            </div>
            <button type="button" id="dvmGpsBtn" class="dvf-gps-btn ${dvmMode === 'thi' ? 'dvm-gps-thi' : dvmMode === 'outbreak' ? 'dvm-gps-outbreak' : ''}" onclick="window.__dvmUseMyLocation()" title="আমার বর্তমান অবস্থান শনাক্ত করুন">
                <i class="fas fa-location-crosshairs"></i>
                <span>আমার অবস্থান</span>
            </button>
        </div>`;

    sec.innerHTML = `
        <div class="dvm-header-panel">
            ${headerBadge}
            <div class="dvm-header-text">
                <div class="dvm-header-title-row">
                    <h2 class="dvm-header-title">${headerTitle}</h2>
                    ${headerTag}
                </div>
                <p class="dvm-header-subtitle">${headerSub}</p>
            </div>
        </div>
        ${dvmMode === 'forage' ? dvfLayerChipsHtml() : ''}
        ${toolbarHtml}
        <div class="dvm-bc"><button id="dvmBack" onclick="window.__dvmBack()"><i class="fas fa-arrow-left"></i> পূর্বের ধাপে ফিরুন</button><span id="dvmBreadcrumb"></span></div>
        <div id="dvmMap" class="dvm-map"></div>
        <div id="dvmLegend" class="dvm-legend"></div>
        <div id="dvmResult"></div>`;

    const root = _el('forageAppRoot') || _el('thiAppRoot') || _el('outbreakAppRoot');
    if (root) root.appendChild(sec);
    else {
        const anchor = container.querySelector(dvmMode === 'forage' ? '.forage-section' : dvmMode === 'outbreak' ? '.outbreak-section' : '.thi-section');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor.nextSibling);
        else {
            const guide = container.querySelector('.agronomic-guidelines') || container.querySelector('.p-4\\.5');
            if (guide && guide.parentNode) guide.parentNode.insertBefore(sec, guide);
            else container.appendChild(sec);
        }
    }

    dvmInitSearch();
    if (typeof bindDistrictSelector === 'function') {
        bindDistrictSelector();
    }
    const [ok] = await Promise.all([dvmEnsureLeaflet(), dvmLoadGeo()]);
    if (!ok) {
        const m = _el('dvmMap');
        if (m) m.innerHTML = '<div class="climate-empty"><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i><span>মানচিত্র লোড হয়নি (Leaflet পাওয়া যায়নি)। সার্চ ব্যবহার করা যাবে।</span></div>';
        return;
    }
    dvmInitMap();
    dvm.ready = true;
    dvmRenderLegend();
    dvmRenderDivisions();
}

/* ============================================================
   FORAGE AREA MAP  (forage page: which area is best for grass / soil / rearing)
   Re-uses the dvm* map above (Division → District → Upazila, search, panel).
   Three layers (bubble number + colour change with the layer):
     🌱 grass  : forage-growth score   = soil-moisture score × (0.6 + 0.4 × temperature factor)
     🪨 soil   : surface soil moisture (NASA GWETTOP) classified dry / optimal / waterlogged
     🐄 rear   : rearing score         = 40% grass + 35% heat comfort (cow THI) + 25% water/drainage
   Scores are rule-based planning estimates, not measurements. Soil fertility (pH, organic
   matter) is NOT included — only moisture. Everything is prefixed dvf*.
   ============================================================ */
const DVF_LAYERS = {
    grass: { icon: '🌱', label: 'ঘাস ও খাদ্য উৎপাদন', sub: 'Forage Biomass Score', rankTitle: '🌱 ঘাস ও খাদ্য উৎপাদনের জন্য সেরা এলাকা' },
    soil:  { icon: '🪨', label: 'মাটির আর্দ্রতা',       sub: 'SMAP Surface & Root', rankTitle: '🪨 মাটির আর্দ্রতা সবচেয়ে ভালো যেসব এলাকায়' },
    rear:  { icon: '🐄', label: 'পশুপালন পরিবেশ',      sub: 'Rearing Suitability',  rankTitle: '🐄 গবাদি পশু পালনের জন্য সেরা এলাকা' }
};
const DVF_BANDS = [
    { min: 75, c: '#059669', t: 'অতি উপযুক্ত' },
    { min: 55, c: '#65a30d', t: 'ভালো' },
    { min: 35, c: '#d97706', t: 'মোটামুটি' },
    { min: 0,  c: '#dc2626', t: 'ঝুঁকিপূর্ণ' }
];
const dvfBand = v => DVF_BANDS.find(b => v >= b.min) || DVF_BANDS[DVF_BANDS.length - 1];

function ensureForageMapStyles() {
    if (_el('dvfStyles')) return;
    const st = document.createElement('style');
    st.id = 'dvfStyles';
    st.textContent = `
.dvf-rank{display:none !important;}
`;
    document.head.appendChild(st);
}

function dvfLayerChipsHtml() {
    return `
        <div class="dvf-layers-wrap">
            <div class="dvf-layers-label"><i class="fas fa-layer-group text-emerald-600"></i> মানচিত্র লেয়ার নির্বাচন:</div>
            <div class="dvf-layers" id="dvfLayers">
                ${Object.keys(DVF_LAYERS).map(k => `
                    <button type="button" class="dvf-chip ${k === dvmLayer ? 'on' : ''}" data-layer="${k}" onclick="window.__dvfLayer('${k}')">
                        <span class="dvf-chip-icon">${DVF_LAYERS[k].icon}</span>
                        <span class="dvf-chip-info">
                            <span class="dvf-chip-title">${DVF_LAYERS[k].label}</span>
                            <span class="dvf-chip-sub">${DVF_LAYERS[k].sub || ''}</span>
                        </span>
                    </button>
                `).join('')}
            </div>
        </div>`;
}

/* ---------- scoring ---------- */
/* moisture m (0-1) -> 0..100 : too dry rises 0→100 between 0.05 and 0.30, optimal 0.30-0.65, waterlogging falls */
function dvfMoistScore(m) {
    if (m <= 0.05) return 0;
    if (m < 0.30) return Math.round((m - 0.05) / 0.25 * 100);
    if (m <= 0.65) return 100;
    if (m <= 0.90) return Math.round(100 - (m - 0.65) / 0.25 * 80);
    return 20;
}
/* tropical forage grows best 25-35 °C */
function dvfTempFactor(t) {
    if (!Number.isFinite(t)) return 0.7;
    if (t < 10) return 0.2;
    if (t < 20) return 0.2 + (t - 10) / 10 * 0.6;
    if (t < 25) return 0.8 + (t - 20) / 5 * 0.2;
    if (t <= 35) return 1;
    if (t < 40) return 1 - (t - 35) / 5 * 0.4;
    return 0.4;
}
function dvfEval(d, divKey) {
    if (!d || !Number.isFinite(d.soil)) return null;
    const top = d.soil;
    const root = Number.isFinite(d.root) ? d.root : null;
    const m = root != null ? (top + root) / 2 : top;
    const soilScore = dvfMoistScore(m);
    const grass = Math.round(soilScore * (0.6 + 0.4 * dvfTempFactor(d.temp)));
    const cls = NasaClimate.classifySoilMoisture(top);
    const heatLv = NasaClimate.classifyTHI(d.thi, 'cow');
    const heat = ({ normal: 100, mild: 70, moderate: 40, severe: 10 })[heatLv.level];
    const water = m < 0.15 ? 30 : m < 0.30 ? 70 : m <= 0.65 ? 100 : m <= 0.80 ? 60 : 25;
    let rear = 0.4 * grass + 0.35 * (heat == null ? 50 : heat) + 0.25 * water;
    if (Number.isFinite(d.rain) && d.rain >= 50) rear -= 10;     /* very heavy rain → flood / mud risk */
    rear = Math.max(0, Math.min(100, Math.round(rear)));
    const rec = NasaClimate.recommendForageDetailed(cls.level, new Date().getMonth() + 1, top, divKey);
    const trend = NasaClimate.classifySoilTrend(d.soilSeries || []);
    return { top, root, m, soilScore, grass, rear, heat, water, heatLv, cls, rec, trend };
}
function dvfEvOf(row) {
    if (!row || !row.data) return null;
    if (row._evFor !== row.data) {
        const pt = row.aqiPoint || row.centroid;
        const dk = row.level === 'division' ? row.key : (dvm.divisionKey || dvmDivisionAt(pt[0], pt[1]));
        row._ev = dvfEval(row.data, dk);
        row._evFor = row.data;
    }
    return row._ev;
}
/* what the bubble shows for the active layer */
function dvfState(row) {
    const ev = dvfEvOf(row);
    if (!ev) return { val: null, text: row.loading ? '…' : '—', color: '#94a3b8', label: row.loading ? 'লোড হচ্ছে' : 'ডেটা নেই', ev: null };
    if (dvmLayer === 'soil') return { val: ev.soilScore, text: Math.round(ev.top * 100) + '%', color: ev.cls.color, label: ev.cls.labelBn, ev };
    const v = dvmLayer === 'rear' ? ev.rear : ev.grass;
    const b = dvfBand(v);
    return { val: v, text: v + '%', color: b.c, label: b.t, ev };
}

/* ---------- bubbles / popup ---------- */
function dvfIcon(row, boost) {
    const st = dvfState(row);
    const size = Math.round(DVM_BUBBLE_BASE + (DVM_BUBBLE_MAX - DVM_BUBBLE_BASE) * ((st.val || 0) / 100)) + boost;
    const fs = Math.max(9, Math.min(14, size / 2.8));
    return L.divIcon({
        html: `<div class="dvm-bubble${row.loading ? ' load' : ''}" style="width:${size}px;height:${size}px;background:${st.color};font-size:${fs}px;"><span>${escapeHtml(st.text)}</span></div>`,
        className: 'dvm-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2]
    });
}
function dvfPopup(row) {
    const st = dvfState(row);
    const g = st.ev && st.ev.rec.recommended[0];
    return `
        <div class="dvf-modern-pop">
            <div class="dvf-pop-title">${escapeHtml(row.emoji || '📍')} ${escapeHtml(row.nameBn)}</div>
            <div class="dvf-pop-metric">
                <span class="dvf-pop-layer">${DVF_LAYERS[dvmLayer].icon} ${DVF_LAYERS[dvmLayer].label}</span>
                <span class="dvf-pop-val" style="color:${st.color};">${escapeHtml(st.text)} (${escapeHtml(st.label)})</span>
            </div>
            ${g ? `<div class="dvf-pop-grass">🌱 সেরা ঘাস: <strong>${escapeHtml(g.name)}</strong></div>` : ''}
            ${row.level !== 'upazila' && row.feature
                ? `<button class="dvf-pop-btn" onclick="window.__dvmDrill(${row.idx})"><i class="fas fa-chevron-right"></i> আরও গভীরে দেখুন</button>` : ''}
        </div>`;
}

/* ---------- legend ---------- */
function dvfRenderLegend() {
    const el = _el('dvmLegend');
    if (!el) return;
    const dot = (c, txt) => `<span><i style="background:${c};"></i>${txt}</span>`;
    if (dvmLayer === 'soil') {
        el.innerHTML = '<b>মাটির আর্দ্রতা:</b> ' +
            dot('#dc2626', 'খরা &lt;১৫%') + dot('#d97706', 'শুষ্ক ১৫–৩০%') +
            dot('#059669', 'উপযুক্ত ৩০–৬৫%') + dot('#2563eb', 'জলাবদ্ধ &gt;৬৫%') +
            '<span class="dvi-sub">(বৃত্তের সংখ্যা = উপরের মাটির আর্দ্রতা)</span>';
    } else {
        el.innerHTML = `<b>${DVF_LAYERS[dvmLayer].label}:</b> ` +
            dot(DVF_BANDS[0].c, 'অতি উপযুক্ত ৭৫%+') + dot(DVF_BANDS[1].c, 'ভালো ৫৫–৭৫%') +
            dot(DVF_BANDS[2].c, 'মোটামুটি ৩৫–৫৫%') + dot(DVF_BANDS[3].c, 'ঝুঁকিপূর্ণ &lt;৩৫%') +
            '<span class="dvi-sub">(বৃত্তের সংখ্যা = উপযুক্ততার স্কোর)</span>';
    }
}

/* ---------- ranking under the map (disabled/hidden in forage) ---------- */
function dvfRenderRanking() {
    const box = _el('dvfRank');
    if (box) {
        box.innerHTML = '';
        box.style.display = 'none';
    }
}

window.__dvfLayer = function (layer) {
    if (!DVF_LAYERS[layer]) return;
    dvmLayer = layer;
    document.querySelectorAll('#dvfLayers .dvf-chip').forEach(b => b.classList.toggle('on', b.dataset.layer === layer));
    if (!dvm.ready) return;
    dvfRenderLegend();
    dvmRefreshBubbles();
    if (dvm.lastArea) {
        const a = dvm.lastArea;
        dvfShowArea(a.placeName, a.lat, a.lng, a.row);
    }
};
window.__dvfPick = function (idx) {
    const row = dvm.rows[idx];
    if (!row || !dvm.map) return;
    const pt = row.aqiPoint || row.centroid;
    dvmShowArea(row.nameBn + (row.level === 'division' ? ' বিভাগ' : ''), pt[0], pt[1], row);
    try { dvm.map.panTo(row.centroid); const m = dvm.markers.get(row.key); if (m) m.openPopup(); } catch (_) {}
};

window.__dvmUseMyLocation = function () {
    if (!navigator.geolocation) {
        alert('আপনার ব্রাউজারে লোকেশন (GPS) সুবিধা সমর্থিত নয়।');
        return;
    }
    const btn = _el('dvmGpsBtn') || _el('dvfGpsBtn');
    if (btn) {
        btn.classList.add('loading');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>অবস্থান খোঁজা হচ্ছে...</span>';
    }

    navigator.geolocation.getCurrentPosition(
        async position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Check if within/near Bangladesh bounds
            const inBd = (lat >= 20.0 && lat <= 27.0 && lng >= 87.5 && lng <= 93.0);
            if (!inBd) {
                if (btn) {
                    btn.classList.remove('loading');
                    btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> <span>আমার অবস্থান</span>';
                }
                alert('আপনার শনাক্তকৃত অবস্থান (' + lat.toFixed(2) + ', ' + lng.toFixed(2) + ') বাংলাদেশের ভৌগোলিক সীমানার বাইরে।');
                return;
            }

            // Find closest area / upazila / district from dvm.rows
            let closest = null;
            let minDist = Infinity;
            if (dvm.rows && dvm.rows.length) {
                for (const row of dvm.rows) {
                    const pt = row.aqiPoint || row.centroid;
                    if (!pt) continue;
                    const dLat = pt[0] - lat;
                    const dLng = pt[1] - lng;
                    const dist = dLat * dLat + dLng * dLng;
                    if (dist < minDist) {
                        minDist = dist;
                        closest = row;
                    }
                }
            }

            const placeName = closest ? `${closest.nameBn} (আমার অবস্থান)` : 'আমার বর্তমান অবস্থান';

            if (btn) {
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-location-dot"></i> <span>' + (closest ? closest.nameBn : 'আমার অবস্থান') + '</span>';
            }

            if (dvm.map) {
                try {
                    dvm.map.setView([lat, lng], 11);
                    if (dvm._userMarker) {
                        try { dvm.map.removeLayer(dvm._userMarker); } catch (_) {}
                    }
                    const pulseColor = dvmMode === 'thi' ? '#f59e0b' : dvmMode === 'outbreak' ? '#dc2626' : '#059669';
                    const gpsIcon = L.divIcon({
                        html: `<div class="dvf-gps-marker"><div class="dvf-gps-dot" style="background:${pulseColor};"></div><div class="dvf-gps-pulse" style="background:${pulseColor}70;"></div></div>`,
                        className: 'dvf-gps-marker-wrap',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    });
                    dvm._userMarker = L.marker([lat, lng], { icon: gpsIcon }).addTo(dvm.map);
                    dvm._userMarker.bindPopup(`<b>📍 আপনার অবস্থান</b><br>${placeName}`).openPopup();
                } catch (_) {}
            }

            if (dvmMode === 'forage') {
                await dvfShowArea(placeName, lat, lng, closest);
            } else if (dvmMode === 'outbreak') {
                await dvoShowArea(placeName, lat, lng, closest);
            } else {
                await dvmShowArea(placeName, lat, lng, closest);
            }
        },
        error => {
            if (btn) {
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-location-crosshairs"></i> <span>আমার অবস্থান</span>';
            }
            let msg = 'লোকেশন শনাক্ত করা সম্ভব হয়নি।';
            if (error.code === 1) msg = 'লোকেশন পারমিশন পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজারে লোকেশন অ্যাক্সেস অন করুন।';
            else if (error.code === 2) msg = 'ডিভাইসের জিপিএস সংকেত পাওয়া যায়নি।';
            else if (error.code === 3) msg = 'লোকেশন অনুসন্ধানের সময় শেষ হয়ে গেছে।';
            alert(msg);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
};
window.__dvfUseMyLocation = window.__dvmUseMyLocation;

/* ---------- area panel ---------- */
async function dvfShowArea(placeName, lat, lng, row) {
    const box = _el('dvmResult');
    if (!box) return;
    dvm.lastArea = { placeName, lat, lng, row };
    const tok = ++dvm.areaTok;
    box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-spinner fa-spin text-emerald-600"></i><span>${escapeHtml(placeName)} এর স্যাটেলাইট ডেটা বিশ্লেষণ করা হচ্ছে...</span></div>`;
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}

    const om = window.OpenMeteo;
    const [d, week] = await Promise.all([
        dvmPointData(lat, lng),
        om ? dvmOpt(() => om.getWeek(lat, lng)) : null
    ]);
    if (tok !== dvm.areaTok) return;
    const divKey = (row && row.level === 'division') ? row.key : (dvm.divisionKey || dvmDivisionAt(lat, lng));
    const ev = dvfEval(d, divKey);
    if (!ev) {
        box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i><span>${escapeHtml(placeName)} এর মাটির NASA ডেটা পাওয়া যায়নি</span></div>`;
        return;
    }

    const gb = dvfBand(ev.grass), rb = dvfBand(ev.rear);
    const rec = ev.rec;
    const allOptions = NasaClimate.compareForageOptions(ev.cls.level);

    /* rain forecast (Open-Meteo, next 7 days) */
    let rain7 = null;
    if (Array.isArray(week)) {
        const vals = week.map(x => x && x.precipitation).filter(Number.isFinite);
        if (vals.length) rain7 = vals.reduce((a, b) => a + b, 0);
    }

    const heatColor = ev.heatLv.color || '#64748b';
    const heatVal = ev.heat == null ? 50 : ev.heat;
    const waterColor = dvfBand(ev.water).c;
    const age = NasaPower.ageDays(d.date);

    const notes = [];
    if (ev.cls.level === 'wet') notes.push({ icon: '💧', text: 'মাটি অতিরিক্ত জলাবদ্ধ — খুর পচা ও পরজীবীর ঝুঁকি রয়েছে। গবাদি পশুকে উঁচু, শুষ্ক স্থানে রাখুন এবং নিষ্কাশন নালা সচল রাখুন।' });
    else if (ev.cls.level === 'drought') notes.push({ icon: '🏜️', text: 'মাটি অতিমাত্রায় শুষ্ক (খরা পরিস্থিতি) — ঘাস ও পানীয় জলের সংকট দেখা দিতে পারে। সাইলেজ বা শুকনো খড় মজুত রাখুন এবং পর্যাপ্ত সেচ দিন।' });
    else if (ev.cls.level === 'dry') notes.push({ icon: '☀️', text: 'মাটিতে পরিমিত আর্দ্রতার অভাব — মালচিং বা হালকা সেচ ছাড়া ঘাসের আশানুরূপ ফলন ব্যাহত হতে পারে।' });
    if (ev.heatLv.level && ev.heatLv.level !== 'normal' && ev.heatLv.level !== 'unknown') notes.push({ icon: '🌡️', text: `গরুর জন্য তাপ-স্ট্রেস সতর্কতা (${ev.heatLv.labelBn}) — শেডে পর্যাপ্ত বাতাস চলাচলের ব্যবস্থা ও ঠান্ডা পানি সরবরাহ করুন।` });
    if (Number.isFinite(d.rain) && d.rain >= 50) notes.push({ icon: '🌧️', text: `গত ২৪ ঘণ্টায় ভারী বৃষ্টিপাত (${d.rain.toFixed(0)} mm) রেকর্ড হয়েছে — কাদা ও জলাবদ্ধতা নিয়ন্ত্রণে নজর দিন।` });
    if (rain7 != null && rain7 >= 100) notes.push({ icon: '🔮', text: `আগামী ৭ দিনে প্রায় ${rain7.toFixed(0)} mm বৃষ্টির পূর্বাভাস রয়েছে — ঘাস কর্তন ও পানি নিষ্কাশন পূর্বপরিকল্পনা করুন।` });
    if (rec.region) notes.push({ icon: '🧭', text: `${rec.region.regionBn}: ${rec.region.noteBn}` });
    if (!notes.length) notes.push({ icon: '✅', text: 'বর্তমান মাটি, বৃষ্টিপাত ও তাপমাত্রা — ঘাস উৎপাদন এবং পশুপালনের জন্য সম্পূর্ণ অনুকূল রয়েছে।' });

    box.innerHTML = `
        <div class="dvf-result-card">
            <!-- Header -->
            <div class="dvf-result-header">
                <div class="dvf-result-title-group">
                    <span class="dvf-loc-icon"><i class="fas fa-location-dot"></i></span>
                    <div>
                        <h3 class="dvf-loc-name">${escapeHtml(placeName)}</h3>
                        <span class="dvf-loc-badge">NASA SMAP &bull; লাইভ টেলিমেট্রি বিশ্লেষণ</span>
                    </div>
                </div>
                <button class="dvf-close-btn" onclick="window.__dvmCloseResult()" aria-label="বন্ধ">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <!-- 3 Main KPI Cards -->
            <div class="dvf-kpi-grid">
                <!-- KPI 1: Grass -->
                <div class="dvf-kpi-card ${dvmLayer === 'grass' ? 'active-layer' : ''}" onclick="window.__dvfLayer('grass')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🌱</span>
                        <span class="dvf-kpi-badge" style="background:${gb.c}15;color:${gb.c};border:1px solid ${gb.c}30;">
                            ${escapeHtml(gb.t)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">ঘাস ও খাদ্য উৎপাদন</div>
                    <div class="dvf-kpi-score" style="color:${gb.c};">${ev.grass}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${ev.grass}%;background:${gb.c};"></div>
                    </div>
                    <div class="dvf-kpi-sub">উপযুক্ততার সূচক &bull; লেয়ার দেখতে চাপুন</div>
                </div>

                <!-- KPI 2: Soil -->
                <div class="dvf-kpi-card ${dvmLayer === 'soil' ? 'active-layer' : ''}" onclick="window.__dvfLayer('soil')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🪨</span>
                        <span class="dvf-kpi-badge" style="background:${ev.cls.color}15;color:${ev.cls.color};border:1px solid ${ev.cls.color}30;">
                            ${escapeHtml(ev.cls.labelBn)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">মাটির আর্দ্রতা (GWETTOP)</div>
                    <div class="dvf-kpi-score" style="color:${ev.cls.color};">${Math.round(ev.top * 100)}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${Math.round(ev.top * 100)}%;background:${ev.cls.color};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        শিকড় আর্দ্রতা: <strong>${ev.root != null ? Math.round(ev.root * 100) + '%' : '—'}</strong>
                        ${ev.trend.trendBn ? ` &bull; ${escapeHtml(ev.trend.trendBn)}` : ''}
                    </div>
                </div>

                <!-- KPI 3: Rearing -->
                <div class="dvf-kpi-card ${dvmLayer === 'rear' ? 'active-layer' : ''}" onclick="window.__dvfLayer('rear')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🐄</span>
                        <span class="dvf-kpi-badge" style="background:${rb.c}15;color:${rb.c};border:1px solid ${rb.c}30;">
                            ${escapeHtml(rb.t)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">পশুপালন সার্বিক স্বাচ্ছন্দ্য</div>
                    <div class="dvf-kpi-score" style="color:${rb.c};">${ev.rear}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${ev.rear}%;background:${rb.c};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        গরমের চাপ: <strong style="color:${heatColor};">${escapeHtml(ev.heatLv.labelBn || 'স্বাভাবিক')}</strong>
                    </div>
                </div>
            </div>

            <!-- Advisory Callout -->
            <div class="dvf-advisory-box" style="background:${ev.cls.color}0d;border-left:4px solid ${ev.cls.color};border-color:${ev.cls.color}30;">
                <div class="dvf-advisory-icon" style="color:${ev.cls.color};">
                    <i class="fas fa-lightbulb"></i>
                </div>
                <div class="dvf-advisory-content">
                    <div class="dvf-advisory-heading" style="color:${ev.cls.color};">মাটি ও সেচ পরামর্শ</div>
                    <div class="dvf-advisory-text">${escapeHtml(ev.cls.adviceBn)}</div>
                </div>
            </div>

            <!-- Satellite Weather Telemetry Grid -->
            <div class="dvf-telemetry-grid">
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌡️</span>
                    <span class="dvf-telemetry-label">তাপমাত্রা</span>
                    <span class="dvf-telemetry-val">${d.temp.toFixed(1)}°C</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">💧</span>
                    <span class="dvf-telemetry-label">আর্দ্রতা</span>
                    <span class="dvf-telemetry-val">${Math.round(d.rh)}% RH</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌧️</span>
                    <span class="dvf-telemetry-label">বৃষ্টি (২৪ ঘণ্টা)</span>
                    <span class="dvf-telemetry-val">${d.rain != null ? d.rain.toFixed(1) + ' mm' : '০.০ mm'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🔮</span>
                    <span class="dvf-telemetry-label">৭ দিনের বৃষ্টি</span>
                    <span class="dvf-telemetry-val">${rain7 != null ? rain7.toFixed(0) + ' mm' : 'পরিমাপাধীন'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🛰️</span>
                    <span class="dvf-telemetry-label">স্যাটেলাইট ফিড</span>
                    <span class="dvf-telemetry-val">${escapeHtml(formatDate(d.date))}${age != null ? ` (${age} দিন)` : ''}</span>
                </div>
            </div>

            <!-- Recommended Grasses -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-seedling text-emerald-600"></i>
                    <span>এই এলাকায় চাষের জন্য সেরা ঘাসসমূহ</span>
                </div>
                <div class="dvf-grass-grid">
                    ${rec.recommended.slice(0, 3).map((g, i) => `
                        <div class="dvf-grass-card">
                            <div class="dvf-grass-head">
                                <span class="dvf-grass-rank">#${i + 1} সেরা সুপারিশ</span>
                                <span class="dvf-grass-emoji">${g.emoji}</span>
                            </div>
                            <h4 class="dvf-grass-name">${escapeHtml(g.name)}</h4>
                            <div class="dvf-grass-en">${escapeHtml(g.en)}</div>
                            <div class="dvf-grass-why">
                                <i class="fas fa-check-circle text-emerald-600"></i>
                                <span>${escapeHtml(g.why)}</span>
                            </div>
                            <div class="dvf-grass-metrics">
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">💧 পানি প্রয়োজন</span>
                                    <span class="m-val">${escapeHtml(g.waterNeed)}</span>
                                </div>
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">🌾 সম্ভাব্য ফলন</span>
                                    <span class="m-val">${escapeHtml(g.yieldPerHectare)}</span>
                                </div>
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">✂️ প্রথম কর্তন</span>
                                    <span class="m-val">${g.harvestDays} দিনে</span>
                                </div>
                            </div>
                            <div class="dvf-grass-reason">${escapeHtml(g.reason)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Avoid List -->
            ${rec.avoid.length ? `
                <div class="dvf-avoid-banner">
                    <div class="dvf-avoid-title">
                        <i class="fas fa-triangle-exclamation text-rose-600"></i>
                        <span>এই মৌসুমে যেসব ঘাস লাগানো পরিহার করবেন</span>
                    </div>
                    <div class="dvf-avoid-grid">
                        ${rec.avoid.map(a => `
                            <div class="dvf-avoid-card">
                                <strong>❌ ${escapeHtml(a.name)}</strong>
                                <span>${escapeHtml(a.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- 3 Months Calendar -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-calendar-alt text-teal"></i>
                    <span>পরবর্তী ৩ মাসের ঘাস রোটেশন ক্যালেন্ডার</span>
                </div>
                <div class="dvf-calendar-row">
                    ${rec.calendar.map((c, idx) => `
                        <div class="dvf-cal-step">
                            <div class="dvf-cal-num">মাস ${idx + 1}</div>
                            <div class="dvf-cal-month">${escapeHtml(c.month)}</div>
                            <div class="dvf-cal-grass">🌱 ${escapeHtml(c.grass)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Rearing Environmental Factors -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-cow text-amber-700"></i>
                    <span>পশুপালন উপযোগিতা ও পরিবেশগত অবস্থা (${escapeHtml(rb.t)})</span>
                </div>
                <div class="dvf-factors-card">
                    <div class="dvf-factor-bars">
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>🌱 ঘাসের সহজলভ্যতা ও পরিবেশ</span>
                                <strong style="color:${gb.c};">${ev.grass}%</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${ev.grass}%;background:${gb.c};"></div></div>
                        </div>
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>🌡️ তাপ-সহনশীলতা ও আরাম (গরু)</span>
                                <strong style="color:${heatColor};">${escapeHtml(ev.heatLv.labelBn || 'স্বাভাবিক')} (${heatVal}%)</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${heatVal}%;background:${heatColor};"></div></div>
                        </div>
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>💧 পানি সরবরাহ ও ড্রেনেজ সুবিধা</span>
                                <strong style="color:${waterColor};">${ev.water}%</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${ev.water}%;background:${waterColor};"></div></div>
                        </div>
                    </div>
                    <div class="dvf-notes-list">
                        ${notes.map(n => `
                            <div class="dvf-note-item">
                                <span class="dvf-note-icon">${n.icon}</span>
                                <span class="dvf-note-text">${escapeHtml(n.text)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- Irrigation Guidance -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-droplet text-sky-600"></i>
                    <span>মাটি অনুযায়ী সেচ ও মালচিং ব্যবস্থাপনা</span>
                </div>
                <div class="dvf-irrigation-grid">
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">সেচের পৌনঃপুনিকতা</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.frequency)}</span>
                    </div>
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">সেচ দেওয়ার উত্তম সময়</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.timing)}</span>
                    </div>
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">প্রয়োজনীয় পানির পরিমাণ</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.amountPerHectare)}/হেক্টর</span>
                    </div>
                    <div class="dvf-irrigation-card dvf-irrigation-highlight">
                        <span class="dvf-irrigation-lbl">🌿 খড়ের মালচিং সুবিধা</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.mulchingBenefit)}</span>
                    </div>
                </div>
            </div>

            <!-- All Options Comparison -->
            <div class="dvf-block">
                <details class="forage-all-options">
                    <summary><i class="fas fa-chart-simple text-emerald-600 mr-2"></i> সব ঘাসের জাতের তুলনামূলক উপযোগিতা (${allOptions.length}টি জাত)</summary>
                    <div class="forage-all-list">
                        ${allOptions.map(g => `
                            <div class="forage-all-item ${g.isRecommended ? 'recommended' : ''}">
                                <span class="forage-all-emoji">${g.emoji}</span>
                                <span class="forage-all-name">${escapeHtml(g.name)}</span>
                                <span class="forage-all-verdict">${escapeHtml(g.verdictBn)}</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>

            <!-- Footer Disclaimer -->
            <div class="dvf-card-footer">
                <i class="fas fa-info-circle text-slate-400"></i>
                <span>মাটির আর্দ্রতা NASA POWER (GWETTOP / GWETROOT) এর মডেল-ভিত্তিক তথ্য (রেজোলিউশন প্রায় ৫০ কিমি)। স্কোরগুলো নিয়মভিত্তিক অ্যালগরিদম দ্বারা অনুমিত। জমিতে সরাসরি চাষাবাদের পূর্বে স্থানীয় উপজেলা প্রাণিসম্পদ বা কৃষি কর্মকর্তার সুনির্দিষ্ট পরামর্শ নেওয়া বাঞ্ছনীয়।</span>
            </div>
        </div>`;
}

/* ============================================================
   DISEASE-RISK AREA MAP  (Disease Risk Alert page)
   Same engine as the card above (NasaOutbreak) and as climate-map.js v8:
   bubble = disease-risk % (0-30 কম · 30-50 মধ্যম · 50-70 উচ্চ · 70+ অতি উচ্চ),
   click = score breakdown, top diseases, tomorrow forecast, division economic loss, prevention.
   Everything is prefixed dvo*.
   ============================================================ */
const DVO_LEVEL = {
    critical: { c: '#dc2626', t: 'অতি উচ্চ', e: '🚨' },
    alert:    { c: '#c2410c', t: 'উচ্চ',     e: '⚠️' },
    watch:    { c: '#d97706', t: 'মধ্যম',    e: '👀' },
    safe:     { c: '#059669', t: 'কম',       e: '✅' },
    unknown:  { c: '#94a3b8', t: 'ডেটা নেই', e: '⚪' }
};
const DVO_PREVENTION = [
    '🦟 পশুকে মশারির নিচে রাখুন',
    '💧 জমা পানি ও কাদা পরিষ্কার করুন',
    '🏠 গোয়াল ঘর শুকনো রাখুন',
    '💊 ভেটের পরামর্শে টিকা দিন'
];
const dvoScoreColor = s => s >= 70 ? '#dc2626' : s >= 50 ? '#c2410c' : '#92400e';

function ensureOutbreakMapStyles() {
    if (_el('dvoStyles')) return;
    const st = document.createElement('style');
    st.id = 'dvoStyles';
    st.textContent = `
.dvo-dis{border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;padding:7px 10px;margin-bottom:6px;}
.dvo-dis .t{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;}
.dvo-dis .s{font-size:11.5px;color:#64748b;line-height:1.5;margin-top:2px;}
.dvo-two{display:flex;gap:8px;margin:8px 0;}
.dvo-two>div{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:6px 4px;text-align:center;font-size:12px;}
.dvo-two b{display:block;font-size:20px;}
.dvo-bd{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0;border-bottom:1px dashed #e2e8f0;}
.dvo-eco{text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:10px;}
.dvo-eco .v{font-size:22px;font-weight:800;color:#b45309;}
.dvo-prev{margin:0;padding:0;list-style:none;font-size:13px;line-height:1.8;}
`;
    document.head.appendChild(st);
}

function dvoState(row) {
    const d = row.data;
    if (d && d.risk) {
        const lv = DVO_LEVEL[d.risk.level] || DVO_LEVEL.unknown;
        return { score: d.risk.score, color: lv.c, label: lv.t, emoji: lv.e, d };
    }
    return { score: null, color: DVO_LEVEL.unknown.c, label: row.loading ? 'লোড হচ্ছে' : 'ডেটা নেই', emoji: '⚪', d: null };
}
function dvoIcon(row, boost) {
    const st = dvoState(row);
    const size = Math.round(DVM_BUBBLE_BASE + (DVM_BUBBLE_MAX - DVM_BUBBLE_BASE) * ((st.score || 0) / 100)) + boost;
    const text = st.score != null ? st.score + '%' : (row.loading ? '…' : '—');
    const fs = Math.max(9, Math.min(13, size / 3));
    return L.divIcon({
        html: `<div class="dvm-bubble${row.loading ? ' load' : ''}" style="width:${size}px;height:${size}px;background:${st.color};font-size:${fs}px;"><span>${escapeHtml(text)}</span></div>`,
        className: 'dvm-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2]
    });
}
function dvoPopup(row) {
    const st = dvoState(row);
    const top = st.d && st.d.diseases && st.d.diseases[0];
    return `<div class="dvm-pop"><b>${escapeHtml(row.emoji || '📍')} ${escapeHtml(row.nameBn)}</b><br>` +
        `<span style="color:${st.color};font-weight:800;">রোগ ঝুঁকি ${st.score != null ? st.score + '%' : '—'} · ${escapeHtml(st.label)}</span>` +
        (top ? `<br><span style="font-size:12px;">${VECTOR_ICON[top.vector] || '🌍'} ${escapeHtml(top.nameBn)} ${top.score}%</span>` : '') +
        (row.level !== 'upazila' && row.feature
            ? `<button class="dvm-pop-btn" onclick="window.__dvmDrill(${row.idx})">আরও দেখুন →</button>` : '') +
        `</div>`;
}
function dvoRenderLegend() {
    const el = _el('dvmLegend');
    if (!el) return;
    const dot = (k, txt) => `<span><i style="background:${DVO_LEVEL[k].c};"></i>${DVO_LEVEL[k].t} ${txt}</span>`;
    el.innerHTML = '<b>রোগ ঝুঁকি:</b> ' + dot('safe', '০–৩০%') + dot('watch', '৩০–৫০%') + dot('alert', '৫০–৭০%') + dot('critical', '৭০%+') +
        '<span class="dvi-sub">(বৃষ্টি + আর্দ্রতা + তাপমাত্রা থেকে হিসাব)</span>';
}

function dvxRank(loading) { return dvmMode === 'outbreak' ? dvoRenderRanking(loading) : null; }

function dvoRenderRanking(loading) {
    const box = _el('dvfRank');
    if (!box) return;
    if (loading) { box.innerHTML = '<div class="dvi-sub" style="margin:6px 0;">⏳ এলাকাগুলোর NASA ডেটা আসছে...</div>'; return; }
    const items = dvm.rows.map(r => ({ r, st: dvoState(r) })).filter(x => x.st.d);
    if (!items.length) { box.innerHTML = ''; return; }
    items.sort((a, b) => b.st.score - a.st.score);
    const rowHtml = (x, i) => {
        const top = x.st.d.diseases[0];
        return `<div class="dvf-rk" onclick="window.__dvoPick(${x.r.idx})"><span class="n">${i + 1}</span>` +
            `<span class="nm">${escapeHtml(x.r.nameBn)}</span>` +
            `<span class="gr">${top ? (VECTOR_ICON[top.vector] || '🌍') + ' ' + escapeHtml(top.nameBn) : ''}</span>` +
            `<b style="color:${x.st.color};">${x.st.score}%</b></div>`;
    };
    const low = items.length > 5 ? items.slice(-3).reverse() : [];
    box.innerHTML = `<div class="dvf-rank"><div class="dvf-rank-title">🚨 রোগের ঝুঁকি সবচেয়ে বেশি যেসব এলাকায়</div>` +
        items.slice(0, 5).map(rowHtml).join('') +
        (low.length ? `<div class="dvi-sub" style="margin-top:6px;">✅ সবচেয়ে কম ঝুঁকি: ${low.map(x => escapeHtml(x.r.nameBn) + ' ' + x.st.score + '%').join(' · ')}</div>` : '') +
        `<div class="dvi-sub" style="margin-top:4px;">নাম চাপলে বিস্তারিত দেখাবে। NASA গ্রিড বড় (≈৫০ কিমি), তাই পাশের এলাকার মান একই হতে পারে।</div></div>`;
}
window.__dvoPick = function (idx) {
    const row = dvm.rows[idx];
    if (!row || !dvm.map) return;
    const pt = row.aqiPoint || row.centroid;
    dvmShowArea(row.nameBn + (row.level === 'division' ? ' বিভাগ' : ''), pt[0], pt[1], row);
    try { dvm.map.panTo(row.centroid); const m = dvm.markers.get(row.key); if (m) m.openPopup(); } catch (_) {}
};

/* ---------- Outbreak Unified Card HTML Builder ---------- */
function renderOutbreakCardHtml({
    placeName,
    isDivision,
    risk,
    vector,
    yesterdayRisk,
    tomorrowRisk,
    rainMm,
    temp,
    humidity,
    dataDate,
    ageDays,
    alert,
    diseases,
    breakdown,
    economicHtml
}) {
    const riskScore = (risk && Number.isFinite(risk.score)) ? risk.score : 0;
    const riskLevelKey = (risk && risk.level) || 'safe';
    const lv = DVO_LEVEL[riskLevelKey] || DVO_LEVEL.unknown;
    const riskColor = (risk && risk.color) || lv.c || '#059669';
    const riskLabel = (risk && risk.labelBn) || lv.t || 'স্বাভাবিক';
    const riskBg = (risk && risk.bg) || (riskColor + '12');

    const yScore = yesterdayRisk && Number.isFinite(yesterdayRisk.score) ? yesterdayRisk.score : null;
    const yLv = yesterdayRisk ? (DVO_LEVEL[yesterdayRisk.level] || DVO_LEVEL.unknown) : null;
    const yColor = yLv ? yLv.c : '#94a3b8';
    const yLabel = yLv ? yLv.t : 'ডেটা নেই';
    const yPct = yScore != null ? Math.min(100, Math.max(0, yScore)) : 0;
    const delta = (yScore != null && riskScore != null) ? (riskScore - yScore) : null;
    const trendText = delta == null ? '' : (Math.abs(delta) < 2 ? '➡️ গতকালের মতোই' : (delta > 0 ? `📈 গতকালের চেয়ে ${delta}% বেশি` : `📉 গতকালের চেয়ে ${Math.abs(delta)}% কম`));

    const tmScore = tomorrowRisk && Number.isFinite(tomorrowRisk.score) ? tomorrowRisk.score : null;
    const tmLv = tomorrowRisk ? (DVO_LEVEL[tomorrowRisk.level] || DVO_LEVEL.unknown) : null;
    const tmColor = tmLv ? tmLv.c : '#94a3b8';
    const tmLabel = tmLv ? tmLv.t : 'পূর্বাভাস নেই';
    const tmPct = tmScore != null ? Math.min(100, Math.max(0, tmScore)) : 0;
    const tmRain = tomorrowRisk && Number.isFinite(tomorrowRisk.rain) ? tomorrowRisk.rain : null;

    const vecIcon = (vector && vector.icon) || '🦟';
    const vecLabel = (vector && vector.labelBn) || 'স্বাভাবিক';

    const alertTitle = (alert && alert.titleBn) || (riskLabel + ' রোগ ঝুঁকি সতর্কতা');
    const alertMsg = (alert && alert.messageBn) || 'আবহাওয়াজনিত কারণে খামারের গবাদিপশু ও হাঁস-মুরগির বিশেষ যত্ন ও পর্যবেক্ষণ প্রয়োজন।';

    const diseasesHtml = (diseases && diseases.length) ? diseases.map(d => {
        const scoreColor = dvoScoreColor(d.score);
        const animalsList = Array.isArray(d.animals) && d.animals.length ? d.animals.join(', ') : 'সকল গবাদিপশু';
        return `
            <div class="dvf-disease-card">
                <div class="dvf-disease-head">
                    <div class="dvf-disease-title">
                        <span>${VECTOR_ICON[d.vector] || '🌍'}</span>
                        <span>${escapeHtml(d.nameBn)}</span>
                    </div>
                    <span class="dvf-disease-score" style="color:${scoreColor};background:${scoreColor}15;border:1px solid ${scoreColor}30;">
                        ${d.score}% ঝুঁকি
                    </span>
                </div>
                <div class="dvf-disease-animals">
                    🐾 ঝুঁকিপূর্ণ পশু: <span>${escapeHtml(animalsList)}</span> &bull; বাহক: ${escapeHtml(d.vectorBn || 'পরিবেশ')}
                </div>
                <div class="dvf-disease-advice">
                    💡 <b>ক্লিনিক্যাল সতর্কতা:</b> ${escapeHtml(d.adviceBn || 'পরিচ্ছন্নতা বজায় রাখুন, জমা পানি সরান ও নিয়মিত টিকা দিন।')}
                </div>
            </div>`;
    }).join('') : `
        <div class="dvi-ok" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;padding:14px;border-radius:14px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-circle-check text-emerald-600" style="font-size:18px;"></i>
            <span>বর্তমানে এলাকায় কোনো নির্দিষ্ট সংক্রামক রোগের ঝুঁকি ৩০% এর উপরে নেই। সাধারণ খামার স্বাস্থ্যবিধি মেনে চলুন।</span>
        </div>`;

    const breakdownHtml = (Array.isArray(breakdown) && breakdown.length) ? `
        <div class="dvf-block">
            <div class="dvf-block-title">
                <i class="fas fa-calculator text-rose-600"></i>
                <span>ঝুঁকি স্কোর নির্ণয়ের উপাদানসমূহ (${riskScore}%)</span>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;">
                ${breakdown.map(b => `
                    <div>
                        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:600;margin-bottom:4px;">
                            <span>${b.icon || ''} ${escapeHtml(b.label || '')} <span class="dvi-sub">(${escapeHtml(b.value || '')})</span></span>
                            <span style="color:${riskColor};font-weight:700;">+${b.score} / ${b.max}</span>
                        </div>
                        <div style="height:6px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
                            <div style="width:${Math.min(100, (b.score / (b.max || 1)) * 100)}%;background:${riskColor};height:100%;border-radius:999px;"></div>
                        </div>
                        ${b.reason ? `<div class="dvi-sub" style="font-size:11px;margin-top:2px;color:#64748b;">${escapeHtml(b.reason)}</div>` : ''}
                    </div>
                `).join('')}
                <div style="display:flex;justify-content:space-between;border-top:1px dashed #cbd5e1;padding-top:8px;font-size:13px;font-weight:700;">
                    <span>সর্বমোট বায়োক্লাইমেট রিস্ক স্কোর</span>
                    <span style="color:${riskColor};font-size:15px;">${riskScore} / 100</span>
                </div>
            </div>
        </div>` : '';

    return `
        <div class="dvf-result-card dvm-outbreak-card ${isDivision ? 'dvf-top-division-card' : ''}">
            <!-- Header -->
            <div class="dvf-result-header">
                <div class="dvf-result-title-group">
                    <span class="dvf-loc-icon" style="background:linear-gradient(135deg,#e11d48,#be123c);"><i class="fas fa-shield-virus"></i></span>
                    <div>
                        <h3 class="dvf-loc-name">${escapeHtml(placeName)}</h3>
                        <span class="dvf-loc-badge" style="color:#be123c;background:#fff1f2;">NASA POWER &bull; ${isDivision ? 'নির্বাচিত বিভাগীয় রোগ নজরদারি ও ঝুঁকি' : 'লাইভ সংক্রামক রোগ রাডার টেলিমেট্রি'}</span>
                    </div>
                </div>
                ${!isDivision ? `
                    <button class="dvf-close-btn" onclick="window.__dvmCloseResult()" aria-label="বন্ধ">
                        <i class="fas fa-times"></i>
                    </button>
                ` : `
                    <div class="dvf-top-div-tag" style="color:#be123c;background:#fff1f2;border-color:#fecdd3;">
                        <i class="fas fa-radar text-rose-600"></i>
                        <span>বায়োক্লাইমেট রোগ রাডার</span>
                    </div>
                `}
            </div>

            <!-- 3 Main KPI Cards -->
            <div class="dvf-kpi-grid">
                <!-- Yesterday -->
                <div class="dvf-kpi-card">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">⏳</span>
                        <span class="dvf-kpi-badge" style="background:${yColor}15;color:${yColor};border:1px solid ${yColor}30;">
                            ${escapeHtml(yLabel)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">গতকাল (NASA)</div>
                    <div class="dvf-kpi-score" style="color:${yColor};">${yScore != null ? yScore + '%' : '—'}</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${yPct}%;background:${yColor};"></div>
                    </div>
                    <div class="dvf-kpi-sub">${trendText || 'পূর্ববর্তী দিনের রেফারেন্স'}</div>
                </div>

                <!-- Today / Current Risk (Highlighted) -->
                <div class="dvf-kpi-card active-layer" style="border-color:${riskColor};box-shadow:0 0 0 3px ${riskColor}25,0 8px 24px rgba(225,29,72,0.08);">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🚨</span>
                        <span class="dvf-kpi-badge" style="background:${riskColor}18;color:${riskColor};border:1px solid ${riskColor}40;">
                            ${escapeHtml(riskLabel)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">বর্তমান সামগ্রিক ঝুঁকি</div>
                    <div class="dvf-kpi-score" style="color:${riskColor};">${riskScore}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${riskScore}%;background:${riskColor};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        ভেক্টর: <strong style="color:${riskColor};">${vecIcon} ${escapeHtml(vecLabel)}</strong>
                    </div>
                </div>

                <!-- Tomorrow Forecast -->
                <div class="dvf-kpi-card">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🔮</span>
                        <span class="dvf-kpi-badge" style="background:${tmColor}15;color:${tmColor};border:1px solid ${tmColor}30;">
                            ${escapeHtml(tmLabel)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">আগামীকাল (পূর্বাভাস)</div>
                    <div class="dvf-kpi-score" style="color:${tmColor};">${tmScore != null ? tmScore + '%' : '—'}</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${tmPct}%;background:${tmColor};"></div>
                    </div>
                    <div class="dvf-kpi-sub">${tmRain != null ? `🌧️ বৃষ্টি: ${tmRain.toFixed(1)} mm` : 'Open-Meteo পূর্বাভাস'}</div>
                </div>
            </div>

            <!-- Advisory Banner -->
            <div class="dvf-advisory-box" style="background:${riskBg};border-left:4px solid ${riskColor};border-color:${riskColor}35;">
                <div class="dvf-advisory-icon" style="color:${riskColor};">
                    <i class="fas fa-biohazard"></i>
                </div>
                <div class="dvf-advisory-content">
                    <div class="dvf-advisory-heading" style="color:${riskColor};">${escapeHtml(alertTitle)}</div>
                    <div class="dvf-advisory-text">${escapeHtml(alertMsg)}</div>
                </div>
            </div>

            <!-- Weather & Atmosphere Telemetry Grid -->
            <div class="dvf-telemetry-grid">
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌧️</span>
                    <span class="dvf-telemetry-label">বৃষ্টিপাত</span>
                    <span class="dvf-telemetry-val">${rainMm != null ? rainMm.toFixed(1) + ' mm' : '০.০ mm'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌡️</span>
                    <span class="dvf-telemetry-label">তাপমাত্রা</span>
                    <span class="dvf-telemetry-val">${temp != null ? temp.toFixed(1) + '°C' : '—'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">💧</span>
                    <span class="dvf-telemetry-label">আর্দ্রতা</span>
                    <span class="dvf-telemetry-val">${humidity != null ? Math.round(humidity) + '% RH' : '—'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">${vecIcon}</span>
                    <span class="dvf-telemetry-label">ভেক্টর চাপ</span>
                    <span class="dvf-telemetry-val" style="color:${riskColor};">${escapeHtml(vecLabel)}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🛰️</span>
                    <span class="dvf-telemetry-label">স্যাটেলাইট ফিড</span>
                    <span class="dvf-telemetry-val">${escapeHtml(formatDate(dataDate))}${ageDays != null ? ` (${ageDays} দিন)` : ''}</span>
                </div>
            </div>

            <!-- Tracked Diseases Grid -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-virus text-rose-600"></i>
                    <span>সতর্ক থাকুন এই সংক্রামক রোগগুলোর জন্য</span>
                </div>
                <div class="dvf-disease-grid">
                    ${diseasesHtml}
                </div>
            </div>

            <!-- Breakdown -->
            ${breakdownHtml}

            <!-- Prevention Protocols Grid -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-shield-halved text-rose-600"></i>
                    <span>খামার জৈব-নিরাপত্তা ও প্রতিরোধমূলক ব্যবস্থা</span>
                </div>
                <div class="dvf-prevention-grid">
                    <div class="dvf-prev-card"><i class="fas fa-mosquito text-rose-600"></i><span>পশুকে সূর্যাস্তের পর মশারির নিচে রাখুন এবং মশারি বা ধোঁয়া দিয়ে ভেক্টর মাছি নিয়ন্ত্রণ করুন</span></div>
                    <div class="dvf-prev-card"><i class="fas fa-droplet-slash text-blue-600"></i><span>গোয়ালঘরের চারপাশের জলাবদ্ধ পানি, ড্রেন ও স্যাঁতসেঁতে কাদা দ্রুত নিষ্কাশন করুন</span></div>
                    <div class="dvf-prev-card"><i class="fas fa-broom text-amber-600"></i><span>মেঝে প্রতিদিন ব্লিচিং পাউডার বা অনুমোদিত জীবাণুনাশক স্প্রে দিয়ে শুকনো ও পরিচ্ছন্ন রাখুন</span></div>
                    <div class="dvf-prev-card"><i class="fas fa-syringe text-emerald-600"></i><span>তড়কা (Anthrax), ক্ষুরারোগ (FMD), বাদলা (BQ) ও পিপিআর এর সময়মতো টিকাদান সম্পন্ন করুন</span></div>
                </div>
            </div>

            <!-- Economic Loss (if available) -->
            ${economicHtml || ''}

            <!-- Footer Disclaimer -->
            <div class="dvf-card-footer">
                <i class="fas fa-info-circle text-slate-400"></i>
                <span>রোগ ঝুঁকি হিসাব NASA GPM/POWER এর বৃষ্টিপাত, আর্দ্রতা ও তাপমাত্রা নির্ভর ভেটেরিনারি এপিডেমিওলজিক্যাল অ্যালগরিদম ভিত্তিক। কোনো পশু অসুস্থ হলে দ্রুত উপজেলা প্রাণিসম্পদ কর্মকর্তা বা রেজিস্টার্ড ভেটেরিনারি সার্জনের সাথে যোগাযোগ করুন।</span>
            </div>
        </div>`;
}

/* ---------- area panel ---------- */
async function dvoShowArea(placeName, lat, lng, row) {
    const box = _el('dvmResult');
    if (!box) return;
    dvm.lastArea = { placeName, lat, lng, row };
    const tok = ++dvm.areaTok;
    box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-spinner fa-spin"></i><span>${escapeHtml(placeName)} এর ডেটা লোড হচ্ছে...</span></div>`;
    try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}

    const om = window.OpenMeteo;
    const [d, fc] = await Promise.all([
        dvmPointData(lat, lng),
        om ? dvmOpt(() => om.getTomorrow(lat, lng)) : null
    ]);
    if (tok !== dvm.areaTok) return;
    if (!d || !d.risk) {
        box.innerHTML = `<div class="climate-empty dvm-sec"><i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i><span>${escapeHtml(placeName)} এর NASA ডেটা পাওয়া যায়নি</span></div>`;
        return;
    }

    const risk = d.risk;
    const lv = DVO_LEVEL[risk.level] || DVO_LEVEL.unknown;
    const vec = NasaOutbreak.getVectorActivity(risk.level);

    /* tomorrow (Open-Meteo forecast) */
    let tomorrow = null;
    if (fc && Number.isFinite(fc.precipitation)) {
        try {
            tomorrow = NasaOutbreak.calculateRainfallRiskDetailed(fc.precipitation, fc.humidity, fc.tempMean);
            tomorrow.rain = fc.precipitation;
        } catch (_) {}
    }

    /* alert banner */
    const alert = NasaOutbreak.generateAlertBanner(placeName, risk, d.diseases, d.rain);

    /* economic loss: livestock data exists per DIVISION only → use the parent division */
    const divKey = (row && row.level === 'division') ? row.key : (dvm.divisionKey || dvmDivisionAt(lat, lng));
    let economicHtml = '';
    if (divKey && DISTRICT_COORDS[divKey] && window.NasaSedac) {
        try {
            const dc = DISTRICT_COORDS[divKey];
            const [dd, sedac] = await Promise.all([dvmPointData(dc.lat, dc.lng), NasaSedac.fetchSedacData(divKey)]);
            const counts = sedac ? NasaOutbreak.livestockFromSedac(sedac) : null;
            if (dd && dd.risk && counts) {
                const eco = NasaOutbreak.estimateEconomicImpact(dd.diseases, counts);
                if (eco.total > 0) {
                    economicHtml = `
                        <div class="dvf-block">
                            <div class="dvf-block-title">
                                <i class="fas fa-coins text-amber-600"></i>
                                <span>সম্ভাব্য আর্থিক ঝুঁকি (${escapeHtml(dc.nameBn)} বিভাগ)</span>
                            </div>
                            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:16px;text-align:center;">
                                <div style="font-size:26px;font-weight:900;color:#b45309;">${fmtTk(eco.total)}</div>
                                <div class="dvi-sub" style="font-weight:600;color:#92400e;margin-top:2px;">${escapeHtml(dc.nameBn)} বিভাগে পশুর সম্ভাব্য আর্থিক ক্ষতি</div>
                            </div>
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:10px;">
                                ${(eco.breakdown || []).map(b => `
                                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
                                        <div>
                                            <span style="font-size:13px;font-weight:700;color:#1e293b;">${VECTOR_ICON[b.vector] || '🌍'} ${escapeHtml(b.abbr || b.disease)}</span>
                                            <div style="font-size:11px;color:#64748b;">${fmtN(b.affectedHeads)} পশু আক্রান্তের ঝুঁকি</div>
                                        </div>
                                        <strong style="font-size:13px;color:#b45309;">৳${b.lossCrore} কোটি</strong>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="dvi-sub" style="margin-top:6px;font-size:11px;">পশুর সংখ্যা SEDAC লাইভস্টক আদমশুমারি থেকে প্রাপ্ত। জেলা-উপজেলার হিসাব বিভাগের অন্তর্ভুক্ত।</div>
                        </div>`;
                }
            }
        } catch (err) { console.warn('[Map] outbreak impact unavailable:', err.message); }
        if (tok !== dvm.areaTok) return;
    }

    const age = NasaPower.ageDays(d.date);

    box.innerHTML = renderOutbreakCardHtml({
        placeName,
        isDivision: false,
        risk: { ...risk, color: lv.c, labelBn: lv.t },
        vector: vec,
        yesterdayRisk: d.yesterdayRisk,
        tomorrowRisk: tomorrow,
        rainMm: d.rain,
        temp: d.temp,
        humidity: d.rh,
        dataDate: d.date,
        ageDays: age,
        alert,
        diseases: d.diseases,
        breakdown: risk.breakdown,
        economicHtml
    });
}

/* ============================================================
   FORAGE RENDERER
   ============================================================ */
function renderForage(parameter) {
    const body = _el('dvmResult') || _el('forageBody');
    if (!body) return;

    const soilLatest = NasaPower.getLatest(parameter, 'GWETTOP');
    if (!soilLatest) {
        showError(body.id, 'Soil moisture data not available');
        return;
    }

    const rootLatest = NasaPower.getLatest(parameter, 'GWETROOT');
    const tempLatest = NasaPower.getLatest(parameter, 'T2M');
    const rhLatest = NasaPower.getLatest(parameter, 'RH2M');
    const rainLatest = NasaPower.getLatest(parameter, 'PRECTOTCORR');
    const rainSeries = NasaPower.getSeries(parameter, 'PRECTOTCORR');

    const tempVal = (tempLatest && Number.isFinite(tempLatest.value)) ? tempLatest.value : 28;
    const rhVal = (rhLatest && Number.isFinite(rhLatest.value)) ? rhLatest.value : 70;
    const thiVal = NasaClimate.calculateTHI(tempVal, rhVal);
    const rainVal = (rainLatest && Number.isFinite(rainLatest.value)) ? rainLatest.value : 0;

    let rain7 = null;
    if (Array.isArray(rainSeries) && rainSeries.length) {
        rain7 = rainSeries.slice(-7).reduce((acc, curr) => acc + (Number.isFinite(curr.value) && curr.value > 0 ? curr.value : 0), 0);
    }

    const d = {
        soil: soilLatest.value,
        root: (rootLatest && Number.isFinite(rootLatest.value)) ? rootLatest.value : null,
        temp: tempVal,
        rh: rhVal,
        rain: rainVal,
        thi: thiVal,
        soilSeries: NasaPower.getSeries(parameter, 'GWETTOP'),
        date: soilLatest.date
    };

    const ev = dvfEval(d, currentDistrict);
    if (!ev) {
        showError(body.id, 'Error evaluating soil parameters');
        return;
    }

    const gb = dvfBand(ev.grass);
    const rb = dvfBand(ev.rear);
    const rec = ev.rec;
    const heatColor = ev.heatLv.color || '#64748b';
    const heatVal = ev.heat == null ? 50 : ev.heat;
    const waterColor = dvfBand(ev.water).c;
    const age = NasaPower.ageDays(d.date);

    const divInfo = DISTRICT_COORDS[currentDistrict] || { nameBn: 'ঢাকা', name: 'Dhaka' };
    const divNameBn = (divInfo.nameBn || 'ঢাকা') + ' বিভাগ';

    const allOptions = NasaClimate.compareForageOptions(ev.cls.level);

    const notes = [];
    if (ev.cls.level === 'wet') notes.push({ icon: '💧', text: 'মাটি অতিরিক্ত জলাবদ্ধ — খুর পচা ও পরজীবীর ঝুঁকি রয়েছে। গবাদি পশুকে উঁচু, শুষ্ক স্থানে রাখুন এবং নিষ্কাশন নালা সচল রাখুন।' });
    else if (ev.cls.level === 'drought') notes.push({ icon: '🏜️', text: 'মাটি অতিমাত্রায় শুষ্ক (খরা পরিস্থিতি) — ঘাস ও পানীয় জলের সংকট দেখা দিতে পারে। সাইলেজ বা শুকনো খড় মজুত রাখুন এবং পর্যাপ্ত সেচ দিন।' });
    else if (ev.cls.level === 'dry') notes.push({ icon: '☀️', text: 'মাটিতে পরিমিত আর্দ্রতার অভাব — মালচিং বা হালকা সেচ ছাড়া ঘাসের আশানুরূপ ফলন ব্যাহত হতে পারে।' });
    if (ev.heatLv.level && ev.heatLv.level !== 'normal' && ev.heatLv.level !== 'unknown') notes.push({ icon: '🌡️', text: `গরুর জন্য তাপ-স্ট্রেস সতর্কতা (${ev.heatLv.labelBn}) — শেডে পর্যাপ্ত বাতাস চলাচলের ব্যবস্থা ও ঠান্ডা পানি সরবরাহ করুন।` });
    if (Number.isFinite(rainVal) && rainVal >= 50) notes.push({ icon: '🌧️', text: `গত ২৪ ঘণ্টায় ভারী বৃষ্টিপাত (${rainVal.toFixed(0)} mm) রেকর্ড হয়েছে — কাদা ও জলাবদ্ধতা নিয়ন্ত্রণে নজর দিন।` });
    if (rain7 != null && rain7 >= 100) notes.push({ icon: '🔮', text: `সঞ্চিত/সাম্প্রতিক বৃষ্টিপাত (${rain7.toFixed(0)} mm) — ঘাস কর্তন ও পানি নিষ্কাশন পূর্বপরিকল্পনা করুন।` });
    if (rec.region) notes.push({ icon: '🧭', text: `${rec.region.regionBn}: ${rec.region.noteBn}` });
    if (!notes.length) notes.push({ icon: '✅', text: 'বর্তমান মাটি, বৃষ্টিপাত ও তাপমাত্রা — ঘাস উৎপাদন এবং পশুপালনের জন্য সম্পূর্ণ অনুকূল রয়েছে।' });

    body.innerHTML = `
        <div class="dvf-result-card dvf-top-division-card">
            <!-- Header -->
            <div class="dvf-result-header">
                <div class="dvf-result-title-group">
                    <span class="dvf-loc-icon"><i class="fas fa-layer-group"></i></span>
                    <div>
                        <h3 class="dvf-loc-name">${escapeHtml(divNameBn)}</h3>
                        <span class="dvf-loc-badge">NASA SMAP &bull; লাইভ টেলিমেট্রি ও বিভাগীয় কৃষি বাস্তুতন্ত্র বিশ্লেষণ</span>
                    </div>
                </div>
                <div class="dvf-top-div-tag">
                    <i class="fas fa-satellite text-emerald-600"></i>
                    <span>নির্বাচিত বিভাগীয় বিশ্লেষণ</span>
                </div>
            </div>

            <!-- 3 Main KPI Cards -->
            <div class="dvf-kpi-grid">
                <!-- KPI 1: Grass -->
                <div class="dvf-kpi-card ${dvmLayer === 'grass' ? 'active-layer' : ''}" onclick="window.__dvfLayer && window.__dvfLayer('grass')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🌱</span>
                        <span class="dvf-kpi-badge" style="background:${gb.c}15;color:${gb.c};border:1px solid ${gb.c}30;">
                            ${escapeHtml(gb.t)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">ঘাস ও খাদ্য উৎপাদন</div>
                    <div class="dvf-kpi-score" style="color:${gb.c};">${ev.grass}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${ev.grass}%;background:${gb.c};"></div>
                    </div>
                    <div class="dvf-kpi-sub">উপযুক্ততার সূচক &bull; লেয়ার দেখতে চাপুন</div>
                </div>

                <!-- KPI 2: Soil -->
                <div class="dvf-kpi-card ${dvmLayer === 'soil' ? 'active-layer' : ''}" onclick="window.__dvfLayer && window.__dvfLayer('soil')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🪨</span>
                        <span class="dvf-kpi-badge" style="background:${ev.cls.color}15;color:${ev.cls.color};border:1px solid ${ev.cls.color}30;">
                            ${escapeHtml(ev.cls.labelBn)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">মাটির আর্দ্রতা (GWETTOP)</div>
                    <div class="dvf-kpi-score" style="color:${ev.cls.color};">${Math.round(ev.top * 100)}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${Math.round(ev.top * 100)}%;background:${ev.cls.color};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        শিকড় আর্দ্রতা: <strong>${ev.root != null ? Math.round(ev.root * 100) + '%' : '—'}</strong>
                        ${ev.trend.trendBn ? ` &bull; ${escapeHtml(ev.trend.trendBn)}` : ''}
                    </div>
                </div>

                <!-- KPI 3: Rearing -->
                <div class="dvf-kpi-card ${dvmLayer === 'rear' ? 'active-layer' : ''}" onclick="window.__dvfLayer && window.__dvfLayer('rear')">
                    <div class="dvf-kpi-top">
                        <span class="dvf-kpi-icon">🐄</span>
                        <span class="dvf-kpi-badge" style="background:${rb.c}15;color:${rb.c};border:1px solid ${rb.c}30;">
                            ${escapeHtml(rb.t)}
                        </span>
                    </div>
                    <div class="dvf-kpi-title">পশুপালন সার্বিক স্বাচ্ছন্দ্য</div>
                    <div class="dvf-kpi-score" style="color:${rb.c};">${ev.rear}%</div>
                    <div class="dvf-kpi-bar-bg">
                        <div class="dvf-kpi-bar-fill" style="width:${ev.rear}%;background:${rb.c};"></div>
                    </div>
                    <div class="dvf-kpi-sub">
                        গরমের চাপ: <strong style="color:${heatColor};">${escapeHtml(ev.heatLv.labelBn || 'স্বাভাবিক')}</strong>
                    </div>
                </div>
            </div>

            <!-- Advisory Callout -->
            <div class="dvf-advisory-box" style="background:${ev.cls.color}0d;border-left:4px solid ${ev.cls.color};border-color:${ev.cls.color}30;">
                <div class="dvf-advisory-icon" style="color:${ev.cls.color};">
                    <i class="fas fa-lightbulb"></i>
                </div>
                <div class="dvf-advisory-content">
                    <div class="dvf-advisory-heading" style="color:${ev.cls.color};">মাটি ও সেচ পরামর্শ</div>
                    <div class="dvf-advisory-text">${escapeHtml(ev.cls.adviceBn)}</div>
                </div>
            </div>

            <!-- Satellite Weather Telemetry Grid -->
            <div class="dvf-telemetry-grid">
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌡️</span>
                    <span class="dvf-telemetry-label">তাপমাত্রা</span>
                    <span class="dvf-telemetry-val">${d.temp.toFixed(1)}°C</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">💧</span>
                    <span class="dvf-telemetry-label">আর্দ্রতা</span>
                    <span class="dvf-telemetry-val">${Math.round(d.rh)}% RH</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🌧️</span>
                    <span class="dvf-telemetry-label">বৃষ্টি (২৪ ঘণ্টা)</span>
                    <span class="dvf-telemetry-val">${d.rain != null ? d.rain.toFixed(1) + ' mm' : '০.০ mm'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🔮</span>
                    <span class="dvf-telemetry-label">৭ দিনের বৃষ্টি</span>
                    <span class="dvf-telemetry-val">${rain7 != null ? rain7.toFixed(0) + ' mm' : 'পরিমাপাধীন'}</span>
                </div>
                <div class="dvf-telemetry-item">
                    <span class="dvf-telemetry-icon">🛰️</span>
                    <span class="dvf-telemetry-label">স্যাটেলাইট ফিড</span>
                    <span class="dvf-telemetry-val">${escapeHtml(formatDate(d.date))}${age != null ? ` (${age} দিন)` : ''}</span>
                </div>
            </div>

            <!-- Region-Specific Callout (if any) -->
            ${rec.region ? `
                <div class="dvf-advisory-box" style="background:${rec.region.type === 'drought' ? '#fffbeb' : '#eff6ff'};border-left:4px solid ${rec.region.type === 'drought' ? '#f59e0b' : '#3b82f6'};border-color:${rec.region.type === 'drought' ? '#fde68a' : '#bfdbfe'};">
                    <div class="dvf-advisory-icon" style="color:${rec.region.type === 'drought' ? '#d97706' : '#2563eb'};">
                        <i class="fas ${rec.region.type === 'drought' ? 'fa-sun' : 'fa-water'}"></i>
                    </div>
                    <div class="dvf-advisory-content">
                        <div class="dvf-advisory-heading" style="color:${rec.region.type === 'drought' ? '#92400e' : '#1e40af'};">${rec.region.type === 'drought' ? '🏜️' : '🌊'} ${escapeHtml(rec.region.regionBn)}</div>
                        <div class="dvf-advisory-text" style="color:${rec.region.type === 'drought' ? '#78350f' : '#1e3a8a'};">${escapeHtml(rec.region.noteBn)}</div>
                    </div>
                </div>
            ` : ''}

            <!-- Recommended Grasses -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-seedling text-emerald-600"></i>
                    <span>${escapeHtml(divNameBn)}-এ চাষের জন্য সেরা ঘাসসমূহ</span>
                </div>
                <div class="dvf-grass-grid">
                    ${rec.recommended.map((g, i) => `
                        <div class="dvf-grass-card">
                            <div class="dvf-grass-head">
                                <span class="dvf-grass-rank">#${i + 1} সেরা সুপারিশ</span>
                                <span class="dvf-grass-emoji">${g.emoji}</span>
                            </div>
                            <h4 class="dvf-grass-name">${escapeHtml(g.name)}</h4>
                            <div class="dvf-grass-en">${escapeHtml(g.en)}</div>
                            <div class="dvf-grass-why">
                                <i class="fas fa-check-circle text-emerald-600"></i>
                                <span>${escapeHtml(g.why)}</span>
                            </div>
                            <div class="dvf-grass-metrics">
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">💧 পানি প্রয়োজন</span>
                                    <span class="m-val">${escapeHtml(g.waterNeed)}</span>
                                </div>
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">🌾 সম্ভাব্য ফলন</span>
                                    <span class="m-val">${escapeHtml(g.yieldPerHectare)}</span>
                                </div>
                                <div class="dvf-grass-m-item">
                                    <span class="m-lbl">✂️ প্রথম কর্তন</span>
                                    <span class="m-val">${g.harvestDays} দিনে</span>
                                </div>
                            </div>
                            <div class="dvf-grass-reason">${escapeHtml(g.reason)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Avoid List -->
            ${rec.avoid.length ? `
                <div class="dvf-avoid-banner">
                    <div class="dvf-avoid-title">
                        <i class="fas fa-triangle-exclamation text-rose-600"></i>
                        <span>এই মৌসুমে যেসব ঘাস লাগানো পরিহার করবেন</span>
                    </div>
                    <div class="dvf-avoid-grid">
                        ${rec.avoid.map(a => `
                            <div class="dvf-avoid-card">
                                <strong>❌ ${escapeHtml(a.name)}</strong>
                                <span>${escapeHtml(a.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- 3 Months Calendar -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-calendar-alt text-teal"></i>
                    <span>পরবর্তী ৩ মাসের ঘাস রোটেশন ক্যালেন্ডার</span>
                </div>
                <div class="dvf-calendar-row">
                    ${rec.calendar.map((c, idx) => `
                        <div class="dvf-cal-step">
                            <div class="dvf-cal-num">মাস ${idx + 1}</div>
                            <div class="dvf-cal-month">${escapeHtml(c.month)}</div>
                            <div class="dvf-cal-grass">${(c.grasses && c.grasses.length ? c.grasses : [c.grass]).map(n => `<div>🌱 ${escapeHtml(n)}</div>`).join('')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Irrigation Guidance -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-droplet text-sky-600"></i>
                    <span>মাটি অনুযায়ী সেচ ও মালচিং ব্যবস্থাপনা</span>
                </div>
                <div class="dvf-irrigation-grid">
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">সেচের পৌনঃপুনিকতা</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.frequency)}</span>
                    </div>
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">সেচ দেওয়ার উত্তম সময়</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.timing)}</span>
                    </div>
                    <div class="dvf-irrigation-card">
                        <span class="dvf-irrigation-lbl">প্রয়োজনীয় পানির পরিমাণ</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.amountPerHectare)}/হেক্টর</span>
                    </div>
                    <div class="dvf-irrigation-card dvf-irrigation-highlight">
                        <span class="dvf-irrigation-lbl">🌿 খড়ের মালচিং সুবিধা</span>
                        <span class="dvf-irrigation-val">${escapeHtml(rec.irrigation.mulchingBenefit)}</span>
                    </div>
                </div>
            </div>

            <!-- Environmental & Rearing Factors -->
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-cow text-amber-700"></i>
                    <span>পশুপালন উপযোগিতা ও পরিবেশগত অবস্থা (${escapeHtml(rb.t)})</span>
                </div>
                <div class="dvf-factors-card">
                    <div class="dvf-factor-bars">
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>🌱 ঘাসের সহজলভ্যতা ও পরিবেশ</span>
                                <strong style="color:${gb.c};">${ev.grass}%</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${ev.grass}%;background:${gb.c};"></div></div>
                        </div>
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>🌡️ তাপ-সহনশীলতা ও আরাম (গরু)</span>
                                <strong style="color:${heatColor};">${escapeHtml(ev.heatLv.labelBn || 'স্বাভাবিক')} (${heatVal}%)</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${heatVal}%;background:${heatColor};"></div></div>
                        </div>
                        <div class="dvf-factor-row">
                            <div class="dvf-factor-meta">
                                <span>💧 পানি সরবরাহ ও ড্রেনেজ সুবিধা</span>
                                <strong style="color:${waterColor};">${ev.water}%</strong>
                            </div>
                            <div class="dvf-factor-track"><div class="dvf-factor-fill" style="width:${ev.water}%;background:${waterColor};"></div></div>
                        </div>
                    </div>
                    <div class="dvf-notes-list">
                        ${notes.map(n => `
                            <div class="dvf-note-item">
                                <span class="dvf-note-icon">${n.icon}</span>
                                <span class="dvf-note-text">${escapeHtml(n.text)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- All Options Comparison -->
            <div class="dvf-block">
                <details class="forage-all-options">
                    <summary><i class="fas fa-chart-simple text-emerald-600 mr-2"></i> সব ঘাসের জাতের তুলনামূলক উপযোগিতা (${allOptions.length}টি জাত)</summary>
                    <div class="forage-all-list">
                        ${allOptions.map(g => `
                            <div class="forage-all-item ${g.isRecommended ? 'recommended' : ''}">
                                <span class="forage-all-emoji">${g.emoji}</span>
                                <span class="forage-all-name">${escapeHtml(g.name)}</span>
                                <span class="forage-all-verdict">${escapeHtml(g.verdictBn)}</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            </div>

            <!-- Footer Disclaimer -->
            <div class="dvf-card-footer">
                <i class="fas fa-info-circle text-slate-400"></i>
                <span>মাটির আর্দ্রতা NASA POWER (GWETTOP / GWETROOT) এর মডেল-ভিত্তিক তথ্য (রেজোলিউশন প্রায় ৫০ কিমি)। স্কোর ও সুপারিশসমূহ এগ্রোনমিক অ্যালগরিদম দ্বারা অনুমিত। মাঠে সরাসরি প্রয়োগের পূর্বে স্থানীয় উপজেলা প্রাণিসম্পদ বা কৃষি কর্মকর্তার সুনির্দিষ্ট পরামর্শ নেওয়া বাঞ্ছনীয়।</span>
            </div>
        </div>`;
}

/* ============================================================
   OUTBREAK RENDERER (v3.0 — tomorrow forecast card)
   ============================================================ */
async function renderOutbreak(parameter, sedac) {
    const body = _el('dvmResult') || _el('outbreakBody');
    if (!body) return;

    const rainLatest = NasaPower.getLatest(parameter, 'PRECTOTCORR');
    const tempLatest = NasaPower.getLatest(parameter, 'T2M');
    const rhLatest = NasaPower.getLatest(parameter, 'RH2M');

    if (!rainLatest || !tempLatest || !rhLatest) {
        showError(body.id, 'Weather data not available');
        return;
    }

    const rainMm = rainLatest.value;
    const temp = tempLatest.value;
    const humidity = rhLatest.value;
    const districtBn = DISTRICT_COORDS[currentDistrict].nameBn;

    const riskLevel = NasaOutbreak.calculateRainfallRiskDetailed(rainMm, humidity, temp);
    const diseases = NasaOutbreak.calculateDiseaseRisks({ rainMm, humidity, temp, district: currentDistrict });
    const alert = NasaOutbreak.generateAlertBanner(districtBn + ' বিভাগ', riskLevel, diseases, rainMm);
    const vector = NasaOutbreak.getVectorActivity(riskLevel.level);

    /* ===== Yesterday risk from series ===== */
    const rainSeries = NasaPower.getSeries(parameter, 'PRECTOTCORR');
    const tempSeries = NasaPower.getSeries(parameter, 'T2M');
    const rhSeries = NasaPower.getSeries(parameter, 'RH2M');
    let yesterdayRisk = null;
    if (rainSeries.length >= 2 && tempSeries.length >= 2 && rhSeries.length >= 2) {
        const yRain = rainSeries[rainSeries.length - 2].value;
        const yTemp = tempSeries[tempSeries.length - 2].value;
        const yRh = rhSeries[rhSeries.length - 2].value;
        if (Number.isFinite(yRain) && Number.isFinite(yTemp) && Number.isFinite(yRh)) {
            try {
                yesterdayRisk = NasaOutbreak.calculateRainfallRiskDetailed(yRain, yRh, yTemp);
            } catch (_) {}
        }
    }

    /* ===== Tomorrow forecast (Open-Meteo) ===== */
    const coords = DISTRICT_COORDS[currentDistrict];
    let tomorrowRisk = null;
    let tomorrowRain = null;
    if (window.OpenMeteo && typeof OpenMeteo.getTomorrow === 'function') {
        try {
            const fc = await OpenMeteo.getTomorrow(coords.lat, coords.lng);
            if (fc && Number.isFinite(fc.precipitation)) {
                tomorrowRain = fc.precipitation;
                tomorrowRisk = NasaOutbreak.calculateRainfallRiskDetailed(
                    fc.precipitation, fc.humidity, fc.tempMean
                );
                tomorrowRisk.rain = fc.precipitation;
            }
        } catch (err) {
            console.warn('[Outbreak] Forecast fetch failed:', err.message);
        }
    }

    /* ===== Economic impact ===== */
    const livestockCounts = NasaOutbreak.livestockFromSedac(sedac);
    const economicImpact = livestockCounts
        ? NasaOutbreak.estimateEconomicImpact(diseases, livestockCounts)
        : { total: 0, currency: '৳', breakdown: [] };

    let economicHtml = '';
    if (economicImpact && economicImpact.total > 0) {
        economicHtml = `
            <div class="dvf-block">
                <div class="dvf-block-title">
                    <i class="fas fa-coins text-amber-600"></i>
                    <span>সম্ভাব্য আর্থিক ঝুঁকি (${escapeHtml(districtBn)} বিভাগ)</span>
                </div>
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:16px;padding:16px;text-align:center;">
                    <div style="font-size:26px;font-weight:900;color:#b45309;">${fmtTk(economicImpact.total)}</div>
                    <div class="dvi-sub" style="font-weight:600;color:#92400e;margin-top:2px;">${escapeHtml(districtBn)} বিভাগে পশুর সম্ভাব্য আর্থিক ক্ষতি</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:10px;">
                    ${(economicImpact.breakdown || []).map(b => `
                        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <span style="font-size:13px;font-weight:700;color:#1e293b;">${VECTOR_ICON[b.vector] || '🌍'} ${escapeHtml(b.abbr || b.disease)}</span>
                                <div style="font-size:11px;color:#64748b;">${fmtN(b.affectedHeads)} পশু আক্রান্তের ঝুঁকি</div>
                            </div>
                            <strong style="font-size:13px;color:#b45309;">৳${b.lossCrore} কোটি</strong>
                        </div>
                    `).join('')}
                </div>
                <div class="dvi-sub" style="margin-top:6px;font-size:11px;">পশুর সংখ্যা SEDAC লাইভস্টক আদমশুমারি থেকে প্রাপ্ত।</div>
            </div>`;
    }

    /* ===== Publish for notification ===== */
    window.__lastOutbreakRisk = {
        district: currentDistrict,
        districtBn,
        dataDate: rainLatest.date,
        stale: NasaPower.getSource(parameter) === 'stale-cache',
        level: riskLevel.level,
        score: riskLevel.score,
        diseases: diseases.map(d => ({ key: d.key, nameBn: d.nameBn, score: d.score })),
        rainMm, humidity, temp, economicImpact,
        tomorrowForecast: tomorrowRisk ? {
            rain: tomorrowRain,
            score: tomorrowRisk.score,
            level: tomorrowRisk.level
        } : null,
        timestamp: Date.now()
    };

    const age = NasaPower.ageDays(rainLatest.date);

    body.innerHTML = renderOutbreakCardHtml({
        placeName: districtBn + ' বিভাগ',
        isDivision: true,
        risk: riskLevel,
        vector,
        yesterdayRisk,
        tomorrowRisk,
        rainMm,
        temp,
        humidity,
        dataDate: rainLatest.date,
        ageDays: age,
        alert,
        diseases,
        breakdown: riskLevel.breakdown,
        economicHtml
    });
}

/* ============================================================
   IMPACT RENDERER — SUB NAVBAR CONTROLLER
   Sub Navbar tabs:
   1. 'heat': "তাপ স্ট্রেসে প্রাণী ও আর্থিক প্রভাব" (from THI Page)
   2. 'loss': "সম্ভাব্য আর্থিক ক্ষতি" (from Disease Radar Page & SEDAC)
   ============================================================ */
let currentImpactSubNav = (() => {
    try {
        const v = sessionStorage.getItem('dvImpactSubNav');
        return ['heat', 'loss'].includes(v) ? v : 'heat';
    } catch (_) { return 'heat'; }
})();

function renderHeatSubContent(box) {
    if (!box || !impactState) return;
    renderImpactBox();
}

function renderLossSubContent(box, impact, outbreakEconomic, style, fmt) {
    if (!box) return;
    const sedac = (impactState && impactState.sedac) || {};
    const divName = escapeHtml(sedac.nameBn || sedac.name || '');

    const totalLossText = outbreakEconomic && outbreakEconomic.total > 0
        ? `৳ ${(outbreakEconomic.total / 10000000).toFixed(2)} কোটি`
        : `৳ ${impact.economicLoss.minCrore} – ${impact.economicLoss.maxCrore} কোটি`;

    const noteText = outbreakEconomic && outbreakEconomic.overlap
        ? 'একই পশু একাধিক রোগে গণনা এড়ানো হয়েছে — সর্বোচ্চ ঝুঁকির রোগে এককভাবে হিসাবকৃত।'
        : `ঝুঁকিতে থাকা পশুর ${(impact.lossRate * 100).toFixed(1)}% ক্ষতিগ্রস্ত হওয়ার প্রবল আশঙ্কা।`;

    const diseaseChipsHtml = outbreakEconomic && outbreakEconomic.breakdown && outbreakEconomic.breakdown.length > 0 ? `
        <div class="sedac-disease-grid">
            ${outbreakEconomic.breakdown.map(b => {
                const heads = Number(b.affectedHeads) || 0;
                const lossCr = Number(b.lossCrore) || 0;
                const isSafe = heads === 0 || lossCr === 0;
                const isOverlapDeduplicated = isSafe && outbreakEconomic.overlap;
                const dName = escapeHtml(b.abbr || b.disease);
                const dSub = b.disease && b.disease !== b.abbr ? escapeHtml(b.disease) : (b.diseaseEn ? escapeHtml(b.diseaseEn) : '');

                return `
                    <div class="sedac-dis-card ${isSafe ? 'is-safe' : 'is-risk'}">
                        <div class="sedac-dis-top">
                            <div class="sedac-dis-title-wrap">
                                <div class="sedac-dis-icon-box">
                                    <span>${VECTOR_ICON[b.vector] || '🦠'}</span>
                                </div>
                                <div class="sedac-dis-names">
                                    <div class="sedac-dis-name">${dName}</div>
                                    ${dSub ? `<div class="sedac-dis-sub">${dSub}</div>` : ''}
                                </div>
                            </div>
                            <div class="sedac-dis-badge-wrap">
                                ${!isSafe ? `
                                    <div class="sedac-dis-loss-badge">৳${b.lossCrore} কোটি</div>
                                ` : isOverlapDeduplicated ? `
                                    <div class="sedac-dis-safe-badge" style="background:#f1f5f9;color:#475569;border-color:#cbd5e1;"><i class="fas fa-filter"></i> দ্বৈত গণনা বাদ</div>
                                ` : `
                                    <div class="sedac-dis-safe-badge"><i class="fas fa-check-circle"></i> ঝুঁকিমুক্ত</div>
                                `}
                            </div>
                        </div>

                        <div class="sedac-dis-divider"></div>

                        <div class="sedac-dis-bottom">
                            <div class="sedac-dis-head-count">
                                ${!isSafe ? `
                                    <i class="fas fa-paw"></i>
                                    <span><b>${heads.toLocaleString('en-US')}</b> পশু আক্রান্তের ঝুঁকি</span>
                                ` : isOverlapDeduplicated ? `
                                    <i class="fas fa-paw" style="color:#94a3b8;"></i>
                                    <span style="color:#64748b;">পূর্বের রোগে গণনাকৃত (ডাবল কাউন্ট মুক্ত)</span>
                                ` : `
                                    <i class="fas fa-paw" style="color:#10b981;"></i>
                                    <span>ঝুঁকিতে কোনো পশু নেই</span>
                                `}
                            </div>
                            <div class="sedac-dis-tag">
                                ${!isSafe ? 'ক্ষতি প্রক্ষেপণ' : isOverlapDeduplicated ? 'সমন্বিত' : 'সুরক্ষিত'}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    ` : '';

    box.innerHTML = `
        <div class="dvi-box">
            <!-- Header -->
            <div class="dvi-header">
                <div class="dvi-header-title-group">
                    <span class="dvi-header-icon" style="background:linear-gradient(135deg, #7c3aed, #4f46e5);"><i class="fas fa-coins"></i></span>
                    <div>
                        <div class="dvi-header-name">সম্ভাব্য আর্থিক ক্ষতি ও পশুসম্পদের ঝুঁকি &bull; ${divName}</div>
                        <div class="dvi-header-badge" style="background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe;">মহামারী ও জলবায়ু দুর্যোগ বিশ্লেষণ</div>
                    </div>
                </div>
                <div class="dvi-top-thi-tag" style="background:${style.bg};color:${style.color};border-color:${style.border};">
                    <i class="fas fa-triangle-exclamation"></i>
                    <span>${style.label || 'Moderate'} ঝুঁকি</span>
                </div>
            </div>

            <!-- Outbreak disease loss card transferred from Disease Radar -->
            <div class="sedac-loss-hero">
                <div class="sedac-loss-hero-title">
                    <i class="fas fa-triangle-exclamation"></i>
                    রোগ ও মহামারীজনিত আর্থিক ক্ষতি প্রক্ষেপণ
                </div>
                <div class="sedac-loss-hero-val">${totalLossText}</div>
                <div class="sedac-loss-hero-sub">${noteText}</div>
                ${diseaseChipsHtml}
            </div>

            <!-- SEDAC Livestock Species Breakdown -->
            <div class="dvi-card">
                <div class="dvi-card-title">
                    <i class="fas fa-paw text-purple-600"></i>
                    <span>প্রজাতিভিত্তিক আর্থিক ক্ষতির ব্যাপ্তি</span>
                </div>
                <div class="sedac-species-allocation-grid">
                    <div class="sedac-species-allocation-card">
                        <div class="name"><span>🐄</span> গরু ও মহিষ</div>
                        <div class="val">৳${(impact.economicLoss.breakdown.cattle / 10000000).toFixed(2)} কোটি</div>
                        <div class="dvi-sub">দুধ ও উৎপাদন ক্ষতি অন্তর্ভুক্ত</div>
                    </div>
                    <div class="sedac-species-allocation-card">
                        <div class="name"><span>🐐</span> ছাগল</div>
                        <div class="val">৳${(impact.economicLoss.breakdown.goat / 10000000).toFixed(2)} কোটি</div>
                        <div class="dvi-sub">পিপিআর ও পক্স ঝুঁকি</div>
                    </div>
                    <div class="sedac-species-allocation-card">
                        <div class="name"><span>🐑</span> ভেড়া</div>
                        <div class="val">৳${(impact.economicLoss.breakdown.sheep / 10000000).toFixed(2)} কোটি</div>
                        <div class="dvi-sub">প্যারাসাইটিক ও ফ্লুক ঝুঁকি</div>
                    </div>
                    <div class="sedac-species-allocation-card">
                        <div class="name"><span>🐔</span> মুরগি / পোল্ট্রি</div>
                        <div class="val">৳${(impact.economicLoss.breakdown.poultry / 10000000).toFixed(2)} কোটি</div>
                        <div class="dvi-sub">রানিখেত ও বার্ডফ্লু ঝুঁকি</div>
                    </div>
                </div>
            </div>

            <!-- SEDAC Population & Livestock Exposure Stats -->
            <div class="dvi-card">
                <div class="dvi-card-title">
                    <i class="fas fa-users-viewfinder text-indigo-600"></i>
                    <span>আদমশুমারি ও খামারি এক্সপোজার (SEDAC GPW v4)</span>
                </div>
                <div class="sedac-stats-grid">
                    <div class="sedac-stat-card">
                        <div class="sedac-stat-top">
                            <span class="sedac-stat-lbl">People at Risk</span>
                            <div class="sedac-stat-icon-wrap" style="background:#eef2ff;color:#4f46e5;">👥</div>
                        </div>
                        <div class="sedac-stat-val">${fmt(impact.populationAtRisk)}</div>
                        <div class="dvi-sub">ঝুঁকিপূর্ণ গ্রামীণ জনসংখ্যা</div>
                    </div>
                    <div class="sedac-stat-card">
                        <div class="sedac-stat-top">
                            <span class="sedac-stat-lbl">Marginal Farmers</span>
                            <div class="sedac-stat-icon-wrap" style="background:#ecfdf5;color:#059669;">🧑‍🌾</div>
                        </div>
                        <div class="sedac-stat-val">${fmt(impact.farmersAtRisk)}</div>
                        <div class="dvi-sub">প্রান্তিক ক্ষুদ্র খামারি</div>
                    </div>
                    <div class="sedac-stat-card">
                        <div class="sedac-stat-top">
                            <span class="sedac-stat-lbl">Cattle at Risk</span>
                            <div class="sedac-stat-icon-wrap" style="background:#fffbeb;color:#d97706;">🐄</div>
                        </div>
                        <div class="sedac-stat-val">${fmt(impact.breakdown.cattle)}</div>
                        <div class="dvi-sub">গবাদিপশু এক্সপোজার</div>
                    </div>
                    <div class="sedac-stat-card">
                        <div class="sedac-stat-top">
                            <span class="sedac-stat-lbl">Total Livestock</span>
                            <div class="sedac-stat-icon-wrap" style="background:#faf5ff;color:#7c3aed;">🐾</div>
                        </div>
                        <div class="sedac-stat-val">${fmt(impact.livestockAtRisk)}</div>
                        <div class="dvi-sub">সর্বমোট গৃহপালিত প্রাণী</div>
                    </div>
                </div>
            </div>

            <!-- Vulnerability Index -->
            <div class="sedac-vuln-card">
                <div class="sedac-vuln-header">
                    <span style="color:#1e293b;display:flex;align-items:center;gap:6px;">
                        <i class="fas fa-shield-virus text-purple-600"></i>
                        <span>সামগ্রিক দুর্যোগ ঝুঁকি সূচক (Vulnerability Index)</span>
                    </span>
                    <span style="color:${style.color};font-size:16px;font-weight:900;">${impact.vulnerability}%</span>
                </div>
                <div class="sedac-vuln-track">
                    <div class="sedac-vuln-bar" style="width:${impact.vulnerability}%;background:${style.color};"></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#64748b;">
                    <span>নিরাপদ স্তর (০%)</span>
                    <span>মাঝারি (৫০%)</span>
                    <span>চরম ঝুঁকিপূর্ণ (১০০%)</span>
                </div>
            </div>

            <!-- Calculation Steps -->
            <div class="sedac-calc-card">
                <div class="sedac-calc-header">
                    <span style="display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-list-check text-purple-600"></i>
                        <span>কীভাবে হিসাব করা হলো (Algorithmic Steps)</span>
                    </span>
                    <span style="font-size:11.5px;font-weight:700;color:#64748b;background:#f8fafc;padding:3px 10px;border-radius:8px;border:1px solid #e2e8f0;">
                        FAO &amp; DLS স্ট্যান্ডার্ড
                    </span>
                </div>
                <div class="sedac-calc-list">
                    ${impact.calculationSteps.map((step, i) => `
                        <div class="sedac-calc-item">
                            <div class="sedac-calc-num">${i + 1}</div>
                            <div class="sedac-calc-content">
                                <div class="sedac-calc-title">${escapeHtml(step.step)}</div>
                                <div class="sedac-calc-value-row">
                                    <span class="sedac-calc-val">${escapeHtml(fmtFull(step.value))}</span>
                                    ${step.formula ? `<span class="sedac-calc-formula">${escapeHtml(step.formula)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Source Data Footnote -->
            <div class="sedac-source-foot">
                <i class="fas fa-database text-purple-600"></i>
                <span>উৎস: <strong>NASA SEDAC GPW v4</strong> + <strong>GPM Precipitation Radar</strong> + বাংলাদেশ প্রাণিসম্পদ অধিদপ্তর (DLS)</span>
            </div>
        </div>`;
}

async function renderImpact(riskContext, token, preloaded, parameter) {
    const body = _el('impactBody');
    if (!body) return;

    try {
        const sedac = preloaded || await NasaSedac.fetchSedacData(currentDistrict);
        if (token !== loadToken) return;

        if (!sedac) {
            body.innerHTML = `
                <div class="climate-empty">
                    <i class="fas fa-map-location-dot"></i>
                    <span>SEDAC data not available</span>
                </div>`;
            return;
        }

        const param = parameter || lastParameter;

        // 1. Prepare Heat Impact State
        let thi = 75;
        let dateStr = '';
        if (param) {
            const temp = NasaPower.getLatest(param, 'T2M');
            const rh = NasaPower.getLatest(param, 'RH2M');
            if (temp && rh) {
                thi = NasaClimate.calculateTHI(temp.value, rh.value) || 75;
                dateStr = temp.date;
            }
        }
        ensureImpactStyles();
        bindImpactEvents();
        impactState = {
            district: currentDistrict,
            thi,
            date: dateStr,
            sedac,
            source: sedac.source,
            nameBn: DISTRICT_COORDS[currentDistrict].nameBn,
            model: computeImpactModel(sedac, thi)
        };

        // 2. Prepare Outbreak Disease Economic Impact
        let rainMm = 0, tempVal = 25, rhVal = 70;
        if (param) {
            const rain = NasaPower.getLatest(param, 'PRECTOTCORR');
            const temp = NasaPower.getLatest(param, 'T2M');
            const rh = NasaPower.getLatest(param, 'RH2M');
            if (rain) rainMm = rain.value;
            if (temp) tempVal = temp.value;
            if (rh) rhVal = rh.value;
        }
        const diseases = NasaOutbreak.calculateDiseaseRisks({ rainMm, humidity: rhVal, temp: tempVal, district: currentDistrict });
        const livestockCounts = NasaOutbreak.livestockFromSedac(sedac);
        const outbreakEconomic = livestockCounts
            ? NasaOutbreak.estimateEconomicImpact(diseases, livestockCounts)
            : { total: 0, currency: '৳', breakdown: [] };

        // 3. Prepare SEDAC Calculation
        const impact = NasaSedac.calculateImpactDetailed(sedac, riskContext);
        window.__lastImpact = {
            populationAtRisk: impact.populationAtRisk,
            farmersAtRisk: impact.farmersAtRisk,
            livestockAtRisk: impact.livestockAtRisk,
            economicLoss: impact.economicLoss,
            breakdown: impact.breakdown
        };
        if (window.__lastOutbreakRisk) window.__lastOutbreakRisk.impact = window.__lastImpact;

        const style = RISK_STYLE[impact.riskLevel] || RISK_STYLE.safe;
        const fmt = NasaSedac.formatNumber;

        // 4. Render Sub Navbar Shell
        body.innerHTML = `
            <div class="impact-page-wrapper">
                <div class="impact-subnav">
                    <button class="impact-subnav-btn ${currentImpactSubNav === 'heat' ? 'active' : ''}" id="btnSubNavHeat" onclick="window.__setImpactSubNav('heat')">
                        <i class="fas fa-temperature-arrow-up text-amber-500"></i>
                        <span>তাপ স্ট্রেসে প্রাণী ও আর্থিক প্রভাব</span>
                    </button>
                    <button class="impact-subnav-btn ${currentImpactSubNav === 'loss' ? 'active' : ''}" id="btnSubNavLoss" onclick="window.__setImpactSubNav('loss')">
                        <i class="fas fa-coins text-purple-600"></i>
                        <span>সম্ভাব্য আর্থিক ক্ষতি</span>
                    </button>
                </div>
                <div id="impactSubContent"></div>
            </div>`;

        window.__setImpactSubNav = function (tab) {
            if (tab !== 'heat' && tab !== 'loss') return;
            currentImpactSubNav = tab;
            try { sessionStorage.setItem('dvImpactSubNav', tab); } catch (_) {}
            const btnHeat = _el('btnSubNavHeat');
            const btnLoss = _el('btnSubNavLoss');
            if (btnHeat) btnHeat.classList.toggle('active', tab === 'heat');
            if (btnLoss) btnLoss.classList.toggle('active', tab === 'loss');

            const content = _el('impactSubContent');
            if (!content) return;

            if (tab === 'heat') {
                renderHeatSubContent(content);
            } else {
                renderLossSubContent(content, impact, outbreakEconomic, style, fmt);
            }
        };

        window.__setImpactSubNav(currentImpactSubNav);
    } catch (err) {
        if (token !== loadToken) return;
        console.error('[Climate] SEDAC load failed:', err);
        body.innerHTML = `
            <div class="climate-empty">
                <i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i>
                <span>Could not load impact data</span>
            </div>`;
    }
}

/* ============================================================
   FEATURE LOADER
   ============================================================ */
async function loadFeature() {
    const coords = DISTRICT_COORDS[currentDistrict];
    if (!coords) return;

    const token = ++loadToken;

    const bodyId = FEATURE === 'thi' ? (_el('dvmResult') ? 'dvmResult' : 'thiBody')
                 : FEATURE === 'forage' ? (_el('dvmResult') ? 'dvmResult' : 'forageBody')
                 : FEATURE === 'outbreak' ? (_el('dvmResult') ? 'dvmResult' : 'outbreakBody')
                 : 'impactBody';

    showLoading(bodyId);

    let parameter;
    try {
        parameter = await NasaPower.getPowerData(coords.lat, coords.lng, 7);
    } catch (err) {
        if (token !== loadToken) return;
        console.error('[Climate] Load failed:', err);
        showError(bodyId, 'Failed to load NASA data');
        return;
    }
    if (token !== loadToken) return;

    lastParameter = parameter;

    let sedac = null;
    if (FEATURE === 'outbreak' || FEATURE === 'impact') {
        try { sedac = await NasaSedac.fetchSedacData(currentDistrict); }
        catch (err) { console.warn('[Climate] SEDAC unavailable:', err.message); }
        if (token !== loadToken) return;
    }

    lastSedac = sedac;

    /* ===== Render — THI & Outbreak are async (Open-Meteo forecast call) ===== */
    if (FEATURE === 'thi') {
        try { await renderTHI(parameter); }
        catch (err) { console.error(err); showError(bodyId, 'Render failed'); }
    } else if (FEATURE === 'forage') {
        safeRender(_el('dvmResult') ? 'dvmResult' : 'forageBody', () => renderForage(parameter));
    } else if (FEATURE === 'outbreak') {
        try { await renderOutbreak(parameter, sedac); }
        catch (err) { console.error(err); showError(bodyId, 'Render failed'); }
        if (window.__lastOutbreakRisk && typeof window.triggerNasaOutbreakAlert === 'function') {
            setTimeout(() => {
                if (token === loadToken) window.triggerNasaOutbreakAlert();
            }, 2000);
        }
    } else if (FEATURE === 'impact') {
        /* The impact page has no outbreak card, so compute the live risk here from the same
           NASA POWER data the Disease Risk page uses (otherwise it always showed 'safe' ×0.10). */
        let riskCtx = { level: 'safe', score: 0 };
        try {
            const rain = NasaPower.getLatest(parameter, 'PRECTOTCORR');
            const temp = NasaPower.getLatest(parameter, 'T2M');
            const rh = NasaPower.getLatest(parameter, 'RH2M');
            if (rain) {
                const r = NasaOutbreak.calculateRainfallRiskDetailed(
                    rain.value, rh ? rh.value : null, temp ? temp.value : null);
                riskCtx = { level: r.level, score: r.score };
            }
        } catch (err) { console.warn('[Impact] risk calc failed:', err.message); }
        await renderImpact(riskCtx, token, sedac, parameter);
    }
}

/* ============================================================
   INIT
   ============================================================ */
function getUserPhone() {
    try {
        return sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    } catch (_) { return null; }
}

function bindDistrictSelector() {
    const select = _el('climateDistrict');
    if (!select || select._bound) return;
    select._bound = true;
    if (DISTRICT_COORDS[select.value]) currentDistrict = select.value;
    select.addEventListener('change', e => {
        if (!DISTRICT_COORDS[e.target.value]) return;
        currentDistrict = e.target.value;
        loadFeature();
        if (FEATURE !== 'impact') dvmFocusDivision(currentDistrict);
    });
}

function init() {
    if (!getUserPhone()) {
        window.location.replace('login.html');
        return;
    }

    const container = document.querySelector('.climate-feature-container');
    FEATURE = (container && container.dataset.feature) || 'thi';

    document.addEventListener('change', e => {
        if (e.target && e.target.id === 'thiSpecies') window.__changeSpecies(e.target.value);
    });

    /* THI + Forage + Disease-Risk pages: area map + search + per-area details */
    if (FEATURE === 'thi' || FEATURE === 'forage' || FEATURE === 'outbreak') {
        dvmInit().catch(err => console.warn('[Map] init failed:', err.message));
    }

    bindDistrictSelector();
    loadFeature();
}

window.DVClimate = {
    reload: () => loadFeature(),
    setDistrict(key) {
        if (!DISTRICT_COORDS[key]) return false;
        currentDistrict = key;
        const select = _el('climateDistrict');
        if (select) select.value = key;
        loadFeature();
        if (FEATURE !== 'impact') dvmFocusDivision(key);
        return true;
    },
    getDistrict: () => currentDistrict,
    DISTRICT_COORDS
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();