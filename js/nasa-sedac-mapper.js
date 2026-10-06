/* DailyVet — NASA SEDAC Impact Mapper v2.0
   Population: NASA SEDAC GPW v4.11
   Livestock:  DLS Bangladesh (2022-23 estimate)
   v2.0: Detailed calculation steps + economic loss
*/
(function () {
'use strict';

const SEDAC_COLLECTION = 'sedac_data';
const CACHE_TTL_MS = 10 * 60 * 1000;
const _fs = () => firebase.firestore();
const _cache = new Map();

/* ===== FALLBACK DATA (SEDAC GPW v4.11 + DLS) ===== */
const FALLBACK_DATA = {
    dhaka: {
        name: 'Dhaka', nameBn: 'ঢাকা',
        population: 44_215_759, ruralPopulation: 27_582_000,
        marginalFarmers: 82_000,
        livestock: { cattle: 385_000, goat: 195_000, sheep: 28_000, poultry: 5_200_000 },
        vulnerabilityIndex: 0.72
    },
    chittagong: {
        name: 'Chittagong', nameBn: 'চট্টগ্রাম',
        population: 33_202_326, ruralPopulation: 24_120_000,
        marginalFarmers: 78_000,
        livestock: { cattle: 340_000, goat: 175_000, sheep: 32_000, poultry: 4_600_000 },
        vulnerabilityIndex: 0.78
    },
    rajshahi: {
        name: 'Rajshahi', nameBn: 'রাজশাহী',
        population: 20_810_000, ruralPopulation: 15_680_000,
        marginalFarmers: 68_000,
        livestock: { cattle: 295_000, goat: 155_000, sheep: 24_000, poultry: 3_100_000 },
        vulnerabilityIndex: 0.65
    },
    khulna: {
        name: 'Khulna', nameBn: 'খুলনা',
        population: 17_415_000, ruralPopulation: 13_250_000,
        marginalFarmers: 58_000,
        livestock: { cattle: 245_000, goat: 128_000, sheep: 18_000, poultry: 2_800_000 },
        vulnerabilityIndex: 0.70
    },
    barisal: {
        name: 'Barisal', nameBn: 'বরিশাল',
        population: 9_325_000, ruralPopulation: 7_480_000,
        marginalFarmers: 42_000,
        livestock: { cattle: 145_000, goat: 82_000, sheep: 12_000, poultry: 1_700_000 },
        vulnerabilityIndex: 0.68
    },
    sylhet: {
        name: 'Sylhet', nameBn: 'সিলেট',
        population: 11_415_000, ruralPopulation: 8_620_000,
        marginalFarmers: 38_000,
        livestock: { cattle: 175_000, goat: 88_000, sheep: 14_000, poultry: 2_100_000 },
        vulnerabilityIndex: 0.74
    },
    rangpur: {
        name: 'Rangpur', nameBn: 'রংপুর',
        population: 17_610_000, ruralPopulation: 14_380_000,
        marginalFarmers: 72_000,
        livestock: { cattle: 265_000, goat: 142_000, sheep: 22_000, poultry: 2_500_000 },
        vulnerabilityIndex: 0.61
    },
    mymensingh: {
        name: 'Mymensingh', nameBn: 'ময়মনসিংহ',
        population: 12_368_000, ruralPopulation: 9_820_000,
        marginalFarmers: 55_000,
        livestock: { cattle: 210_000, goat: 105_000, sheep: 15_000, poultry: 2_300_000 },
        vulnerabilityIndex: 0.66
    }
};

/* ===== FETCH ===== */
async function fetchSedacData(district) {
    if (!district) return null;
    const key = String(district).toLowerCase().trim();
    
    const hit = _cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
    
    const base = FALLBACK_DATA[key] || {};
    let result = null;
    
    try {
        const doc = await _fs().collection(SEDAC_COLLECTION).doc(key).get();
        if (doc.exists) {
            const data = doc.data();
            if (data && data.population && data.livestock) {
                result = { ...base, ...data, id: doc.id, source: 'firestore' };
            }
        }
    } catch (err) {
        console.warn('[SEDAC] Firestore fetch failed:', err.message);
    }
    
    if (!result && FALLBACK_DATA[key]) {
        result = { ...base, id: key, source: 'fallback-gpw411' };
    }
    
    if (result) _cache.set(key, { at: Date.now(), data: result });
    return result;
}

/* ===== IMPACT CALCULATION with detailed steps ===== */
const EXPOSURE_MULTIPLIER = { critical: 0.85, alert: 0.65, watch: 0.35, safe: 0.10 };

/* Share of the *exposed* animals expected to be lost (death, treatment, lost output).
   Exposed animals are NOT all lost: this keeps the SEDAC loss figure realistic and in the
   same order of magnitude as the outbreak engine's 10%-affected assumption.
   These are planning assumptions: adjust / cite them before presenting as fact. */
const EXPECTED_LOSS_RATE = { critical: 0.08, alert: 0.05, watch: 0.02, safe: 0.005 };

const LIVESTOCK_VALUE_BDT = {
    cattle: 80000,
    buffalo: 100000,
    goat: 12000,
    sheep: 10000,
    poultry: 400
};

function calculateImpactDetailed(sedac, riskCtx) {
    if (!sedac) return null;
    
    const riskLevel = String((riskCtx && riskCtx.level) || 'safe').toLowerCase();
    const riskScore = Number(riskCtx && riskCtx.score) || 0;
    const multiplier = EXPOSURE_MULTIPLIER[riskLevel] !== undefined
        ? EXPOSURE_MULTIPLIER[riskLevel]
        : EXPOSURE_MULTIPLIER.safe;
    
    const livestock = sedac.livestock || {};
    const exposed = n => Math.round((Number(n) || 0) * multiplier);
    
    const cattle = exposed(livestock.cattle);
    const goat = exposed(livestock.goat);
    const sheep = exposed(livestock.sheep);
    const poultry = exposed(livestock.poultry);
    
    const populationAtRisk = exposed(sedac.ruralPopulation);
    const farmersAtRisk = exposed(sedac.marginalFarmers);
    const livestockAtRisk = cattle + goat + sheep + poultry;
    
    /* ===== Economic loss ===== */
    const lossRate = EXPECTED_LOSS_RATE[riskLevel] !== undefined
        ? EXPECTED_LOSS_RATE[riskLevel]
        : EXPECTED_LOSS_RATE.safe;
    const lossOf = (heads, value) => Math.round(heads * lossRate * value);
    const lossCattle  = lossOf(cattle,  LIVESTOCK_VALUE_BDT.cattle);
    const lossGoat    = lossOf(goat,    LIVESTOCK_VALUE_BDT.goat);
    const lossSheep   = lossOf(sheep,   LIVESTOCK_VALUE_BDT.sheep);
    const lossPoultry = lossOf(poultry, LIVESTOCK_VALUE_BDT.poultry);
    const economicLoss = lossCattle + lossGoat + lossSheep + lossPoultry;
    
    /* ===== Vulnerability ===== */
    const vulnerability = Math.min(100, Math.max(0, Math.round((sedac.vulnerabilityIndex || 0.5) * riskScore)));
    
    /* ===== Detailed calculation steps ===== */
    const calculationSteps = [
        {
            step: 'মোট গ্রামীণ জনসংখ্যা',
            stepEn: 'Total rural population',
            value: sedac.ruralPopulation,
            formula: null
        },
        {
            step: 'Exposure multiplier',
            stepEn: 'Exposure multiplier',
            value: `×${multiplier}`,
            formula: `(risk level: ${riskLevel})`
        },
        {
            step: 'ঝুঁকিতে জনসংখ্যা',
            stepEn: 'Population at risk',
            value: populationAtRisk,
            formula: `${formatNumber(sedac.ruralPopulation)} × ${multiplier}`
        },
        {
            step: 'প্রান্তিক কৃষক',
            stepEn: 'Marginal farmers',
            value: sedac.marginalFarmers,
            formula: null
        },
        {
            step: 'ঝুঁকিতে কৃষক',
            stepEn: 'Farmers at risk',
            value: farmersAtRisk,
            formula: `${formatNumber(sedac.marginalFarmers)} × ${multiplier}`
        },
        {
            step: 'ঝুঁকিতে গবাদি পশু',
            stepEn: 'Livestock at risk',
            value: livestockAtRisk,
            formula: `গরু + ছাগল + ভেড়া + পোল্ট্রি (প্রত্যেকটি × ${multiplier})`
        },
        {
            step: 'প্রত্যাশিত ক্ষতির হার',
            stepEn: 'Expected loss rate',
            value: `${(lossRate * 100).toFixed(1)}%`,
            formula: 'ঝুঁকিতে থাকা পশুর যে অংশ ক্ষতিগ্রস্ত হতে পারে (অনুমান)'
        },
        {
            step: 'সম্ভাব্য আর্থিক ক্ষতি',
            stepEn: 'Estimated economic loss',
            value: `৳${(economicLoss / 10000000).toFixed(2)} কোটি`,
            formula: 'পশু × ক্ষতির হার × গড় বাজারমূল্য'
        }
    ];
    
    return {
        riskLevel,
        riskScore,
        multiplier,
        lossRate,
        populationAtRisk,
        farmersAtRisk,
        livestockAtRisk,
        breakdown: { cattle, goat, sheep, poultry },
        vulnerability,
        districtName: sedac.name,
        districtNameBn: sedac.nameBn,
        dataSource: sedac.source || 'unknown',
        calculationSteps,
        economicLoss: {
            total: Math.round(economicLoss),
            min: Math.round(economicLoss * 0.7),
            max: Math.round(economicLoss * 1.3),
            minCrore: (economicLoss * 0.7 / 10000000).toFixed(2),
            maxCrore: (economicLoss * 1.3 / 10000000).toFixed(2),
            currency: '৳',
            breakdown: {
                cattle: lossCattle,
                goat: lossGoat,
                sheep: lossSheep,
                poultry: lossPoultry
            }
        },
        rawLivestock: livestock,
        rawPopulation: {
            total: sedac.population,
            rural: sedac.ruralPopulation,
            farmers: sedac.marginalFarmers
        }
    };
}

function calculateImpact(sedac, riskCtx) {
    return calculateImpactDetailed(sedac, riskCtx);
}

/* ===== NUMBER FORMATTER ===== */
function formatNumber(n) {
    const v = Number(n);
    if (n === null || n === undefined || !Number.isFinite(v)) return '0';
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (v >= 1_000) {
        const k = Math.round(v / 1_000);
        return k >= 1000 ? '1.0M' : k + 'K';
    }
    return String(Math.round(v));
}

/* ===== BANGLA SUMMARY with numbers ===== */
function generateImpactSummary(impact) {
    if (!impact) return '';
    
    const { riskLevel, populationAtRisk, farmersAtRisk, livestockAtRisk, districtName, economicLoss } = impact;
    const pop = formatNumber(populationAtRisk);
    const farm = formatNumber(farmersAtRisk);
    const live = formatNumber(livestockAtRisk);
    
    switch (riskLevel) {
        case 'safe':
            return `${districtName} এলাকায় বর্তমানে কোনো বড় ঝুঁকি নেই। স্বাভাবিক অবস্থা বিরাজ করছে।`;
        case 'watch':
            return `${districtName} এলাকায় প্রায় ${pop} মানুষ এবং ${live} গবাদি পশু নজরদারির মধ্যে আছে। সতর্ক থাকুন এবং প্রতিরোধমূলক ব্যবস্থা নিন।`;
        case 'alert':
            return `${districtName} এলাকায় প্রায় ${farm} marginal কৃষকের জীবিকা এবং ${live} গবাদি পশু খাদ্য নিরাপত্তা ঝুঁকিতে পড়তে পারে। সম্ভাব্য ক্ষতি ৳${economicLoss.minCrore}–${economicLoss.maxCrore} কোটি। জরুরি প্রস্তুতি নিন।`;
        case 'critical':
            return `🚨 ${districtName} এলাকায় প্রায় ${pop} মানুষ এবং ${live} গবাদি পশু গুরুতর ঝুঁকিতে আছে। সম্ভাব্য ক্ষতি ৳${economicLoss.minCrore}–${economicLoss.maxCrore} কোটি। অবিলম্বে প্রতিরোধমূলক ব্যবস্থা ও ভেটেরিনারিয়ান সহায়তা প্রয়োজন।`;
        default:
            return `${districtName} এলাকার ঝুঁকির তথ্য পাওয়া যায়নি।`;
    }
}

/* ===== PUBLIC API ===== */
window.NasaSedac = {
    fetchSedacData,
    calculateImpact,
    calculateImpactDetailed,
    generateImpactSummary,
    formatNumber,
    listDistricts: () => Object.keys(FALLBACK_DATA),
    FALLBACK_DATA,
    LIVESTOCK_VALUE_BDT,
    EXPECTED_LOSS_RATE,
    SOURCE: 'NASA SEDAC GPW v4.11',
    GEE_COLLECTION: 'CIESIN/GPWv411/GPW_Population_Count'
};

})();