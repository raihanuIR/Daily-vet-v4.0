/* ============================================================
   DailyVet — Dung & Urine AI Scanner v1.1
   ✅ Search dropdown for animal + type
   ✅ Species-specific analysis
   ✅ Gemini Vision AI
   ✅ Bengali verdict + DIY guide
   ✅ Copy/Paste + Drag&Drop + Camera + Gallery
   ============================================================ */

/* ============================================================
   0. STATE + CONFIG
   ============================================================ */
let bdSelectedImage = null;
let bdCurrentPhone = null;
let bdSelectedAnimal = 'cow';
let bdSelectedType = 'dung';
let animalDropdownOpen = false;
let typeDropdownOpen = false;

const BD_GEMINI_API_KEY = 'AQ.Ab8RN6JpOCNQXVWw4BqZz-qiUPTxB6pSvFUUd1E1lrhiRWpdQg';
const BD_GEMINI_VISION_MODEL = 'gemini-3.5-flash-lite';
const BD_GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BD_GEMINI_TIMEOUT_MS = 30000;
const BD_MAX_IMAGE_MB = 10;

/* ============================================================
   1. DATA — Animals + Types
   ============================================================ */
const BD_ANIMALS = [
    { id: 'cow',      emoji: '🐄', name: 'Cow',      sub: 'গরু' },
    { id: 'buffalo',  emoji: '🐃', name: 'Buffalo',  sub: 'মহিষ' },
    { id: 'goat',     emoji: '🐐', name: 'Goat',     sub: 'ছাগল' },
    { id: 'sheep',    emoji: '🐑', name: 'Sheep',    sub: 'ভেড়া' },
    { id: 'chicken',  emoji: '🐔', name: 'Chicken',  sub: 'মুরগি' },
    { id: 'duck',     emoji: '🦆', name: 'Duck',     sub: 'হাঁস' },
    { id: 'pigeon',   emoji: '🕊️', name: 'Pigeon',   sub: 'কবুতর' },
    { id: 'dog',      emoji: '🐕', name: 'Dog',      sub: 'কুকুর' },
    { id: 'cat',      emoji: '🐈', name: 'Cat',      sub: 'বিড়াল' },
    { id: 'rabbit',   emoji: '🐇', name: 'Rabbit',   sub: 'খরগোশ' }
];

const BD_TYPES = [
    { id: 'dung',  emoji: '🌱', name: 'Dung / Droppings', sub: 'গোবর / পটি' },
    { id: 'urine', emoji: '💧', name: 'Urine',             sub: 'প্রস্রাব' }
];

/* ============================================================
   2. PROMPTS — Species × Type
   ============================================================ */
const BD_EXCRETA_PROMPTS = {
    cow: {
        dung: `You are a veterinary AI analyzing COW DUNG (গোবর).
Analyze the attached image of cow feces.

🚨 CHECKLIST:
1. Color (green, brown, black, red, yellow)
2. Texture (normal, loose, watery, hard, frothy)
3. Blood presence (fresh red / dark tarry)
4. Mucus presence
5. Visible worms (round, tape)
6. Undigested feed (straw, grain)
7. Odor (normal, putrid, sour)

🔬 LIKELY CONDITIONS:
- Loose/watery → Diarrhea, Dehydration, Food poisoning
- Bloody/mucus → Black Quarter (বাদলা), Bacterial infection
- Worms visible → Parasitic infestation
- Undigested feed → Liver issue, Metabolic failure
- Black tarry → Internal bleeding
- Green watery → Grass overload / infectious

📋 RETURN ONLY VALID JSON:
{
  "status": "success",
  "species": "cow",
  "speciesBengali": "গরু",
  "analysisType": "dung",
  "analysisTypeBengali": "গোবর",
  "aiVisualFindings": {
    "detectedColor": "...",
    "detectedTexture": "...",
    "bloodPresent": true,
    "mucusPresent": false,
    "wormsVisible": false,
    "undigestedFeed": false
  },
  "suspectedDisease": {
    "nameEnglish": "...",
    "nameBengali": "...",
    "confidencePercentage": 85
  },
  "riskLevel": "Critical | High | Medium | Low",
  "verdictBengali": "বিস্তারিত বাংলা ভাষায় সারসংক্ষেপ...",
  "immediateActionsBengali": ["এখনই কী করতে হবে ১", "২"],
  "homeCareBengali": ["ঘরোয়া যত্ন ১"],
  "medicineSuggestionBengali": ["generic নাম — কাজ"],
  "dietAdviceBengali": ["খাদ্য পরিবর্তন"],
  "preventionBengali": ["প্রতিরোধ"],
  "diyPhysicalVerificationGuide": ["নিজেই যাচাই"]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON. No markdown.`,
        urine: `You are a veterinary AI analyzing COW URINE (প্রস্রাব).
Analyze the attached image of cow urine.

🚨 CHECKLIST:
1. Color: pale yellow=normal, red/coffee=EMERGENCY, dark yellow, cloudy, brown
2. Clarity: clear vs cloudy/milky
3. Blood presence
4. Sediment/pus visible

🔬 LIKELY CONDITIONS:
- Red/coffee → Babesiosis (বেবেসিওসিস), Tick fever 🚨 LIFE-THREATENING
- Dark yellow → Jaundice, Liver issue, Dehydration
- Cloudy/milky → UTI, Kidney infection
- Brown → Myoglobinuria

📋 RETURN ONLY VALID JSON:
{
  "status": "success",
  "species": "cow",
  "speciesBengali": "গরু",
  "analysisType": "urine",
  "analysisTypeBengali": "প্রস্রাব",
  "aiVisualFindings": {
    "detectedColor": "...",
    "detectedClarity": "...",
    "bloodPresent": true,
    "sedimentVisible": false
  },
  "suspectedDisease": {
    "nameEnglish": "...",
    "nameBengali": "...",
    "confidencePercentage": 85
  },
  "riskLevel": "Critical | High | Medium | Low",
  "verdictBengali": "...",
  "immediateActionsBengali": ["..."],
  "homeCareBengali": ["..."],
  "medicineSuggestionBengali": ["..."],
  "dietAdviceBengali": ["..."],
  "preventionBengali": ["..."],
  "diyPhysicalVerificationGuide": ["..."]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON. No markdown.`
    },

    goat: {
        dung: `You are a veterinary AI analyzing GOAT DROPPINGS.
Analyze the attached image of goat feces.

🚨 CHECKLIST:
1. Color (green, brown, black, red)
2. Texture (normal, loose, watery, pellets)
3. Blood/mucus presence
4. Visible worms
5. Undigested feed

🔬 LIKELY CONDITIONS:
- Loose/watery → PPR, Parasitic, Enterotoxaemia
- Blood → Coccidiosis, Bacterial
- Worms → Parasitic
- Undigested → Digestive issue
- Pellets normal → Healthy

📋 RETURN ONLY VALID JSON (same structure as cow):
{
  "status": "success",
  "species": "goat",
  "speciesBengali": "ছাগল",
  "analysisType": "dung",
  "analysisTypeBengali": "গোবর",
  "aiVisualFindings": {...},
  "suspectedDisease": {...},
  "riskLevel": "...",
  "verdictBengali": "...",
  "immediateActionsBengali": ["..."],
  "homeCareBengali": ["..."],
  "medicineSuggestionBengali": ["..."],
  "dietAdviceBengali": ["..."],
  "preventionBengali": ["..."],
  "diyPhysicalVerificationGuide": ["..."]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON.`,
        urine: `You are a veterinary AI analyzing GOAT URINE.
[Same structure as cow urine with goat-specific conditions]`
    },

    buffalo: {
        dung: `You are a veterinary AI analyzing BUFFALO DUNG.
[Similar to cow — HS, FMD, Parasitic conditions]
Return ONLY JSON.`,
        urine: `You are a veterinary AI analyzing BUFFALO URINE.
[Similar to cow] Return ONLY JSON.`
    },

    sheep: {
        dung: `You are a veterinary AI analyzing SHEEP DROPPINGS.
[Similar to goat — PPR, Parasitic, Enterotoxaemia]
Return ONLY JSON.`,
        urine: `You are a veterinary AI analyzing SHEEP URINE.
[Similar to goat] Return ONLY JSON.`
    },

    dog: {
        dung: `You are a veterinary AI analyzing DOG FECES (পটি).

🚨 CRITICAL — PARVOVIRUS DETECTION:
- Black tarry stool → GI bleeding, Parvo SUSPECT
- Fresh red blood → Parvo or Parasitic
- Loose + vomiting → EMERGENCY
- White string/rice grain → Tapeworm/Roundworm

🔬 CONDITIONS:
- Black/tarry → GI bleeding, Parvovirus
- Fresh blood → Parvovirus, Colitis
- Loose/watery → Parvovirus, Parasitic, Food poisoning
- Worms → Tapeworm, Roundworm
- Yellow/green → Liver issue

📋 RETURN ONLY VALID JSON:
{
  "status": "success",
  "species": "dog",
  "speciesBengali": "কুকুর",
  "analysisType": "dung",
  "analysisTypeBengali": "পটি",
  "aiVisualFindings": {
    "detectedColor": "...",
    "detectedTexture": "...",
    "bloodPresent": true,
    "tarryStool": false,
    "wormsVisible": false,
    "mucusPresent": false
  },
  "suspectedDisease": {...},
  "riskLevel": "...",
  "verdictBengali": "...",
  "immediateActionsBengali": ["..."],
  "homeCareBengali": ["..."],
  "medicineSuggestionBengali": ["..."],
  "dietAdviceBengali": ["..."],
  "preventionBengali": ["..."],
  "diyPhysicalVerificationGuide": ["..."]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON.`,
        urine: `You are a veterinary AI analyzing DOG URINE.

🔬 CONDITIONS:
- Red/pink → UTI, Bladder stones, Trauma
- Dark yellow → Dehydration, Liver issue
- Cloudy → UTI, Infection
- Brown → Myoglobinuria

📋 RETURN ONLY VALID JSON (same structure as dung but with urine fields):
{
  "status": "success",
  "species": "dog",
  "speciesBengali": "কুকুর",
  "analysisType": "urine",
  "analysisTypeBengali": "প্রস্রাব",
  "aiVisualFindings": {...},
  "suspectedDisease": {...},
  "riskLevel": "...",
  "verdictBengali": "...",
  "immediateActionsBengali": ["..."],
  "homeCareBengali": ["..."],
  "medicineSuggestionBengali": ["..."],
  "dietAdviceBengali": ["..."],
  "preventionBengali": ["..."],
  "diyPhysicalVerificationGuide": ["..."]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON.`
    },

    cat: {
        dung: `You are a veterinary AI analyzing CAT FECES.

🔬 CONDITIONS:
- Black → GI bleeding
- Fresh red → Parasitic, Colitis
- Loose → IBD, Parasitic, Infection
- Worms → Tapeworm (from fleas), Roundworm
- Hard/dry → Constipation, Dehydration

📋 RETURN ONLY VALID JSON with same structure.
ALL Bengali fields MUST be in Bengali script.`,
        urine: `You are a veterinary AI analyzing CAT URINE.

🚨 CRITICAL — FLUTD DETECTION:
- Pink/red → UTI, FLUTD (LIFE-THREATENING), Stones
- Dark yellow → Jaundice, Liver issue
- Cloudy → Infection
- Crystal visible → Struvite, Oxalate

📋 RETURN ONLY VALID JSON.
ALL Bengali fields MUST be in Bengali script.`
    },

    chicken: {
        dung: `You are a POULTRY expert analyzing CHICKEN DROPPINGS (পটি).

🚨🚨 OUTBREAK ALERT DETECTION:
- Green/Chalky white → Newcastle Disease / Avian Influenza 🚨 CRITICAL OUTBREAK
- Bloody/Red → Coccidiosis (রক্ত আমাশয়)
- Yellow frothy → Fowl Cholera / Salmonella
- Watery/clear → Heat stroke / Gumboro
- White chalky → Serious infectious disease

🚨 EMERGENCY STEPS:
1. Isolate affected chickens immediately
2. Disinfect entire farm (Potassium Permanganate)
3. Vaccinate healthy chickens
4. Provide electrolyte/glucose water
5. Bury dead birds safely
6. Report to DLS if Avian Influenza suspected

📋 RETURN ONLY VALID JSON:
{
  "status": "success",
  "species": "chicken",
  "speciesBengali": "মুরগি",
  "analysisType": "dung",
  "analysisTypeBengali": "পটি",
  "aiVisualFindings": {
    "detectedColor": "...",
    "detectedTexture": "...",
    "bloodPresent": false,
    "outbreakAlert": true,
    "frothy": false
  },
  "suspectedDisease": {
    "nameEnglish": "Newcastle Disease",
    "nameBengali": "রাণীক্ষেত",
    "confidencePercentage": 90
  },
  "riskLevel": "Critical",
  "verdictBengali": "...",
  "immediateActionsBengali": [
    "আক্রান্ত মুরগি সাথে সাথে আলাদা করুন",
    "পুরো খামার জীবাণুমুক্ত করুন (পটাসিয়াম পারম্যাঙ্গানেট)",
    "সুস্থ মুরগিকে ভ্যাকসিন দিন",
    "ইলেক্ট্রোলাইট/গ্লুকোজ পানি দিন",
    "মৃত মুরগি নিরাপদে পুঁতে ফেলুন"
  ],
  "homeCareBengali": ["..."],
  "medicineSuggestionBengali": ["..."],
  "dietAdviceBengali": ["..."],
  "preventionBengali": ["..."],
  "diyPhysicalVerificationGuide": ["..."]
}
ALL Bengali fields MUST be in Bengali script.
Return ONLY JSON.`,
        urine: `You are a POULTRY expert. Birds excrete uric acid (white paste) with droppings, not liquid urine.
Analyze the urate portion:
- Yellow urates → Liver issue
- Green urates → Liver infection
- White chalky → Normal or dehydration
- Bloody → Serious infection

📋 RETURN ONLY VALID JSON with same structure.
ALL Bengali fields MUST be in Bengali script.`
    },

    duck: {
        dung: `You are a POULTRY expert analyzing DUCK DROPPINGS.

🔬 CONDITIONS:
- Green/Chalky → Duck Plague (হাঁসের মড়ক)
- Bloody → Coccidiosis
- Watery → Duck Viral Hepatitis
- Yellow → Salmonella

📋 RETURN ONLY VALID JSON with same structure.
ALL Bengali fields MUST be in Bengali script.`,
        urine: `You are a POULTRY expert analyzing DUCK URATE.
[Similar to chicken urine analysis]
Return ONLY JSON.`
    },

    pigeon: {
        dung: `You are a BIRD expert analyzing PIGEON DROPPINGS.

🔬 CONDITIONS:
- Green watery → Salmonella, Paratyphoid
- Bloody → Coccidiosis
- Yellow → Liver issue
- White chalky → Normal or dehydration

📋 RETURN ONLY VALID JSON with same structure.
ALL Bengali fields MUST be in Bengali script.`,
        urine: `You are a BIRD expert analyzing PIGEON URATE.
Return ONLY JSON.`
    },

    rabbit: {
        dung: `You are a veterinary AI analyzing RABBIT DROPPINGS.

🔬 CONDITIONS:
- Loose/watery → GI stasis, Enteritis, Coccidiosis
- No droppings → GI STASIS (EMERGENCY)
- Small/tiny → GI stasis
- Worms → Parasitic
- Mucus → Enteritis

📋 RETURN ONLY VALID JSON with same structure.
ALL Bengali fields MUST be in Bengali script.`,
        urine: `You are a veterinary AI analyzing RABBIT URINE.

Note: Rabbit urine can be naturally red/orange (porphyrins) — not always blood.

🔬 CONDITIONS:
- Milky white → Normal (calcium)
- Red-orange → Normal porphyrins OR blood (check)
- Cloudy thick → Sludge, UTI
- Bloody → UTI, Stones

📋 RETURN ONLY VALID JSON.
ALL Bengali fields MUST be in Bengali script.`
    }
};

/* ============================================================
   3. HELPERS
   ============================================================ */
const _elBD = id => document.getElementById(id);
const _fsBD = () => firebase.firestore();

function escapeHtmlBD(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getExcretaPrompt(animal, type) {
    const p = BD_EXCRETA_PROMPTS[animal];
    return p ? (p[type] || p.dung) : null;
}

function parseGeminiJSON(rawText) {
    try {
        return JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Could not parse AI response');
    }
}

/* ============================================================
   4. IMAGE HANDLING
   ============================================================ */
function openBDCamera() { _elBD('bdCameraInput')?.click(); }
function openBDGallery() { _elBD('bdGalleryInput')?.click(); }

window.openBDCamera = openBDCamera;
window.openBDGallery = openBDGallery;

function compressBDImage(file, maxDim = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    const scale = maxDim / Math.max(width, height);
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('Image decode failed'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
    });
}

/* Unified image intake — camera / gallery / paste / drop */
async function handleBDImage(file) {
    if (!file || !file.type.startsWith('image/')) return;

    if (file.size > BD_MAX_IMAGE_MB * 1024 * 1024) {
        alert(`Image too large. Please choose under ${BD_MAX_IMAGE_MB}MB.`);
        return;
    }

    try {
        bdSelectedImage = await compressBDImage(file);
        showBDPreview(bdSelectedImage);
    } catch (err) {
        alert('Failed to read image: ' + err.message);
    }
}

function handleBDImageSelect(event) {
    const file = event.target.files?.[0];
    if (file) handleBDImage(file);
    event.target.value = '';   // allow re-selecting the same file
}

function showBDPreview(dataURL) {
    _elBD('bdImageField')?.classList.add('hidden');

    const preview = _elBD('bdPreview');
    const img = _elBD('bdPreviewImg');
    if (preview && img) {
        img.src = dataURL;
        preview.style.display = 'flex';
    }

    const result = _elBD('bdResult');
    if (result) result.style.display = 'none';
    const loading = _elBD('bdLoading');
    if (loading) loading.style.display = 'none';

    preview?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function removeBDPreview() {
    bdSelectedImage = null;

    _elBD('bdPreview').style.display = 'none';
    _elBD('bdImageField')?.classList.remove('hidden');
    _elBD('bdResult').style.display = 'none';
    _elBD('bdLoading').style.display = 'none';

    ['bdCameraInput', 'bdGalleryInput'].forEach(id => {
        const el = _elBD(id);
        if (el) el.value = '';
    });
}

window.removeBDPreview = removeBDPreview;

/* ============================================================
   5. DROPDOWN — ANIMAL
   ============================================================ */
function toggleAnimalDropdown() {
    const panel = _elBD('animalPanel');
    const trigger = _elBD('animalTrigger');
    if (!panel || !trigger) return;

    if (animalDropdownOpen) {
        closeAnimalDropdown();
        return;
    }

    closeTypeDropdown();
    renderAnimalList('');
    panel.classList.add('open');
    trigger.classList.add('open');
    animalDropdownOpen = true;

    const search = _elBD('animalSearch');
    if (search) {
        search.value = '';
        setTimeout(() => search.focus(), 100);
    }
}

function closeAnimalDropdown() {
    _elBD('animalPanel')?.classList.remove('open');
    _elBD('animalTrigger')?.classList.remove('open');
    animalDropdownOpen = false;
}

function renderAnimalList(filter) {
    const list = _elBD('animalList');
    if (!list) return;

    const q = (filter || '').toLowerCase().trim();
    const filtered = BD_ANIMALS.filter(a =>
        !q || a.name.toLowerCase().includes(q) || a.sub.includes(q) || a.id.includes(q)
    );

    if (!filtered.length) {
        list.innerHTML = `<div class="ex-empty">No animal found</div>`;
        return;
    }

    list.innerHTML = filtered.map(a => `
        <button type="button" class="ex-option ${a.id === bdSelectedAnimal ? 'active' : ''}"
                data-id="${a.id}" onclick="selectAnimalFromList('${a.id}')">
            <span class="ex-option-emoji">${a.emoji}</span>
            <span class="ex-option-text">
                <span>${a.name}</span>
                <div class="ex-option-sub">${a.sub}</div>
            </span>
            <i class="fas fa-check ex-check"></i>
        </button>
    `).join('');
}

function selectAnimalFromList(id) {
    const animal = BD_ANIMALS.find(a => a.id === id);
    if (!animal) return;

    bdSelectedAnimal = animal.id;
    const emoji = _elBD('animalEmoji');
    const name = _elBD('animalName');
    if (emoji) emoji.textContent = animal.emoji;
    if (name) name.textContent = animal.name;

    closeAnimalDropdown();
    console.log('🐾 Selected animal:', bdSelectedAnimal);
}

/* ============================================================
   6. DROPDOWN — TYPE
   ============================================================ */
function toggleTypeDropdown() {
    const panel = _elBD('typePanel');
    const trigger = _elBD('typeTrigger');
    if (!panel || !trigger) return;

    if (typeDropdownOpen) {
        closeTypeDropdown();
        return;
    }

    closeAnimalDropdown();
    renderTypeList();
    panel.classList.add('open');
    trigger.classList.add('open');
    typeDropdownOpen = true;
}

function closeTypeDropdown() {
    _elBD('typePanel')?.classList.remove('open');
    _elBD('typeTrigger')?.classList.remove('open');
    typeDropdownOpen = false;
}

function renderTypeList() {
    const list = _elBD('typeList');
    if (!list) return;

    list.innerHTML = BD_TYPES.map(t => `
        <button type="button" class="ex-option ${t.id === bdSelectedType ? 'active' : ''}"
                data-id="${t.id}" onclick="selectTypeFromList('${t.id}')">
            <span class="ex-option-emoji">${t.emoji}</span>
            <span class="ex-option-text">
                <span>${t.name}</span>
                <div class="ex-option-sub">${t.sub}</div>
            </span>
            <i class="fas fa-check ex-check"></i>
        </button>
    `).join('');
}

function selectTypeFromList(id) {
    const type = BD_TYPES.find(t => t.id === id);
    if (!type) return;

    bdSelectedType = type.id;
    const emoji = _elBD('typeEmoji');
    const name = _elBD('typeName');
    if (emoji) emoji.textContent = type.emoji;
    if (name) name.textContent = type.name;

    closeTypeDropdown();
    console.log('🧪 Selected type:', bdSelectedType);
}

/* ============================================================
   7. GEMINI VISION CALL
   ============================================================ */
async function callExcretaGemini(imageBase64, prompt) {
    const url = `${BD_GEMINI_API_URL}/${BD_GEMINI_VISION_MODEL}:generateContent?key=${BD_GEMINI_API_KEY}`;
    const imageData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType = imageBase64.includes('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BD_GEMINI_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inline_data: { mime_type: mimeType, data: imageData } },
                        { text: prompt }
                    ]
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2000,
                    topP: 1,
                    responseMimeType: 'application/json'
                }
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('Gemini error:', response.status, errText.slice(0, 300));
            throw new Error(`Gemini API error (${response.status})`);
        }

        const data = await response.json();
        const rawText = (data.candidates?.[0]?.content?.parts || [])
            .filter(pt => pt && pt.text && !pt.thought)
            .map(pt => pt.text).join('');

        if (!rawText) throw new Error('Empty AI response');
        return parseGeminiJSON(rawText);

    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/* ============================================================
   8. RESULT RENDERING
   ============================================================ */
const BD_TRAIT_LABELS = {
    detectedColor: '🎨 Color',
    detectedTexture: '📏 Texture',
    detectedClarity: '🔍 Clarity',
    bloodPresent: '🩸 Blood',
    mucusPresent: '💧 Mucus',
    wormsVisible: '🪱 Worms',
    undigestedFeed: '🌾 Undigested',
    sedimentVisible: '⚗️ Sediment',
    tarryStool: '⚫ Tarry Stool',
    frothy: '🫧 Frothy',
    outbreakAlert: '🚨 Outbreak Sign'
};

function _buildRiskBanner(riskLevel) {
    if (riskLevel === 'critical') {
        return `<div class="bd-risk-banner"><i class="fas fa-triangle-exclamation"></i>
            <div><strong>🚨 CRITICAL EMERGENCY</strong><p>Contact a veterinarian immediately</p></div></div>`;
    }
    if (riskLevel === 'high') {
        return `<div class="bd-risk-banner"><i class="fas fa-triangle-exclamation"></i>
            <div><strong>⚠️ HIGH RISK</strong><p>Urgent treatment needed</p></div></div>`;
    }
    if (riskLevel === 'medium') {
        return `<div class="bd-caution-banner"><i class="fas fa-info-circle"></i>
            <div><strong>⚡ MODERATE RISK</strong><p>Monitor closely</p></div></div>`;
    }
    return `<div class="bd-safe-banner"><i class="fas fa-circle-check"></i>
        <div><strong>✅ NORMAL</strong><p>Healthy appearance</p></div></div>`;
}

function _buildListSection(title, items, listClass = 'bd-diy-list', ordered = false) {
    if (!Array.isArray(items) || !items.length) return '';
    const tag = ordered ? 'ol' : 'ul';
    return `<div class="bd-section">
        <div class="bd-section-label">${title}</div>
        <${tag} class="${listClass}">
            ${items.map(i => `<li>${escapeHtmlBD(i)}</li>`).join('')}
        </${tag}>
    </div>`;
}

function renderExcretaResult(data) {
    const resultEl = _elBD('bdResult');
    if (!resultEl) return;

    const userImageHTML = bdSelectedImage
        ? `<div class="bd-result-image"><img src="${bdSelectedImage}" alt="Analyzed Sample" /></div>`
        : '';

    /* ---------- ERROR STATE ---------- */
    if (data.status === 'error' || data.error) {
        resultEl.innerHTML = `
            ${userImageHTML}
            <div class="bd-result-error">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Could Not Analyze</h3>
                <p>${escapeHtmlBD(data.error || data.verdictBengali || 'Please try a clearer photo.')}</p>
            </div>`;
        resultEl.style.display = 'flex';
        return;
    }

    const findings = data.aiVisualFindings || {};
    const disease = data.suspectedDisease || {};
    const riskLevel = (data.riskLevel || 'Low').toLowerCase();

    const riskColor = (riskLevel === 'critical' || riskLevel === 'high') ? '#dc2626'
                    : riskLevel === 'medium' ? '#d97706' : '#10b981';
    const riskBg = (riskLevel === 'critical' || riskLevel === 'high') ? '#fef2f2'
                 : riskLevel === 'medium' ? '#fef9e7' : '#f0fdf4';
    const riskBorder = (riskLevel === 'critical' || riskLevel === 'high') ? '#fecaca'
                     : riskLevel === 'medium' ? '#fcd34d' : '#86efac';

    const confidence = disease.confidencePercentage || 0;
    const confColor = confidence >= 80 ? '#10b981'
                    : confidence >= 60 ? '#d97706' : '#dc2626';

    const riskBanner = _buildRiskBanner(riskLevel);

    /* ---------- VISUAL FINDINGS ---------- */
    const findingsHTML = Object.entries(findings).map(([k, v]) => {
        const label = BD_TRAIT_LABELS[k] || k;
        const value = typeof v === 'boolean' ? (v ? '✅ Yes' : '❌ No') : escapeHtmlBD(v);
        return `<div class="bd-trait-row"><span class="bd-trait-label">${label}</span><span class="bd-trait-value">${value}</span></div>`;
    }).join('');

    /* ---------- LIST SECTIONS ---------- */
    const actionsHTML = _buildListSection('🚨 Immediate Actions', data.immediateActionsBengali, 'bd-red-flags');
    const homeCareHTML = _buildListSection('🏠 Home Care', data.homeCareBengali);
    const medicineHTML = _buildListSection('💊 Medicine (Vet-supervised)', data.medicineSuggestionBengali);
    const dietHTML = _buildListSection('🥗 Diet Advice', data.dietAdviceBengali);
    const preventionHTML = _buildListSection('🛡️ Prevention', data.preventionBengali);
    const diyHTML = _buildListSection('🔍 Verify Yourself (DIY)', data.diyPhysicalVerificationGuide, 'bd-diy-list', true);

    const speciesBn = data.speciesBengali || 'প্রাণী';
    const analysisTypeBn = data.analysisTypeBengali || (bdSelectedType === 'urine' ? 'প্রস্রাব' : 'মল');

    /* ---------- RENDER ---------- */
    resultEl.innerHTML = `
        ${riskBanner}
        ${userImageHTML}

        <div class="bd-result-header">
            <i class="fas fa-check-circle" style="color:${confColor};"></i>
            <h3>Analysis Complete</h3>
        </div>

        <div class="bd-section bd-breed-section">
            <div class="bd-section-label">🐾 Subject</div>
            <div class="bd-species-name">${escapeHtmlBD(speciesBn)} — ${escapeHtmlBD(analysisTypeBn)}</div>
            ${disease.nameBengali ? `
                <div class="bd-breed-name">🩺 ${escapeHtmlBD(disease.nameBengali)}</div>
                ${disease.nameEnglish ? `<div style="font-size:13px;color:#666;margin-top:4px;">${escapeHtmlBD(disease.nameEnglish)}</div>` : ''}
            ` : ''}
            <div class="bd-confidence">
                <span>Confidence</span>
                <div class="bd-confidence-bar">
                    <div class="bd-confidence-fill" style="width:${confidence}%;background:${confColor};"></div>
                </div>
                <strong style="color:${confColor};">${confidence}%</strong>
            </div>
        </div>

        ${findingsHTML ? `
            <div class="bd-section">
                <div class="bd-section-label">📊 AI Visual Findings</div>
                <div class="bd-traits">${findingsHTML}</div>
            </div>
        ` : ''}

        <div class="bd-section bd-health-section" style="background:${riskBg};border-color:${riskBorder};">
            <div class="bd-section-label" style="color:${riskColor};">
                🩺 Risk Assessment
            </div>
            <div class="bd-health-status">
                <span>Risk Level:</span>
                <strong style="color:${riskColor};">
                    ${escapeHtmlBD(data.riskLevel || 'Low').toUpperCase()}
                </strong>
            </div>
        </div>

        ${actionsHTML}
        ${data.verdictBengali ? `
            <div class="bd-section bd-verdict-section">
                <div class="bd-section-label">🇧🇩 সারসংক্ষেপ (বাংলা)</div>
                <div class="bd-verdict-text">${escapeHtmlBD(data.verdictBengali)}</div>
            </div>
        ` : ''}
        ${homeCareHTML}
        ${medicineHTML}
        ${dietHTML}
        ${preventionHTML}
        ${diyHTML}

        <div class="bd-result-actions">
            <button type="button" class="bd-rescan-btn" onclick="rescanExcreta()">
                <i class="fas fa-redo"></i> Scan Again
            </button>
        </div>
    `;
    resultEl.style.display = 'flex';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   9. SAVE TO FIRESTORE
   ============================================================ */
async function saveExcretaScan(scanData) {
    if (!bdCurrentPhone) return;
    try {
        await _fsBD()
            .collection('users')
            .doc(bdCurrentPhone)
            .collection('excreta_history')
            .add({
                ...scanData,
                user_phone: bdCurrentPhone,
                animal: bdSelectedAnimal,
                type: bdSelectedType,
                scanned_at: firebase.firestore.FieldValue.serverTimestamp(),
                scanned_at_ms: Date.now()
            });
        console.log('✅ Excreta scan saved');
    } catch (err) {
        console.warn('Save failed:', err.message);
    }
}

/* ============================================================
   10. SCAN FLOW
   ============================================================ */
async function startExcretaScan() {
    if (!bdSelectedImage) return alert('Please select or take a photo first.');

    if (!bdCurrentPhone) {
        alert('Please login first.');
        window.location.href = 'login.html';
        return;
    }

    const prompt = getExcretaPrompt(bdSelectedAnimal, bdSelectedType);
    if (!prompt) return alert('Analysis prompt not found. Please try again.');

    const scanBtn = _elBD('bdScanBtn');
    const preview = _elBD('bdPreview');
    const loading = _elBD('bdLoading');
    const result = _elBD('bdResult');

    scanBtn.disabled = true;
    preview.style.display = 'none';
    result.style.display = 'none';
    loading.style.display = 'flex';

    try {
        console.log('🧪 Analyzing', bdSelectedAnimal, bdSelectedType, '...');
        const scanData = await callExcretaGemini(bdSelectedImage, prompt);
        console.log('📋 Result:', scanData);

        loading.style.display = 'none';
        renderExcretaResult(scanData);

        if (scanData.status !== 'error') saveExcretaScan(scanData);

    } catch (err) {
        console.error('Scan error:', err);
        loading.style.display = 'none';
        preview.style.display = 'flex';
        alert('Analysis failed: ' + (err.message || 'Please try again.'));
    } finally {
        scanBtn.disabled = false;
    }
}

window.startExcretaScan = startExcretaScan;

function rescanExcreta() {
    if (!bdSelectedImage) return;
    showBDPreview(bdSelectedImage);
}

window.rescanExcreta = rescanExcreta;

/* ============================================================
   11. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    bdCurrentPhone = localStorage.getItem('userPhone') || sessionStorage.getItem('userPhone');
    if (!bdCurrentPhone) {
        window.location.href = 'login.html';
        return;
    }

    /* Init dropdown display */
    const cow = BD_ANIMALS.find(a => a.id === 'cow');
    const dung = BD_TYPES.find(t => t.id === 'dung');
    if (_elBD('animalEmoji')) _elBD('animalEmoji').textContent = cow.emoji;
    if (_elBD('animalName')) _elBD('animalName').textContent = cow.name;
    if (_elBD('typeEmoji')) _elBD('typeEmoji').textContent = dung.emoji;
    if (_elBD('typeName')) _elBD('typeName').textContent = dung.name;

    /* File inputs */
    ['bdCameraInput', 'bdGalleryInput'].forEach(id => {
        _elBD(id)?.addEventListener('change', handleBDImageSelect);
    });

    /* Animal search input */
    const animalSearch = _elBD('animalSearch');
    if (animalSearch) {
        animalSearch.addEventListener('input', (e) => renderAnimalList(e.target.value));
    }

    /* Image field — click / drag / drop */
    const imageField = _elBD('bdImageField');
    if (imageField) {
        imageField.addEventListener('click', openBDGallery);

        imageField.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            imageField.classList.add('bd-dragover');
        });

        imageField.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            imageField.classList.remove('bd-dragover');
        });

        imageField.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            imageField.classList.remove('bd-dragover');

            const imgFile = Array.from(e.dataTransfer?.files || [])
                .find(f => f.type.startsWith('image/'));
            if (imgFile) handleBDImage(imgFile);
        });
    }

    /* Paste handler */
    document.addEventListener('paste', (e) => {
        const imageItem = Array.from(e.clipboardData?.items || [])
            .find(item => item.type.indexOf('image') !== -1);
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();
        handleBDImage(file);
    });

    /* Close dropdowns on outside click */
    document.addEventListener('click', (e) => {
        const animalWrap = _elBD('animalTrigger')?.parentElement;
        const typeWrap = _elBD('typeTrigger')?.parentElement;

        if (animalWrap && !animalWrap.contains(e.target)) closeAnimalDropdown();
        if (typeWrap && !typeWrap.contains(e.target)) closeTypeDropdown();
    });

    /* Escape key closes dropdowns */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAnimalDropdown();
            closeTypeDropdown();
        }
    });

    console.log('✅ Dung & Urine Scanner ready v1.1');
});

/* ============================================================
   GLOBAL EXPORTS
   ============================================================ */
window.toggleAnimalDropdown = toggleAnimalDropdown;
window.toggleTypeDropdown = toggleTypeDropdown;
window.selectAnimalFromList = selectAnimalFromList;
window.selectTypeFromList = selectTypeFromList;