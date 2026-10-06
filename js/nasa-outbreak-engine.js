/* DailyVet — NASA Outbreak & Vector Risk Engine v2.1
   Inputs (NASA POWER): PRECTOTCORR (rain mm/day), RH2M (%), T2M (°C)
   Overall score (0–100): rain max +40, humidity max +25, temperature max +20
   Levels: >=70 critical | >=50 alert | >=30 watch | <30 safe
   Disease data: Bangladesh DLS + FAO EMPRES-i patterns
   v2.1: estimateEconomicImpact now deduplicates animals across diseases
         (prevents same cattle being counted for LSD + FMD + mastitis).
*/
(function () {
'use strict';

/* ===== START: DISEASE LIBRARY ===== */
const DISEASE_LIBRARY = {
    lsd: {
        nameEn: 'Lumpy Skin Disease (LSD)',
        nameBn: 'লাম্পি স্কিন ডিজিজ', abbr: 'LSD',
        animals: ['Cow', 'Buffalo'],
        vector: 'mosquito', vectorBn: 'মশা ও মাছি',
        tempRange: [25, 32], rainThreshold: 30, humidityMin: 70,
        riskBoost: 15,
        adviceBn: 'গবাদি পশুকে মশারির নিচে রাখুন। ফার্মের পাশে জমা পানি পরিষ্কার করুন।',
        economicImpactPerHead: 80000
    },
    fmd: {
        nameEn: 'Foot & Mouth Disease (FMD)',
        nameBn: 'খুরা রোগ', abbr: 'FMD',
        animals: ['Cow', 'Goat', 'Buffalo', 'Sheep'],
        vector: 'water', vectorBn: 'দূষিত পানি ও কাদা',
        tempRange: [20, 30], rainThreshold: 50, humidityMin: 75,
        riskBoost: 12,
        adviceBn: 'পশুর খুর শুকনো রাখুন। ১% পটাশিয়াম পারম্যাঙ্গানেট দিয়ে খুর ধুয়ে দিন।',
        economicImpactPerHead: 60000
    },
    ppr: {
        nameEn: 'PPR (Peste des Petits Ruminants)',
        nameBn: 'পিপিআর', abbr: 'PPR',
        animals: ['Goat', 'Sheep'],
        vector: 'contact', vectorBn: 'সরাসরি সংস্পর্শ',
        tempRange: [22, 32], rainThreshold: 40, humidityMin: 70,
        riskBoost: 10,
        adviceBn: 'আক্রান্ত ছাগলকে আলাদা রাখুন। সুস্থ ছাগলকে PPR টিকা দিন।',
        economicImpactPerHead: 12000
    },
    ranikhet: {
        nameEn: 'Ranikhet (Newcastle Disease)',
        nameBn: 'রানীক্ষেত', abbr: 'Ranikhet',
        animals: ['Chicken', 'Duck', 'Pigeon'],
        vector: 'air', vectorBn: 'বায়ু ও দূষিত খাবার',
        tempRange: [20, 35], rainThreshold: 35, humidityMin: 65,
        riskBoost: 15,
        adviceBn: 'মুরগির ঘর শুকনো রাখুন। সুস্থ মুরগিকে BCRDV টিকা দিন।',
        economicImpactPerHead: 400
    },
    coccidiosis: {
        nameEn: 'Coccidiosis',
        nameBn: 'রক্ত আমাশয়', abbr: 'Coccidiosis',
        animals: ['Chicken', 'Duck', 'Goat', 'Rabbit'],
        vector: 'water', vectorBn: 'ভেজা লিটার ও দূষিত পানি',
        tempRange: [22, 30], rainThreshold: 30, humidityMin: 75,
        riskBoost: 18,
        adviceBn: 'মুরগির লিটার শুকনো রাখুন। অ্যান্টিককসিডিয়াল ঔষধ ভেটের পরামর্শে দিন।',
        economicImpactPerHead: 400
    },
    mastitis: {
        nameEn: 'Mastitis',
        nameBn: 'ওলান পাকা', abbr: 'Mastitis',
        animals: ['Cow', 'Buffalo', 'Goat'],
        vector: 'environment', vectorBn: 'ভেজা ও নোংরা পরিবেশ',
        tempRange: [15, 32], rainThreshold: 40, humidityMin: 80,
        riskBoost: 10,
        adviceBn: 'দোহনের আগে-পরে ওলান পরিষ্কার করুন। গোয়াল ঘর শুকনো রাখুন।',
        economicImpactPerHead: 45000
    }
};
/* ===== END: DISEASE LIBRARY ===== */

/* ===== START: HELPERS + RISK LEVEL TABLE ===== */
const GENERIC_DISEASES_BN = 'মশা-বাহিত ও পানিবাহিত রোগ';
const _isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

const RISK_LEVELS = [
    { min: 70, level: 'critical', label: 'Very High', labelBn: 'অতি উচ্চ',
      color: '#dc2626', bg: '#fef2f2', border: '#fecaca', icon: '🚨' },
    { min: 50, level: 'alert',    label: 'High',      labelBn: 'উচ্চ',
      color: '#c2410c', bg: '#fff7ed', border: '#fdba74', icon: '⚠️' },
    { min: 30, level: 'watch',    label: 'Medium',    labelBn: 'মধ্যম',
      color: '#92400e', bg: '#fef9e7', border: '#fcd34d', icon: '👀' },
    { min: 0,  level: 'safe',     label: 'Low',       labelBn: 'কম',
      color: '#047857', bg: '#ecfdf5', border: '#86efac', icon: '✅' }
];
/* ===== END: HELPERS + RISK LEVEL TABLE ===== */

/* ===== START: DETAILED RAINFALL RISK with breakdown ===== */
function calculateRainfallRiskDetailed(rainMm, humidity, temp) {
    if (!_isNum(rainMm)) {
        return {
            level: 'unknown', score: 0, color: '#8ab8be',
            label: 'Unknown', labelBn: 'অজানা',
            bg: '#f1f5f9', border: '#e2e8f0', icon: '⚪',
            breakdown: [],
            totalRawScore: 0
        };
    }

    const rain = Number(rainMm);
    /* Missing humidity / temperature must not print "NaN" — treat as 'no contribution' */
    const rhOk = _isNum(humidity), tOk = _isNum(temp);
    const rh = rhOk ? Number(humidity) : 0;
    const t = tOk ? Number(temp) : NaN;
    const breakdown = [];
    let score = 0;

    /* ===== RAINFALL ===== */
    let rainScore = 0, rainReason = '', rainReasonBn = '';
    if (rain > 100) { rainScore = 40; rainReason = '>100mm → severe flood'; rainReasonBn = '১০০ মিমির বেশি → তীব্র বন্যা-ঝুঁকি'; }
    else if (rain > 50) { rainScore = 30; rainReason = '>50mm → mosquito peak'; rainReasonBn = '৫০ মিমির বেশি → মশার প্রজনন তুঙ্গে'; }
    else if (rain > 20) { rainScore = 20; rainReason = '>20mm → moderate vector'; rainReasonBn = '২০ মিমির বেশি → মাঝারি ভেক্টর বৃদ্ধি'; }
    else if (rain > 5) { rainScore = 10; rainReason = '>5mm → light vector'; rainReasonBn = '৫ মিমির বেশি → হালকা ভেক্টর বৃদ্ধি'; }
    else { rainReason = '<5mm → minimal'; rainReasonBn = '৫ মিমির কম → প্রভাব সামান্য'; }
    score += rainScore;
    breakdown.push({
        icon: '🌧️', label: 'বৃষ্টি', labelEn: 'Rainfall',
        value: `${Math.round(rain)}mm/24h`,
        score: rainScore, max: 40, reason: rainReason,
        reasonBn: rainReasonBn
    });

    /* ===== HUMIDITY ===== */
    let humScore = 0, humReason = '', humReasonBn = '';
    if (!rhOk) { humReason = 'no data'; humReasonBn = 'আর্দ্রতার ডেটা নেই'; }
    else if (rh > 85) { humScore = 25; humReason = '>85% → vector survival high'; humReasonBn = '৮৫%-এর বেশি → বাহকের টিকে থাকার হার উচ্চ'; }
    else if (rh > 75) { humScore = 15; humReason = '>75% → moderate survival'; humReasonBn = '৭৫%-এর বেশি → বাহকের টিকে থাকার হার মাঝারি'; }
    else if (rh > 65) { humScore = 8; humReason = '>65% → low survival'; humReasonBn = '৬৫%-এর বেশি → বাহকের টিকে থাকার হার কম'; }
    else { humReason = '<65% → minimal'; humReasonBn = '৬৫%-এর কম → প্রভাব সামান্য'; }
    score += humScore;
    breakdown.push({
        icon: '💧', label: 'আর্দ্রতা', labelEn: 'Humidity',
        value: rhOk ? `${rh.toFixed(0)}%` : 'N/A',
        score: humScore, max: 25, reason: humReason,
        reasonBn: humReasonBn
    });

    /* ===== TEMPERATURE ===== */
    let tempScore = 0, tempReason = '', tempReasonBn = '';
    if (!tOk) { tempReason = 'no data'; tempReasonBn = 'তাপমাত্রার ডেটা নেই'; }
    else if (t >= 25 && t <= 32) { tempScore = 20; tempReason = '25-32°C → optimal for virus'; tempReasonBn = '২৫–৩২°C → রোগজীবাণু ও বাহকের জন্য সবচেয়ে অনুকূল'; }
    else if (t >= 20 && t < 35) { tempScore = 10; tempReason = '20-35°C → moderate'; tempReasonBn = '২০–৩৫°C → মাঝারি অনুকূল'; }
    else { tempReason = 'outside 20-35°C → low'; tempReasonBn = '২০–৩৫°C-এর বাইরে → কম অনুকূল'; }
    score += tempScore;
    breakdown.push({
        icon: '🌡️', label: 'তাপমাত্রা', labelEn: 'Temperature',
        value: tOk ? `${Math.round(t)}°C` : 'N/A',
        score: tempScore, max: 20, reason: tempReason,
        reasonBn: tempReasonBn
    });

    /* ===== VECTOR BASELINE ===== */
    const vectorBaseline = 10;
    score += vectorBaseline;
    breakdown.push({
        icon: '🦟', label: 'Vector baseline', labelEn: 'Vector baseline',
        value: 'Endemic',
        score: vectorBaseline, max: 10, reason: 'Bangladesh endemic baseline',
        reasonBn: 'বাংলাদেশে এন্ডেমিক বেসলাইন'
    });

    const totalRaw = score;
    const finalScore = Math.min(100, score);

    const levelDef = RISK_LEVELS.find(l => finalScore >= l.min);
    const { min, ...result } = levelDef;

    return {
        ...result,
        score: finalScore,
        totalRawScore: totalRaw,
        capped: totalRaw > 100,
        breakdown,
        inputs: { rain, humidity: rhOk ? rh : null, temp: tOk ? t : null }
    };
}

function calculateRainfallRisk(rainMm, humidity, temp) {
    return calculateRainfallRiskDetailed(rainMm, humidity, temp);
}
/* ===== END: DETAILED RAINFALL RISK ===== */

/* ===== START: DISEASE RISK with top 3 ===== */
function calculateDiseaseRisks(params) {
    const { rainMm, humidity, temp } = params || {};
    if (!_isNum(rainMm) || !_isNum(humidity) || !_isNum(temp)) return [];

    const rain = Number(rainMm);
    const rh = Number(humidity);
    const t = Number(temp);
    const risks = [];

    for (const [key, d] of Object.entries(DISEASE_LIBRARY)) {
        let score = 0;

        // Rain factor
        if (rain >= d.rainThreshold) score += 35;
        else if (rain >= d.rainThreshold * 0.6) score += 20;
        else if (rain >= d.rainThreshold * 0.3) score += 10;

        // Humidity factor
        if (rh >= d.humidityMin) score += 25;
        else if (rh >= d.humidityMin - 10) score += 12;

        // Temp factor
        if (t >= d.tempRange[0] && t <= d.tempRange[1]) score += 25;
        else if (t >= d.tempRange[0] - 3 && t <= d.tempRange[1] + 3) score += 12;

        // Endemic baseline
        score += d.riskBoost * 0.5;

        const rounded = Math.min(100, Math.round(score));
        if (rounded >= 30) {
            risks.push({
                key,
                ...d,
                score: rounded,
                economicPerHead: d.economicImpactPerHead
            });
        }
    }

    return risks.sort((a, b) => b.score - a.score).slice(0, 3);
}
/* ===== END: DISEASE RISK ===== */

/* ===== START: BANGLA ALERT with numbers ===== */
function generateAlertBanner(district, riskLevel, diseases, rainMm) {
    const level = riskLevel && riskLevel.level;
    const list = Array.isArray(diseases) ? diseases : [];
    const rain = Number(rainMm) || 0;

    if (level === 'safe') {
        return {
            type: 'safe', icon: '✅',
            titleBn: 'স্বাভাবিক অবস্থা',
            messageBn: `${district} এলাকায় বর্তমানে মশা-বাহিত বা পানিবাহিত রোগের ঝুঁকি কম।`,
            title: 'Normal condition',
            message: `Low risk of vector-borne diseases in ${district}.`
        };
    }

    if (level === 'watch') {
        return {
            type: 'watch', icon: '👀',
            titleBn: 'সতর্ক থাকুন',
            messageBn: `${district}-এ গত ২৪ ঘণ্টায় ${rain.toFixed(0)} মিমি বৃষ্টি হয়েছে। মশা ও মাছির প্রজনন বাড়তে পারে। জমা পানি পরিষ্কার করুন।`,
            title: 'Stay alert',
            message: `${rain.toFixed(0)}mm rain in ${district} in last 24h. Vector breeding may increase.`
        };
    }

    if (level === 'alert') {
        const names = list.slice(0, 2).map(d => d.nameBn).join(' ও ') || GENERIC_DISEASES_BN;
        const topDisease = list[0];
        return {
            type: 'alert', icon: '⚠️',
            titleBn: 'উচ্চ রোগের ঝুঁকি',
            messageBn: `${district}-এ ${rain.toFixed(0)} মিমি বৃষ্টিপাতের কারণে ${names} এর ঝুঁকি বেড়েছে${topDisease ? ` (${topDisease.score}%)` : ''}। পশুকে মশারির নিচে রাখুন এবং ফার্ম শুকনো রাখুন।`,
            title: 'High disease risk',
            message: `${rain.toFixed(0)}mm rainfall increased risk of ${names} in ${district}.`
        };
    }

    if (level === 'critical') {
        const names = list.slice(0, 3).map(d => d.nameBn).join(', ') || GENERIC_DISEASES_BN;
        const topDisease = list[0];
        return {
            type: 'critical', icon: '🚨',
            titleBn: 'জরুরি সতর্কতা',
            messageBn: `${district}-এ তীব্র বৃষ্টিপাত (${rain.toFixed(0)}mm) ও উচ্চ আর্দ্রতা। ${names} এর প্রাদুর্ভাবের সম্ভাবনা অতি উচ্চ${topDisease ? ` (${topDisease.score}%)` : ''}। এখনই প্রতিরোধমূলক ব্যবস্থা নিন এবং ভেটেরিনারিয়ানের সাথে যোগাযোগ করুন।`,
            title: 'Emergency alert',
            message: `Severe rainfall (${rain.toFixed(0)}mm) + high humidity. Very high risk of ${names} in ${district}.`
        };
    }

    return {
        type: 'unknown', icon: '⚪',
        titleBn: 'তথ্য পাওয়া যায়নি',
        messageBn: `${district} এলাকার আবহাওয়ার তথ্য পাওয়া যায়নি।`,
        title: 'No data',
        message: `No weather data for ${district}.`
    };
}
/* ===== END: BANGLA ALERT ===== */

/* ===== START: ECONOMIC IMPACT (v2.1 — double-count fixed) ===== */
/**
 * Estimate per-disease economic loss without double-counting animals.
 * If the same animal species (e.g. cattle) appears under several diseases
 * (LSD + FMD + mastitis), it is counted ONLY for the highest-risk disease.
 * That keeps the total realistic — matching how a real outbreak would unfold.
 *
 * @param {Array} diseases - Output of calculateDiseaseRisks() (sorted by score desc)
 * @param {Object} livestockCounts - { cow, buffalo, goat, sheep, chicken, duck, ... }
 * @returns {Object} { total, totalCrore, currency, breakdown, overlap, assumption }
 */
function estimateEconomicImpact(diseases, livestockCounts) {
    if (!Array.isArray(diseases) || !livestockCounts) {
        return {
            total: 0, totalCrore: '0.00', currency: '৳',
            breakdown: [], overlap: false,
            assumption: 'কোনো রোগ বা পশুর তথ্য নেই'
        };
    }

    /* Map "Cow" -> "cow", "Chicken" -> "chicken", plus plural fallback */
    const resolveCount = (speciesName) => {
        const key = String(speciesName || '').toLowerCase();
        if (livestockCounts[key] !== undefined) return Number(livestockCounts[key]) || 0;
        if (livestockCounts[key + 's'] !== undefined) return Number(livestockCounts[key + 's']) || 0;
        return 0;
    };

    /* ===== Deduplicate: each species counted ONLY for its top-risk disease ===== */
    const claimedSpecies = new Set();
    const breakdown = [];
    let total = 0;
    let hadOverlap = false;

    diseases.forEach(d => {
        const animals = Array.isArray(d.animals) ? d.animals : [];
        let affectedHeads = 0;
        let lostSpecies = 0;

        animals.forEach(a => {
            const speciesKey = String(a).toLowerCase();
            if (claimedSpecies.has(speciesKey)) {
                hadOverlap = true;   // same species already counted above
                return;
            }
            claimedSpecies.add(speciesKey);
            lostSpecies++;
            affectedHeads += resolveCount(a) * 0.1;  // 10% assumed infection rate
        });

        const loss = affectedHeads * (d.economicPerHead || 0);
        total += loss;

        breakdown.push({
            key: d.key,
            vector: d.vector,
            disease: d.nameBn,
            abbr: d.abbr || d.nameBn,
            diseaseEn: d.nameEn,
            affectedHeads: Math.round(affectedHeads),
            perHead: d.economicPerHead || 0,
            loss: Math.round(loss),
            lossCrore: (loss / 10000000).toFixed(2),
            speciesCounted: lostSpecies   // how many unique species this disease added
        });
    });

    return {
        total: Math.round(total),
        totalCrore: (total / 10000000).toFixed(2),
        currency: '৳',
        overlap: hadOverlap,
        assumption: hadOverlap
            ? 'একই পশু একাধিক রোগে গণনা এড়ানো হয়েছে — শুধু সর্বোচ্চ ঝুঁকির রোগে ধরা হয়েছে (সংক্রমণ-ধরা: ১০%)'
            : 'সংক্রমণ-ধরা: ঝুঁকিপূর্ণ পশুর ১০%',
        breakdown
    };
}

/**
 * Convert SEDAC livestock stats ({cattle, goat, sheep, poultry}) to the per-species
 * counts estimateEconomicImpact() expects. Explicit keys in the data win; otherwise
 * cattle is split cow/buffalo 90/10 and poultry chicken/duck 87/13 (ESTIMATES).
 * The split keeps totals equal to the SEDAC numbers (no double counting).
 */
function livestockFromSedac(sedac) {
    const l = sedac && sedac.livestock;
    if (!l) return null;
    const n = v => Math.max(0, Number(v) || 0);
    const cattle = n(l.cattle), poultry = n(l.poultry);
    const has = k => l[k] !== undefined && l[k] !== null;
    return {
        cow:     has('cow')     ? n(l.cow)     : Math.round(cattle * (has('buffalo') ? 1 : 0.9)),
        buffalo: has('buffalo') ? n(l.buffalo) : Math.round(cattle * 0.1),
        goat:    n(l.goat),
        sheep:   n(l.sheep),
        chicken: has('chicken') ? n(l.chicken) : Math.round(poultry * (has('duck') ? 1 : 0.87)),
        duck:    has('duck')    ? n(l.duck)    : Math.round(poultry * 0.13)
    };
}
/* ===== END: ECONOMIC IMPACT ===== */

/* ===== START: VECTOR ACTIVITY ===== */
const VECTOR_ACTIVITY = {
    safe:     { label: 'Low',       labelBn: 'কম',       icon: '🟢' },
    watch:    { label: 'Medium',    labelBn: 'মধ্যম',    icon: '🟡' },
    alert:    { label: 'High',      labelBn: 'উচ্চ',     icon: '🟠' },
    critical: { label: 'Very High', labelBn: 'অতি উচ্চ', icon: '🔴' },
    unknown:  { label: 'Unknown',   labelBn: 'অজানা',    icon: '⚪' }
};

function getVectorActivity(riskLevel) {
    return VECTOR_ACTIVITY[riskLevel] || VECTOR_ACTIVITY.unknown;
}
/* ===== END: VECTOR ACTIVITY ===== */

/* ===== START: PUBLIC API ===== */
window.NasaOutbreak = {
    calculateRainfallRisk,
    calculateRainfallRiskDetailed,
    calculateDiseaseRisks,
    generateAlertBanner,
    getVectorActivity,
    estimateEconomicImpact,
    livestockFromSedac,
    DISEASE_LIBRARY
};
/* ===== END: PUBLIC API ===== */

})();