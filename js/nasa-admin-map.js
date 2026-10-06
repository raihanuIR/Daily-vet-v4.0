/* DailyVet — NASA Admin Analytics Map v1.0
   Feature 4 (plan 4.2 / 4.6): vulnerable-division map + ranking.
   Data:  NASA POWER (rain, humidity, temp)  ×  NASA SEDAC GPW v4 (population, livestock)
   Needs: nasa-power-api.js, nasa-outbreak-engine.js, nasa-sedac-mapper.js
   Mount: <div id="adminMapBody"></div>  — or it auto-inserts a card after #impactBody.
   Click a bubble / row -> the main dashboard switches to that division. */
(function () {
'use strict';

/* ===== CONFIG ===== */
const COORDS = {
    dhaka:      { lat: 23.8103, lng: 90.4125, name: 'Dhaka',      nameBn: 'ঢাকা' },
    chittagong: { lat: 22.3569, lng: 91.7832, name: 'Chittagong', nameBn: 'চট্টগ্রাম' },
    rajshahi:   { lat: 24.3745, lng: 88.6042, name: 'Rajshahi',   nameBn: 'রাজশাহী' },
    khulna:     { lat: 22.8456, lng: 89.5403, name: 'Khulna',     nameBn: 'খুলনা' },
    barisal:    { lat: 22.7010, lng: 90.3535, name: 'Barisal',    nameBn: 'বরিশাল' },
    sylhet:     { lat: 24.8949, lng: 91.8687, name: 'Sylhet',     nameBn: 'সিলেট' },
    rangpur:    { lat: 25.7439, lng: 89.2752, name: 'Rangpur',    nameBn: 'রংপুর' },
    mymensingh: { lat: 24.7471, lng: 90.4203, name: 'Mymensingh', nameBn: 'ময়মনসিংহ' }
};

/* Simplified Bangladesh outline [lng, lat] — schematic only, not a survey boundary */
const OUTLINE = [
    [88.12, 26.15], [88.45, 26.63], [88.95, 26.40], [89.45, 26.15], [89.85, 26.00], [89.80, 25.50],
    [90.30, 25.20], [91.00, 25.17], [91.60, 25.15], [92.00, 25.10], [92.25, 24.90], [92.00, 24.50],
    [91.80, 24.15], [91.55, 24.05], [91.20, 23.70], [91.25, 23.20], [91.60, 23.00], [91.85, 23.25],
    [92.15, 23.70], [92.50, 23.20], [92.35, 22.40], [92.30, 21.50], [92.30, 20.75], [92.00, 21.20],
    [91.85, 22.00], [91.70, 22.30], [91.30, 22.60], [90.90, 22.40], [90.50, 22.10], [90.00, 21.85],
    [89.50, 21.80], [89.10, 21.75], [89.05, 22.30], [88.95, 22.90], [88.70, 23.30], [88.55, 23.80],
    [88.60, 24.10], [88.20, 24.45], [88.05, 24.65], [88.15, 25.20], [88.45, 25.50], [88.10, 25.95]
];

const W = 320, H = 450;
const px = lng => (lng - 87.9) * 65.3;
const py = lat => (26.85 - lat) * 71.2;

const LEVEL = {
    critical: { color: '#dc2626', labelBn: 'অতি উচ্চ' },
    alert:    { color: '#c2410c', labelBn: 'উচ্চ' },
    watch:    { color: '#d97706', labelBn: 'মধ্যম' },
    safe:     { color: '#059669', labelBn: 'কম' },
    unknown:  { color: '#94a3b8', labelBn: 'ডেটা নেই' }
};

const CONCURRENCY = 3;
let runToken = 0;
let rowsCache = [];

/* ===== HELPERS ===== */
const _ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => _ESC[c]);
const fmt = n => (window.NasaSedac ? NasaSedac.formatNumber(n) : String(n));

function fmtDate(yyyymmdd) {
    if (!yyyymmdd || String(yyyymmdd).length !== 8) return '';
    const s = String(yyyymmdd);
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function injectStyles() {
    if (document.getElementById('dvam-css')) return;
    const st = document.createElement('style');
    st.id = 'dvam-css';
    st.textContent = `
    .dvam-card{margin:16px 0;padding:16px;border-radius:16px;background:#fff;border:1px solid rgba(100,116,139,.25);
               box-shadow:0 1px 3px rgba(15,23,42,.06);color:#0f172a}
    .dvam-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 12px;align-items:baseline;margin-bottom:12px}
    .dvam-title{font-size:16px;font-weight:700}
    .dvam-sub{font-size:11.5px;color:#64748b}
    .dvam-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:14px}
    .dvam-total{padding:10px 12px;border-radius:12px;background:#f1f5f9}
    .dvam-total b{display:block;font-size:19px;line-height:1.2}
    .dvam-total span{font-size:11.5px;color:#475569}
    .dvam-body{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
    .dvam-map{flex:1 1 260px;max-width:340px;margin:0 auto}
    .dvam-map svg{width:100%;height:auto;display:block}
    .dvam-bubble{cursor:pointer;transition:opacity .15s}
    .dvam-bubble:hover,.dvam-bubble:focus{opacity:.8;outline:none}
    .dvam-bubble.sel{stroke:#0f172a;stroke-width:2.5}
    .dvam-list{flex:1 1 280px;min-width:0}
    .dvam-row{display:grid;grid-template-columns:22px 1fr auto;gap:2px 10px;align-items:center;width:100%;text-align:left;
              padding:9px 8px;border:0;border-bottom:1px solid #e2e8f0;background:transparent;cursor:pointer;font:inherit;color:inherit}
    .dvam-row:hover,.dvam-row:focus{background:#f8fafc;outline:none}
    .dvam-row.sel{background:#eef6ff}
    .dvam-rank{font-weight:700;color:#64748b;font-size:13px}
    .dvam-name{font-weight:600;font-size:14px}
    .dvam-meta{grid-column:2 / 4;font-size:12px;color:#475569}
    .dvam-badge{font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;color:#fff;white-space:nowrap}
    .dvam-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:10px;font-size:11.5px;color:#475569}
    .dvam-legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
    .dvam-note{margin-top:8px;font-size:11px;color:#64748b;line-height:1.5}
    .dvam-empty{padding:18px;text-align:center;color:#64748b;font-size:13px}`;
    document.head.appendChild(st);
}

/* ===== DATA ===== */
async function loadRow(key) {
    const c = COORDS[key];
    try {
        const param = await NasaPower.getPowerData(c.lat, c.lng, 7);
        const rain = NasaPower.getLatest(param, 'PRECTOTCORR');
        const temp = NasaPower.getLatest(param, 'T2M');
        const rh = NasaPower.getLatest(param, 'RH2M');
        if (!rain || !temp || !rh) return { key, c, error: 'no-data' };

        const risk = NasaOutbreak.calculateRainfallRiskDetailed(rain.value, rh.value, temp.value);
        let sedac = null;
        try { sedac = await NasaSedac.fetchSedacData(key); } catch (_) { sedac = null; }
        const impact = sedac
            ? NasaSedac.calculateImpactDetailed(sedac, { level: risk.level, score: risk.score })
            : null;
        return { key, c, risk, impact, date: rain.date, source: NasaPower.getSource(param) };
    } catch (err) {
        console.warn('[AdminMap]', key, err.message);
        return { key, c, error: err.message || 'error' };
    }
}

async function loadAll(token) {
    const keys = Object.keys(COORDS);
    const out = new Array(keys.length);
    let next = 0;
    async function worker() {
        while (next < keys.length) {
            const i = next++;
            out[i] = await loadRow(keys[i]);
            if (token !== runToken) return;
        }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, keys.length) }, worker));
    return out;
}

/* ===== RENDER ===== */
function levelOf(r) { return (r.risk && LEVEL[r.risk.level]) ? r.risk.level : 'unknown'; }

function render(mount, rows) {
    const ok = rows.filter(r => !r.error && r.impact);
    const sorted = rows.slice().sort((a, b) => {
        const av = a.impact ? a.impact.livestockAtRisk : -1;
        const bv = b.impact ? b.impact.livestockAtRisk : -1;
        return bv - av;
    });

    if (!ok.length) {
        mount.innerHTML = `<div class="dvam-card"><div class="dvam-empty">মানচিত্রের জন্য NASA ডেটা পাওয়া যায়নি। কিছুক্ষণ পর আবার চেষ্টা করুন।</div></div>`;
        return;
    }

    const sum = f => ok.reduce((s, r) => s + (Number(f(r)) || 0), 0);
    const totPeople = sum(r => r.impact.populationAtRisk);
    const totFarmers = sum(r => r.impact.farmersAtRisk);
    const totLive = sum(r => r.impact.livestockAtRisk);
    const totLossCr = sum(r => r.impact.economicLoss.total) / 10000000;
    const highCount = ok.filter(r => r.risk.level === 'alert' || r.risk.level === 'critical').length;
    const maxLive = Math.max(1, ...ok.map(r => r.impact.livestockAtRisk));
    const dates = ok.map(r => r.date).filter(Boolean).sort();
    const latestDate = dates.length ? fmtDate(dates[dates.length - 1]) : '';
    const selected = (window.DVClimate && DVClimate.getDistrict && DVClimate.getDistrict()) || '';
    const anyStale = ok.some(r => r.source === 'stale-cache');

    const outline = OUTLINE.map(([lng, lat]) => `${px(lng).toFixed(1)},${py(lat).toFixed(1)}`).join(' ');

    const bubbles = rows.map(r => {
        const lv = levelOf(r);
        const col = LEVEL[lv].color;
        const cx = px(r.c.lng), cy = py(r.c.lat);
        const rad = r.impact ? 8 + 16 * Math.sqrt(r.impact.livestockAtRisk / maxLive) : 7;
        const tip = r.impact
            ? `${r.c.nameBn}: ঝুঁকি ${r.risk.score}% · ${fmt(r.impact.populationAtRisk)} মানুষ · ${fmt(r.impact.livestockAtRisk)} পশু`
            : `${r.c.nameBn}: ডেটা নেই`;
        return `
            <g>
                <circle class="dvam-bubble${r.key === selected ? ' sel' : ''}" data-key="${esc(r.key)}"
                        cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}"
                        fill="${col}" fill-opacity="0.72" stroke="#fff" stroke-width="1.5"
                        tabindex="0" role="button" aria-label="${esc(tip)}"><title>${esc(tip)}</title></circle>
                <text x="${cx.toFixed(1)}" y="${(cy + rad + 11).toFixed(1)}" text-anchor="middle"
                      font-size="11" font-weight="600" fill="#0f172a" pointer-events="none">${esc(r.c.nameBn)}</text>
            </g>`;
    }).join('');

    const list = sorted.map((r, i) => {
        const lv = levelOf(r);
        const col = LEVEL[lv].color;
        const meta = r.impact
            ? `👥 ${fmt(r.impact.populationAtRisk)} · 🧑‍🌾 ${fmt(r.impact.farmersAtRisk)} · 🐾 ${fmt(r.impact.livestockAtRisk)} · ৳${r.impact.economicLoss.minCrore}–${r.impact.economicLoss.maxCrore} কোটি`
            : 'এই বিভাগের NASA ডেটা এখন পাওয়া যাচ্ছে না';
        return `
            <button type="button" class="dvam-row${r.key === selected ? ' sel' : ''}" data-key="${esc(r.key)}">
                <span class="dvam-rank">${i + 1}</span>
                <span class="dvam-name">${esc(r.c.nameBn)} <small style="color:#64748b;font-weight:400">${esc(r.c.name)}</small></span>
                <span class="dvam-badge" style="background:${col}">${r.risk ? r.risk.score + '% · ' : ''}${esc(LEVEL[lv].labelBn)}</span>
                <span class="dvam-meta">${meta}</span>
            </button>`;
    }).join('');

    const legend = ['critical', 'alert', 'watch', 'safe'].map(k =>
        `<span><i style="background:${LEVEL[k].color}"></i>${esc(LEVEL[k].labelBn)}</span>`).join('');

    mount.innerHTML = `
        <div class="dvam-card">
            <div class="dvam-head">
                <div class="dvam-title">🗺️ বিভাগভিত্তিক ঝুঁকি ও প্রভাব মানচিত্র</div>
                <div class="dvam-sub">NASA POWER × NASA SEDAC GPW v4${latestDate ? ` · ডেটা: ${esc(latestDate)}` : ''}${anyStale ? ' · ⚠️ কিছু ডেটা সংরক্ষিত' : ''}</div>
            </div>

            <div class="dvam-totals">
                <div class="dvam-total"><b>${highCount}/${ok.length}</b><span>বিভাগে উচ্চ/অতি উচ্চ ঝুঁকি</span></div>
                <div class="dvam-total"><b>${esc(fmt(totPeople))}</b><span>👥 ঝুঁকিতে মানুষ</span></div>
                <div class="dvam-total"><b>${esc(fmt(totFarmers))}</b><span>🧑‍🌾 প্রান্তিক কৃষক</span></div>
                <div class="dvam-total"><b>${esc(fmt(totLive))}</b><span>🐾 ঝুঁকিতে পশু</span></div>
                <div class="dvam-total"><b>৳${totLossCr.toFixed(1)} কোটি</b><span>💰 সম্ভাব্য ক্ষতি (অনুমান)</span></div>
            </div>

            <div class="dvam-body">
                <div class="dvam-map">
                    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="বাংলাদেশের বিভাগভিত্তিক ঝুঁকির মানচিত্র">
                        <polygon points="${outline}" fill="#eef2f7" stroke="#94a3b8" stroke-width="1.2" stroke-linejoin="round"/>
                        ${bubbles}
                    </svg>
                    <div class="dvam-legend">${legend}</div>
                </div>
                <div class="dvam-list">${list}</div>
            </div>

            <div class="dvam-note">বুদবুদের আকার = ঝুঁকিতে থাকা পশুর সংখ্যা, রঙ = রোগের ঝুঁকির মাত্রা। বিভাগে ক্লিক করলে উপরের ড্যাশবোর্ড সেই বিভাগে চলে যাবে।
            মানচিত্রের সীমানা সরলীকৃত (শুধু ভিজ্যুয়াল রেফারেন্স); জনসংখ্যা SEDAC GPW v4 ও পশুসম্পদ DLS-ভিত্তিক বিভাগীয় অনুমান।</div>
        </div>`;
}

/* ===== MOUNT + EVENTS ===== */
function findMount() {
    let el = document.getElementById('adminMapBody');
    if (el) return el;
    const impact = document.getElementById('impactBody');
    if (!impact) return null;
    const host = impact.closest('section, .climate-card, .result-section') || impact.parentElement;
    if (!host || !host.parentElement) return null;
    el = document.createElement('div');
    el.id = 'adminMapBody';
    host.insertAdjacentElement('afterend', el);
    return el;
}

function onPick(key) {
    if (!COORDS[key]) return;
    if (window.DVClimate && typeof DVClimate.setDistrict === 'function') {
        DVClimate.setDistrict(key);
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (_) { window.scrollTo(0, 0); }
        if (rowsCache.length) {
            const m = document.getElementById('adminMapBody');
            if (m) render(m, rowsCache);
        }
    }
}

function bind(mount) {
    if (mount.dataset.dvamBound) return;
    mount.dataset.dvamBound = '1';
    mount.addEventListener('click', e => {
        const t = e.target.closest && e.target.closest('[data-key]');
        if (t) onPick(t.getAttribute('data-key'));
    });
    mount.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest && e.target.closest('circle[data-key]');
        if (t) { e.preventDefault(); onPick(t.getAttribute('data-key')); }
    });
}

async function start() {
    if (!window.NasaPower || !window.NasaOutbreak || !window.NasaSedac) {
        console.warn('[AdminMap] Required NASA modules not loaded');
        return;
    }
    const mount = findMount();
    if (!mount) return;
    injectStyles();
    bind(mount);

    const token = ++runToken;
    mount.innerHTML = `<div class="dvam-card"><div class="dvam-empty">🛰️ সব বিভাগের NASA ডেটা লোড হচ্ছে…</div></div>`;
    try {
        const rows = await loadAll(token);
        if (token !== runToken) return;
        rowsCache = rows;
        render(mount, rows);
    } catch (err) {
        console.error('[AdminMap] failed:', err);
        mount.innerHTML = `<div class="dvam-card"><div class="dvam-empty">মানচিত্র লোড করা যায়নি।</div></div>`;
    }
}

function init() {
    const mount = findMount();
    if (!mount) return;                       // not the climate dashboard page
    if ('IntersectionObserver' in window) {   // load only when the card is near the viewport
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) { io.disconnect(); start(); }
        }, { rootMargin: '300px' });
        io.observe(mount);
    } else {
        start();
    }
}

window.NasaAdminMap = { refresh: start, COORDS };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();