// ============================================
// DAILYVET PHARMA — Medicine Search + AI Fallback
// Local search first, then Gemini/Groq if no result
// Brand pills are clickable → Google search (new tab)
// ============================================

let allDiseases = [];
let isLoaded = false;
let isSearching = false;

const PREFERRED_LANG = 'en';

const _el = id => document.getElementById(id);
const _sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================
// 🔑 AI API CONFIG
// ============================================
const GEMINI_API_KEY = 'AQ.Ab8RN6IUiLUm5b319960n0yL7uH29JmthCXB-OVQg84uBIXfDQ';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT_MS = 30000;

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_TIMEOUT_MS = 25000;

// ============================================
// 🛠️ Helpers
// ============================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

const ANIMAL_EMOJI_MAP = [
    [['cow', 'cattle'], '🐄'],
    [['buffalo'], '🐃'],
    [['goat'], '🐐'],
    [['sheep'], '🐑'],
    [['dog'], '🐕'],
    [['cat'], '🐈'],
    [['chicken', 'poultry'], '🐔'],
    [['duck'], '🦆'],
    [['pigeon'], '🕊️'],
    [['horse'], '🐎'],
    [['rabbit'], '🐇'],
    [['turtle', 'reptile'], '🐢']
];

function getAnimalEmoji(animal) {
    if (!animal) return '💊';
    const a = String(animal).toLowerCase();
    for (const [keys, emoji] of ANIMAL_EMOJI_MAP) {
        if (keys.some(k => a.includes(k))) return emoji;
    }
    return '💊';
}

// ============================================
// 📥 Preload diseases
// ============================================
async function preloadDiseases() {
    try {
        console.log('📥 Loading diseases from Firestore...');
        if (typeof firebase !== 'undefined' && firebase.firestore) {
            const snap = await firebase.firestore().collection('diseases').get();
            if (!snap.empty) {
                allDiseases = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                isLoaded = true;
                console.log(`✅ Loaded ${allDiseases.length} diseases from Firestore`);
                return;
            }
        }
    } catch (err) {
        console.warn('Firestore load failed, falling back to local dataset:', err.message);
    }

    // Resilient Fallback to local diseases.json
    try {
        console.log('📥 Loading diseases from local diseases.json...');
        const resp = await fetch('diseases.json');
        if (resp.ok) {
            const data = await resp.json();
            if (data.diseases && Array.isArray(data.diseases)) {
                allDiseases = data.diseases;
                isLoaded = true;
                console.log(`✅ Loaded ${allDiseases.length} diseases from local diseases.json`);
                return;
            }
        }
    } catch (e) {
        console.error('❌ Failed to load local diseases.json:', e);
    }
}

// ============================================
// 🔍 Main Search
// ============================================
async function searchMedicine() {
    if (isSearching) return;

    const input = _el('diseaseSearchInput');
    const query = (input?.value || '').trim();

    if (!query) {
        alert('Please enter a disease name');
        input?.focus();
        return;
    }

    if (!isLoaded) await preloadDiseases();

    isSearching = true;

    const searchBtn = _el('searchBtn');
    const originalHTML = searchBtn?.innerHTML || '';
    if (searchBtn) {
        searchBtn.disabled = true;
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Searching...</span>';
    }

    const resultArea = _el('resultArea');
    const emptyState = _el('emptyState');
    const quickChips = _el('quickChips');

    if (emptyState) emptyState.style.display = 'none';
    if (quickChips) quickChips.style.display = 'none';
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Searching for "${escapeHtml(query)}"...</p>
            </div>`;
    }

    try {
        const matchedDiseases = findMatchingDiseases(query);

        if (matchedDiseases.length > 0) {
            console.log(`✅ Local search: ${matchedDiseases.length} results`);
            renderResults(matchedDiseases, query);
        } else {
            console.log('🤖 No local results → calling AI...');
            await aiFallbackSearch(query, resultArea);
        }
    } catch (err) {
        console.error('Search failed:', err);
        if (resultArea) {
            resultArea.innerHTML = `
                <div class="no-result">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>Search failed</h4>
                    <p>${escapeHtml(err.message)}</p>
                </div>`;
        }
    } finally {
        isSearching = false;
        if (searchBtn) {
            searchBtn.disabled = false;
            searchBtn.innerHTML = originalHTML;
        }
    }
}

// ============================================
// 🤖 AI FALLBACK — Gemini first, Groq fallback
// ============================================
async function aiFallbackSearch(query, resultArea) {
    if (resultArea) {
        resultArea.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>🔍 Not found locally. Asking DailyVet AI...</p>
            </div>`;
    }

    const prompt = buildPharmaPrompt(query);
    let aiReply = null;
    let usedAI = null;

    // Try Gemini
    try {
        console.log('🤖 Trying Gemini...');
        aiReply = await callGeminiForMedicine(prompt);
        if (aiReply) usedAI = 'gemini';
    } catch (err) {
        console.warn('Gemini failed:', err.message);
    }

    // Groq fallback
    if (!aiReply) {
        try {
            console.log('🤖 Trying Groq...');
            aiReply = await callGroqForMedicine(prompt);
            if (aiReply) usedAI = 'groq';
        } catch (err) {
            console.warn('Groq failed:', err.message);
        }
    }

    if (!aiReply) {
        if (resultArea) {
            resultArea.innerHTML = `
                <div class="no-result">
                    <i class="fas fa-search-minus"></i>
                    <h4>No results found for "${escapeHtml(query)}"</h4>
                    <p>
                        Try:
                        <br>• Correct spelling
                        <br>• Full English disease name
                        <br>• Shorter keywords (e.g. FMD, PPR, Parvo)
                        <br>• Animal + disease (e.g. cow lumpy, dog parvo)
                    </p>
                </div>`;
        }
        return;
    }

    renderAIResponse(query, aiReply, usedAI, resultArea);
}

// ============================================
// 📝 Build AI Prompt
// ============================================
function buildPharmaPrompt(query) {
    return `You are DailyVet Pharma AI — a veterinary medicine information assistant for Bangladesh.

USER QUERY: "${query}"

TASK:
Provide medicine information for this disease/condition/symptom in Bangladesh context.

OUTPUT FORMAT (strict — follow exactly):

DISEASE_NAME: <name in English>
DISEASE_NAME_BN: <name in Bangla>
ANIMAL: <Cow/Goat/Dog/Cat/Chicken/etc>
CATEGORY: <Viral/Bacterial/Parasitic/Fungal/etc>
DANGER: <Low/Medium/High/Critical>

MEDICINES:

MEDICINE_1:
  NAME: <generic name>
  PURPOSE: <English purpose>
  ROUTE: <IM/IV/Oral/SC/Topical>
  DOSAGE: <adult dosage>
  BRANDS: <comma-separated BD brands available>

MEDICINE_2:
  NAME: ...
  PURPOSE: ...
  ROUTE: ...
  DOSAGE: ...
  BRANDS: ...

MEDICINE_3:
  NAME: ...
  ...

RULES:
1. Only include vet-approved medicines available in Bangladesh
2. Only 3 medicines maximum
3. Brand names should be real BD brands (Renata, Square, ACI, ACME, Incepta, Techno, Popular, Eskayef, Elanco, Shinil)
4. If the query is unclear, provide the most likely disease info
5. No markdown, no extra explanation, only the format above
6. If you don't know, respond: "NOT_FOUND"`;
}

// ============================================
// 🤖 Gemini Call
// ============================================
async function callGeminiForMedicine(prompt) {
    const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 800,
                    topP: 0.95
                }
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn('Gemini status:', response.status);
            return null;
        }

        const data = await response.json();
        const text = (data.candidates?.[0]?.content?.parts || [])
            .filter(p => p && p.text && !p.thought)
            .map(p => p.text)
            .join('') || '';

        if (!text || text.includes('NOT_FOUND')) return null;
        return text.trim();
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('Gemini error:', err.message);
        return null;
    }
}

// ============================================
// 🤖 Groq Call
// ============================================
async function callGroqForMedicine(prompt) {
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
                        content: 'You are a veterinary medicine assistant for Bangladesh. Always follow the requested output format strictly.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                max_tokens: 800
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn('Groq status:', response.status);
            return null;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (!text || text.includes('NOT_FOUND')) return null;
        return text.trim();
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('Groq error:', err.message);
        return null;
    }
}

// ============================================
// 🎨 Parse AI Response
// ============================================
function parseAIResponse(text) {
    const result = {
        disease_name: '',
        disease_name_bn: '',
        animal: '',
        category: '',
        danger: '',
        medicines: []
    };

    const diseaseFields = {
        'DISEASE_NAME_BN:': 'disease_name_bn',
        'DISEASE_NAME:': 'disease_name',
        'ANIMAL:': 'animal',
        'CATEGORY:': 'category',
        'DANGER:': 'danger'
    };
    const medFields = {
        'NAME:': 'name',
        'PURPOSE:': 'purpose',
        'ROUTE:': 'route',
        'DOSAGE:': 'dosage',
        'BRANDS:': 'brands'
    };

    let currentMed = null;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    lines.forEach(line => {
        if (line === 'MEDICINES:' || line === '---') return;

        for (const [prefix, key] of Object.entries(diseaseFields)) {
            if (line.startsWith(prefix)) {
                result[key] = line.replace(prefix, '').trim();
                return;
            }
        }

        if (line.startsWith('MEDICINE_')) {
            if (currentMed && currentMed.name) result.medicines.push(currentMed);
            currentMed = { name: '', purpose: '', route: '', dosage: '', brands: '' };
            return;
        }

        if (!currentMed) return;

        for (const [prefix, key] of Object.entries(medFields)) {
            if (line.startsWith(prefix)) {
                currentMed[key] = line.replace(prefix, '').trim();
                return;
            }
        }
    });

    if (currentMed && currentMed.name) result.medicines.push(currentMed);
    return result;
}

// ============================================
// 🎨 Render AI Response
// ============================================
function renderAIResponse(query, aiText, usedAI, resultArea) {
    if (!resultArea) return;

    const parsed = parseAIResponse(aiText);
    const providerName = usedAI === 'gemini' ? 'Gemini 2.5 Flash' : 'Groq Llama 3';

    // Parsing failed → show raw
    if (!parsed.disease_name && parsed.medicines.length === 0) {
        resultArea.innerHTML = `
            <div class="result-count">
                <i class="fas fa-robot text-purple-600"></i>
                <span>AI Clinical Formulary for "<strong>${escapeHtml(query)}</strong>"</span>
            </div>
            <div class="medicine-card" style="border-left-color: #7d3c98;">
                <div class="med-header">
                    <div class="med-name-wrapper">
                        <div class="med-icon-box" style="background:#f3e8ff;color:#7d3c98;border-color:#e9d5ff;">
                            <i class="fas fa-robot"></i>
                        </div>
                        <div>
                            <h3 class="med-name" style="color:#5b2c6f;">DailyVet AI Synthesis</h3>
                            <span class="med-type-label" style="color:#7d3c98;">Clinical Intelligence</span>
                        </div>
                    </div>
                </div>
                <div class="med-purpose-box" style="border-left-color:#7d3c98;background:#faf5ff;border-color:#f3e8ff;">
                    <i class="fas fa-circle-info" style="color:#7d3c98;"></i>
                    <p class="med-purpose" style="white-space:pre-wrap;line-height:1.6;">${escapeHtml(aiText)}</p>
                </div>
                <div class="vet-badge">
                    <i class="fas fa-user-doctor"></i>
                    <span>AI generated clinical guidance — verify with a registered veterinarian before administration</span>
                </div>
            </div>`;
        return;
    }

    const animalEmoji = getAnimalEmoji(parsed.animal);
    const parts = [];

    parts.push(`<div class="result-count">
        <i class="fas fa-robot text-purple-600"></i>
        <span>AI Formulary Synthesis for "<strong>${escapeHtml(query)}</strong>"</span>
    </div>`);

    parts.push(`
        <div class="disease-header-card" style="background: linear-gradient(135deg, #6b21a8 0%, #4c1d95 60%, #3b0764 100%); border-color: rgba(216, 180, 254, 0.3);">
            <div class="disease-top-badges">
                ${parsed.animal ? `<span class="badge species-badge">${animalEmoji} ${escapeHtml(parsed.animal)}</span>` : ''}
                ${parsed.category ? `<span class="badge category-badge"><i class="fas fa-microscope"></i> ${escapeHtml(parsed.category)}</span>` : ''}
                ${parsed.danger ? `<span class="badge danger-badge ${escapeHtml(parsed.danger.toLowerCase())}"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(parsed.danger)} Severity</span>` : ''}
                <span class="badge" style="background:rgba(255,255,255,0.2);"><i class="fas fa-wand-magic-sparkles text-amber-300"></i> AI Verified</span>
            </div>
            <h2>${escapeHtml(parsed.disease_name || query)}</h2>
            ${parsed.disease_name_bn ? `
                <div class="disease-subtitles">
                    <span><i class="fas fa-language"></i> ${escapeHtml(parsed.disease_name_bn)}</span>
                </div>
            ` : ''}
        </div>`);

    parsed.medicines.forEach(med => {
        const brandList = med.brands
            ? med.brands.split(/[,;]/).map(b => b.trim()).filter(Boolean)
            : [];

        const infoItems = [
            med.route ? { label: 'Route', value: med.route, icon: 'fa-syringe' } : null,
            med.dosage ? { label: 'Adult Dose', value: med.dosage, icon: 'fa-scale-balanced' } : null
        ].filter(Boolean);

        parts.push(`
            <div class="medicine-card" style="border-left-color: #7d3c98;">
                <div class="med-header">
                    <div class="med-name-wrapper">
                        <div class="med-icon-box" style="background:#f3e8ff;color:#7d3c98;border-color:#e9d5ff;">
                            <i class="fas fa-pills"></i>
                        </div>
                        <div>
                            <h3 class="med-name" style="color:#5b2c6f;">${escapeHtml(med.name)}</h3>
                            <span class="med-type-label" style="color:#7d3c98;">Recommended Formulation</span>
                        </div>
                    </div>
                </div>

                ${med.purpose ? `
                    <div class="med-purpose-box" style="border-left-color:#7d3c98;background:#faf5ff;border-color:#f3e8ff;">
                        <i class="fas fa-circle-info" style="color:#7d3c98;"></i>
                        <p class="med-purpose">${escapeHtml(med.purpose)}</p>
                    </div>
                ` : ''}

                ${infoItems.length > 0 ? `
                    <div class="med-info-grid">
                        ${infoItems.map(it => `
                            <div class="med-info-item">
                                <span class="label" style="color:#7d3c98;"><i class="fas ${escapeHtml(it.icon)}"></i> ${escapeHtml(it.label)}</span>
                                <span class="value">${escapeHtml(it.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${brandList.length > 0 ? `
                    <div class="brand-section">
                        <div class="brand-title">
                            <span><i class="fas fa-certificate text-purple-600"></i> Bangladesh Market Brands</span>
                            <span class="brand-count-badge" style="background:#f3e8ff;color:#6b21a8;border-color:#e9d5ff;">${brandList.length} Available</span>
                        </div>
                        <div class="brand-list">
                            ${brandList.map(b => brandPillHtml(b)).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="vet-badge">
                    <i class="fas fa-user-doctor"></i>
                    <span>Administer strictly under registered veterinarian oversight (DVM / DLS)</span>
                </div>
            </div>`);
    });

    parts.push(`
        <div style="
            display:flex;align-items:center;gap:12px;
            background:linear-gradient(to right, #f5f3ff, #faf5ff);border:1.5px solid #d8b4fe;
            color:#5b2c6f;border-radius:18px;padding:14px 18px;
            font-size:12.5px;font-weight:600;line-height:1.5;box-shadow:0 2px 8px rgba(107,33,168,0.06);">
            <div style="width:34px;height:34px;border-radius:10px;background:#e9d5ff;color:#6b21a8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fas fa-robot text-base"></i>
            </div>
            <span>
                This response was synthesized in real time via <strong>${providerName}</strong> because it was not in the local offline database. Always verify dosages with a certified DVM.
            </span>
        </div>`);

    resultArea.innerHTML = parts.join('');
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// 🎯 Find matching diseases — LOCAL SEARCH
// ============================================
const WORD_SYNONYMS = {
    'mites': 'mite', 'ticks': 'tick', 'worms': 'worm',
    'fleas': 'flea', 'cattle': 'cow', 'puppy': 'dog',
    'puppies': 'dog', 'kitten': 'cat', 'kittens': 'cat',
    'chicks': 'chicken', 'poultry': 'chicken',
    'itchy': 'itch', 'itching': 'itch',
    'vomiting': 'vomit', 'swelling': 'swollen'
};

function findMatchingDiseases(query) {
    const rawQuery = query.toLowerCase().trim();
    if (!rawQuery) return [];

    const words = rawQuery.split(/\s+/).map(w => w.trim()).filter(w => w.length >= 2);
    if (!words.length) return [];

    const scored = [];

    allDiseases.forEach(disease => {
        let totalScore = 0;
        let matchedWords = 0;

        const haystackParts = [
            disease.disease_name_en || '',
            disease.disease_name_bn || '',
            disease.disease_name_local || '',
            disease.slug || '',
            disease.animal_type || '',
            disease.disease_category || '',
            ...(disease.tags || []),
            ...(disease.symptoms?.en || []),
            ...(disease.symptoms?.bn || []),
            ...(disease.treatment || []).map(t => t.generic_name || ''),
            ...(disease.treatment || []).map(t => t.purpose_en || ''),
            ...(disease.treatment || []).map(t => t.purpose || ''),
            ...(disease.treatment || []).flatMap(t => t.market_brands_bd || [])
        ].map(s => String(s).toLowerCase());

        const haystack = haystackParts.join(' | ');

        const primaryFields = [
            disease.disease_name_en || '',
            disease.disease_name_bn || '',
            disease.disease_name_local || '',
            disease.animal_type || '',
            disease.slug || ''
        ].map(s => String(s).toLowerCase()).join(' | ');

        const nameParts = (disease.disease_name_en || '').toLowerCase().split(/[\s()/,]+/);

        words.forEach(word => {
            let wordScore = 0;
            let wordMatched = false;

            const variants = [
                word,
                WORD_SYNONYMS[word],
                word.endsWith('s') ? word.slice(0, -1) : word + 's'
            ].filter(Boolean);

            variants.forEach(variant => {
                if (primaryFields.includes(variant)) {
                    wordScore += 50;
                    wordMatched = true;
                    if (nameParts.includes(variant)) wordScore += 20;
                } else if (haystack.includes(variant)) {
                    wordScore += 10;
                    wordMatched = true;
                }
            });

            if (wordMatched) {
                matchedWords++;
                totalScore += wordScore;
            }
        });

        const requiredMatches = Math.ceil(words.length / 2);

        if (matchedWords >= requiredMatches && totalScore > 0) {
            if (matchedWords === words.length) totalScore += 30;
            totalScore += matchedWords * 5;
            scored.push({ disease, score: totalScore });
        }
    });

    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.disease);
}

// ============================================
// 🎨 Render local results
// ============================================
function renderResults(diseases, query) {
    const resultArea = _el('resultArea');
    if (!resultArea) return;

    const html = `<div class="result-count">
        <i class="fas fa-check-circle text-teal"></i>
        <span>Found ${diseases.length} clinical condition${diseases.length !== 1 ? 's' : ''} matching "<strong>${escapeHtml(query)}</strong>"</span>
    </div>` + diseases.map(renderDiseaseCard).join('');

    resultArea.innerHTML = html;
    resultArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================
// 🃏 Render single disease card
// ============================================
function renderDiseaseCard(disease) {
    const nameEn = disease.disease_name_en || '';
    const nameBn = disease.disease_name_bn || '';
    const nameLocal = disease.disease_name_local || '';
    const animal = disease.animal_type || '';
    const category = disease.disease_category || '';
    const danger = disease.danger_level?.level || (typeof disease.danger_level === 'string' ? disease.danger_level : '');

    const animalEmoji = getAnimalEmoji(animal);
    const treatments = disease.treatment || [];

    let html = `
        <div class="disease-header-card">
            <div class="disease-top-badges">
                ${animal ? `<span class="badge species-badge">${animalEmoji} ${escapeHtml(animal)}</span>` : ''}
                ${category ? `<span class="badge category-badge"><i class="fas fa-microscope"></i> ${escapeHtml(category)}</span>` : ''}
                ${danger ? `<span class="badge danger-badge ${escapeHtml(danger.toLowerCase())}"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(danger)} Severity</span>` : ''}
            </div>
            <h2>${escapeHtml(nameEn || nameBn)}</h2>
            <div class="disease-subtitles">
                ${nameBn && nameBn !== nameEn ? `<span class="name-bn"><i class="fas fa-language"></i> ${escapeHtml(nameBn)}</span>` : ''}
                ${nameLocal && nameLocal !== nameEn && nameLocal !== nameBn ? `<span class="name-local"><i class="fas fa-tag"></i> ${escapeHtml(nameLocal)}</span>` : ''}
            </div>
        </div>`;

    if (treatments.length === 0) {
        html += `
            <div class="no-result">
                <i class="fas fa-circle-info"></i>
                <h4>No specific medicine protocol recorded</h4>
                <p>Consult a registered veterinarian for clinical diagnostic and treatment options.</p>
            </div>`;
        return html;
    }

    treatments.forEach(tr => {
        const genericName = tr.generic_name || 'Unknown';
        const purpose = pickPurpose(tr);
        const route = tr.route || '';
        const form = tr.medicine_form || '';
        const dose = tr.dosage_adult || '';
        const frequency = tr.frequency || '';
        const duration = tr.duration || '';
        const brands = tr.market_brands_bd || [];
        const verify = tr.verify_with_vet !== false;

        const infoItems = [
            route ? { label: 'Route', value: route, icon: 'fa-syringe' } : null,
            form ? { label: 'Form', value: form, icon: 'fa-capsules' } : null,
            dose ? { label: 'Adult Dose', value: dose, icon: 'fa-scale-balanced' } : null,
            frequency ? { label: 'Frequency', value: frequency, icon: 'fa-clock' } : null,
            duration ? { label: 'Duration', value: duration, icon: 'fa-calendar-days' } : null
        ].filter(Boolean);

        const uniqueBrands = [...new Set(brands.map(b => String(b).trim()).filter(Boolean))];

        html += `
            <div class="medicine-card">
                <div class="med-header">
                    <div class="med-name-wrapper">
                        <div class="med-icon-box">
                            <i class="fas fa-pills"></i>
                        </div>
                        <div>
                            <h3 class="med-name">${escapeHtml(genericName)}</h3>
                            <span class="med-type-label">Veterinary Formulation</span>
                        </div>
                    </div>
                    ${form ? `<span class="med-form-badge"><i class="fas fa-box-archive"></i> ${escapeHtml(form)}</span>` : ''}
                </div>

                ${purpose ? `
                    <div class="med-purpose-box">
                        <i class="fas fa-circle-info"></i>
                        <p class="med-purpose">${escapeHtml(purpose)}</p>
                    </div>
                ` : ''}

                ${infoItems.length > 0 ? `
                    <div class="med-info-grid">
                        ${infoItems.map(it => `
                            <div class="med-info-item">
                                <span class="label"><i class="fas ${escapeHtml(it.icon)}"></i> ${escapeHtml(it.label)}</span>
                                <span class="value">${escapeHtml(it.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                ${uniqueBrands.length > 0 ? `
                    <div class="brand-section">
                        <div class="brand-title">
                            <span><i class="fas fa-certificate text-teal"></i> Bangladesh Market Brands</span>
                            <span class="brand-count-badge">${uniqueBrands.length} Available</span>
                        </div>
                        <div class="brand-list">
                            ${uniqueBrands.map(b => brandPillHtml(b)).join('')}
                        </div>
                    </div>
                ` : ''}

                ${verify ? `
                    <div class="vet-badge">
                        <i class="fas fa-user-doctor"></i>
                        <span>Administer strictly under registered veterinarian oversight (DVM / DLS)</span>
                    </div>
                ` : ''}
            </div>`;
    });

    return html;
}

// ============================================
// 🔗 Brand Pill HTML — Clickable Google Search
// ============================================
function brandPillHtml(brandName) {
    const name = String(brandName).trim();
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(name + ' veterinary medicine Bangladesh')}`;
    return `<a href="${googleUrl}"
               target="_blank"
               rel="noopener noreferrer"
               class="brand-pill"
               title="Search '${escapeHtml(name)}' on Google">
               <span>${escapeHtml(name)}</span>
               <i class="fas fa-arrow-up-right-from-square"></i>
            </a>`;
}

// ============================================
// 🌐 Purpose language picker
// ============================================
function pickPurpose(treatment) {
    if (!treatment) return '';
    const en = (treatment.purpose_en || '').trim();
    const bn = (treatment.purpose || '').trim();
    return PREFERRED_LANG === 'bn' ? (bn || en || '') : (en || bn || '');
}

// ============================================
// 🔄 Clear
// ============================================
function clearSearch() {
    const input = _el('diseaseSearchInput');
    const clearBtn = _el('clearBtn');
    const resultArea = _el('resultArea');
    const emptyState = _el('emptyState');
    const quickChips = _el('quickChips');

    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (resultArea) resultArea.innerHTML = '';
    if (emptyState) emptyState.style.display = 'flex';
    if (quickChips) quickChips.style.display = 'flex';

    input?.focus();
}

// ============================================
// ⚡ Quick search
// ============================================
function quickSearch(query) {
    const input = _el('diseaseSearchInput');
    const clearBtn = _el('clearBtn');
    if (input) {
        input.value = query;
        if (clearBtn) clearBtn.style.display = 'flex';
    }
    searchMedicine();
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('💊 DailyVet Pharma loaded');

    const userPhone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!userPhone) {
        window.location.href = 'login.html';
        return;
    }
    if (!sessionStorage.getItem('userPhone') && userPhone) {
        sessionStorage.setItem('userPhone', userPhone);
    }

    const input = _el('diseaseSearchInput');
    if (input) {
        input.addEventListener('keypress', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchMedicine();
            }
        });

        input.addEventListener('input', () => {
            const clearBtn = _el('clearBtn');
            if (clearBtn) clearBtn.style.display = input.value.trim() ? 'flex' : 'none';
        });
    }

    preloadDiseases();
});

// Expose to global
window.searchMedicine = searchMedicine;
window.clearSearch = clearSearch;
window.quickSearch = quickSearch;