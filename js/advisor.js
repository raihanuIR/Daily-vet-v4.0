// ============================================
// DAILYVET — FEED ADVISOR (Premium)
// Species-aware + BMI + Auto Health + Chat Button
// ============================================

let userPhone = null;
let isProcessing = false;
let lastResultData = null;

// ============================================
// CONSTANTS
// ============================================
const _elAdv = id => document.getElementById(id);
const _db = () => firebase.firestore();
const _checkedValue = name =>
    document.querySelector(`input[name="${name}"]:checked`)?.value;
const _checkedValues = name =>
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
const _round1 = n => Math.round(n * 10) / 10;

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 25000;

const SPECIES_LIMITS = {
    Dog:     { emoji: '🐕', minWeight: 0.5, maxWeight: 90,  maxAge: 25 },
    Cat:     { emoji: '🐈', minWeight: 0.5, maxWeight: 12,  maxAge: 25 },
    Cow:     { emoji: '🐄', minWeight: 30,  maxWeight: 900, maxAge: 20 },
    Goat:    { emoji: '🐐', minWeight: 5,   maxWeight: 120, maxAge: 15 },
    Chicken: { emoji: '🐔', minWeight: 0.3, maxWeight: 5,   maxAge: 8 }
};

const IDEAL_WEIGHT = {
    Dog: {
        puppy:  { min: 1, max: 25 },
        young:  { min: 4, max: 35 },
        adult:  { min: 4, max: 45 },
        senior: { min: 4, max: 48 }
    },
    Cat: {
        puppy:  { min: 0.5, max: 4.5 },
        young:  { min: 3,   max: 5.5 },
        adult:  { min: 3.5, max: 5.5 },
        senior: { min: 3.5, max: 5.5 }
    },
    Cow: {
        puppy:  { min: 40,  max: 200 },
        young:  { min: 100, max: 350 },
        adult:  { min: 200, max: 500 },
        senior: { min: 220, max: 480 }
    },
    Goat: {
        puppy:  { min: 5,  max: 20 },
        young:  { min: 15, max: 35 },
        adult:  { min: 25, max: 50 },
        senior: { min: 28, max: 50 }
    },
    Chicken: {
        puppy:  { min: 0.05, max: 1.5 },
        young:  { min: 0.7,  max: 2.2 },
        adult:  { min: 1.2,  max: 2.5 },
        senior: { min: 1.2,  max: 2.5 }
    }
};

const SPECIES_FEED_RULES = {
    Cow: `COW (RUMINANT) FEEDING RULES — CRITICAL:
- Cow is a RUMINANT (cud-chewing) animal.
- ALLOWED FOODS ONLY:
  * Green grass / সবুজ কাঁচা ঘাস (Napier, Para, German, Jumbo)
  * Hay / খড়
  * Rice straw / ধানের খড়
  * Rice bran / চালের ভুসি
  * Wheat bran / গমের ভুসি
  * Oil cake / খৈল (mustard, sesame, soybean)
  * Mineral mixture / খনিজ মিশ্রণ
  * Common salt / লবণ
  * Fresh silage (no fungal)
  * Fresh water
- FORBIDDEN: meat, chicken, mutton, egg, ghee, human rice, curd, milk (for adult cows).
- Portions in KG: grass 15-25kg, hay 4-6kg, concentrate 3-5kg.
- Feed 3 times + water (80-100 L) always.`,

    Goat: `GOAT (RUMINANT) FEEDING RULES:
- Goat is a RUMINANT.
- ALLOWED FOODS ONLY:
  * Green grass / কাঁচা ঘাস
  * Tree leaves / গাছের পাতা (neem, mango, jackfruit)
  * Hay / খড়
  * Rice bran / চালের ভুসি
  * Wheat bran / গমের ভুসি
  * Oil cake / খৈল
  * Mineral mixture + salt
  * Fresh water
- FORBIDDEN: meat, egg, ghee, curd, human food, milk.
- Portions in grams.`,

    Chicken: `CHICKEN (POULTRY) FEEDING RULES:
- Chicken is a MONOGASTRIC bird.
- ALLOWED FOODS ONLY:
  * Commercial poultry feed (starter/grower/layer)
  * Broken rice / চাল ভাঙ্গা
  * Maize / ভুট্টা
  * Soybean meal / সয়াবিন মিল
  * Fish meal / মাছের গুঁড়া
  * Limestone / চুনাপাথর (layers)
  * Vitamin-mineral premix
- FORBIDDEN: meat, milk, chocolate, onion, garlic, human cooked food.
- Portions in GRAMS per bird.`,

    Dog: `DOG FEEDING RULES:
- Dog is a MONOGASTRIC omnivore.
- ALLOWED: Commercial kibble/wet food, boiled chicken (no bone),
  boiled egg, plain rice, curd, carrot, pumpkin, green beans,
  boneless fish, small ghee.
- FORBIDDEN (toxic): chocolate, onion, garlic, grapes, raisins,
  xylitol, avocado, alcohol, caffeine, macadamia.
- Feed 2-3 times daily.`,

    Cat: `CAT FEEDING RULES:
- Cat is an OBLIGATE CARNIVORE.
- ALLOWED: Commercial cat food, boiled chicken, boneless fish,
  small liver, egg yolk, small curd.
- FORBIDDEN: chocolate, onion, garlic, grapes, raisins, milk,
  dog food, raw fish in large amounts.
- Feed 2-3 times daily.`
};

// ============================================
// SAFETY FILTER
// ============================================
function filterSpeciesAppropriate(aiData, petType) {
    if (!aiData || !aiData.meals) return aiData;
    if (!['Cow', 'Goat', 'Chicken'].includes(petType)) return aiData;

    const forbidden = ['mutton', 'beef', 'pork', 'ghee', 'butter',
                       'cheese', 'chicken breast', 'boiled egg', 'omelette',
                       'human rice'];

    aiData.meals = aiData.meals.map(meal => {
        meal.foods = meal.foods.filter(food => {
            const lf = food.toLowerCase();
            const isBad = forbidden.some(f => lf.includes(f));
            if (isBad) console.warn('⚠️ Filtered forbidden food for', petType, ':', food);
            return !isBad;
        });
        return meal;
    });

    const hasFood = aiData.meals.some(m => m.foods && m.foods.length > 0);
    return hasFood ? aiData : null;
}

// ============================================
// BMI CHECK
// ============================================
function calculateBMI(petType, ageInYears, weight) {
    const limits = IDEAL_WEIGHT[petType];
    if (!limits) return null;

    const stage = ageInYears < 1 ? 'puppy'
                : ageInYears < 3 ? 'young'
                : ageInYears < 7 ? 'adult'
                : 'senior';

    const ideal = limits[stage];
    const midIdeal = (ideal.min + ideal.max) / 2;
    const ratio = weight / midIdeal;

    let status, percent, color, advice;

    if (ratio < 0.75) {
        status = 'Underweight';
        percent = Math.round((1 - ratio) * 100);
        color = '#e67e22';
        advice = `আপনার পশু আদর্শের চেয়ে ${percent}% কম ওজনের। পুষ্টিকর খাবার বাড়ান।`;
    } else if (ratio < 0.9) {
        status = 'Slightly Underweight';
        percent = Math.round((1 - ratio) * 100);
        color = '#f39c12';
        advice = `সামান্য কম ওজন। খাবারে প্রোটিন বাড়ান।`;
    } else if (ratio <= 1.1) {
        status = 'Ideal';
        percent = 0;
        color = '#27ae60';
        advice = `চমৎকার! আপনার পশুর ওজন আদর্শ। এভাবেই বজায় রাখুন।`;
    } else if (ratio <= 1.25) {
        status = 'Slightly Overweight';
        percent = Math.round((ratio - 1) * 100);
        color = '#f39c12';
        advice = `সামান্য বেশি ওজন। খাবারের পরিমাণ কমান, ব্যায়াম বাড়ান।`;
    } else {
        status = 'Overweight';
        percent = Math.round((ratio - 1) * 100);
        color = '#c0392b';
        advice = `আদর্শের চেয়ে ${percent}% বেশি ওজন। ডায়েট কন্ট্রোল ও ব্যায়াম জরুরি।`;
    }

    return {
        status, percent, color, advice,
        idealMin: ideal.min,
        idealMax: ideal.max,
        midIdeal: _round1(midIdeal),
        stage, ratio
    };
}

// ============================================
// AUTO-DETECT HEALTH
// ============================================
function autoDetectHealthConditions(data, ageInYears, bmi) {
    const tags = [];

    if (ageInYears < 1) tags.push('Puppy/Kitten');

    const seniorAge = (data.petType === 'Dog' || data.petType === 'Cat') ? 7 : 8;
    if (ageInYears >= seniorAge) tags.push('Senior');

    if (bmi && ['Overweight', 'Slightly Overweight'].includes(bmi.status)) tags.push('Overweight');
    if (bmi && ['Underweight', 'Slightly Underweight'].includes(bmi.status)) tags.push('Underweight');

    console.log('🎯 Auto-detected health:', tags);
    return tags;
}

// ============================================
// VALIDATION
// ============================================
function validateInput(data) {
    const errors = [];
    const warnings = [];

    if (!data.petType) { errors.push('Please select a pet type.'); return { valid: false, errors, warnings }; }

    const limits = SPECIES_LIMITS[data.petType];
    if (!limits) { errors.push('Invalid pet type.'); return { valid: false, errors, warnings }; }

    const ageInYears = data.ageUnit === 'months' ? data.age / 12 : data.age;

    if (isNaN(ageInYears) || ageInYears < 0) errors.push('Please enter a valid age.');
    else if (ageInYears > limits.maxAge) errors.push(`${data.petType} age seems unrealistic (max ${limits.maxAge} years).`);

    if (isNaN(data.weight) || data.weight <= 0) errors.push('Please enter a valid weight.');
    else if (data.weight < limits.minWeight || data.weight > limits.maxWeight)
        errors.push(`${data.petType} weight should be between ${limits.minWeight}–${limits.maxWeight} kg.`);

    if (!data.gender) errors.push('Please select gender.');
    if (!data.activity) errors.push('Please select activity level.');
    if (!data.goal) errors.push('Please select goal.');

    if (data.health.includes('Pregnant') && data.gender === 'Male')
        errors.push('Pregnancy is only possible for female pets.');

    if (data.goal === 'Weight Loss' && data.health.includes('Puppy/Kitten')) {
        warnings.push('Weight loss is not recommended for puppies/kittens. Showing "Maintain" plan.');
        data.goal = 'Maintain';
    }

    if (data.goal === 'Weight Gain' && data.health.includes('Overweight'))
        errors.push('Cannot recommend weight gain for overweight pet.');

    if (data.goal === 'Weight Loss' && data.health.includes('Pregnant'))
        errors.push('Weight loss is unsafe during pregnancy.');

    if (data.health.includes('Sick') && data.goal !== 'Maintain')
        warnings.push('A sick pet should focus on recovery.');

    return { valid: errors.length === 0, errors, warnings, ageInYears };
}

// ============================================
// NUTRITION
// ============================================
function getActivityMultiplier(data, ageInYears, bmi) {
    const { activity, goal, health } = data;

    if (health.includes('Puppy/Kitten') || ageInYears < 1) return 2.5;
    if (health.includes('Senior')) return 1.2;
    if (health.includes('Pregnant')) return 2.0;
    if (health.includes('Sick')) return 1.2;

    if (bmi) {
        if (bmi.status === 'Overweight') return 1.0;
        if (bmi.status === 'Slightly Overweight') return 1.1;
        if (bmi.status === 'Underweight') return 2.0;
        if (bmi.status === 'Slightly Underweight') return 1.8;
    }

    if (health.includes('Overweight') || goal === 'Weight Loss') return 1.0;
    if (goal === 'Weight Gain') return 1.8;

    return { Low: 1.2, Medium: 1.6, High: 2.0 }[activity] || 1.4;
}

function calculateSmallAnimal(data, ageInYears, bmi) {
    const weight = data.weight;
    const factor = getActivityMultiplier(data, ageInYears, bmi);
    const calories = Math.round(70 * Math.pow(weight, 0.75) * factor);

    let pPct, fPct, cPct;
    if (data.petType === 'Cat') { pPct = 0.35; fPct = 0.30; cPct = 0.15; }
    else if (ageInYears < 1) { pPct = 0.28; fPct = 0.20; cPct = 0.42; }
    else if (data.health.includes('Senior')) { pPct = 0.22; fPct = 0.15; cPct = 0.53; }
    else { pPct = 0.26; fPct = 0.16; cPct = 0.48; }

    return {
        type: 'small',
        calories,
        protein: Math.round((calories * pPct) / 4),
        fat: Math.round((calories * fPct) / 9),
        carbs: Math.round((calories * cPct) / 4),
        water: Math.round(weight * 55),
        meals: (data.health.includes('Puppy/Kitten') || ageInYears < 0.5) ? 3 : 2
    };
}

/* ---------- Shared ruminant calculation (Cow + Goat) ---------- */
function _calculateRuminant(data, bmi, opts) {
    const { dmiFactor, greenPct, hayPct, concPct, waterFactor, meals,
            calFactor, protFactor, fatFactor, carbFactor, type } = opts;

    let dmi = _round1(data.weight * dmiFactor);
    if (bmi) {
        if (bmi.status === 'Overweight') dmi = dmi * 0.85;
        else if (bmi.status === 'Underweight') dmi = dmi * 1.2;
    }

    const boost = data.health.includes('Pregnant') ? 1.2 : 1;

    return {
        type,
        dmi: _round1(dmi),
        greenFodder: _round1(dmi * greenPct * boost),
        hay: _round1(dmi * hayPct * boost),
        concentrate: _round1(dmi * concPct * boost),
        water: Math.round(dmi * waterFactor),
        meals,
        calories: Math.round(dmi * calFactor),
        protein: Math.round(dmi * protFactor),
        fat: Math.round(dmi * fatFactor),
        carbs: Math.round(dmi * carbFactor)
    };
}

function calculateCow(data, bmi) {
    return _calculateRuminant(data, bmi, {
        type: 'cow', dmiFactor: 0.03,
        greenPct: 0.65, hayPct: 0.25, concPct: 0.35,
        waterFactor: 40, meals: 3,
        calFactor: 2000, protFactor: 120, fatFactor: 30, carbFactor: 600
    });
}

function calculateGoat(data, bmi) {
    return _calculateRuminant(data, bmi, {
        type: 'goat', dmiFactor: 0.035,
        greenPct: 0.60, hayPct: 0.20, concPct: 0.30,
        waterFactor: 30, meals: 2,
        calFactor: 1800, protFactor: 110, fatFactor: 25, carbFactor: 550
    });
}

function calculateChicken(data, ageInYears, bmi) {
    let dailyFeed, proteinPct;
    if (ageInYears < 0.15) { dailyFeed = 40; proteinPct = 20; }
    else if (ageInYears < 0.4) { dailyFeed = 80; proteinPct = 18; }
    else { dailyFeed = 115; proteinPct = 17; }

    if (data.health.includes('Pregnant')) dailyFeed = Math.round(dailyFeed * 1.1);

    if (bmi) {
        if (bmi.status === 'Overweight') dailyFeed = Math.round(dailyFeed * 0.9);
        else if (bmi.status === 'Underweight') dailyFeed = Math.round(dailyFeed * 1.15);
    }

    return {
        type: 'chicken',
        dailyFeed,
        calories: dailyFeed * 3,
        protein: Math.round(dailyFeed * proteinPct / 100),
        fat: Math.round(dailyFeed * 0.05),
        carbs: Math.round(dailyFeed * 0.55),
        water: dailyFeed * 2,
        meals: 2
    };
}

function calculateNutrition(data, ageInYears, bmi) {
    const t = data.petType;
    if (t === 'Dog' || t === 'Cat') return calculateSmallAnimal(data, ageInYears, bmi);
    if (t === 'Cow') return calculateCow(data, bmi);
    if (t === 'Goat') return calculateGoat(data, bmi);
    if (t === 'Chicken') return calculateChicken(data, ageInYears, bmi);
    return null;
}

// ============================================
// GROQ API
// ============================================
async function callGroqForDiet(data, nutrition, ageInYears, bmi) {
    const petType = data.petType;
    const emoji = SPECIES_LIMITS[petType].emoji;
    const feedRules = SPECIES_FEED_RULES[petType] || '';

    const bmiContext = bmi
        ? `\nWEIGHT STATUS: ${bmi.status} (${data.weight}kg vs ideal ${bmi.idealMin}-${bmi.idealMax}kg)\n`
        : '';

    const prompt = `You are DailyVet Feed Advisor — a Bangladesh-licensed veterinary nutritionist.

TASK: Create a species-correct diet plan for a ${petType}.

=== ${petType.toUpperCase()} — STRICT FEEDING RULES ===
${feedRules}
=================================================

PET INFO:
- Type: ${petType} ${emoji}
- Age: ${data.age} ${data.ageUnit}
- Weight: ${data.weight} kg
- Gender: ${data.gender}
- Activity: ${data.activity}
- Health: ${data.health.join(', ') || 'None'}
- Goal: ${data.goal}
${bmiContext}
CALCULATED DAILY NUTRITION (USE THESE EXACT NUMBERS):
- Total Calories: ${nutrition.calories} kcal
- Protein: ${nutrition.protein} g
- Fat: ${nutrition.fat} g
- Water: ${nutrition.water} ml
- Meals per day: ${nutrition.meals}
${nutrition.greenFodder ? `- Green Fodder: ${nutrition.greenFodder} kg\n- Hay: ${nutrition.hay || 0} kg\n- Concentrate: ${nutrition.concentrate} kg` : ''}
${nutrition.dailyFeed ? `- Daily Feed: ${nutrition.dailyFeed} g/bird` : ''}

OUTPUT FORMAT — Return ONLY valid JSON (no markdown):

{
  "meals": [
    {
      "time": "Morning 7:00 AM",
      "icon": "🌅",
      "foods": ["correct food with quantity"],
      "calories": ${Math.round(nutrition.calories / nutrition.meals)}
    }
  ],
  "avoid": ["5-6 species-appropriate items to avoid"],
  "tips": ["5-6 practical tips for this species"],
  "emergencySigns": ["4-5 species-specific warning signs"]
}

CRITICAL RULES:
1. ONLY use foods from the ALLOWED list above for ${petType}.
2. NEVER mix other species' food.
3. Bangla descriptions with English food names.
4. Provide ${nutrition.meals} meals.
5. Response MUST be valid JSON only — no markdown.
6. For COW: KG for grass/hay, KG for concentrate.
7. For CHICKEN: GRAMS per bird.
8. Include mineral mixture and salt for farm animals.
9. Practical Bangladesh-available foods.

Return ONLY the JSON object.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are a species-specific veterinary nutritionist.
RULES:
- Cow/Goat are RUMINANTS: only grass, hay, bran, oil cake, mineral. NO meat, egg, ghee, human food.
- Chicken: only poultry feed, broken rice, maize, soybean meal, fish meal. NO meat/milk.
- Dog: omnivore — chicken, egg, rice, veg, curd.
- Cat: obligate carnivore — meat-based only.
- Always answer in valid JSON.`
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_completion_tokens: 2500,
                reasoning_effort: 'low',
                include_reasoning: false,
                stream: false
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!response.ok) {
            console.error('Groq error:', response.status);
            return null;
        }

        const result = await response.json();
        let content = result.choices?.[0]?.message?.content || '';
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(content);
        } catch (e) {
            console.error('JSON parse failed:', e.message);
            return null;
        }
    } catch (err) {
        clearTimeout(timeoutId);
        console.error('Groq call failed:', err.message);
        return null;
    }
}

// ============================================
// FETCH VETS
// ============================================
const VET_TYPE_MAP = { Dog: 'pet', Cat: 'pet', Cow: 'dairy', Goat: 'dairy', Chicken: 'poultry' };

async function fetchVetsForPet(petType) {
    try {
        const db = _db();
        const vetType = VET_TYPE_MAP[petType] || 'general';

        const snap = await db.collection('vets')
            .where('available', '==', true)
            .where('type', '==', vetType)
            .limit(3)
            .get();

        if (!snap.empty) return snap.docs.map(d => d.data());

        const fb = await db.collection('vets')
            .where('available', '==', true)
            .where('type', '==', 'general')
            .limit(2)
            .get();

        return fb.docs.map(d => d.data());
    } catch (err) {
        console.warn('Vet fetch error:', err);
        return [];
    }
}

// ============================================
// FALLBACK DATA (single source)
// ============================================
const FALLBACK_DATA = {
    Cow: {
        avoid: ['মানুষের খাবার (মাংস, ডিম, ঘি, ভাত)', 'বাসি বা ফাঙ্গাসযুক্ত খড়/সাইলেজ', 'অতিরিক্ত দানাদার (অ্যাসিডোসিস)', 'অতিরিক্ত লবণ', 'ঠান্ডা বাসি পানি'],
        tips: ['খড় ও কাঁচা ঘাস কেটে ছোট করে খাওয়ান', 'নতুন খাদ্য ৭-১০ দিনে ধীরে পরিবর্তন করুন', 'প্রতিদিন ২-৩ বার ভাগ করে খাওয়ান', 'সবসময় পরিষ্কার তাজা পানি দিন (৮০-১০০ লিটার)', 'মাসিকভাবে ওজন মাপুন', 'নিয়মিত কৃমিনাশক ও টিকা দিন'],
        emergency: ['হঠাৎ খাবার বন্ধ', 'পেট ফুলে যাওয়া (Bloat)', 'জাবর না কাটা', 'দ্রুত ওজন কমা', 'দুর্বল হয়ে শোয়া']
    },
    Goat: {
        avoid: ['মানুষের খাবার (মাংস, ডিম, ঘি)', 'বাসি বা নোংরা ঘাস', 'অতিরিক্ত দানাদার', 'বিষাক্ত গাছের পাতা', 'অতিরিক্ত লবণ'],
        tips: ['গাছের পাতা ও কাঁচা ঘাসের মিশ্রণ দিন', 'খড় ছোট করে কেটে দিন', 'প্রতিদিন ২ বার খাওয়ান', 'পরিষ্কার তাজা পানি সবসময়', 'মাসিকভাবে ওজন মাপুন', 'বছরে ২ বার কৃমিনাশক'],
        emergency: ['খাবার না খাওয়া', 'পেট ফোলা', 'হাঁটা সমস্যা', 'শ্বাসকষ্ট', 'দুর্বলতা']
    },
    Chicken: {
        avoid: ['মানুষের রান্না করা খাবার', 'মাংস ও দুধ', 'চকলেট, পেঁয়াজ, রসুন', 'বাসি বা ফাঙ্গাসযুক্ত ফিড', 'অতিরিক্ত লবণ'],
        tips: ['নিয়মিত ফিড শিডিউল মেনে চলুন', 'সবসময় পরিষ্কার পানি দিন', 'পোল্ট্রি ফিডে ভিটামিন-মিনারেল মিশ্রণ', 'নিয়মিত কৃমিনাশক ও টিকা', 'খাঁচা পরিষ্কার রাখুন', 'তাপমাত্রা নিয়ন্ত্রণ করুন'],
        emergency: ['হঠাৎ মৃত্যু', 'শ্বাসকষ্ট', 'ডিম কমে যাওয়া', 'পাতলা পায়খানা', 'দুর্বল হয়ে বসে থাকা']
    },
    Dog: {
        avoid: ['চকলেট, কোকো', 'পেঁয়াজ, রসুন', 'আঙুর, কিশমিশ', 'অ্যাভোকাডো, অ্যালকোহল', 'ক্যাফেইন, ম্যাকাডামিয়া'],
        tips: ['সবসময় পরিষ্কার তাজা পানি দিন', 'নতুন খাদ্য ধীরে পরিবর্তন করুন', 'প্রতিদিন ২-৩ বার ভাগ করে খাওয়ান', 'ব্যায়ামের সাথে খাদ্য মিলিয়ে দিন', 'প্রতি ৩ মাসে ভেট চেকআপ', 'ওজন নিয়মিত মাপুন'],
        emergency: ['২৪ ঘণ্টা খাবার না খাওয়া', 'রক্তমিশ্রিত পায়খানা', 'শ্বাসকষ্ট', 'খিঁচুনি', 'অচেতন হয়ে পড়া']
    },
    Cat: {
        avoid: ['চকলেট, পেঁয়াজ, রসুন', 'আঙুর, কিশমিশ', 'গরুর দুধ (ল্যাকটোজ)', 'কুকুরের খাবার', 'কাঁচা মাছ বেশি পরিমাণে'],
        tips: ['সবসময় তাজা পানি দিন', 'ওয়েট ফুড প্রাধান্য দিন', 'প্রতিদিন ২-৩ বার খাওয়ান', 'কাঁচা মাছ বেশি দেবেন না', 'প্রতি ৩ মাসে ভেট চেকআপ', 'লিটার বক্স পরিষ্কার রাখুন'],
        emergency: ['২৪ ঘণ্টা খাবার না খাওয়া', 'শ্বাসকষ্ট', 'প্রস্রাব বন্ধ', 'খিঁচুনি', 'দুর্বল হয়ে শোয়া']
    }
};

const getFallbackAvoid = t => FALLBACK_DATA[t]?.avoid || [];
const getFallbackTips = t => FALLBACK_DATA[t]?.tips || [];
const getFallbackEmergency = t => FALLBACK_DATA[t]?.emergency || [];

// ============================================
// FALLBACK MEALS
// ============================================
function generateFallbackMeals(data, nutrition) {
    const type = data.petType;

    if (type === 'Cow') {
        const g = _round1(nutrition.greenFodder / 3);
        const h = _round1(nutrition.hay / 3);
        const c = _round1(nutrition.concentrate / 3);
        const w = Math.round(nutrition.water / 3);
        return [
            { time: 'সকাল ৭:০০', icon: '🌅', foods: [`সবুজ কাঁচা ঘাস ${g} কেজি`, `খড় ${h} কেজি`, `দানাদার (ভুসি+খৈল) ${c} কেজি`, 'খনিজ মিশ্রণ ২৫ গ্রাম', `তাজা পানি ${w} লিটার`], calories: null },
            { time: 'দুপুর ১:০০', icon: '☀️', foods: [`সবুজ কাঁচা ঘাস ${g} কেজি`, `খড় ${h} কেজি`, `তাজা পানি ${w} লিটার`], calories: null },
            { time: 'বিকাল ৬:০০', icon: '🌆', foods: [`সবুজ কাঁচা ঘাস ${g} কেজি`, `খড় ${h} কেজি`, `দানাদার (ভুসি+খৈল) ${c} কেজি`, 'লবণ ২৫ গ্রাম', `তাজা পানি ${w} লিটার`], calories: null }
        ];
    }

    if (type === 'Goat') {
        const g = _round1(nutrition.greenFodder / 2);
        const h = _round1((nutrition.hay || 0.5) / 2);
        const c = _round1(nutrition.concentrate / 2);
        return [
            { time: 'সকাল ৭:০০', icon: '🌅', foods: [`সবুজ কাঁচা ঘাস ${g} কেজি`, 'গাছের পাতা (নিম, আম, কাঁঠাল)', `খড় ${h} কেজি`, `দানাদার (ভুসি+খৈল) ${c} কেজি`, 'খনিজ মিশ্রণ ১৫ গ্রাম', 'তাজা পানি'], calories: null },
            { time: 'বিকাল ৬:০০', icon: '🌆', foods: [`সবুজ কাঁচা ঘাস ${g} কেজি`, `খড় ${h} কেজি`, `দানাদার (ভুসি+খৈল) ${c} কেজি`, 'লবণ ১০ গ্রাম', 'তাজা পানি'], calories: null }
        ];
    }

    if (type === 'Chicken') {
        const f = Math.round(nutrition.dailyFeed / 2);
        return [
            { time: 'সকাল ৭:০০', icon: '🌅', foods: [`পোল্ট্রি ফিড ${f} গ্রাম/পাখি`, 'ভিটামিন-মিনারেল প্রিমিক্স', 'তাজা পানি'], calories: null },
            { time: 'বিকাল ৫:০০', icon: '🌆', foods: [`পোল্ট্রি ফিড ${f} গ্রাম/পাখি`, 'চুনাপাথর (লেয়ার হলে)', 'তাজা পানি'], calories: null }
        ];
    }

    if (type === 'Dog') {
        const cups = _round1(nutrition.calories / 350 / 2);
        const cal = Math.round(nutrition.calories / 2);
        return [
            { time: 'সকাল ৭:০০', icon: '🌅', foods: [`ড্রাই কিবল ${cups} কাপ`, '১টি সিদ্ধ ডিম', 'তাজা পানি'], calories: cal },
            { time: 'বিকাল ৭:০০', icon: '🌆', foods: [`ড্রাই কিবল ${cups} কাপ`, 'সিদ্ধ মুরগি (হাড় ছাড়া)', 'মিশ্র সবজি (গাজর, বিনস)', 'তাজা পানি'], calories: cal }
        ];
    }

    if (type === 'Cat') {
        const cal = Math.round(nutrition.calories / 2);
        return [
            { time: 'সকাল ৭:০০', icon: '🌅', foods: ['ওয়েট ফুড ১/২ ক্যান', 'ড্রাই কিবল ১/৪ কাপ', 'তাজা পানি'], calories: cal },
            { time: 'বিকাল ৭:০০', icon: '🌆', foods: ['ওয়েট ফুড ১/২ ক্যান', 'সিদ্ধ মুরগি/মাছ (হাড় ছাড়া)', 'তাজা পানি'], calories: cal }
        ];
    }

    return [];
}

// ============================================
// BUILD RESULT HTML
// ============================================
function _nutritionItem(label, value, unit) {
    return `<div class="nutrition-item"><span class="label">${label}</span><span class="value">${value}<small>${unit}</small></span></div>`;
}

function _buildVetRows(vets) {
    return vets.map(v => {
        const cleanPhone = (v.phone || '').replace(/\D/g, '');
        const waPhone = cleanPhone.startsWith('880') ? cleanPhone : '88' + cleanPhone;
        const waMsg = encodeURIComponent(
            'আসসালামু আলাইকুম, আমি DailyVet Feed Advisor থেকে বলছি। আমার পশুর ডায়েট নিয়ে পরামর্শ দরকার।'
        );
        const waURL = `https://wa.me/${waPhone}?text=${waMsg}`;

        return `
            <div class="vet-item">
                <div class="vet-info">
                    <div class="vet-name">${v.name}</div>
                    <div class="vet-spec">${v.speciality} · ${v.location}</div>
                </div>
                <div class="vet-actions">
                    <a href="tel:${v.phone}" class="vet-action-btn call" title="Call">
                        <i class="fas fa-phone"></i>
                    </a>
                    <a href="${waURL}" target="_blank" rel="noopener" class="vet-action-btn chat" title="Chat on WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>`;
    }).join('');
}

function buildResultHTML(data, nutrition, aiData, warnings, vets, bmi) {
    const emoji = SPECIES_LIMITS[data.petType].emoji;
    const ageDisplay = data.ageUnit === 'months' ? `${data.age} months` : `${data.age} years`;

    let filteredData = aiData ? filterSpeciesAppropriate(aiData, data.petType) : null;
    if (!filteredData || !filteredData.meals || filteredData.meals.length === 0) {
        console.log('⚠️ Using species-correct fallback meals');
        filteredData = {
            meals: generateFallbackMeals(data, nutrition),
            avoid: getFallbackAvoid(data.petType),
            tips: getFallbackTips(data.petType),
            emergencySigns: getFallbackEmergency(data.petType)
        };
    }

    const { meals, avoid, tips, emergencySigns: emergency } = filteredData;
    const parts = [];

    /* Warnings */
    if (warnings && warnings.length > 0) {
        parts.push(`
            <div class="result-warnings">
                ${warnings.map(w => `
                    <div class="warning-item">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${w}</span>
                    </div>
                `).join('')}
            </div>`);
    }

    /* Pet info */
    parts.push(`
        <div class="pet-info-card">
            <div class="pet-info-header">
                <div class="pet-info-emoji">${emoji}</div>
                <div class="pet-info-text">
                    <h4>${data.petType} Diet Plan</h4>
                    <p>${ageDisplay} · ${data.weight} kg · ${data.gender}</p>
                </div>
            </div>
            <div class="pet-info-details">
                <div class="info-detail"><i class="fas fa-running"></i><span>Activity: <strong>${data.activity}</strong></span></div>
                <div class="info-detail"><i class="fas fa-bullseye"></i><span>Goal: <strong>${data.goal}</strong></span></div>
                ${data.health.length > 0 ? `
                    <div class="info-detail" style="grid-column:1/-1;">
                        <i class="fas fa-heart-pulse"></i>
                        <span>Health: <strong>${data.health.join(', ')}</strong></span>
                    </div>` : ''}
            </div>
        </div>`);

    /* BMI card */
    if (bmi) {
        const barPercent = Math.min(100, Math.max(0, 50 + (bmi.ratio - 1) * 40));
        parts.push(`
            <div class="bmi-card" style="border-left-color: ${bmi.color};">
                <div class="bmi-header">
                    <div class="bmi-icon" style="background: ${bmi.color};">
                        <i class="fas fa-weight-scale"></i>
                    </div>
                    <div class="bmi-title">
                        <h4>Weight Check</h4>
                        <p>Age-based ideal weight</p>
                    </div>
                    <div class="bmi-status" style="color: ${bmi.color};">${bmi.status}</div>
                </div>
                <div class="bmi-comparison">
                    <div class="bmi-item">
                        <span class="bmi-label">Your pet</span>
                        <span class="bmi-value">${data.weight} kg</span>
                    </div>
                    <div class="bmi-arrow"><i class="fas fa-arrow-right"></i></div>
                    <div class="bmi-item">
                        <span class="bmi-label">Ideal range</span>
                        <span class="bmi-value">${bmi.idealMin}–${bmi.idealMax} kg</span>
                    </div>
                </div>
                <div class="bmi-bar-wrap">
                    <div class="bmi-bar">
                        <div class="bmi-bar-fill" style="left: ${barPercent}%;"></div>
                    </div>
                    <div class="bmi-bar-labels">
                        <span>Low</span><span>Ideal</span><span>High</span>
                    </div>
                </div>
                <div class="bmi-advice">
                    <i class="fas fa-info-circle"></i>
                    <span>${bmi.advice}</span>
                </div>
            </div>`);
    }

    /* Nutrition summary */
    parts.push(`
        <div class="nutrition-summary">
            <div class="nutrition-title">📊 Daily Requirements</div>
            <div class="nutrition-grid">
                ${_nutritionItem('🔥 Energy', nutrition.calories, 'kcal')}
                ${_nutritionItem('🥩 Protein', nutrition.protein, 'g')}
                ${_nutritionItem('🧈 Fat', nutrition.fat, 'g')}
                ${_nutritionItem('💧 Water', nutrition.water, 'ml')}
                ${nutrition.greenFodder ? `
                    ${_nutritionItem('🌿 Green Grass', nutrition.greenFodder, 'kg')}
                    ${_nutritionItem('🌾 Hay', nutrition.hay || 0, 'kg')}
                    ${_nutritionItem('🥜 Concentrate', nutrition.concentrate, 'kg')}
                ` : ''}
                ${nutrition.dailyFeed ? _nutritionItem('🌾 Feed', nutrition.dailyFeed, 'g/bird') : ''}
            </div>
        </div>`);

    /* Meals */
    parts.push(`
        <div class="meal-schedule">
            <div class="section-label"><i class="fas fa-utensils"></i><span>Meal Schedule</span></div>
            ${meals.map(m => `
                <div class="meal-item">
                    <div class="meal-time">
                        <span class="time-icon">${m.icon || '🍽️'}</span>
                        <span class="time-label">${m.time}</span>
                    </div>
                    <div class="meal-content">
                        <ul>${m.foods.map(f => `<li>${f}</li>`).join('')}</ul>
                        ${m.calories ? `<span class="meal-calories">~${m.calories} kcal</span>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>`);

    /* Avoid */
    parts.push(`
        <div class="warnings-box">
            <div class="section-label"><i class="fas fa-ban"></i><span>Foods to Avoid</span></div>
            <ul class="warnings-list">${avoid.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>`);

    /* Tips */
    parts.push(`
        <div class="tips-box">
            <div class="section-label"><i class="fas fa-lightbulb"></i><span>Care Tips</span></div>
            <ul class="tips-list">${tips.map(t => `<li>${t}</li>`).join('')}</ul>
        </div>`);

    /* Emergency */
    if (emergency && emergency.length > 0) {
        parts.push(`
            <div class="emergency-box">
                <div class="section-label"><i class="fas fa-ambulance"></i><span>Emergency Signs</span></div>
                <ul class="emergency-list">${emergency.map(e => `<li>${e}</li>`).join('')}</ul>
            </div>`);
    }

    /* Vets */
    if (vets && vets.length > 0) {
        parts.push(`
            <div class="vet-suggestion-box">
                <div class="section-label">
                    <i class="fas fa-user-md"></i>
                    <span>Recommended Vets</span>
                </div>
                ${_buildVetRows(vets)}
                <div class="vet-helpline">
                    <i class="fas fa-headset"></i>
                    24/7 Helpline: <strong>16358</strong>
                </div>
            </div>`);
    }

    /* Disclaimer */
    parts.push(`
        <div class="disclaimer-box">
            <i class="fas fa-shield-halved"></i>
            এটি প্রাথমিক পরামর্শ। চূড়ান্ত ডায়েটের জন্য ভেটেরিনারিয়ান দেখান।
        </div>`);

    return parts.join('');
}

// ============================================
// FORM SUBMIT
// ============================================
async function handleFormSubmit(event) {
    event.preventDefault();
    if (isProcessing) return;

    const data = {
        petType: _el('petType').value,
        age: parseFloat(_el('petAge').value),
        ageUnit: _el('ageUnit').value,
        weight: parseFloat(_el('petWeight').value),
        gender: _checkedValue('gender'),
        activity: _checkedValue('activity'),
        health: _checkedValues('health'),
        goal: _checkedValue('goal')
    };

    const ageInYears = data.ageUnit === 'months' ? data.age / 12 : data.age;
    const bmi = calculateBMI(data.petType, ageInYears, data.weight);
    const autoTags = autoDetectHealthConditions(data, ageInYears, bmi);
    data.health = [...new Set([...data.health, ...autoTags])];

    console.log('📋 Final health:', data.health);

    const validation = validateInput(data);
    if (!validation.valid) {
        alert('❌ ' + validation.errors.join('\n\n'));
        return;
    }
    if (validation.warnings.length > 0) {
        if (!confirm('⚠️ ' + validation.warnings.join('\n\n') + '\n\nContinue?')) return;
    }

    isProcessing = true;
    const btn = _el('submitBtn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Analyzing...</span>';

    try {
        const nutrition = calculateNutrition(data, ageInYears, bmi);
        console.log('🍽️ Nutrition:', nutrition);

        let aiData = null;
        try { aiData = await callGroqForDiet(data, nutrition, ageInYears, bmi); } catch (e) {}

        const vets = await fetchVetsForPet(data.petType);
        lastResultData = { data, nutrition, aiData, warnings: validation.warnings, vets, bmi };

        showReadyMessage(data, bmi);
        saveToHistory(data, nutrition, bmi);

    } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
    } finally {
        isProcessing = false;
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}

// ============================================
// READY MESSAGE
// ============================================
function showReadyMessage(data, bmi) {
    const resultSection = _el('resultSection');
    const emoji = SPECIES_LIMITS[data.petType].emoji;

    const bmiBadge = bmi ? `
        <div class="bmi-mini-badge" style="background: ${bmi.color}20; color: ${bmi.color}; border-color: ${bmi.color}40;">
            <i class="fas fa-weight-scale"></i>
            <span>${bmi.status}</span>
        </div>
    ` : '';

    resultSection.style.display = 'flex';
    resultSection.innerHTML = `
        <div class="ready-message">
            <div class="ready-icon">
                <i class="fas fa-check-circle"></i>
            </div>
            <h3>Your Result is Ready!</h3>
            <p>
                <strong>${emoji} ${data.petType}</strong> · 
                ${data.age} ${data.ageUnit} · 
                ${data.weight} kg
            </p>
            ${bmiBadge}
            <button class="view-result-btn" onclick="openResultModal()">
                <i class="fas fa-eye"></i>
                <span>See Result</span>
            </button>
        </div>
    `;

    setTimeout(() => {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
}

// ============================================
// MODAL
// ============================================
function openResultModal() {
    if (!lastResultData) return;
    const { data, nutrition, aiData, warnings, vets, bmi } = lastResultData;

    let modal = _el('resultModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'resultModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-top">
                    <h3><i class="fas fa-clipboard-check"></i> Diet Plan</h3>
                    <button class="modal-close-btn" onclick="closeResultModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="modalBody"></div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeResultModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeResultModal();
        });
    }

    _el('modalBody').innerHTML = buildResultHTML(data, nutrition, aiData, warnings, vets, bmi);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeResultModal() {
    const modal = _el('resultModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

// ============================================
// HISTORY
// ============================================
async function saveToHistory(data, nutrition, bmi) {
    if (!userPhone) return;
    try {
        await _db().collection('feed_plans').add({
            userPhone,
            petType: data.petType,
            age: data.age, ageUnit: data.ageUnit,
            weight: data.weight,
            gender: data.gender,
            activity: data.activity,
            goal: data.goal,
            health: data.health,
            nutrition,
            bmi: bmi ? { status: bmi.status, percent: bmi.percent } : null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn('History save failed:', err.message);
    }
}

// ============================================
// RESET
// ============================================
function resetForm() {
    _el('resultSection').style.display = 'none';
    _el('advisorForm').reset();
    lastResultData = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    console.log('🍽️ Feed Advisor loaded (with Chat button)');

    userPhone = sessionStorage.getItem('userPhone');
    if (!userPhone) { window.location.href = 'login.html'; return; }

    const form = _el('advisorForm');
    if (form) form.addEventListener('submit', handleFormSubmit);

    ['petWeight', 'petAge'].forEach(id => {
        const el = _el(id);
        if (el) el.addEventListener('input', e => {
            e.target.value = e.target.value.replace(/[^0-9.]/g, '');
        });
    });
});

window.resetForm = resetForm;
window.openResultModal = openResultModal;
window.closeResultModal = closeResultModal;