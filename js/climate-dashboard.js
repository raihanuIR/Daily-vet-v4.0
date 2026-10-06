/* DailyVet — NASA Climate Dashboard v2.0
   v2.0: Detailed breakdowns, species-specific THI, economic impact, demo widget
*/
(function () {
'use strict';

/* ===== DISTRICT COORDINATES ===== */
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

const SECTION_IDS = ['thiBody', 'forageBody', 'outbreakBody', 'impactBody'];
const ALERT_DELAY_MS = 2000;

const RISK_STYLE = {
    critical: { color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
    alert:    { color: '#c2410c', bg: '#fff7ed', icon: '⚠️' },
    watch:    { color: '#92400e', bg: '#fef9e7', icon: '👀' },
    safe:     { color: '#047857', bg: '#ecfdf5', icon: '✅' }
};

const VECTOR_ICON = { mosquito: '🦟', fly: '🪰', water: '💧', air: '💨', contact: '🤝', environment: '🌍' };

let currentDistrict = 'dhaka';
const SPECIES_IDS = ['cow', 'buffalo', 'goat', 'sheep', 'chicken', 'duck', 'dog', 'cat'];
const SPECIES_KEY = 'dvClimateSpecies';
let currentSpecies = (() => {
    try {
        const v = localStorage.getItem(SPECIES_KEY);
        return SPECIES_IDS.includes(v) ? v : 'cow';
    } catch (_) { return 'cow'; }
})();
let lastParameter = null;
let loadToken = 0;
let alertTimer = null;

/* ===== HELPERS ===== */
const _el = id => document.getElementById(id);
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = text => String(text == null ? '' : text).replace(/[&<>"']/g, c => _ESC[c]);

function formatDate(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length !== 8) return '';
    const date = new Date(Date.UTC(
        Number(yyyymmdd.slice(0, 4)),
        Number(yyyymmdd.slice(4, 6)) - 1,
        Number(yyyymmdd.slice(6, 8))
    ));
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/* Locale-safe full-number formatter (never throws on undefined / strings) */
function fmtFull(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString('en-IN');
    return v == null ? '—' : String(v);
}

function injectExtraStyles() {
    if (document.getElementById('dv-nasa-extra-css')) return;
    const st = document.createElement('style');
    st.id = 'dv-nasa-extra-css';
    st.textContent = `
        .dv-note{font-size:11.5px;opacity:.75;margin:6px 2px 0;line-height:1.45}
        .dv-src{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-top:12px;padding-top:8px;
                border-top:1px dashed rgba(100,116,139,.35);font-size:11px;opacity:.8}
        .dv-src.stale{color:#b45309;opacity:1}
        .dv-region{margin:10px 0;padding:9px 12px;border-radius:10px;font-size:13px;line-height:1.5;
                   background:rgba(37,99,235,.08);border-left:3px solid #2563eb}
        .dv-region.drought{background:rgba(217,119,6,.10);border-left-color:#d97706}
        .dv-soil-extra{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px;font-size:12.5px}
        .dv-push{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12.5px}
        .dv-push button{border:0;border-radius:999px;padding:7px 14px;font-weight:600;cursor:pointer;
                        background:#0f766e;color:#fff;font-size:12.5px}
    `;
    document.head.appendChild(st);
}

const _POWER_LABEL = { live: 'live', 'firestore-cache': 'cached (≤24h)', 'stale-cache': 'সংরক্ষিত পুরনো ডেটা' };

function appendDataBadge(elementId, parameter, text) {
    const el = _el(elementId);
    if (!el || el.querySelector('.climate-empty')) return;
    const src = NasaPower.getSource(parameter);
    const latest = NasaPower.getLatest(parameter, 'T2M');
    const date = latest ? formatDate(latest.date) : '';
    const age = latest ? NasaPower.ageDays(latest.date) : null;
    const stale = src === 'stale-cache';
    el.insertAdjacentHTML('beforeend', `
        <div class="dv-src${stale ? ' stale' : ''}">
            <span>🛰️ ${escapeHtml(text)}</span>
            ${date ? `<span>📅 ${escapeHtml(date)}${age !== null ? ` (${age} দিন আগে)` : ''}</span>` : ''}
            <span>${stale ? '⚠️ ' : ''}${escapeHtml(_POWER_LABEL[src] || src)}</span>
        </div>`);
}

function renderPushControl(body) {
    if (!body || !window.DVNotifications || typeof DVNotifications.pushPermission !== 'function') return;
    const perm = DVNotifications.pushPermission();
    if (perm === 'unsupported') return;
    let host = body.querySelector('.dv-push');
    if (!host) {
        host = document.createElement('div');
        host.className = 'dv-push';
        body.appendChild(host);
    }
    if (perm === 'granted') {
        host.innerHTML = '<span>🔔 Push সতর্কতা চালু আছে</span>';
    } else if (perm === 'denied') {
        host.innerHTML = '<span>🔕 Push ব্লক করা আছে — browser settings থেকে অনুমতি দিন</span>';
    } else {
        host.innerHTML = '<button type="button">🔔 Push সতর্কতা চালু করুন</button>' +
                         '<span>ঝুঁকি বাড়লে ফোনে বাংলা নোটিফিকেশন পাবেন</span>';
        const btn = host.querySelector('button');
        btn.addEventListener('click', async () => {
            await DVNotifications.requestPushPermission();
            renderPushControl(body);
        });
    }
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

/* ===== SECTION 1: THI with COMPARISON ===== */
function renderTHI(parameter) {
    const body = _el('thiBody');
    if (!body) return;
    
    const tempLatest = NasaPower.getLatest(parameter, 'T2M');
    const rhLatest = NasaPower.getLatest(parameter, 'RH2M');
    
    if (!tempLatest || !rhLatest) {
        showError('thiBody', 'THI data not available');
        return;
    }
    
    const thi = NasaClimate.calculateTHI(tempLatest.value, rhLatest.value);
    if (thi === null) {
        showError('thiBody', 'THI data not available');
        return;
    }
    
    /* ===== Get yesterday + tomorrow ===== */
    const tempSeries = NasaPower.getSeries(parameter, 'T2M');
    const rhSeries = NasaPower.getSeries(parameter, 'RH2M');
    const rhMap = {};
    rhSeries.forEach(r => { rhMap[r.date] = r.value; });
    
    let yesterday = null, tomorrow = null;
    if (tempSeries.length >= 2) {
        const prev = tempSeries[tempSeries.length - 2];
        const prevRh = rhMap[prev.date] !== undefined ? rhMap[prev.date] : rhLatest.value;
        yesterday = NasaClimate.calculateTHI(prev.value, prevRh);
    }
    // Tomorrow = estimate from 7-day average
    if (tempSeries.length >= 3) {
        const recent = tempSeries.slice(-3);
        const avgTemp = recent.reduce((s, d) => s + d.value, 0) / recent.length;
        const avgRh = recent.reduce((s, d) => s + (rhMap[d.date] !== undefined ? rhMap[d.date] : rhLatest.value), 0) / recent.length;
        tomorrow = NasaClimate.calculateTHI(avgTemp, avgRh);
    }
    
    const comparison = NasaClimate.generateTHIComparison(thi, yesterday, tomorrow, currentSpecies, 'bn');
    
    /* ===== 7-day chart ===== */
    const last7 = tempSeries.slice(-7);
    const bars = last7.map(d => {
        const dayRh = rhMap[d.date] !== undefined ? rhMap[d.date] : rhLatest.value;
        const dayThi = NasaClimate.calculateTHI(d.value, dayRh);
        if (dayThi === null) return '';
        const pct = Math.min(100, Math.max(10, (dayThi - 50) * 2));  // THI 55→10% … 100→100%
        const dayCls = NasaClimate.classifyTHI(dayThi, currentSpecies);
        const label = formatDate(d.date);
        return `
            <div class="thi-bar-wrap" title="${escapeHtml(label)}: THI ${dayThi.toFixed(1)}">
                <div class="thi-bar" style="height:${pct}%;background:${dayCls.color};"></div>
                <div class="thi-bar-label">${escapeHtml(label.split(' ')[0])}</div>
            </div>`;
    }).join('');
    
    /* ===== Species selector ===== */
    const speciesList = [
        { id: 'cow', label: '🐄 গরু' },
        { id: 'buffalo', label: '🐃 মহিষ' },
        { id: 'goat', label: '🐐 ছাগল' },
        { id: 'sheep', label: '🐑 ভেড়া' },
        { id: 'chicken', label: '🐔 মুরগি' },
        { id: 'duck', label: '🦆 হাঁস' },
        { id: 'dog', label: '🐕 কুকুর' },
        { id: 'cat', label: '🐈 বিড়াল' }
    ];
    
    const speciesOptions = speciesList.map(s => 
        `<option value="${s.id}" ${s.id === currentSpecies ? 'selected' : ''}>${s.label}</option>`
    ).join('');
    
    body.innerHTML = `
        <div class="thi-widget">
            <div class="thi-species-selector">
                <label for="thiSpecies">🐾 পশু নির্বাচন:</label>
                <select id="thiSpecies">
                    ${speciesOptions}
                </select>
            </div>
            
            <div class="thi-comparison-headline" style="background:${comparison.bg};border-left:4px solid ${comparison.color};">
                <div class="thi-headline-text" style="color:${comparison.color};">
                    ${escapeHtml(comparison.headlineBn)}
                </div>
                ${comparison.deltaText ? `
                    <div class="thi-delta-text" style="color:${comparison.color};opacity:0.85;">
                        ${escapeHtml(comparison.trend)} ${escapeHtml(comparison.deltaText)}
                    </div>` : ''}
            </div>
            
            <div class="thi-comparison-grid">
                ${comparison.yesterdayText ? `
                    <div class="thi-compare-card">
                        <div class="thi-compare-label">আগের দিন</div>
                        <div class="thi-compare-value" style="opacity:0.6;">${comparison.yesterday}</div>
                        <div class="thi-compare-level" style="opacity:0.6;">THI</div>
                    </div>
                    <div class="thi-compare-arrow">→</div>
                ` : ''}
                
                <div class="thi-compare-card highlight" style="border-color:${comparison.color};">
                    <div class="thi-compare-label">সর্বশেষ</div>
                    <div class="thi-compare-value" style="color:${comparison.color};">${comparison.current}</div>
                    <div class="thi-compare-level" style="color:${comparison.color};">THI</div>
                </div>
                
                ${comparison.tomorrowText ? `
                    <div class="thi-compare-arrow">→</div>
                    <div class="thi-compare-card">
                        <div class="thi-compare-label">আগামীকাল*</div>
                        <div class="thi-compare-value" style="opacity:0.6;">${comparison.tomorrow}</div>
                        <div class="thi-compare-level" style="opacity:0.6;">THI</div>
                    </div>
                ` : ''}
            </div>
            
            ${comparison.tomorrowText ? `
                <div class="dv-note">* আগামীকালের মান NASA POWER-এর সাম্প্রতিক ৩ দিনের গড় থেকে আনুমানিক (POWER নিজে forecast দেয় না)।</div>` : ''}
            <div class="thi-widget-meta">
                <span>🌡️ ${tempLatest.value.toFixed(1)}°C</span>
                <span>💧 ${rhLatest.value.toFixed(0)}% RH</span>
                <span>📅 ${escapeHtml(formatDate(tempLatest.date))}</span>
            </div>
            
            <div class="thi-action-box" style="background:${comparison.bg};border-left:3px solid ${comparison.color};">
                <i class="fas fa-bolt" style="color:${comparison.color};"></i>
                <span style="color:${comparison.color};">${escapeHtml(comparison.actionBn)}</span>
            </div>
            
            ${last7.length > 1 ? `
                <div class="thi-widget-chart-title">গত ৭ দিনের THI</div>
                <div class="thi-mini-chart">${bars}</div>
            ` : ''}
        </div>`;
}

window.__changeSpecies = function(species) {
    if (!SPECIES_IDS.includes(species)) return;
    currentSpecies = species;
    try { localStorage.setItem(SPECIES_KEY, species); } catch (_) {}
    /* Only the THI card depends on species — no reload, no new NASA call, no duplicate alert */
    if (lastParameter) {
        safeRender('thiBody', () => renderTHI(lastParameter));
        appendDataBadge('thiBody', lastParameter, 'NASA POWER · T2M, RH2M');
    } else {
        loadAllSections();
    }
};

/* ===== SECTION 2: FORAGE with DETAILED recommendation ===== */
function renderForage(parameter) {
    const body = _el('forageBody');
    if (!body) return;
    
    const soilLatest = NasaPower.getLatest(parameter, 'GWETTOP');
    if (!soilLatest) {
        showError('forageBody', 'Soil moisture data not available');
        return;
    }
    
    const soilCls = NasaClimate.classifySoilMoisture(soilLatest.value);
    const currentMonth = new Date().getMonth() + 1;
    const recommendation = NasaClimate.recommendForageDetailed(soilCls.level, currentMonth, soilLatest.value, currentDistrict);
    const rootLatest = NasaPower.getLatest(parameter, 'GWETROOT');
    const soilTrend = NasaClimate.classifySoilTrend(NasaPower.getSeries(parameter, 'GWETTOP'));
    const region = recommendation.region;
    const allOptions = NasaClimate.compareForageOptions(soilCls.level);
    
    body.innerHTML = `
        <div class="forage-card">
            <div class="forage-soil-status" style="background:${soilCls.color}15;border-left:3px solid ${soilCls.color};">
                <div class="forage-soil-label">
                    <i class="fas fa-water"></i>
                    মাটির আর্দ্রতা
                </div>
                <div class="forage-soil-value" style="color:${soilCls.color};">
                    ${(soilLatest.value * 100).toFixed(0)}%
                    <small>${escapeHtml(soilCls.labelBn)}</small>
                </div>
                <div class="forage-soil-advice" style="color:${soilCls.color};">
                    ${escapeHtml(soilCls.adviceBn)}
                </div>
            </div>
            
            <div class="dv-soil-extra">
                ${rootLatest ? `<span>🌱 শিকড় অঞ্চলের আর্দ্রতা: <strong>${(rootLatest.value * 100).toFixed(0)}%</strong></span>` : ''}
                ${soilTrend.trendBn ? `<span>${escapeHtml(soilTrend.trendBn)}</span>` : ''}
            </div>
            ${region ? `
                <div class="dv-region ${escapeHtml(region.type)}">
                    <strong>${region.type === 'drought' ? '🏜️' : '🌊'} ${escapeHtml(region.regionBn)}</strong><br>
                    ${escapeHtml(region.noteBn)}
                </div>` : ''}

            <div class="forage-recommend-title">🌱 এখন যা লাগান</div>
            <div class="forage-detailed-grid">
                ${recommendation.recommended.map((g, i) => `
                    <div class="forage-detail-card">
                        <div class="forage-detail-rank">#${i + 1}</div>
                        <div class="forage-detail-emoji">${g.emoji}</div>
                        <div class="forage-detail-name">${escapeHtml(g.name)}</div>
                        <div class="forage-detail-sub">${escapeHtml(g.en)}</div>
                        <div class="forage-detail-why">✓ ${escapeHtml(g.why)}</div>
                        <div class="forage-detail-stats">
                            <span>💧 পানি: ${escapeHtml(g.waterNeed)}</span>
                            <span>📅 কাটা: ${g.harvestDays} দিন</span>
                            <span>🌾 ফলন: ${escapeHtml(g.yieldPerHectare)}</span>
                        </div>
                        <div class="forage-detail-reason">${escapeHtml(g.reason)}</div>
                    </div>
                `).join('')}
            </div>
            
            ${recommendation.avoid.length > 0 ? `
                <div class="forage-avoid-section">
                    <div class="forage-avoid-title">❌ এখন যা লাগাবেন না</div>
                    ${recommendation.avoid.map(a => `
                        <div class="forage-avoid-item">
                            <strong>${escapeHtml(a.name)}</strong>
                            <span>${escapeHtml(a.reason)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <div class="forage-calendar-section">
                <div class="forage-calendar-title">📅 পরবর্তী ৩ মাসের Calendar</div>
                <div class="forage-calendar-grid">
                    ${recommendation.calendar.map(c => `
                        <div class="forage-calendar-item">
                            <div class="forage-calendar-month">${escapeHtml(c.month)}</div>
                            <div class="forage-calendar-grass">${escapeHtml(c.grass)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="forage-irrigation-section">
                <div class="forage-irrigation-title">💧 সেচ পরামর্শ</div>
                <div class="forage-irrigation-grid">
                    <div class="forage-irrigation-item">
                        <span class="label">কত বার</span>
                        <span class="value">${escapeHtml(recommendation.irrigation.frequency)}</span>
                    </div>
                    <div class="forage-irrigation-item">
                        <span class="label">কখন</span>
                        <span class="value">${escapeHtml(recommendation.irrigation.timing)}</span>
                    </div>
                    <div class="forage-irrigation-item">
                        <span class="label">পরিমাণ</span>
                        <span class="value">${escapeHtml(recommendation.irrigation.amountPerHectare)}/হেক্টর</span>
                    </div>
                    <div class="forage-irrigation-item highlight">
                        <span class="label">মালচিং করলে</span>
                        <span class="value">${escapeHtml(recommendation.irrigation.mulchingBenefit)}</span>
                    </div>
                </div>
            </div>
            
            <details class="forage-all-options">
                <summary>📊 সব ঘাসের তুলনা দেখুন</summary>
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
        </div>`;
}

/* ===== SECTION 3: OUTBREAK with BREAKDOWN ===== */
function renderOutbreak(parameter, sedac) {
    const body = _el('outbreakBody');
    if (!body) return;
    
    const rainLatest = NasaPower.getLatest(parameter, 'PRECTOTCORR');
    const tempLatest = NasaPower.getLatest(parameter, 'T2M');
    const rhLatest = NasaPower.getLatest(parameter, 'RH2M');
    
    if (!rainLatest || !tempLatest || !rhLatest) {
        showError('outbreakBody', 'Weather data not available');
        return;
    }
    
    const rainMm = rainLatest.value;
    const temp = tempLatest.value;
    const humidity = rhLatest.value;
    const district = DISTRICT_COORDS[currentDistrict].name;
    const districtBn = DISTRICT_COORDS[currentDistrict].nameBn;
    
    const riskLevel = NasaOutbreak.calculateRainfallRiskDetailed(rainMm, humidity, temp);
    const diseases = NasaOutbreak.calculateDiseaseRisks({ rainMm, humidity, temp, district: currentDistrict });
    const alert = NasaOutbreak.generateAlertBanner(districtBn, riskLevel, diseases, rainMm);
    const vector = NasaOutbreak.getVectorActivity(riskLevel.level);
    
    /* ===== Economic impact (livestock counts of THIS division, from NASA SEDAC / DLS data) ===== */
    const livestockCounts = NasaOutbreak.livestockFromSedac(sedac);
    const economicImpact = livestockCounts
        ? NasaOutbreak.estimateEconomicImpact(diseases, livestockCounts)
        : { total: 0, currency: '৳', breakdown: [] };
    
    /* ===== Publish risk (for impact section + notification) ===== */
    window.__lastOutbreakRisk = {
        district: currentDistrict,
        districtBn,
        dataDate: rainLatest.date,
        stale: NasaPower.getSource(parameter) === 'stale-cache',
        level: riskLevel.level,
        score: riskLevel.score,
        diseases: diseases.map(d => ({ key: d.key, nameBn: d.nameBn, score: d.score })),
        rainMm,
        humidity,
        temp,
        economicImpact,
        timestamp: Date.now()
    };
    
    body.innerHTML = `
        <div class="outbreak-card">
            <div class="outbreak-weather-grid">
                <div class="outbreak-weather-item">
                    <i class="fas fa-cloud-rain"></i>
                    <div class="outbreak-weather-value">${rainMm.toFixed(1)}</div>
                    <div class="outbreak-weather-label">mm (সর্বশেষ দিন)</div>
                </div>
                <div class="outbreak-weather-item">
                    <i class="fas fa-temperature-half"></i>
                    <div class="outbreak-weather-value">${temp.toFixed(1)}°C</div>
                    <div class="outbreak-weather-label">Temp</div>
                </div>
                <div class="outbreak-weather-item">
                    <i class="fas fa-droplet"></i>
                    <div class="outbreak-weather-value">${humidity.toFixed(0)}%</div>
                    <div class="outbreak-weather-label">Humidity</div>
                </div>
            </div>
            
            <div class="outbreak-vector">
                <div class="outbreak-vector-label">
                    <i class="fas fa-mosquito"></i>
                    <span>Vector Activity</span>
                </div>
                <div class="outbreak-vector-value" style="color:${riskLevel.color};">
                    ${vector.icon} ${escapeHtml(vector.labelBn)}
                </div>
            </div>
            
            <div class="outbreak-score">
                <div class="outbreak-score-label">
                    <span>Risk Score</span>
                    <strong style="color:${riskLevel.color};">${riskLevel.score}%</strong>
                </div>
                <div class="outbreak-score-bar">
                    <div class="outbreak-score-fill" style="width:${riskLevel.score}%;background:${riskLevel.color};"></div>
                </div>
            </div>
            
            <!-- ✅ NEW: Risk breakdown -->
            <div class="outbreak-breakdown">
                <div class="outbreak-breakdown-title">
                    <i class="fas fa-calculator"></i>
                    কেন ${riskLevel.score}%?
                </div>
                <div class="outbreak-breakdown-list">
                    ${riskLevel.breakdown.map(b => `
                        <div class="outbreak-breakdown-row">
                            <div class="outbreak-breakdown-icon">${b.icon}</div>
                            <div class="outbreak-breakdown-label">
                                ${escapeHtml(b.label)}
                                <span class="outbreak-breakdown-value">${escapeHtml(b.value)}</span>
                            </div>
                            <div class="outbreak-breakdown-bar-wrap">
                                <div class="outbreak-breakdown-bar" style="width:${(b.score / b.max) * 100}%;background:${riskLevel.color};"></div>
                            </div>
                            <div class="outbreak-breakdown-score" style="color:${riskLevel.color};">
                                +${b.score}
                            </div>
                        </div>
                        <div class="outbreak-breakdown-reason">${escapeHtml(b.reasonBn)}</div>
                    `).join('')}
                </div>
                <div class="outbreak-breakdown-total">
                    <span>মোট score:</span>
                    <strong style="color:${riskLevel.color};">
                        ${riskLevel.totalRawScore}/100
                        ${riskLevel.capped ? ' (capped at 100)' : ''}
                    </strong>
                </div>
            </div>
            
            <div class="outbreak-banner ${escapeHtml(alert.type)}"
                 style="background:${riskLevel.bg};border-color:${riskLevel.border};">
                <div class="outbreak-banner-icon">${alert.icon}</div>
                <div class="outbreak-banner-text">
                    <strong style="color:${riskLevel.color};">${escapeHtml(alert.titleBn)}</strong>
                    <p style="color:${riskLevel.color};">${escapeHtml(alert.messageBn)}</p>
                </div>
            </div>
            
            ${diseases.length > 0 ? `
                <div class="outbreak-diseases">
                    <div class="outbreak-diseases-title">
                        <i class="fas fa-virus"></i>
                        সতর্ক থাকুন এই রোগগুলোর জন্য
                    </div>
                    ${diseases.map(d => `
                        <div class="outbreak-disease-item">
                            <div class="outbreak-disease-icon">${VECTOR_ICON[d.vector] || '🌍'}</div>
                            <div class="outbreak-disease-info">
                                <div class="outbreak-disease-name">${escapeHtml(d.nameBn)}</div>
                                <div class="outbreak-disease-vector">${escapeHtml(d.vectorBn)} · Score ${d.score}%</div>
                            </div>
                            <div class="outbreak-disease-score"
                                 style="color:${d.score >= 70 ? '#dc2626' : d.score >= 50 ? '#c2410c' : '#92400e'};">
                                ${d.score}%
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            ${economicImpact.total > 0 ? `
                <div class="outbreak-economic">
                    <div class="outbreak-economic-title">
                        <i class="fas fa-coins"></i>
                        সম্ভাব্য আর্থিক ক্ষতি
                    </div>
                    <div class="outbreak-economic-value">
                        ৳ ${(economicImpact.total / 10000000).toFixed(2)} কোটি
                    </div>
                    ${economicImpact.overlap ? `<div class="dv-note">একই পশু একাধিক রোগে গণনা হতে পারে — তাই এটি সর্বোচ্চ সীমা। অনুমান: ঝুঁকিপূর্ণ পশুর ১০% আক্রান্ত।</div>` : ''}
                    <div class="outbreak-economic-breakdown">
                        ${economicImpact.breakdown.map(b => `
                            <div class="outbreak-economic-item">
                                <span>${escapeHtml(b.disease)}</span>
                                <span>${b.affectedHeads.toLocaleString()} পশু → ৳${b.lossCrore} কোটি</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div class="outbreak-prevention">
                <div class="outbreak-prevention-title">
                    <i class="fas fa-shield-halved"></i>
                    প্রতিরোধমূলক ব্যবস্থা
                </div>
                <ul class="outbreak-prevention-list">
                    <li>🦟 পশুকে মশারির নিচে রাখুন</li>
                    <li>💧 জমা পানি ও কাদা পরিষ্কার করুন</li>
                    <li>🏠 গোয়াল ঘর শুকনো ও পরিষ্কার রাখুন</li>
                    <li>💊 ভেটের পরামর্শে প্রয়োজনীয় টিকা দিন</li>
                </ul>
            </div>
        </div>`;
}

/* ===== SECTION 4: IMPACT with DETAILED calculation ===== */
async function renderImpact(riskContext, token, preloaded) {
    const body = _el('impactBody');
    if (!body) return;
    
    const district = currentDistrict;
    
    try {
        const sedac = preloaded || await NasaSedac.fetchSedacData(district);
        if (token !== loadToken) return;
        
        if (!sedac) {
            body.innerHTML = `
                <div class="climate-empty">
                    <i class="fas fa-map-location-dot"></i>
                    <span>SEDAC data not available for ${escapeHtml(district)}</span>
                </div>`;
            return;
        }
        
        const impact = NasaSedac.calculateImpactDetailed(sedac, riskContext);

        /* Publish for the notification engine (was missing: impact block never appeared in alerts) */
        window.__lastImpact = {
            populationAtRisk: impact.populationAtRisk,
            farmersAtRisk: impact.farmersAtRisk,
            livestockAtRisk: impact.livestockAtRisk,
            economicLoss: impact.economicLoss,
            breakdown: impact.breakdown
        };
        if (window.__lastOutbreakRisk) window.__lastOutbreakRisk.impact = window.__lastImpact;
        const summary = NasaSedac.generateImpactSummary(impact);
        const style = RISK_STYLE[impact.riskLevel] || RISK_STYLE.safe;
        const fmt = NasaSedac.formatNumber;
        
        body.innerHTML = `
            <div class="sedac-card">
                <div class="sedac-district">
                    <div class="sedac-district-icon"><i class="fas fa-map-marker-alt"></i></div>
                    <div class="sedac-district-info">
                        <div class="sedac-district-name">
                            ${escapeHtml(sedac.nameBn || sedac.name)} · ${escapeHtml(sedac.name)}
                        </div>
                        <div class="sedac-district-sub">NASA SEDAC · GPW v4 Population Data</div>
                    </div>
                </div>
                
                <div class="sedac-summary" style="background:${style.bg};border-color:${style.color};">
                    <div class="sedac-summary-icon" style="color:${style.color};">${style.icon}</div>
                    <div class="sedac-summary-text" style="color:${style.color};">${escapeHtml(summary)}</div>
                </div>
                
                <!-- ✅ NEW: Calculation steps -->
                <div class="sedac-calc-steps">
                    <div class="sedac-calc-title">
                        <i class="fas fa-list-ol"></i>
                        কীভাবে হিসাব করা হলো
                    </div>
                    ${impact.calculationSteps.map((step, i) => `
                        <div class="sedac-calc-row">
                            <div class="sedac-calc-num">${i + 1}</div>
                            <div class="sedac-calc-content">
                                <div class="sedac-calc-label">${escapeHtml(step.step)}</div>
                                <div class="sedac-calc-value">
                                    ${escapeHtml(fmtFull(step.value))}
                                    ${step.formula ? `<span class="sedac-calc-formula">${escapeHtml(step.formula)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="sedac-stats-grid">
                    <div class="sedac-stat">
                        <div class="sedac-stat-icon">👥</div>
                        <div class="sedac-stat-value">${fmt(impact.populationAtRisk)}</div>
                        <div class="sedac-stat-label">People at risk</div>
                    </div>
                    <div class="sedac-stat">
                        <div class="sedac-stat-icon">🧑‍🌾</div>
                        <div class="sedac-stat-value">${fmt(impact.farmersAtRisk)}</div>
                        <div class="sedac-stat-label">Marginal farmers</div>
                    </div>
                    <div class="sedac-stat">
                        <div class="sedac-stat-icon">🐄</div>
                        <div class="sedac-stat-value">${fmt(impact.breakdown.cattle)}</div>
                        <div class="sedac-stat-label">Cattle</div>
                    </div>
                    <div class="sedac-stat">
                        <div class="sedac-stat-icon">🐐</div>
                        <div class="sedac-stat-value">${fmt(impact.breakdown.goat)}</div>
                        <div class="sedac-stat-label">Goats</div>
                    </div>
                </div>
                
                <div class="sedac-total">
                    <div class="sedac-total-label">Total livestock at risk</div>
                    <div class="sedac-total-value" style="color:${style.color};">
                        🐾 ${fmt(impact.livestockAtRisk)}
                    </div>
                </div>
                
                <!-- ✅ NEW: Economic loss -->
                <div class="sedac-economic">
                    <div class="sedac-economic-title">
                        <i class="fas fa-coins"></i>
                        সম্ভাব্য আর্থিক ক্ষতি
                    </div>
                    <div class="sedac-economic-range">
                        ৳ ${impact.economicLoss.minCrore} – ${impact.economicLoss.maxCrore} কোটি
                    </div>
                    <div class="dv-note">অনুমান: ঝুঁকিতে থাকা পশুর ${(impact.lossRate * 100).toFixed(1)}% ক্ষতিগ্রস্ত হতে পারে (গড় বাজারমূল্য অনুযায়ী)।</div>
                    <div class="sedac-economic-breakdown">
                        <div class="sedac-economic-item">
                            <span>🐄 গরু</span>
                            <span>৳${(impact.economicLoss.breakdown.cattle / 10000000).toFixed(2)} কোটি</span>
                        </div>
                        <div class="sedac-economic-item">
                            <span>🐐 ছাগল</span>
                            <span>৳${(impact.economicLoss.breakdown.goat / 10000000).toFixed(2)} কোটি</span>
                        </div>
                        <div class="sedac-economic-item">
                            <span>🐑 ভেড়া</span>
                            <span>৳${(impact.economicLoss.breakdown.sheep / 10000000).toFixed(2)} কোটি</span>
                        </div>
                        <div class="sedac-economic-item">
                            <span>🐔 মুরগি</span>
                            <span>৳${(impact.economicLoss.breakdown.poultry / 10000000).toFixed(2)} কোটি</span>
                        </div>
                    </div>
                </div>
                
                <div class="sedac-vulnerability">
                    <div class="sedac-vulnerability-header">
                        <span>Vulnerability Index</span>
                        <strong style="color:${style.color};">${impact.vulnerability}%</strong>
                    </div>
                    <div class="sedac-vulnerability-bar">
                        <div class="sedac-vulnerability-fill" style="width:${impact.vulnerability}%;background:${style.color};"></div>
                    </div>
                </div>
                
                <div class="sedac-source">
                    <i class="fas fa-database"></i>
                    <span>Data: <strong>NASA SEDAC GPW v4</strong> + Bangladesh DLS</span>
                </div>
            </div>`;
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

/* ===== MAIN LOADER ===== */
async function loadAllSections() {
    const coords = DISTRICT_COORDS[currentDistrict];
    if (!coords) return;
    
    const token = ++loadToken;
    clearTimeout(alertTimer);
    window.__lastOutbreakRisk = null;
    window.__lastImpact = null;
    
    SECTION_IDS.forEach(showLoading);
    
    let parameter;
    try {
        parameter = await NasaPower.getPowerData(coords.lat, coords.lng, 7);
    } catch (err) {
        if (token !== loadToken) return;
        console.error('[Climate] Load failed:', err);
        SECTION_IDS.forEach(id => showError(id, 'Failed to load NASA data'));
        return;
    }
    if (token !== loadToken) return;
    
    lastParameter = parameter;

    /* SEDAC first: outbreak economics and the impact card both need this division's livestock */
    let sedac = null;
    try { sedac = await NasaSedac.fetchSedacData(currentDistrict); }
    catch (err) { console.warn('[Climate] SEDAC unavailable:', err.message); }
    if (token !== loadToken) return;

    safeRender('thiBody', () => renderTHI(parameter));
    safeRender('forageBody', () => renderForage(parameter));
    safeRender('outbreakBody', () => renderOutbreak(parameter, sedac));

    appendDataBadge('thiBody', parameter, 'NASA POWER · T2M, RH2M');
    appendDataBadge('forageBody', parameter, 'NASA POWER · GWETTOP, GWETROOT');
    appendDataBadge('outbreakBody', parameter, 'NASA POWER · PRECTOTCORR, RH2M, T2M');
    renderPushControl(_el('outbreakBody'));

    const riskCtx = window.__lastOutbreakRisk || { level: 'safe', score: 0 };
    await renderImpact(riskCtx, token, sedac);
    if (token !== loadToken) return;
    
    if (window.__lastOutbreakRisk && typeof window.triggerNasaOutbreakAlert === 'function') {
        alertTimer = setTimeout(() => {
            if (token === loadToken) window.triggerNasaOutbreakAlert();
        }, ALERT_DELAY_MS);
    }
}

/* ===== INIT ===== */
function getUserPhone() {
    try {
        return sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    } catch (_) { return null; }
}

function init() {
    if (!getUserPhone()) {
        window.location.replace('login.html');
        return;
    }
    
    injectExtraStyles();
    document.addEventListener('change', e => {
        if (e.target && e.target.id === 'thiSpecies') window.__changeSpecies(e.target.value);
    });

    const select = _el('climateDistrict');
    if (select) {
        if (DISTRICT_COORDS[select.value]) currentDistrict = select.value;
        select.addEventListener('change', e => {
            if (!DISTRICT_COORDS[e.target.value]) return;
            currentDistrict = e.target.value;
            loadAllSections();
        });
    }
    
    loadAllSections();
}

/* Public hooks (used by the admin analytics map) */
window.DVClimate = {
    reload: () => loadAllSections(),
    setDistrict(key) {
        if (!DISTRICT_COORDS[key]) return false;
        currentDistrict = key;
        const select = _el('climateDistrict');
        if (select) select.value = key;
        loadAllSections();
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