/* DailyVet — Open-Meteo Multi-API Integration v2.0 (Production)
   Data sources (all key-free, unlimited):
   • Weather forecast   : api.open-meteo.com/v1/forecast
   • Air quality        : air-quality-api.open-meteo.com/v1/air-quality
   • Historical archive : archive-api.open-meteo.com/v1/archive

   Provides: temp, humidity, rainfall, wind, UV, PM2.5, PM10, AQI, solar radiation

   Cache: localStorage, 30-minute TTL
   Fallback: null (caller decides)
*/
(function () {
'use strict';

const CACHE_KEY = 'dvOpenMeteoCache_v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/* ============================================================
   CACHE HELPERS
   ============================================================ */
function _readCache(key) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        const hit = cache[key];
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
        return null;
    } catch (_) { return null; }
}

function _writeCache(key, data) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        const cache = raw ? JSON.parse(raw) : {};
        cache[key] = { at: Date.now(), data };
        const keys = Object.keys(cache);
        if (keys.length > 30) {
            keys.slice(0, keys.length - 30).forEach(k => delete cache[k]);
        }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (_) {}
}

/* ============================================================
   FETCH HELPER with timeout
   ============================================================ */
async function _fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

/* ============================================================
   1. WEATHER FORECAST
   ============================================================ */
async function fetchWeatherForecast(lat, lng, days) {
    days = Math.max(1, Math.min(days || 7, 16));
    const cacheKey = `weather_${lat.toFixed(2)}_${lng.toFixed(2)}_${days}`;

    const cached = _readCache(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://api.open-meteo.com/v1/forecast` +
                    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
                    `&daily=` +
                    `temperature_2m_max,temperature_2m_min,` +
                    `relative_humidity_2m_mean,precipitation_sum,` +
                    `wind_speed_10m_max,uv_index_max,` +
                    `shortwave_radiation_sum,` +
                    `sunrise,sunset` +
                    `&hourly=relative_humidity_2m,temperature_2m` +
                    `&timezone=Asia%2FDhaka&forecast_days=${days}`;

        const data = await _fetchJSON(url);
        if (!data.daily || !Array.isArray(data.daily.time)) {
            throw new Error('Bad response');
        }

        const forecast = data.daily.time.map((date, i) => ({
            date,
            tempMax: data.daily.temperature_2m_max[i],
            tempMin: data.daily.temperature_2m_min[i],
            tempMean: (data.daily.temperature_2m_max[i] + data.daily.temperature_2m_min[i]) / 2,
            humidity: data.daily.relative_humidity_2m_mean[i],
            precipitation: data.daily.precipitation_sum[i],
            windMax: data.daily.wind_speed_10m_max[i],
            uvIndexMax: data.daily.uv_index_max[i],
            solarRadiation: data.daily.shortwave_radiation_sum[i],
            sunrise: data.daily.sunrise[i],
            sunset: data.daily.sunset[i]
        }));

        _writeCache(cacheKey, forecast);
        return forecast;
    } catch (err) {
        console.warn('[OpenMeteo] Weather fetch failed:', err.message);
        return null;
    }
}

/* ============================================================
   2. AIR QUALITY
   ============================================================ */
async function fetchAirQuality(lat, lng) {
    const cacheKey = `aqi_${lat.toFixed(2)}_${lng.toFixed(2)}`;

    const cached = _readCache(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality` +
                    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
                    `&current=` +
                    `pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,` +
                    `sulphur_dioxide,ozone,us_aqi,european_aqi,` +
                    `dust,aerosol_optical_depth` +
                    `&timezone=Asia%2FDhaka`;

        const data = await _fetchJSON(url);
        if (!data.current) throw new Error('Bad AQI response');

        const c = data.current;
        const result = {
            time: c.time,
            pm10: c.pm10,
            pm25: c.pm2_5,
            co: c.carbon_monoxide,
            no2: c.nitrogen_dioxide,
            so2: c.sulphur_dioxide,
            o3: c.ozone,
            dust: c.dust,
            aod: c.aerosol_optical_depth,
            usAqi: c.us_aqi,
            euAqi: c.european_aqi
        };

        _writeCache(cacheKey, result);
        return result;
    } catch (err) {
        console.warn('[OpenMeteo] AQI fetch failed:', err.message);
        return null;
    }
}

/* ============================================================
   3. SOLAR RADIATION (NASA POWER also provides this — Open-Meteo
      gives forecast, NASA gives historical)
   ============================================================ */
async function fetchSolarForecast(lat, lng, days) {
    days = Math.max(1, Math.min(days || 7, 16));
    const cacheKey = `solar_${lat.toFixed(2)}_${lng.toFixed(2)}_${days}`;

    const cached = _readCache(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://api.open-meteo.com/v1/forecast` +
                    `?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}` +
                    `&hourly=shortwave_radiation,direct_normal_irradiance,` +
                    `diffuse_radiation,terrestrial_radiation` +
                    `&timezone=Asia%2FDhaka&forecast_days=${days}`;

        const data = await _fetchJSON(url);
        if (!data.hourly) throw new Error('Bad solar response');

        const solar = data.hourly.time.map((time, i) => ({
            time,
            shortwave: data.hourly.shortwave_radiation[i],
            directNormal: data.hourly.direct_normal_irradiance[i],
            diffuse: data.hourly.diffuse_radiation[i],
            terrestrial: data.hourly.terrestrial_radiation[i]
        }));

        _writeCache(cacheKey, solar);
        return solar;
    } catch (err) {
        console.warn('[OpenMeteo] Solar fetch failed:', err.message);
        return null;
    }
}

/* ============================================================
   CONVENIENCE GETTERS
   ============================================================ */
async function getWeather(lat, lng, days) {
    return await fetchWeatherForecast(lat, lng, days || 7);
}

async function getToday(lat, lng) {
    const f = await fetchWeatherForecast(lat, lng, 2);
    return f && f[0] ? f[0] : null;
}

async function getTomorrow(lat, lng) {
    const f = await fetchWeatherForecast(lat, lng, 2);
    return f && f[1] ? f[1] : null;
}

async function getWeek(lat, lng) {
    return await fetchWeatherForecast(lat, lng, 7);
}

async function getAQI(lat, lng) {
    return await fetchAirQuality(lat, lng);
}

/* ============================================================
   CLASSIFICATIONS (Bangla)
   ============================================================ */
function classifyAQI(aqi) {
    if (!Number.isFinite(aqi)) {
        return { label: 'অজানা', labelEn: 'Unknown', color: '#94a3b8', icon: '⚪', advice: 'ডেটা নেই' };
    }
    if (aqi <= 50) return { label: 'ভালো', labelEn: 'Good', color: '#059669', icon: '🟢',
        advice: 'বাতাস পরিষ্কার — স্বাভাবিক কার্যক্রম চালিয়ে যান।' };
    if (aqi <= 100) return { label: 'মধ্যম', labelEn: 'Moderate', color: '#d97706', icon: '🟡',
        advice: 'সংবেদনশীল পশুদের ঘরে রাখুন।' };
    if (aqi <= 150) return { label: 'সংবেদনশীল', labelEn: 'Unhealthy for Sensitive Groups', color: '#ea580c', icon: '🟠',
        advice: 'পশুদের দীর্ঘ সময় বাইরে রাখবেন না।' };
    if (aqi <= 200) return { label: 'অস্বাস্থ্যকর', labelEn: 'Unhealthy', color: '#dc2626', icon: '🔴',
        advice: 'পশুদের ঘরে রাখুন, ঘরে বাতাস চলাচল ঠিক রাখুন।' };
    if (aqi <= 300) return { label: 'খুব খারাপ', labelEn: 'Very Unhealthy', color: '#991b1b', icon: '🟣',
        advice: 'সব পশু ঘরে রাখুন, বাতাস চলাচল নিশ্চিত করুন।' };
    return { label: 'বিপজ্জনক', labelEn: 'Hazardous', color: '#7f1d1d', icon: '☠️',
        advice: 'জরুরি অবস্থা — সব পশু ঘরে রাখুন, ভেটের সাথে যোগাযোগ করুন।' };
}

function classifyUV(uv) {
    if (!Number.isFinite(uv)) {
        return { label: 'অজানা', labelEn: 'Unknown', color: '#94a3b8', icon: '⚪', advice: 'ডেটা নেই' };
    }
    if (uv < 3) return { label: 'কম', labelEn: 'Low', color: '#059669', icon: '🟢',
        advice: 'স্বাভাবিক যত্ন চালিয়ে যান।' };
    if (uv < 6) return { label: 'মধ্যম', labelEn: 'Moderate', color: '#d97706', icon: '🟡',
        advice: 'দুপুরে ছায়ায় রাখুন।' };
    if (uv < 8) return { label: 'উচ্চ', labelEn: 'High', color: '#dc2626', icon: '🟠',
        advice: 'দুপুর ১১টা-৪টা পশুদের ছায়ায় রাখুন।' };
    if (uv < 11) return { label: 'খুব উচ্চ', labelEn: 'Very High', color: '#991b1b', icon: '🔴',
        advice: 'সরাসরি রোদ এড়িয়ে চলুন। পানি বেশি দিন।' };
    return { label: 'চরম', labelEn: 'Extreme', color: '#7f1d1d', icon: '☠️',
        advice: 'জরুরি — পশুদের সম্পূর্ণ ছায়ায় রাখুন, পানি ২ গুণ দিন।' };
}

/* ============================================================
   PUBLIC API
   ============================================================ */
window.OpenMeteo = {
    /* Weather */
    fetchWeatherForecast,
    getWeather,
    getToday,
    getTomorrow,
    getWeek,

    /* Air Quality */
    fetchAirQuality,
    getAQI,

    /* Solar */
    fetchSolarForecast,

    /* Classifiers */
    classifyAQI,
    classifyUV,

    /* Config */
    CACHE_TTL_MS
};

/* Backward compat alias for existing code */
window.OpenMeteoForecast = {
    fetchForecast: fetchWeatherForecast,
    getToday,
    getTomorrow,
    getWeek,
    CACHE_TTL_MS
};

})();