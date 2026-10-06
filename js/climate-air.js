/* DailyVet — Air Quality & UV Index Feature v2.0
   Data: Open-Meteo Air Quality API (key-free)
   Provides: AQI, PM2.5, PM10, UV, dust, solar radiation for livestock health

   v2.0 additions:
   • AQI Score Ranges (US EPA Standard)
   • UV Index Score Ranges (WHO Standard)
   • PM2.5 Score Ranges (WHO 2021)
   • Health impact for each range
   • Bangla labels + emoji + color coding
*/
(function () {
'use strict';

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

const _el = id => document.getElementById(id);
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => _ESC[c]);

let currentDistrict = 'dhaka';
let loadToken = 0;

function showLoading() {
    const body = _el('airBody');
    if (!body) return;
    body.innerHTML = `
        <div class="climate-empty">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Loading air quality data...</span>
        </div>`;
}

function showError(msg) {
    const body = _el('airBody');
    if (!body) return;
    body.innerHTML = `
        <div class="climate-empty">
            <i class="fas fa-exclamation-triangle" style="color:#dc2626;"></i>
            <span>${escapeHtml(msg)}</span>
        </div>`;
}

/* ============================================================
   SCORE RANGES HTML — Health Standards Reference
   ============================================================ */
function buildScoreRangesHTML() {
    return `
        <div class="air-ranges">
            <div class="air-ranges-title">
                <i class="fas fa-clipboard-list"></i>
                <span>স্কোর রেঞ্জ ও স্বাস্থ্য মান</span>
            </div>

            <!-- ===== AQI RANGES (US EPA) ===== -->
            <div class="air-range-group">
                <div class="air-range-label">
                    🌬️ AQI (US EPA Standard)
                </div>
                <div class="air-range-grid">
                    <div class="air-range-item" style="border-left-color:#059669;">
                        <span class="air-range-num">0–50</span>
                        <span class="air-range-status" style="color:#059669;">ভালো ✅</span>
                        <span class="air-range-note">স্বাস্থ্যকর</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#d97706;">
                        <span class="air-range-num">51–100</span>
                        <span class="air-range-status" style="color:#d97706;">মধ্যম 🟡</span>
                        <span class="air-range-note">গ্রহণযোগ্য</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#ea580c;">
                        <span class="air-range-num">101–150</span>
                        <span class="air-range-status" style="color:#ea580c;">সংবেদনশীল 🟠</span>
                        <span class="air-range-note">শিশু/বৃদ্ধদের ঝুঁকি</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#dc2626;">
                        <span class="air-range-num">151–200</span>
                        <span class="air-range-status" style="color:#dc2626;">অস্বাস্থ্যকর 🔴</span>
                        <span class="air-range-note">সবার জন্য ক্ষতিকর</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#991b1b;">
                        <span class="air-range-num">201–300</span>
                        <span class="air-range-status" style="color:#991b1b;">খুব খারাপ 🟣</span>
                        <span class="air-range-note">স্বাস্থ্য সতর্কতা</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#7f1d1d;">
                        <span class="air-range-num">301+</span>
                        <span class="air-range-status" style="color:#7f1d1d;">বিপজ্জনক ⚫</span>
                        <span class="air-range-note">জরুরি অবস্থা</span>
                    </div>
                </div>
            </div>

            <!-- ===== UV RANGES (WHO) ===== -->
            <div class="air-range-group">
                <div class="air-range-label">
                    ☀️ UV Index (WHO Standard)
                </div>
                <div class="air-range-grid">
                    <div class="air-range-item" style="border-left-color:#059669;">
                        <span class="air-range-num">0–2</span>
                        <span class="air-range-status" style="color:#059669;">কম 🟢</span>
                        <span class="air-range-note">সুরক্ষা লাগে না</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#d97706;">
                        <span class="air-range-num">3–5</span>
                        <span class="air-range-status" style="color:#d97706;">মধ্যম 🟡</span>
                        <span class="air-range-note">ছায়া দরকার</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#ea580c;">
                        <span class="air-range-num">6–7</span>
                        <span class="air-range-status" style="color:#ea580c;">উচ্চ 🟠</span>
                        <span class="air-range-note">ছায়া + পানি</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#dc2626;">
                        <span class="air-range-num">8–10</span>
                        <span class="air-range-status" style="color:#dc2626;">খুব উচ্চ 🔴</span>
                        <span class="air-range-note">সম্পূর্ণ সতর্কতা</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#7f1d1d;">
                        <span class="air-range-num">11+</span>
                        <span class="air-range-status" style="color:#7f1d1d;">চরম ⚫</span>
                        <span class="air-range-note">জরুরি ব্যবস্থা</span>
                    </div>
                </div>
            </div>

            <!-- ===== PM2.5 RANGES (WHO 2021) ===== -->
            <div class="air-range-group">
                <div class="air-range-label">
                    🌫️ PM2.5 (WHO 2021 Guideline)
                </div>
                <div class="air-range-grid">
                    <div class="air-range-item" style="border-left-color:#059669;">
                        <span class="air-range-num">0–12</span>
                        <span class="air-range-status" style="color:#059669;">নিরাপদ 🟢</span>
                        <span class="air-range-note">μg/m³</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#d97706;">
                        <span class="air-range-num">13–35</span>
                        <span class="air-range-status" style="color:#d97706;">মধ্যম 🟡</span>
                        <span class="air-range-note">μg/m³</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#ea580c;">
                        <span class="air-range-num">36–55</span>
                        <span class="air-range-status" style="color:#ea580c;">সংবেদনশীল 🟠</span>
                        <span class="air-range-note">μg/m³</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#dc2626;">
                        <span class="air-range-num">56–150</span>
                        <span class="air-range-status" style="color:#dc2626;">অস্বাস্থ্যকর 🔴</span>
                        <span class="air-range-note">μg/m³</span>
                    </div>
                    <div class="air-range-item" style="border-left-color:#991b1b;">
                        <span class="air-range-num">151+</span>
                        <span class="air-range-status" style="color:#991b1b;">বিপজ্জনক ⚫</span>
                        <span class="air-range-note">μg/m³</span>
                    </div>
                </div>
            </div>

            <!-- ===== REFERENCE SOURCES ===== -->
            <div class="air-ranges-source">
                <i class="fas fa-book-medical"></i>
                <span>Standards: <strong>US EPA</strong> (AQI) · <strong>WHO</strong> (UV, PM2.5)</span>
            </div>
        </div>
    `;
}

/* ============================================================
   MAIN RENDERER
   ============================================================ */
async function renderAirQuality() {
    const body = _el('airBody');
    if (!body) return;

    const token = ++loadToken;
    showLoading();

    const coords = DISTRICT_COORDS[currentDistrict];

    /* Fetch AQI + weather (parallel) */
    const [aqi, weather] = await Promise.all([
        OpenMeteo.getAQI(coords.lat, coords.lng),
        OpenMeteo.getWeek(coords.lat, coords.lng)
    ]);

    if (token !== loadToken) return;

    if (!aqi && !weather) {
        showError('Could not load air quality data');
        return;
    }

    /* AQI classification */
    const aqiInfo = OpenMeteo.classifyAQI(aqi ? aqi.usAqi : null);

    /* UV from today's forecast */
    const today = weather && weather[0] ? weather[0] : null;
    const uv = today ? today.uvIndexMax : null;
    const uvInfo = OpenMeteo.classifyUV(uv);

    /* Solar radiation */
    const solar = today ? today.solarRadiation : null;

    /* Wind speed */
    const wind = today ? today.windMax : null;

    body.innerHTML = `
        <div class="air-card">

            <!-- HEADER -->
            <div class="air-district">
                <div class="air-district-icon">
                    <i class="fas fa-wind"></i>
                </div>
                <div class="air-district-info">
                    <div class="air-district-name">${escapeHtml(coords.nameBn)}</div>
                    <div class="air-district-sub">${escapeHtml(coords.name)} Division · Real-time</div>
                </div>
            </div>

            <!-- AQI GAUGE -->
            <div class="air-gauge" style="border-color:${aqiInfo.color};background:${aqiInfo.color}15;">
                <div class="air-gauge-icon" style="background:${aqiInfo.color};">
                    ${aqiInfo.icon}
                </div>
                <div class="air-gauge-value" style="color:${aqiInfo.color};">
                    ${aqi ? Math.round(aqi.usAqi) : '—'}
                </div>
                <div class="air-gauge-label" style="color:${aqiInfo.color};">
                    US AQI · ${escapeHtml(aqiInfo.label)}
                </div>
                <div class="air-gauge-advice" style="color:${aqiInfo.color};">
                    ${escapeHtml(aqiInfo.advice)}
                </div>
            </div>

            <!-- UV + SOLAR + WIND -->
            <div class="air-stats-grid">

                <div class="air-stat" style="border-left-color:${uvInfo.color};">
                    <div class="air-stat-icon">${uvInfo.icon}</div>
                    <div class="air-stat-value" style="color:${uvInfo.color};">
                        ${uv != null ? uv.toFixed(1) : '—'}
                    </div>
                    <div class="air-stat-label">UV Index</div>
                    <div class="air-stat-status" style="color:${uvInfo.color};">
                        ${escapeHtml(uvInfo.label)}
                    </div>
                </div>

                <div class="air-stat" style="border-left-color:#f59e0b;">
                    <div class="air-stat-icon">☀️</div>
                    <div class="air-stat-value" style="color:#d97706;">
                        ${solar != null ? solar.toFixed(1) : '—'}
                    </div>
                    <div class="air-stat-label">Solar (MJ/m²)</div>
                    <div class="air-stat-status" style="color:#d97706;">
                        ${solar != null ? 'Daily total' : 'N/A'}
                    </div>
                </div>

                <div class="air-stat" style="border-left-color:#0891b2;">
                    <div class="air-stat-icon">💨</div>
                    <div class="air-stat-value" style="color:#0e7490;">
                        ${wind != null ? wind.toFixed(1) : '—'}
                    </div>
                    <div class="air-stat-label">Wind (km/h)</div>
                    <div class="air-stat-status" style="color:#0e7490;">
                        ${wind != null ? 'Max today' : 'N/A'}
                    </div>
                </div>

            </div>

            <!-- UV ADVICE -->
            ${uv != null ? `
                <div class="air-advice" style="background:${uvInfo.color}15;border-left-color:${uvInfo.color};">
                    <i class="fas fa-sun" style="color:${uvInfo.color};"></i>
                    <div>
                        <strong style="color:${uvInfo.color};">UV পরামর্শ:</strong>
                        <span>${escapeHtml(uvInfo.advice)}</span>
                    </div>
                </div>
            ` : ''}

            <!-- POLLUTANTS DETAIL -->
            ${aqi ? `
                <div class="air-pollutants">
                    <div class="air-pollutants-title">
                        <i class="fas fa-flask"></i>
                        বাতাসের উপাদান
                    </div>
                    <div class="air-pollutants-grid">
                        ${aqi.pm25 != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">PM2.5</span>
                                <span class="value">${aqi.pm25.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.pm10 != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">PM10</span>
                                <span class="value">${aqi.pm10.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.o3 != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">Ozone</span>
                                <span class="value">${aqi.o3.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.no2 != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">NO₂</span>
                                <span class="value">${aqi.no2.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.so2 != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">SO₂</span>
                                <span class="value">${aqi.so2.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.co != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">CO</span>
                                <span class="value">${aqi.co.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                        ${aqi.dust != null ? `
                            <div class="air-pollutant-item">
                                <span class="label">Dust</span>
                                <span class="value">${aqi.dust.toFixed(1)} μg/m³</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}

            <!-- ===== SCORE RANGES (NEW v2.0) ===== -->
            ${buildScoreRangesHTML()}

            <!-- 7-DAY FORECAST -->
            ${weather && weather.length > 1 ? `
                <div class="air-forecast">
                    <div class="air-forecast-title">
                        <i class="fas fa-calendar-week"></i>
                        ৭ দিনের পূর্বাভাস
                    </div>
                    <div class="air-forecast-list">
                        ${weather.slice(0, 7).map((d, i) => {
                            const dayLabel = i === 0 ? 'আজ' : i === 1 ? 'আগামীকাল' : formatDayBn(d.date);
                            const uvI = OpenMeteo.classifyUV(d.uvIndexMax);
                            return `
                                <div class="air-forecast-item">
                                    <div class="air-forecast-day">${dayLabel}</div>
                                    <div class="air-forecast-temp">
                                        ${d.tempMax != null ? Math.round(d.tempMax) : '—'}°C
                                    </div>
                                    <div class="air-forecast-uv" style="color:${uvI.color};">
                                        UV ${d.uvIndexMax != null ? d.uvIndexMax.toFixed(1) : '—'}
                                    </div>
                                    <div class="air-forecast-rain">
                                        ${d.precipitation != null ? d.precipitation.toFixed(1) + 'mm' : '—'}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- DATA SOURCE -->
            <div class="air-source">
                <i class="fas fa-database"></i>
                <span>Data: <strong>Open-Meteo Air Quality API</strong> (key-free, real-time)</span>
            </div>

        </div>
    `;
}

function formatDayBn(yyyymmdd) {
    if (!yyyymmdd) return '';
    const d = new Date(yyyymmdd);
    if (isNaN(d.getTime())) return '';
    const days = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'];
    return days[d.getDay()];
}

/* ============================================================
   INIT
   ============================================================ */
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

    const select = _el('climateDistrict');
    if (select) {
        if (DISTRICT_COORDS[select.value]) currentDistrict = select.value;
        select.addEventListener('change', e => {
            if (!DISTRICT_COORDS[e.target.value]) return;
            currentDistrict = e.target.value;
            renderAirQuality();
        });
    }

    renderAirQuality();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();