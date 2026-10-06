/* DailyVet — NASA Climate Engine v2.1
   THI (NRC 1971):  THI = (1.8×T + 32) − (0.55 − 0.0055×RH) × (1.8×T − 26)
   Inputs (NASA POWER): T2M, RH2M, GWETTOP
   Heat-stress thresholds (species-specific):
     Cow/Buffalo: <72 normal | 72–79 mild | 79–89 moderate | ≥89 severe
     Goat/Sheep:  <75 normal | 75–82 mild | 82–88 moderate | ≥88 severe
     Poultry:     <70 normal | 70–76 mild | 76–83 moderate | ≥83 severe
     Dog:         <72 normal | 72–78 mild | 78–85 moderate | ≥85 severe
     Cat:         <72 normal | 72–78 mild | 78–85 moderate | ≥85 severe
   v2.1: Jumbo removed from dry-soil list (needs medium water — unsuitable for dry).
*/
(function () {
'use strict';

/* ===== START: THI CALCULATION - NRC 1971 formula (NASA: T2M, RH2M) ===== */
const _num = v => (v === null || v === undefined || v === '') ? NaN : Number(v);

function calculateTHI(tempC, rh) {
    const T = _num(tempC);
    const R = _num(rh);
    if (!Number.isFinite(T) || !Number.isFinite(R)) return null;
    return (1.8 * T + 32) - (0.55 - 0.0055 * R) * (1.8 * T - 26);
}
/* ===== END: THI CALCULATION ===== */

/* ===== START: SPECIES-SPECIFIC THI THRESHOLDS ===== */
const THI_THRESHOLDS = {
    cow:      { mild: 72, moderate: 79, severe: 89, label: '🐄 গরু' },
    buffalo:  { mild: 72, moderate: 79, severe: 89, label: '🐃 মহিষ' },
    goat:     { mild: 75, moderate: 82, severe: 88, label: '🐐 ছাগল' },
    sheep:    { mild: 75, moderate: 82, severe: 88, label: '🐑 ভেড়া' },
    poultry:  { mild: 70, moderate: 76, severe: 83, label: '🐔 মুরগি' },
    chicken:  { mild: 70, moderate: 76, severe: 83, label: '🐔 মুরগি' },
    duck:     { mild: 70, moderate: 76, severe: 83, label: '🦆 হাঁস' },
    dog:      { mild: 72, moderate: 78, severe: 85, label: '🐕 কুকুর' },
    cat:      { mild: 72, moderate: 78, severe: 85, label: '🐈 বিড়াল' },
    default:  { mild: 72, moderate: 79, severe: 89, label: '🐾 পশু' }
};

const THI_LEVEL_DEFS = {
    normal: {
        level: 'normal', label: 'Normal', labelBn: 'স্বাভাবিক',
        color: '#047857', bg: '#ecfdf5', border: '#86efac',
        advice: 'Heat-stress risk is low. Maintain normal care.',
        adviceBn: 'তাপ-স্ট্রেসের ঝুঁকি কম। স্বাভাবিক যত্ন চালিয়ে যান।',
        actionBn: 'স্বাভাবিক যত্ন চালিয়ে যান',
        action: 'Maintain normal care'
    },
    mild: {
        level: 'mild', label: 'Mild', labelBn: 'মৃদু',
        color: '#92400e', bg: '#fef9e7', border: '#fcd34d',
        advice: 'Mild heat-stress. Provide shade and cool water.',
        adviceBn: 'মৃদু তাপ-স্ট্রেস। ছায়া ও ঠান্ডা পানি দিন।',
        actionBn: 'ছায়ায় রাখুন, পানি ১.৫ গুণ দিন',
        action: 'Provide shade, water ×1.5'
    },
    moderate: {
        level: 'moderate', label: 'Moderate', labelBn: 'মধ্যম',
        color: '#c2410c', bg: '#fff7ed', border: '#fdba74',
        advice: 'Moderate heat-stress. Reduce activity, use fans, add electrolytes.',
        adviceBn: 'মধ্যম তাপ-স্ট্রেস। পরিশ্রম কমান, ফ্যান ব্যবহার করুন, ইলেক্ট্রোলাইট দিন।',
        actionBn: 'দুপুরে ছায়ায় রাখুন, পানি ২ গুণ দিন',
        action: 'Keep in shade at noon, water ×2, add electrolytes'
    },
    severe: {
        level: 'severe', label: 'Severe', labelBn: 'তীব্র',
        color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
        advice: 'SEVERE heat-stress! Immediate action needed. Spray water, provide shade, call vet.',
        adviceBn: 'তীব্র তাপ-স্ট্রেস! এখনই ব্যবস্থা নিন। পানি ছিটান, ছায়া দিন, ভেট ডাকুন।',
        actionBn: 'এখনই পানি ছিটান, ঠান্ডা জায়গায় নিন, ভেট ডাকুন',
        action: 'Spray water NOW, move to cool area, call vet'
    },
    unknown: {
        level: 'unknown', label: 'Unknown', labelBn: 'অজানা',
        color: '#8ab8be', bg: '#f1f5f9', border: '#e2e8f0',
        advice: 'Data not available', adviceBn: 'ডেটা পাওয়া যায়নি',
        actionBn: 'ডেটা পাওয়া যায়নি', action: 'Data not available'
    }
};

function classifyTHI(thi, species) {
    if (!Number.isFinite(thi)) return { ...THI_LEVEL_DEFS.unknown };

    const sp = (species || 'default').toLowerCase();
    const thresholds = THI_THRESHOLDS[sp] || THI_THRESHOLDS.default;

    let level;
    if (thi < thresholds.mild) level = 'normal';
    else if (thi < thresholds.moderate) level = 'mild';
    else if (thi < thresholds.severe) level = 'moderate';
    else level = 'severe';

    return {
        ...THI_LEVEL_DEFS[level],
        species: sp,
        speciesLabel: thresholds.label,
        thresholds,
        thiValue: thi
    };
}
/* ===== END: SPECIES-SPECIFIC THI THRESHOLDS ===== */

/* ===== START: THI COMPARISON - Before/After ===== */
function generateTHIComparison(current, yesterday, tomorrow, species, lang) {
    const bn = lang === 'bn';

    if (!Number.isFinite(current)) {
        return {
            available: false,
            headlineBn: 'ডেটা পাওয়া যায়নি',
            headline: 'Data not available'
        };
    }

    const currentCls = classifyTHI(current, species);
    const yesterdayCls = Number.isFinite(yesterday) ? classifyTHI(yesterday, species) : null;
    const tomorrowCls = Number.isFinite(tomorrow) ? classifyTHI(tomorrow, species) : null;

    const delta = Number.isFinite(yesterday) ? current - yesterday : null;
    let trend = '➡️ স্থির';
    let trendEn = 'Stable';

    if (delta !== null) {
        if (delta > 2) { trend = '⬆️ বাড়ছে'; trendEn = 'Rising'; }
        else if (delta < -2) { trend = '⬇️ কমছে'; trendEn = 'Falling'; }
    }

    const deltaText = delta !== null
        ? (bn
            ? `গতকালের চেয়ে ${Math.abs(delta).toFixed(1)} পয়েন্ট ${delta > 0 ? 'বেশি' : 'কম'}`
            : `${Math.abs(delta).toFixed(1)} points ${delta > 0 ? 'higher' : 'lower'} than yesterday`)
        : '';

    const headlineBn = currentCls.level === 'normal'
        ? `আপনার ${currentCls.speciesLabel} এখন স্বাভাবিক অবস্থায়`
        : `আপনার ${currentCls.speciesLabel} এখন ${currentCls.labelBn} ঝুঁকিতে`;
    const headline = bn
        ? headlineBn
        : `Your ${species || 'animal'} shows ${currentCls.label} heat-stress in the latest NASA data`;

    const tomorrowText = tomorrowCls
        ? (bn
            ? `আগামীকাল (আনুমানিক): ${tomorrow.toFixed(1)} THI (${tomorrowCls.labelBn})`
            : `Tomorrow (trend estimate): ${tomorrow.toFixed(1)} THI (${tomorrowCls.label})`)
        : '';

    const yesterdayText = yesterdayCls
        ? (bn
            ? `গতকাল: ${yesterday.toFixed(1)} THI (${yesterdayCls.labelBn})`
            : `Yesterday: ${yesterday.toFixed(1)} THI (${yesterdayCls.label})`)
        : '';

    return {
        available: true,
        current: current.toFixed(1),
        yesterday: yesterdayCls ? yesterday.toFixed(1) : null,
        tomorrow: tomorrowCls ? tomorrow.toFixed(1) : null,
        delta: delta !== null ? delta.toFixed(1) : null,
        trend,
        trendEn,
        deltaText,
        headline,
        headlineBn,
        yesterdayText,
        tomorrowText,
        currentLevel: currentCls.level,
        currentLevelBn: currentCls.labelBn,
        color: currentCls.color,
        bg: currentCls.bg,
        border: currentCls.border,
        actionBn: currentCls.actionBn,
        action: currentCls.action,
        adviceBn: currentCls.adviceBn,
        advice: currentCls.advice
    };
}
/* ===== END: THI COMPARISON ===== */

/* ===== START: SOIL LEVELS + FORAGE LIBRARY ===== */
const SOIL_LEVELS = [
    { max: 0.15, level: 'drought', label: 'Drought Risk', labelBn: 'খরা ঝুঁকি', color: '#dc2626',
      advice: 'Very dry soil. Choose drought-tolerant grass.',
      adviceBn: 'মাটি অত্যন্ত শুষ্ক। খরা-সহনশীল ঘাস বেছে নিন।' },
    { max: 0.30, level: 'dry', label: 'Dry', labelBn: 'শুষ্ক', color: '#d97706',
      advice: 'Dry soil. Irrigation may be needed.',
      adviceBn: 'মাটি শুষ্ক। সেচের প্রয়োজন হতে পারে।' },
    { max: 0.65, level: 'optimal', label: 'Optimal', labelBn: 'উপযুক্ত', color: '#059669',
      advice: 'Soil moisture is optimal for forage growth.',
      adviceBn: 'পশুখাদ্য উৎপাদনের জন্য মাটির আর্দ্রতা উপযুক্ত।' },
    { max: Infinity, level: 'wet', label: 'Waterlogged', labelBn: 'জলাবদ্ধ', color: '#2563eb',
      advice: 'Soil is very wet. Risk of root rot and foot diseases.',
      adviceBn: 'মাটি অত্যন্ত ভেজা। শিকড় পচা ও খুর রোগের ঝুঁকি।' }
];

const FORAGE_DETAILS = {
    napier: {
        name: 'নেপিয়ার ঘাস', en: 'Napier Grass', emoji: '🌾',
        why: 'খরা-সহনশীল, উচ্চ ফলন',
        whyEn: 'Drought-tolerant, high yield',
        waterNeed: 'কম', waterNeedEn: 'Low',
        harvestDays: 70,
        yieldPerHectare: '৪০-৬০ টন',
        droughtTolerance: 'উচ্চ',
        suitableMonths: [1,2,3,4,5,6,10,11,12],
        avoidReason: 'বর্তমান মাটির অবস্থায় উপযুক্ত নয়'
    },
    german: {
        name: 'জার্মান ঘাস', en: 'German Grass', emoji: '🌱',
        why: 'ভেজা মাটিতে ভালো বাড়ে',
        whyEn: 'Grows well in wet soil',
        waterNeed: 'বেশি', waterNeedEn: 'High',
        harvestDays: 55,
        yieldPerHectare: '৩৫-৫০ টন',
        droughtTolerance: 'কম',
        suitableMonths: [7,8,9,10],
        avoidReason: 'পানি বেশি লাগবে'
    },
    para: {
        name: 'পাড়া ঘাস', en: 'Para Grass', emoji: '🍃',
        why: 'বন্যা-সহনশীল, নিচু জমির জন্য আদর্শ',
        whyEn: 'Flood-tolerant, ideal for lowland',
        waterNeed: 'বেশি', waterNeedEn: 'High',
        harvestDays: 60,
        yieldPerHectare: '৩০-৪০ টন',
        droughtTolerance: 'কম',
        suitableMonths: [7,8,9,10],
        avoidReason: 'জলাবদ্ধ মাটি দরকার'
    },
    jumbo: {
        name: 'জাম্বো ঘাস', en: 'Jumbo Grass', emoji: '🌿',
        why: 'ভালো অবস্থায় সর্বোচ্চ ফলন',
        whyEn: 'Highest yield in good conditions',
        waterNeed: 'মাঝারি', waterNeedEn: 'Medium',
        harvestDays: 65,
        yieldPerHectare: '৫০-৭০ টন',
        droughtTolerance: 'মাঝারি',
        suitableMonths: [3,4,5,6,7,8,9],
        avoidReason: 'মাঝারি পানি লাগে — শুষ্ক মাটিতে উপযুক্ত নয়'
    },
    fodderMaize: {
        name: 'ফডার মেইজ', en: 'Fodder Maize', emoji: '🌽',
        why: 'পুষ্টিকর, দুধের গরুর জন্য আদর্শ',
        whyEn: 'Nutritious, ideal for dairy cattle',
        waterNeed: 'মাঝারি', waterNeedEn: 'Medium',
        harvestDays: 85,
        yieldPerHectare: '৩৫-৫০ টন',
        droughtTolerance: 'মাঝারি',
        suitableMonths: [1,2,3,4,5,10,11,12],
        avoidReason: 'বর্তমান মাটির অবস্থায় উপযুক্ত নয়'
    }
};

const FORAGE_BY_SOIL = {
    drought: ['napier', 'fodderMaize', 'jumbo'],
    dry:     ['napier', 'fodderMaize'],
    optimal: ['jumbo', 'fodderMaize', 'napier'],
    wet:     ['german', 'para']
};

/* Regional difference (project plan): North-West / Barind -> drought risk,
   other areas -> flood risk. Keys match the dashboard district keys. */
const REGION_PROFILE = {
    rajshahi:   { type: 'drought', regionBn: 'বরেন্দ্র / উত্তর-পশ্চিম অঞ্চল',
                  noteBn: 'এই অঞ্চলে খরার ঝুঁকি বেশি — খরা-সহনশীল ঘাস, মালচিং ও সেচ-সাশ্রয়ী পদ্ধতি অগ্রাধিকার দিন।' },
    rangpur:    { type: 'drought', regionBn: 'উত্তর-পশ্চিম অঞ্চল',
                  noteBn: 'এই অঞ্চলে শুষ্ক মৌসুমে খরার ঝুঁকি বেশি — খরা-সহনশীল ঘাস অগ্রাধিকার দিন।' },
    dhaka:      { type: 'flood', regionBn: 'মধ্য বাংলাদেশ',
                  noteBn: 'বর্ষায় জলাবদ্ধতার ঝুঁকি আছে — নিষ্কাশন নালা ঠিক রাখুন, উঁচু জমিতে ঘাস লাগান।' },
    mymensingh: { type: 'flood', regionBn: 'উত্তর-মধ্য অঞ্চল',
                  noteBn: 'বর্ষায় বন্যার ঝুঁকি আছে — বন্যা-সহনশীল ঘাস ও উঁচু জমি বেছে নিন।' },
    sylhet:     { type: 'flood', regionBn: 'উত্তর-পূর্ব হাওর অঞ্চল',
                  noteBn: 'আকস্মিক বন্যার ঝুঁকি বেশি — বর্ষার আগে সাইলেজ/হে মজুত করে রাখুন।' },
    khulna:     { type: 'flood', regionBn: 'দক্ষিণ-পশ্চিম উপকূলীয় অঞ্চল',
                  noteBn: 'জলাবদ্ধতা ও লবণাক্ততার ঝুঁকি আছে — নিষ্কাশন ও লবণ-সহনশীল ঘাস বিবেচনা করুন।' },
    barisal:    { type: 'flood', regionBn: 'দক্ষিণ উপকূলীয় অঞ্চল',
                  noteBn: 'জলাবদ্ধতা ও জোয়ারের ঝুঁকি আছে — নিষ্কাশন ঠিক রাখুন।' },
    chittagong: { type: 'flood', regionBn: 'দক্ষিণ-পূর্ব উপকূলীয় অঞ্চল',
                  noteBn: 'ভারী বৃষ্টি ও পাহাড়ি ঢলের ঝুঁকি আছে — ঢালু জমিতে মাটি ক্ষয় রোধ করুন।' }
};

function getRegionProfile(districtKey) {
    return REGION_PROFILE[String(districtKey || '').toLowerCase()] || null;
}

/** Next calendar month (from `fromMonth`, inclusive) in which the grass can be planted. */
function _nextSuitableMonth(g, fromMonth) {
    for (let i = 0; i < 12; i++) {
        const m = ((fromMonth - 1 + i) % 12) + 1;
        if (g.suitableMonths.includes(m)) return m;
    }
    return g.suitableMonths[0];
}

/** Trend of a soil-moisture series (array of {value}) -> { trend, trendBn, delta } */
function classifySoilTrend(series) {
    const vals = (Array.isArray(series) ? series : [])
        .map(x => _num(x && x.value)).filter(Number.isFinite);
    if (vals.length < 3) return { trend: 'unknown', trendBn: '', delta: null };
    const half = Math.floor(vals.length / 2);
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const delta = avg(vals.slice(-half)) - avg(vals.slice(0, half));
    if (delta > 0.05)  return { trend: 'wetting', trendBn: '⬆️ মাটি ভিজছে', delta };
    if (delta < -0.05) return { trend: 'drying',  trendBn: '⬇️ মাটি শুকাচ্ছে', delta };
    return { trend: 'stable', trendBn: '➡️ মাটির আর্দ্রতা স্থির', delta };
}

function classifySoilMoisture(gwettop) {
    const v = _num(gwettop);
    if (!Number.isFinite(v)) {
        return {
            level: 'unknown', label: 'Unknown', labelBn: 'অজানা', color: '#8ab8be',
            advice: 'Soil data not available', adviceBn: 'মাটির ডেটা পাওয়া যায়নি'
        };
    }
    const found = SOIL_LEVELS.find(l => v < l.max);
    const { max, ...result } = found;
    return result;
}

/**
 * Forage recommendation with full details
 * @param {string} soilLevel
 * @param {number} currentMonth 1-12
 * @param {number} gwettop raw soil moisture 0-1
 * @param {string} districtKey optional — used for regional bias
 */
function recommendForageDetailed(soilLevel, currentMonth, gwettop, districtKey) {
    const month = Number.isInteger(currentMonth) && currentMonth >= 1 && currentMonth <= 12
        ? currentMonth : (new Date().getMonth() + 1);
    currentMonth = month;
    const region = getRegionProfile(districtKey);

    let grassKeys = (FORAGE_BY_SOIL[soilLevel] || ['napier']).slice();

    /* Region bias (only when soil itself is not extreme) */
    if (region && soilLevel === 'optimal') {
        if (region.type === 'drought') grassKeys = ['napier', 'jumbo', 'fodderMaize'];
        else if (currentMonth >= 6 && currentMonth <= 10) grassKeys = ['jumbo', 'para', 'napier'];
    }
    /* ✅ FIXED (v2.1): Jumbo removed — it needs medium water, unsuitable for dry soil.
       Fodder maize + Napier are the only truly dry-tolerant options. */
    if (region && region.type === 'drought' && soilLevel === 'dry') {
        grassKeys = ['napier', 'fodderMaize'];
    }

    /* Plantable-this-month grasses first (stable order otherwise) */
    grassKeys = grassKeys
        .map((k, i) => ({ k, i, ok: FORAGE_DETAILS[k].suitableMonths.includes(currentMonth) }))
        .sort((a, b) => (b.ok - a.ok) || (a.i - b.i))
        .map(x => x.k);
    const monthNames = ['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টে','অক্টো','নভে','ডিসে'];
    const monthFull = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

    const recommended = grassKeys.map(k => {
        const g = FORAGE_DETAILS[k];
        const monthSuitable = g.suitableMonths.includes(currentMonth);
        return {
            ...g,
            key: k,
            monthSuitable,
            reason: monthSuitable
                ? `✅ ${monthFull[currentMonth-1]} মাসে উপযুক্ত`
                : `⚠️ এই মাস উপযুক্ত নয় — ${monthFull[_nextSuitableMonth(g, currentMonth)-1]} মাসে লাগান`,
            reasonEn: monthSuitable
                ? `Suitable for planting in ${monthNames[currentMonth-1]}`
                : `⚠️ Not ideal this month — plant in ${monthNames[_nextSuitableMonth(g, currentMonth)-1]}`
        };
    });

    const avoid = Object.entries(FORAGE_DETAILS)
        .filter(([k]) => !grassKeys.includes(k))
        .slice(0, 2)
        .map(([k, g]) => ({
            name: g.name,
            nameEn: g.en,
            reason: g.avoidReason || 'বর্তমান মাটির অবস্থায় উপযুক্ত নয়',
            reasonEn: g.waterNeedEn === 'High'
                ? 'Needs too much water right now'
                : 'Not suitable for current soil'
        }));

    const calendar = [];
    for (let i = 0; i < 3; i++) {
        const m = ((currentMonth + i - 1) % 12) + 1;
        /* Calendar shows the grasses recommended for this soil that can be planted in month m
           (max 2, one per line). Falls back to any grass suitable that month. */
        let picks = grassKeys.filter(k => FORAGE_DETAILS[k].suitableMonths.includes(m));
        if (!picks.length) {
            picks = Object.keys(FORAGE_DETAILS).filter(k => FORAGE_DETAILS[k].suitableMonths.includes(m));
        }
        calendar.push({
            month: monthNames[m-1],
            grasses: picks.slice(0, 2).map(k => FORAGE_DETAILS[k].name),
            grass: picks.slice(0, 2).map(k => FORAGE_DETAILS[k].name).join(', ') || '—'
        });
    }

    const wet = soilLevel === 'wet';
    return {
        recommended,
        avoid,
        calendar,
        region: region ? { type: region.type, regionBn: region.regionBn, noteBn: region.noteBn } : null,
        soilMoisture: gwettop !== undefined && gwettop !== null
            ? (gwettop * 100).toFixed(0)
            : null,
        irrigation: {
            frequency: soilLevel === 'drought' ? 'প্রতি ২ দিনে ১ বার'
                     : soilLevel === 'dry' ? 'প্রতি ৩ দিনে ১ বার'
                     : soilLevel === 'wet' ? 'সেচের দরকার নেই'
                     : 'প্রতি সপ্তাহে ২ বার',
            frequencyEn: soilLevel === 'drought' ? 'Every 2 days'
                       : soilLevel === 'dry' ? 'Every 3 days'
                       : soilLevel === 'wet' ? 'No irrigation needed'
                       : 'Twice a week',
            timing: wet ? 'নিষ্কাশন নালা পরিষ্কার রাখুন' : 'ভোরে (৬-৮টা)',
            timingEn: wet ? 'Keep drainage channels clear' : 'Early morning (6-8 AM)',
            amountPerHectare: wet ? '০ লিটার' : '৩০,০০০ লিটার',
            amountPerHectareEn: wet ? '0 L' : '30,000 L',
            mulchingBenefit: wet ? 'জলাবদ্ধ জমিতে প্রযোজ্য নয়' : '৪০% পানি সাশ্রয়',
            mulchingBenefitEn: wet ? 'Not applicable on waterlogged soil' : '40% water savings'
        }
    };
}
/* ===== END: SOIL LEVELS + FORAGE LIBRARY ===== */

/* ===== START: FORAGE COMPARISON - Why this grass ===== */
function compareForageOptions(soilLevel) {
    const allKeys = Object.keys(FORAGE_DETAILS);
    const recommended = FORAGE_BY_SOIL[soilLevel] || ['napier'];

    return allKeys.map(k => {
        const g = FORAGE_DETAILS[k];
        const isRecommended = recommended.includes(k);
        const score = isRecommended ? 100 - recommended.indexOf(k) * 15 : 30;

        return {
            ...g,
            key: k,
            isRecommended,
            score,
            verdictBn: isRecommended
                ? `✅ ${recommended.indexOf(k) + 1} নম্বর পছন্দ`
                : '❌ এখন উপযুক্ত নয়',
            verdictEn: isRecommended
                ? `✅ Rank #${recommended.indexOf(k) + 1}`
                : '❌ Not suitable now'
        };
    }).sort((a, b) => b.score - a.score);
}
/* ===== END: FORAGE COMPARISON ===== */

/* ===== START: PUBLIC API ===== */
window.NasaClimate = {
    calculateTHI,
    classifyTHI,
    generateTHIComparison,
    classifySoilMoisture,
    recommendForageDetailed,
    recommendForage: (soilLevel) => {
        const keys = FORAGE_BY_SOIL[soilLevel] || ['napier'];
        return keys.map(k => FORAGE_DETAILS[k]);
    },
    compareForageOptions,
    classifySoilTrend,
    getRegionProfile,
    FORAGE_LIBRARY: FORAGE_DETAILS,
    FORAGE_DETAILS,
    REGION_PROFILE,
    THI_THRESHOLDS
};
/* ===== END: PUBLIC API ===== */

})();