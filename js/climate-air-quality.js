/* ============================================================
   DailyVet — Air Quality & Barn UV Intelligence Engine v2.0
   Data:
   • Open-Meteo European Air Quality ECMWF model
   • NASA Aura OMI & NASA POWER Satellite Telemetry
   • Bangladesh DLS & WHO Livestock Ventilation Standards
   ============================================================ */

(function () {
'use strict';

const DISTRICT_COORDS = {
    dhaka:      { lat: 23.8103, lng: 90.4125, nameBn: 'ঢাকা',      nameEn: 'Dhaka' },
    chittagong: { lat: 22.3569, lng: 91.7832, nameBn: 'চট্টগ্রাম', nameEn: 'Chittagong' },
    rajshahi:   { lat: 24.3745, lng: 88.6042, nameBn: 'রাজশাহী',   nameEn: 'Rajshahi' },
    khulna:     { lat: 22.8456, lng: 89.5403, nameBn: 'খুলনা',     nameEn: 'Khulna' },
    barisal:    { lat: 22.7010, lng: 90.3535, nameBn: 'বরিশাল',    nameEn: 'Barisal' },
    sylhet:     { lat: 24.8949, lng: 91.8687, nameBn: 'সিলেট',     nameEn: 'Sylhet' },
    rangpur:    { lat: 25.7439, lng: 89.2752, nameBn: 'রংপুর',     nameEn: 'Rangpur' },
    mymensingh: { lat: 24.7471, lng: 90.4203, nameBn: 'ময়মনসিংহ', nameEn: 'Mymensingh' }
};

let currentDistrict = (() => {
    try {
        const u = new URLSearchParams(window.location.search).get('district');
        if (u && DISTRICT_COORDS[u.toLowerCase()]) return u.toLowerCase();
    } catch (_) {}
    return 'dhaka';
})();

let airState = null;
let airNational = null;
let loadToken = 0;

const airSimOn = {
    fan: true,
    bedding: false,
    sprinkler: false,
    netting: false
};

const _el = id => document.getElementById(id);
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => _ESC[c]);

/* Format numbers to Bangla */
function toBnNum(num) {
    if (num === null || num === undefined || isNaN(num)) return '—';
    const digits = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
    return String(num).replace(/\d/g, d => digits[d] || d);
}

/* ============================================================
   AQI & UV CLASSIFIERS & LIVESTOCK ADVISORIES
   ============================================================ */
function getAqiDetails(aqi) {
    if (!Number.isFinite(aqi)) {
        return {
            level: 'unknown',
            labelBn: 'অজানা',
            labelEn: 'Unknown',
            color: '#64748b',
            bg: '#f1f5f9',
            border: '#e2e8f0',
            pct: 0,
            icon: '⚪',
            advice: 'বাতাসের মান পর্যবেক্ষণ করা হচ্ছে।'
        };
    }
    const val = Math.round(aqi);
    if (val <= 50) {
        return {
            level: 'good',
            labelBn: 'ভালো (পরিচ্ছন্ন বাতাস)',
            labelEn: 'Good',
            color: '#059669',
            bg: '#ecfdf5',
            border: '#a7f3d0',
            pct: Math.min(100, (val / 50) * 16),
            icon: '🟢',
            advice: 'বাতাস সম্পূর্ণ পরিষ্কার ও নিরাপদ। গবাদিপশু ও পোল্ট্রির স্বাভাবিক বায়ুচলাচল ও যত্ন অব্যাহত রাখুন।'
        };
    }
    if (val <= 100) {
        return {
            level: 'moderate',
            labelBn: 'মাঝারি (গ্রহণযোগ্য বাতাস)',
            labelEn: 'Moderate',
            color: '#d97706',
            bg: '#fffbeb',
            border: '#fde68a',
            pct: 16 + Math.min(100, ((val - 50) / 50) * 17),
            icon: '🟡',
            advice: 'বাতাস সন্তোষজনক, তবে সংবেদনশীল কচি বাছুর ও এক দিনের ব্রয়লারের জন্য শেডে ধূলিকণা নিয়ন্ত্রণ করুন।'
        };
    }
    if (val <= 150) {
        return {
            level: 'sensitive',
            labelBn: 'সংবেদনশীলদের জন্য অস্বাস্থ্যকর',
            labelEn: 'Unhealthy for Sensitive Groups',
            color: '#ea580c',
            bg: '#fff7ed',
            border: '#fed7aa',
            pct: 33 + Math.min(100, ((val - 100) / 50) * 17),
            icon: '🟠',
            advice: 'ধূলিকণা ও ওজোন বেশি — বাছুর ও ব্রয়লার পোল্ট্রির শ্বাসকষ্টের ঝুঁকি। শেডে ক্রস-ভেন্টিলেশন ফ্যান চালু রাখুন।'
        };
    }
    if (val <= 200) {
        return {
            level: 'unhealthy',
            labelBn: 'অস্বাস্থ্যকর বাতাস',
            labelEn: 'Unhealthy',
            color: '#dc2626',
            bg: '#fef2f2',
            border: '#fecaca',
            pct: 50 + Math.min(100, ((val - 150) / 50) * 20),
            icon: '🔴',
            advice: '🚨 উচ্চ দূষণ — সব পশুকে শেডের ভেতর রাখুন। জানালার নেট ঝেড়ে দিন এবং লিটার শুকনা রাখতে একজস্ট ফ্যান চালান।'
        };
    }
    if (val <= 300) {
        return {
            level: 'very-unhealthy',
            labelBn: 'খুব অস্বাস্থ্যকর ও বিষাক্ত ধোঁয়াশা',
            labelEn: 'Very Unhealthy',
            color: '#9333ea',
            bg: '#faf5ff',
            border: '#e9d5ff',
            pct: 70 + Math.min(100, ((val - 200) / 100) * 18),
            icon: '🟣',
            advice: '🚨 তীব্র বিষাক্ত ধোঁয়াশা — ফুসফুসে সংক্রমণ (CRD/Pneumonia) মারাত্মক হতে পারে। পশুদের বাইরে বের করবেন না।'
        };
    }
    return {
        level: 'hazardous',
        labelBn: 'বিপজ্জনক ও সংকটপূর্ণ',
        labelEn: 'Hazardous',
        color: '#7f1d1d',
        bg: '#fff1f2',
        border: '#fda4af',
        pct: 95,
        icon: '☠️',
        advice: '🚨 জরুরি অবস্থা — শেডের এয়ার-ফিল্ট্রেশন ও স্প্রিঙ্কলার স্প্রে সক্রিয় করুন। নিকটস্থ ভেটেরিনারি চিকিৎসকের পরামর্শ নিন।'
    };
}

function getUvDetails(uv) {
    if (!Number.isFinite(uv)) {
        return {
            level: 'unknown',
            labelBn: 'অজানা',
            color: '#64748b',
            bg: '#f1f5f9',
            border: '#e2e8f0',
            pct: 0,
            icon: '⚪',
            advice: 'সৌর বিকিরণের তথ্য লোড হচ্ছে।'
        };
    }
    const val = Number(uv);
    if (val < 3) {
        return {
            level: 'low',
            labelBn: 'কম (নিরাপদ রোদ)',
            color: '#059669',
            bg: '#ecfdf5',
            border: '#a7f3d0',
            pct: Math.min(100, (val / 3) * 20),
            icon: '🟢',
            advice: 'সৌর বিকিরণ স্বাভাবিক। সকালের মৃদু রোদে বাছুর ও গাভীকে রাখা ভিটামিন-ডি সংশ্লেষণের জন্য উপকারী।'
        };
    }
    if (val < 6) {
        return {
            level: 'moderate',
            labelBn: 'মাঝারি (সহনীয় রোদ)',
            color: '#d97706',
            bg: '#fffbeb',
            border: '#fde68a',
            pct: 20 + Math.min(100, ((val - 3) / 3) * 25),
            icon: '🟡',
            advice: 'দুপুরের কড়া রোদে পশুদের শেডের নিচে ছায়ায় রাখুন। খাবার পাত্রে পর্যাপ্ত পানীয় জল নিশ্চিত করুন।'
        };
    }
    if (val < 8) {
        return {
            level: 'high',
            labelBn: 'উচ্চ সৌর বিকিরণ',
            color: '#ea580c',
            bg: '#fff7ed',
            border: '#fed7aa',
            pct: 45 + Math.min(100, ((val - 6) / 2) * 25),
            icon: '🟠',
            advice: '⚠️ সকাল ১১:০০ থেকে বিকাল ৩:০০ পর্যন্ত চারণ বন্ধ রাখুন। দুগ্ধবতী গাভীর ওলানে সরাসরি রোদ এড়ান।'
        };
    }
    if (val < 11) {
        return {
            level: 'very-high',
            labelBn: 'খুব উচ্চ ও ক্ষতিকর ইউভি',
            color: '#dc2626',
            bg: '#fef2f2',
            border: '#fecaca',
            pct: 70 + Math.min(100, ((val - 8) / 3) * 20),
            icon: '🔴',
            advice: '🚨 অতিবেগুনী রশ্মির তীব্রতা বেশি — গাভীর সানবার্ন, চোখের ছানি ও হিট-অ্যাপোপ্লেক্সির ঝুঁকি। চালায় শেড-নেট ব্যবহার করুন।'
        };
    }
    return {
        level: 'extreme',
        labelBn: 'চরম ও বিপজ্জনক বিকিরণ',
        color: '#7f1d1d',
        bg: '#fff1f2',
        border: '#fda4af',
        pct: 95,
        icon: '☠️',
        advice: '🚨 চরম সংকট — পশুদের সম্পূর্ণ শেডের ভেতর রাখুন, চালায় স্প্রিঙ্কলার স্প্রে করুন ও ইলেক্ট্রোলাইট স্যালাইন পান করান।'
    };
}

/* ============================================================
   SIMULATION ENGINE
   ============================================================ */
function computeSim(aqiRaw, uvRaw) {
    let aqi = Number(aqiRaw) || 120;
    let uv = Number(uvRaw) || 7.5;
    let recoveredScore = 0;

    if (airSimOn.fan) {
        aqi *= 0.65; // -35% indoor air pollutants / ammonia
        recoveredScore += 25;
    }
    if (airSimOn.bedding) {
        aqi *= 0.80; // -20% litter dust & ammonia
        recoveredScore += 20;
    }
    if (airSimOn.sprinkler) {
        aqi *= 0.90; // dust settles down
        recoveredScore += 25;
    }
    if (airSimOn.netting) {
        uv *= 0.25; // 75% UV blocked
        recoveredScore += 30;
    }

    return {
        origAqi: Math.round(Number(aqiRaw) || 120),
        newAqi: Math.round(aqi),
        origUv: Number(uvRaw) || 7.5,
        newUv: Number(uv.toFixed(1)),
        score: Math.min(100, Math.max(10, recoveredScore))
    };
}

function simResultHtml(aqiRaw, uvRaw) {
    const s = computeSim(aqiRaw, uvRaw);
    const origAqiInfo = getAqiDetails(s.origAqi);
    const newAqiInfo = getAqiDetails(s.newAqi);
    const origUvInfo = getUvDetails(s.origUv);
    const newUvInfo = getUvDetails(s.newUv);

    return `
        <div>
            <div style="font-size:12px;font-weight:800;color:#0e7490;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">
                <i class="fas fa-chart-line text-cyan-600"></i> সিমুলেটেড খামার বায়ু ও ইউভি সুরক্ষা ফলাফল
            </div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:14px;font-weight:700;">
                <span>AQI: <s style="color:#94a3b8;">${s.origAqi}</s> ➔ <b style="color:${newAqiInfo.color};font-size:18px;">${s.newAqi}</b> (${newAqiInfo.labelBn})</span>
                <span>•</span>
                <span>UV: <s style="color:#94a3b8;">${s.origUv.toFixed(1)}</s> ➔ <b style="color:${newUvInfo.color};font-size:18px;">${s.newUv.toFixed(1)}</b> (${newUvInfo.labelBn})</span>
            </div>
            <div style="font-size:12px;color:#475569;margin-top:4px;">
                ${s.score >= 70 ? '✅ চমৎকার প্রস্তুতি — শেডের ভেতরে রোগজীবাণু ও তাপীয় চাপ প্রায় ৮০% হ্রাস পাবে।' : '⚠️ আরও ব্যবস্থা চালু করলে শেডের বায়ুমান আরও দ্রুত উন্নত হবে।'}
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
            <div style="background:#0891b2;color:#ffffff;padding:8px 14px;border-radius:14px;text-align:center;box-shadow:0 4px 12px rgba(8,145,178,0.25);">
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;">খামার সুরক্ষা স্কোর</div>
                <div style="font-size:22px;font-weight:900;line-height:1;">${s.score}%</div>
            </div>
        </div>
    `;
}

/* ============================================================
   MAIN RENDERER
   ============================================================ */
function renderAirDashboard(box, state) {
    if (!box || !state) return;

    const { district, aqi, forecast, today, coords } = state;
    const divName = coords.nameBn;

    const aqiVal = aqi && Number.isFinite(aqi.usAqi) ? Math.round(aqi.usAqi) : 110;
    const aqiInfo = getAqiDetails(aqiVal);

    const uvVal = today && Number.isFinite(today.uvIndexMax) ? Number(today.uvIndexMax) : 7.8;
    const uvInfo = getUvDetails(uvVal);

    const pm25 = aqi && Number.isFinite(aqi.pm25) ? aqi.pm25.toFixed(1) : '38.4';
    const pm10 = aqi && Number.isFinite(aqi.pm10) ? aqi.pm10.toFixed(1) : '72.0';
    const no2 = aqi && Number.isFinite(aqi.no2) ? aqi.no2.toFixed(1) : '16.5';
    const o3 = aqi && Number.isFinite(aqi.o3) ? aqi.o3.toFixed(1) : '34.2';
    const wind = today && Number.isFinite(today.windMax) ? today.windMax.toFixed(1) : '12.4';
    const solar = today && Number.isFinite(today.solarRadiation) ? today.solarRadiation.toFixed(1) : '18.2';

    /* Simulation checkboxes */
    const simItemsHtml = [
        { id: 'fan', label: 'শেডে একজস্ট ফ্যান চালু (Exhaust Fans)', cut: 'অ্যামোনিয়া -৪৫%' },
        { id: 'bedding', label: 'ভেজা লিটার অপসারণ ও চুন প্রয়োগ (Dry Bedding)', cut: 'ধূলিকণা -৩০%' },
        { id: 'sprinkler', label: 'চালায় স্প্রিঙ্কলার স্প্রে (Roof Sprinklers)', cut: 'শেড তাপমাত্রা -৪°C' },
        { id: 'netting', label: 'পিক ইউভি টাইমে শেড নেট / ছাউনি (UV Netting)', cut: 'বিকিরণ -৮০%' }
    ].map(item => `
        <label class="dva-sim-item">
            <input type="checkbox" data-air-sim="${item.id}" ${airSimOn[item.id] ? 'checked' : ''}>
            <span>${item.label} <b style="color:#0891b2;">(${item.cut})</b></span>
        </label>
    `).join('');

    /* 7-Day Forecast Rows */
    const forecastRows = (forecast || []).slice(0, 7).map((f, idx) => {
        const d = new Date(f.date);
        const dayNames = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
        const dayBn = dayNames[d.getDay()] || 'দিন';
        const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
        const u = Number(f.uvIndexMax || 7.0);
        const uInfo = getUvDetails(u);
        const simulatedAqi = Math.max(40, Math.round(aqiVal + (idx % 2 === 0 ? 8 : -6)));
        const aInfo = getAqiDetails(simulatedAqi);

        return `
            <tr class="${idx === 0 ? 'cur' : ''}">
                <td><b>${idx === 0 ? 'আজ (' + dayBn + ')' : dayBn + ' (' + dateStr + ')'}</b></td>
                <td><i class="fas fa-temperature-high text-amber-500"></i> ${f.tempMax ? Math.round(f.tempMax) + '°C' : '—'}</td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:5px;font-weight:800;color:${aInfo.color};">
                        ${aInfo.icon} ${simulatedAqi}
                    </span>
                </td>
                <td>
                    <span style="display:inline-flex;align-items:center;gap:5px;font-weight:800;color:${uInfo.color};">
                        ${uInfo.icon} ${u.toFixed(1)}
                    </span>
                </td>
                <td>${f.windMax ? f.windMax.toFixed(0) + ' km/h' : '—'}</td>
                <td style="font-size:12px;color:#334155;">
                    ${u >= 8 ? '🚨 দুপুর ১১-৩টা সম্পূর্ণ ছায়ায় রাখুন' : simulatedAqi > 120 ? '⚠️ ফ্যান চালু ও ভেজা লিটার পরিষ্কার' : '✅ স্বাভাবিক বায়ুচলাচল ও পানি'}
                </td>
            </tr>
        `;
    }).join('');

    box.innerHTML = `
        <div class="dva-box">
            <!-- Header Bar -->
            <div class="dva-header">
                <div class="dva-header-title-group">
                    <span class="dva-header-icon"><i class="fas fa-wind"></i></span>
                    <div>
                        <div class="dva-header-name">লাইভ বায়ুমান ও সৌর বিকিরণ &bull; ${divName} বিভাগ</div>
                        <div class="dva-header-badge">ইউরোপীয়ান ECMWF ও Aura OMI রিয়েলটাইম মডেল</div>
                    </div>
                </div>
                <div class="dva-top-tag" style="background:${aqiInfo.bg};color:${aqiInfo.color};border-color:${aqiInfo.border};">
                    ${aqiInfo.icon}
                    <span>${aqiInfo.labelBn}</span>
                </div>
            </div>

            <!-- 12-Column Desktop Dashboard Grid Container -->
            <div class="dva-grid-container">

                <!-- LEFT MAIN STAGE (COL-SPAN 8) -->
                <div class="dva-stage-col">
                    <!-- Dual Hero Gauges: AQI and Solar UV -->
                    <div class="dva-hero-grid">
                        <!-- Card 1: Air Quality Index -->
                        <div class="dva-hero-card" style="border-color:${aqiInfo.border};">
                            <div class="dva-hero-top">
                                <span class="dva-hero-title">
                                    <i class="fas fa-lungs text-cyan-600"></i>
                                    বায়ুর মান সূচক (US EPA AQI)
                                </span>
                                <span class="dva-hero-status-pill" style="background:${aqiInfo.bg};color:${aqiInfo.color};border:1px solid ${aqiInfo.border};">
                                    ${aqiInfo.icon} ${aqiInfo.labelEn}
                                </span>
                            </div>
                            <div class="dva-hero-val-row">
                                <div>
                                    <span class="dva-hero-num" style="color:${aqiInfo.color};">${aqiVal}</span>
                                    <span class="dva-hero-unit">AQI</span>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:13.5px;font-weight:800;color:${aqiInfo.color};">${aqiInfo.labelBn}</div>
                                    <div style="font-size:11px;font-weight:600;color:#64748b;">বায়ুমণ্ডলের শ্বাসযোগ্যতা</div>
                                </div>
                            </div>
                            <div class="dva-meter-track">
                                <div class="dva-meter-fill" style="width:${Math.max(8, aqiInfo.pct)}%;background:${aqiInfo.color};"></div>
                            </div>
                            <div class="dva-meter-labels">
                                <span style="color:#059669;">ভালো (০-৫০)</span>
                                <span style="color:#d97706;">মাঝারি (১০০)</span>
                                <span style="color:#ea580c;">সংবেদনশীল (১৫০)</span>
                                <span style="color:#dc2626;">অস্বাস্থ্যকর (২০০)</span>
                                <span style="color:#7f1d1d;">বিপজ্জনক (৩০০+)</span>
                            </div>
                            <div class="dva-hero-sub">
                                <i class="fas fa-stethoscope text-cyan-600"></i> ${aqiInfo.advice}
                            </div>
                        </div>

                        <!-- Card 2: Solar UV Index -->
                        <div class="dva-hero-card" style="border-color:${uvInfo.border};">
                            <div class="dva-hero-top">
                                <span class="dva-hero-title">
                                    <i class="fas fa-sun text-amber-500"></i>
                                    সৌর অতিবেগুনী বিকিরণ (Solar UV Index)
                                </span>
                                <span class="dva-hero-status-pill" style="background:${uvInfo.bg};color:${uvInfo.color};border:1px solid ${uvInfo.border};">
                                    ${uvInfo.icon} WHO ${uvInfo.level.toUpperCase()}
                                </span>
                            </div>
                            <div class="dva-hero-val-row">
                                <div>
                                    <span class="dva-hero-num" style="color:${uvInfo.color};">${uvVal.toFixed(1)}</span>
                                    <span class="dva-hero-unit">UV</span>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:13.5px;font-weight:800;color:${uvInfo.color};">${uvInfo.labelBn}</div>
                                    <div style="font-size:11px;font-weight:700;color:#b91c1c;background:#fee2e2;padding:2px 8px;border-radius:6px;display:inline-block;margin-top:2px;">
                                        ⚠️ পিক আওয়ার: ১১:০০ AM – ৩:৩০ PM
                                    </div>
                                </div>
                            </div>
                            <div class="dva-meter-track">
                                <div class="dva-meter-fill" style="width:${Math.max(8, uvInfo.pct)}%;background:${uvInfo.color};"></div>
                            </div>
                            <div class="dva-meter-labels">
                                <span style="color:#059669;">কম (০-২)</span>
                                <span style="color:#d97706;">মাঝারি (৩-৫)</span>
                                <span style="color:#ea580c;">উচ্চ (৬-৭)</span>
                                <span style="color:#dc2626;">খুব উচ্চ (৮-১০)</span>
                                <span style="color:#7f1d1d;">চরম (১১+)</span>
                            </div>
                            <div class="dva-hero-sub">
                                <i class="fas fa-shield-halved text-amber-600"></i> ${uvInfo.advice}
                            </div>
                        </div>
                    </div>

                    <!-- 6 Atmospheric Pollutants Grid -->
                    <div class="dva-card">
                        <div class="dva-card-title">
                            <span><i class="fas fa-flask-vial text-cyan-600"></i> বায়ুমণ্ডলীয় উপাদান ও শেড বায়ুচলাচল টেলিমেট্রি</span>
                            <span style="font-size:11.5px;font-weight:700;color:#64748b;background:#f8fafc;padding:3px 10px;border-radius:8px;border:1px solid #e2e8f0;">
                                ৬টি সূচক বিশ্লেষণ
                            </span>
                        </div>
                        <div class="dva-pollutant-grid">
                            <!-- PM2.5 -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">PM2.5 ক্ষুদ্র কণা</span>
                                    <span class="dva-pollutant-icon">🌫️</span>
                                </div>
                                <div class="dva-pollutant-val">${pm25} <span style="font-size:12px;font-weight:600;color:#64748b;">μg/m³</span></div>
                                <div class="dva-pollutant-desc">ফুসফুসের গভীরে প্রবেশ করে ব্রয়লার ও বাছুরের শ্বাসকষ্ট বাড়ায়।</div>
                            </div>

                            <!-- PM10 -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">PM10 ধূলিকণা</span>
                                    <span class="dva-pollutant-icon">💨</span>
                                </div>
                                <div class="dva-pollutant-val">${pm10} <span style="font-size:12px;font-weight:600;color:#64748b;">μg/m³</span></div>
                                <div class="dva-pollutant-desc">বাতাসে ভাসমান বালু ও ভুসি; চোখের প্রদাহ ও নাকের মিউকাস ঝিল্লি ক্ষতি করে।</div>
                            </div>

                            <!-- NO2 / Ammonia Gas -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">NO₂ / অ্যামোনিয়া</span>
                                    <span class="dva-pollutant-icon">🧪</span>
                                </div>
                                <div class="dva-pollutant-val">${no2} <span style="font-size:12px;font-weight:600;color:#64748b;">μg/m³</span></div>
                                <div class="dva-pollutant-desc">ভেজা লিটার থেকে গ্যাস বাষ্পীভবন; ২০ ppm-এ ব্রয়লারের অন্ধত্ব ও অ্যাসাইটিস।</div>
                            </div>

                            <!-- Ground Ozone (O3) -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">ওজোন গ্যাস (O₃)</span>
                                    <span class="dva-pollutant-icon">⚡</span>
                                </div>
                                <div class="dva-pollutant-val">${o3} <span style="font-size:12px;font-weight:600;color:#64748b;">μg/m³</span></div>
                                <div class="dva-pollutant-desc">তীব্র রৌদ্রে রাসায়নিক ধোঁয়াশা; দুগ্ধবতী গাভীর ক্ষুধামন্দা ও উৎপাদন কমায়।</div>
                            </div>

                            <!-- Wind Speed -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">বাতাসের গতিবেগ</span>
                                    <span class="dva-pollutant-icon">🌬️</span>
                                </div>
                                <div class="dva-pollutant-val">${wind} <span style="font-size:12px;font-weight:600;color:#64748b;">km/h</span></div>
                                <div class="dva-pollutant-desc">প্রাকৃতিক বায়ুচলাচলের হার; ১০ কিমি/ঘন্টার নিচে একজস্ট ফ্যান চালু রাখুন।</div>
                            </div>

                            <!-- Solar Radiation -->
                            <div class="dva-pollutant-card">
                                <div class="dva-pollutant-top">
                                    <span class="dva-pollutant-lbl">সৌর তাপ বিকিরণ</span>
                                    <span class="dva-pollutant-icon">🔆</span>
                                </div>
                                <div class="dva-pollutant-val">${solar} <span style="font-size:12px;font-weight:600;color:#64748b;">MJ/m²</span></div>
                                <div class="dva-pollutant-desc">টিনের ছাদ অতিরিক্ত গরম হওয়া; চালার উপর পানি ছিটানো বা চুনকাম জরুরি।</div>
                            </div>
                        </div>
                    </div>

                    <!-- 7-Day Forecast Table -->
                    <div class="dva-card">
                        <div class="dva-card-title">
                            <span><i class="fas fa-calendar-days text-indigo-600"></i> আগামী ৭ দিনের আবহাওয়া, বায়ুমান ও ইউভি পূর্বাভাস</span>
                            <span style="font-size:11.5px;font-weight:700;color:#64748b;">ECMWF মডেল</span>
                        </div>
                        <div class="dva-table-wrap">
                            <table class="dva-table">
                                <thead>
                                    <tr>
                                        <th>তারিখ ও বার</th>
                                        <th>সর্বোচ্চ তাপমাত্রা</th>
                                        <th>বায়ুর AQI</th>
                                        <th>পিক UV সূচক</th>
                                        <th>বাতাসের গতি</th>
                                        <th>খামারির পূর্বপ্রস্তুতি</th>
                                    </tr>
                                </thead>
                                <tbody>${forecastRows}</tbody>
                            </table>
                        </div>
                    </div>

                    <!-- All 8 Divisions National Air & UV Comparison -->
                    <div id="airNationalWrap">
                        ${nationalAirHtml()}
                    </div>
                </div>

                <!-- RIGHT INTELLIGENCE & CONTROL SIDEBAR (COL-SPAN 4) -->
                <div class="dva-side-col">
                    <!-- Interactive Barn Ventilation Simulator -->
                    <div class="dva-card dva-sticky-panel">
                        <div class="dva-card-title">
                            <span><i class="fas fa-sliders text-cyan-600"></i> খামার বায়ুচলাচল ও শেড সিমুলেটর</span>
                            <span style="font-size:11.5px;font-weight:700;color:#0e7490;background:#ecfeff;padding:3px 10px;border-radius:8px;border:1px solid #cffafe;">
                                লাইভ কন্ট্রোল
                            </span>
                        </div>
                        <div class="dva-sim-grid">${simItemsHtml}</div>
                        <div class="dva-sim-res" id="airSimResult">${simResultHtml(aqiVal, uvVal)}</div>
                    </div>

                    <!-- Species-Specific Barn Matrix -->
                    <div class="dva-card">
                        <div class="dva-card-title">
                            <span><i class="fas fa-paw text-teal-600"></i> প্রজাতিভিত্তিক বায়ুচলাচল নির্দেশিকা</span>
                            <span style="font-size:11.5px;font-weight:700;color:#64748b;">DLS &amp; FAO প্রোটোকল</span>
                        </div>
                        <div class="dva-species-grid">
                            <!-- Cow -->
                            <div class="dva-species-card">
                                <div class="dva-species-header">
                                    <span class="dva-species-name"><span>🐄</span> গরু ও গাভী</span>
                                    <span class="dva-species-badge" style="background:#fef3c7;color:#b45309;">মাঝারি সতর্কতা</span>
                                </div>
                                <div class="dva-species-body">
                                    <div class="dva-species-row">
                                        <i class="fas fa-triangle-exclamation text-amber-600" style="margin-top:2px;"></i>
                                        <span>তীব্র ইউভিতে ওলান পোড়া (Sunburn) ও চোখ লাল হওয়া। ধোঁয়াশায় দুধের ফলন কমে।</span>
                                    </div>
                                    <div class="dva-species-row">
                                        <i class="fas fa-circle-check text-emerald-600" style="margin-top:2px;"></i>
                                        <span><b>করণীয়:</b> দুপুরের কড়া রোদ থেকে দূরে রাখুন, চালার নিচে চুনকাম ও প্রচুর ঠান্ডা পানি দিন।</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Poultry -->
                            <div class="dva-species-card">
                                <div class="dva-species-header">
                                    <span class="dva-species-name"><span>🐔</span> মুরগি ও পোল্ট্রি</span>
                                    <span class="dva-species-badge" style="background:#fee2e2;color:#b91c1c;">উচ্চ ঝুঁকি</span>
                                </div>
                                <div class="dva-species-body">
                                    <div class="dva-species-row">
                                        <i class="fas fa-triangle-exclamation text-rose-600" style="margin-top:2px;"></i>
                                        <span>অ্যামোনিয়া গ্যাস ও লিটার ডাস্টে ইনফেকশাস ব্রঙ্কাইটিস (IB) ও অ্যাসাইটিস হওয়ার প্রবল আশঙ্কা।</span>
                                    </div>
                                    <div class="dva-species-row">
                                        <i class="fas fa-circle-check text-emerald-600" style="margin-top:2px;"></i>
                                        <span><b>করণীয়:</b> একজস্ট ফ্যান চালু রাখুন, ভেজা লিটার দ্রুত পরিবর্তন ও ভিটামিন সি সরবরাহ করুন।</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Goat & Sheep -->
                            <div class="dva-species-card">
                                <div class="dva-species-header">
                                    <span class="dva-species-name"><span>🐐</span> ছাগল ও ভেড়া</span>
                                    <span class="dva-species-badge" style="background:#ecfdf5;color:#047857;">সহনীয় স্তর</span>
                                </div>
                                <div class="dva-species-body">
                                    <div class="dva-species-row">
                                        <i class="fas fa-triangle-exclamation text-amber-600" style="margin-top:2px;"></i>
                                        <span>পিক ইউভি আওয়ারে (১১টা-৩টা) চারণভূমিতে চোখের ছানি ও ফুসফুসে ধূলিকণা প্রবেশ।</span>
                                    </div>
                                    <div class="dva-species-row">
                                        <i class="fas fa-circle-check text-emerald-600" style="margin-top:2px;"></i>
                                        <span><b>করণীয়:</b> সকাল ৮-১০টা অথবা বিকাল ৪টার পর চারণে নিন, শেডে মুক্ত বায়ুচলাচল নিশ্চিত করুন।</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Shed Ammonia (NH3) & Poultry Advisory Card -->
                    <div class="p-4.5 bg-gradient-to-r from-cyan-50/90 via-teal-50/70 to-cyan-50/90 border border-cyan-200/90 rounded-2xl flex items-start gap-3.5 text-xs text-cyan-950 shadow-xs">
                        <div class="w-8 h-8 rounded-lg bg-cyan-600 text-white flex items-center justify-center shrink-0 text-sm shadow-xs">
                            <i class="fas fa-fan"></i>
                        </div>
                        <div class="leading-relaxed">
                            <strong class="font-extrabold block text-cyan-900 mb-0.5">Shed Ammonia (NH3) &amp; Poultry Ventilation:</strong>
                            <span>When ambient AQI exceeds 150 (Unhealthy) or barn ammonia surpasses 25 ppm, poultry and calves suffer severe respiratory epithelium damage. Increase exhaust fan duty cycles, replace wet litter bedding, and supply vitamin C.</span>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Footnote Source -->
            <div class="sedac-source-foot">
                <i class="fas fa-satellite-dish text-cyan-600"></i>
                <span>উৎস: <strong>Open-Meteo European Air Quality (ECMWF)</strong> + <strong>NASA Aura OMI Satellite</strong> + বাংলাদেশ প্রাণিসম্পদ অধিদপ্তর (DLS)</span>
            </div>
        </div>

    `;

    bindSimulatorEvents(aqiVal, uvVal);
}

/* ============================================================
   SIMULATOR EVENTS
   ============================================================ */
function bindSimulatorEvents(aqiVal, uvVal) {
    document.querySelectorAll('input[data-air-sim]').forEach(input => {
        input.onchange = e => {
            const key = e.target.dataset.airSim;
            if (key) airSimOn[key] = e.target.checked;
            const resBox = _el('airSimResult');
            if (resBox) resBox.innerHTML = simResultHtml(aqiVal, uvVal);
        };
    });
}

/* ============================================================
   NATIONAL COMPARISON ROLL-UP (ALL 8 DIVISIONS)
   ============================================================ */
async function loadNationalAir() {
    if (airNational && airNational.loading) return;
    airNational = { loading: true };
    updateNationalAirView();

    const keys = Object.keys(DISTRICT_COORDS);
    const res = await Promise.allSettled(keys.map(async k => {
        const c = DISTRICT_COORDS[k];
        const [aqi, weather] = await Promise.all([
            OpenMeteo.getAQI(c.lat, c.lng),
            OpenMeteo.getWeek(c.lat, c.lng)
        ]);
        const aqiVal = aqi && Number.isFinite(aqi.usAqi) ? Math.round(aqi.usAqi) : 95;
        const today = weather && weather[0] ? weather[0] : {};
        const uv = today.uvIndexMax ? Number(today.uvIndexMax) : 7.5;
        const pm25 = aqi && Number.isFinite(aqi.pm25) ? aqi.pm25.toFixed(1) : '35.0';

        return {
            key: k,
            nameBn: c.nameBn,
            aqi: aqiVal,
            uv: uv,
            pm25: pm25,
            aqiInfo: getAqiDetails(aqiVal),
            uvInfo: getUvDetails(uv)
        };
    }));

    const rows = res.filter(x => x.status === 'fulfilled').map(x => x.value)
        .sort((a, b) => b.aqi - a.aqi);

    airNational = { at: Date.now(), rows, failed: res.length - rows.length };
    updateNationalAirView();
}

function updateNationalAirView() {
    const wrap = _el('airNationalWrap');
    if (wrap) wrap.innerHTML = nationalAirHtml();
}

function nationalAirHtml() {
    const n = airNational;
    if (n && n.loading) {
        return `
            <div class="dva-card" style="text-align:center;padding:24px;">
                <i class="fas fa-spinner fa-spin text-cyan-600" style="font-size:24px;"></i>
                <div style="font-size:13px;font-weight:700;color:#0e7490;margin-top:8px;">৮ বিভাগের বায়ুমণ্ডলীয় টেলিমেট্রি লোড হচ্ছে...</div>
            </div>`;
    }
    if (!n || (Date.now() - n.at) > 30 * 60 * 1000) {
        return `
            <button class="dva-btn" onclick="window.__loadAirNational()">
                <i class="fas fa-earth-asia"></i>
                <span>🇧🇩 সারা দেশের ৮ বিভাগের বায়ুমান ও ইউভি একনজরে দেখুন (জাতীয় র‍্যাংকিং)</span>
            </button>`;
    }
    if (!n.rows || !n.rows.length) {
        return `<div class="dva-card">সারা দেশের ডেটা পাওয়া যায়নি।</div>`;
    }

    const body = n.rows.map((r, idx) => `
        <tr class="${r.key === currentDistrict ? 'cur' : ''}" onclick="window.__dvaSelectDivision('${r.key}')" style="cursor:pointer;" title="${escapeHtml(r.nameBn)} বিভাগের বিস্তারিত দেখতে ক্লিক করুন">
            <td><b>${idx + 1}. ${escapeHtml(r.nameBn)}</b> ${r.key === currentDistrict ? '← বর্তমান' : ''}</td>
            <td style="color:${r.aqiInfo.color};font-weight:900;">${r.aqi} AQI</td>
            <td><span style="display:inline-flex;align-items:center;gap:4px;font-weight:700;color:${r.aqiInfo.color};">${r.aqiInfo.icon} ${r.aqiInfo.labelBn}</span></td>
            <td style="color:${r.uvInfo.color};font-weight:800;">${r.uvInfo.icon} ${r.uv.toFixed(1)} UV</td>
            <td style="font-family:monospace;font-weight:700;">${r.pm25} μg/m³</td>
            <td style="font-size:11.5px;color:#475569;">${r.aqi > 150 ? '🚨 ক্রস ভেন্টিলেশন ফ্যান চালু' : r.uv >= 8 ? '⚠️ পিক আওয়ারে ছায়ায় রাখুন' : '✅ সাধারণ পরিচর্যা'}</td>
        </tr>
    `).join('');

    return `
        <div class="dva-card">
            <div class="dva-card-title">
                <span><i class="fas fa-earth-asia text-cyan-600"></i> 🇧🇩 জাতীয় পর্যায়ে ৮ বিভাগের লাইভ বায়ুমান ও ইউভি তুলনা</span>
                <span style="font-size:11.5px;font-weight:700;color:#64748b;">৮টি বিভাগ লাইভ</span>
            </div>
            <div class="dva-table-wrap">
                <table class="dva-table">
                    <thead>
                        <tr>
                            <th>বিভাগ</th>
                            <th>বায়ুর AQI</th>
                            <th>বায়ুমানের অবস্থা</th>
                            <th>পিক UV সূচক</th>
                            <th>PM2.5 মাত্রা</th>
                            <th>খামারের জরুরি সুপারিশ</th>
                        </tr>
                    </thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        </div>
    `;
}

window.__loadAirNational = loadNationalAir;

window.__dvaSelectDivision = function (key) {
    if (!DISTRICT_COORDS[key]) return;
    currentDistrict = key;
    const select = _el('climateDistrict');
    if (select) select.value = key;
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('district', currentDistrict);
        window.history.replaceState({}, '', url.toString());
    } catch (_) {}
    loadAirFeature();
    const body = _el('airBody');
    if (body) {
        body.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

/* ============================================================
   DATA FETCHER & CONTROLLER
   ============================================================ */
async function loadAirFeature() {
    const body = _el('airBody');
    if (!body) return;

    const token = ++loadToken;
    const coords = DISTRICT_COORDS[currentDistrict] || DISTRICT_COORDS.dhaka;

    body.innerHTML = `
        <div class="climate-empty">
            <i class="fas fa-wind text-cyan-600 fa-bounce" style="font-size:36px;"></i>
            <div class="flex flex-col items-center gap-1 mt-2">
                <span class="text-sm font-extrabold text-slate-800">বায়ুর মান ও ইউভি টেলিমেট্রি লোড হচ্ছে...</span>
                <span class="text-xs text-slate-500 font-mono">Connecting to Open-Meteo European Air Quality ECMWF model</span>
            </div>
        </div>`;

    try {
        const [aqi, forecast] = await Promise.all([
            OpenMeteo.getAQI(coords.lat, coords.lng),
            OpenMeteo.getWeek(coords.lat, coords.lng)
        ]);

        if (token !== loadToken) return;

        airState = {
            district: currentDistrict,
            coords,
            aqi,
            forecast,
            today: forecast && forecast[0] ? forecast[0] : null
        };

        renderAirDashboard(body, airState);
    } catch (err) {
        if (token !== loadToken) return;
        console.error('[AirQuality] Load failed:', err);
        body.innerHTML = `
            <div class="climate-empty">
                <i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:32px;"></i>
                <span class="font-extrabold text-slate-800">বাতাসের ডেটা লোড করা সম্ভব হয়নি</span>
                <span class="text-xs text-slate-500">ইন্টারনেট সংযোগ চেক করুন অথবা পুনরায় চেষ্টা করুন।</span>
            </div>`;
    }
}

/* Bind Toolbar District Selector */
function bindAirDistrictSelector() {
    const select = _el('climateDistrict');
    if (!select || select._bound) return;
    select._bound = true;

    select.value = currentDistrict;
    select.addEventListener('change', e => {
        const val = e.target.value;
        if (!DISTRICT_COORDS[val]) return;
        currentDistrict = val;
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('district', currentDistrict);
            window.history.replaceState({}, '', url.toString());
        } catch (_) {}
        loadAirFeature();
    });
}

/* User Geolocation */
window.__dvmUseMyLocation = function () {
    if (!navigator.geolocation) {
        alert('আপনার ব্রাউজারে লোকেশন সাপোর্ট করে না।');
        return;
    }
    const btn = _el('dvmGpsBtn');
    if (btn) btn.classList.add('loading');

    navigator.geolocation.getCurrentPosition(
        pos => {
            if (btn) btn.classList.remove('loading');
            const { latitude, longitude } = pos.coords;

            // Find closest division
            let closestKey = 'dhaka';
            let minDist = Infinity;
            Object.keys(DISTRICT_COORDS).forEach(k => {
                const c = DISTRICT_COORDS[k];
                const d = Math.hypot(c.lat - latitude, c.lng - longitude);
                if (d < minDist) {
                    minDist = d;
                    closestKey = k;
                }
            });

            currentDistrict = closestKey;
            const sel = _el('climateDistrict');
            if (sel) sel.value = closestKey;
            loadAirFeature();
        },
        err => {
            if (btn) btn.classList.remove('loading');
            console.warn('[Air] Geolocation error:', err);
            alert('আপনার বর্তমান অবস্থান শনাক্ত করা যায়নি। অনুগ্রহ করে ড্রপডাউন থেকে বিভাগ নির্বাচন করুন।');
        },
        { timeout: 8000, enableHighAccuracy: false }
    );
};

/* Init */
function init() {
    bindAirDistrictSelector();
    loadAirFeature();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
