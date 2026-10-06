/* ============================================================
   DailyVet — AI Breed Detection (Multi-Species v3.1)
   ✅ Cattle, Buffalo, Goat, Sheep, Chicken, Duck, Pigeon
   ✅ Dog, Cat, Rabbit, Bird
   ✅ Strict rules — no false "Deshi" classification
   ✅ Artificial fattening detection
   ✅ Bengali verdict + DIY guide
   ✅ Shows user image in result
   ============================================================ */

/* ============================================================
   0. STATE + CONFIG
   ============================================================ */
let bdSelectedImage = null;
let bdCurrentPhone = null;

const BD_GEMINI_API_KEY = 'AQ.Ab8RN6JpOCNQXVWw4BqZz-qiUPTxB6pSvFUUd1E1lrhiRWpdQg';
const BD_GEMINI_VISION_MODEL = 'gemini-3.5-flash-lite';
const BD_GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const BD_GEMINI_TIMEOUT_MS = 30000;
const BD_MAX_IMAGE_MB = 10;

/* ============================================================
   1. HELPERS
   ============================================================ */
const _elBD = id => document.getElementById(id);
const _fsBD = () => firebase.firestore();

function escapeHtmlBD(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/* ---------- Shared image compression ---------- */
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

/* ---------- Unified image intake (camera / gallery / paste / drop) ---------- */
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

/* ---------- Image picker buttons ---------- */
function openBDCamera()  { _elBD('bdCameraInput')?.click(); }
function openBDGallery() { _elBD('bdGalleryInput')?.click(); }

window.openBDCamera  = openBDCamera;
window.openBDGallery = openBDGallery;

/* ---------- Preview ---------- */
function showBDPreview(dataURL) {
    const preview = _elBD('bdPreview');
    const img = _elBD('bdPreviewImg');
    const imageField = _elBD('bdImageField');

    imageField?.classList.add('hidden');

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

/* ---------- JSON parse with fallback extraction ---------- */
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
   2. SYSTEM PROMPT — Multi-Species Detection
   ============================================================ */
const BD_BREED_PROMPT = `You are an expert livestock & pet breed identification AI for DailyVet (Bangladesh).

Analyze the attached image and identify the animal species, breed, origin, and health integrity.

═══════════════════════════════════════════════════════════
🐾 SUPPORTED ANIMALS — YOU MUST IDENTIFY ANY OF THESE:
═══════════════════════════════════════════════════════════

FARM ANIMALS:
- Cattle (গরু): Cow, Bull, Ox, Calf
- Buffalo (মহিষ): Water Buffalo
- Goat (ছাগল): Black Bengal, Jamunapari, Boer, Sirohi, Crossbreed
- Sheep (ভেড়া): Local, Garole, Crossbreed
- Chicken (মুরগি): Local Deshi, Broiler, Layer, Sonali
- Duck (হাঁস): Local, Khaki Campbell, Pekin
- Pigeon (কবুতর): Local, Racing, Fancy
- Horse (ঘোড়া)

PETS:
- Dog (কুকুর): Local Deshi, German Shepherd, Labrador, Rottweiler, Pitbull, Spitz, Crossbreed
- Cat (বিড়াল): Local Deshi, Persian, Siamese, Bengal
- Rabbit (খরগোশ), Guinea Pig, Hamster

═══════════════════════════════════════════════════════════
🚨 STEP 1 — IDENTIFY SPECIES FIRST:
═══════════════════════════════════════════════════════════
- Look at the animal carefully.
- Determine species: cow / buffalo / goat / sheep / chicken / duck / pigeon / dog / cat / rabbit / horse / bird
- If it is a GOAT → species: "goat", NOT cow.
- If it is a DOG → species: "dog", NOT cow.
- If it is a CHICKEN → species: "chicken", NOT cow.
- NEVER default to "cow". Identify the actual species.
- NEVER say "Not a cattle" — every domestic animal is valid.

═══════════════════════════════════════════════════════════
🚨 STEP 2 — CATTLE BREED RULES (Cow/Bull/Ox):
═══════════════════════════════════════════════════════════

RULE 1: NEVER call a foreign or crossbreed cattle "Deshi" (দেশী).
RULE 2: If you see ANY of these features, it is NOT pure Deshi:
    - Flat back with no visible hump
    - Small or minimal dewlap
    - Large rectangular body frame
    - Black & white patches (Holstein pattern)
    - Red/brown coat with large dewlap (Sahiwal/Red Sindhi)
    - Hornless (polled) or very small horns
RULE 3: When uncertain → "Crossbreed (Foreign X Local)"
RULE 4: "Deshi" cattle REQUIRES: prominent hump + large dewlap +
        medium/small body + visible horns + solid single color coat
RULE 5: Do NOT guess "Deshi" if image is unclear → say "Uncertain"
RULE 6: Black & white patches → Holstein Friesian → NOT Deshi
RULE 7: Reddish-brown coat + big dewlap → Sahiwal → NOT Deshi
RULE 8: Very large body frame (over 300 kg) → NOT pure Deshi
RULE 9: NEVER default to "Deshi" when uncertain.
RULE 10: Always specify "originType" explicitly.

═══════════════════════════════════════════════════════════
🚨 STEP 3 — GOAT (ছাগল):
═══════════════════════════════════════════════════════════
- BLACK BENGAL: Small body, black/white/brown, short hair, short horns
- JAMUNAPARI: Large, white body, long pendulous ears, roman nose
- BOER: Large, white body with red/brown head, muscular
- SIROHI: White with brown spots, medium size
- CROSSBREED: Mix features

Origin: "Local Deshi (Black Bengal)" / "Crossbreed" / "Foreign (Boer/Jamunapari/Sirohi)"

═══════════════════════════════════════════════════════════
🚨 STEP 4 — BUFFALO (মহিষ):
═══════════════════════════════════════════════════════════
- LOCAL BUFFALO: Black body, large horns, medium frame
- MURRAH: Large body, black, curled horns
- NILI-RAVI: Black body with white patches on face/legs
- JAFARABADI: Large, black, heavy body

═══════════════════════════════════════════════════════════
🚨 STEP 5 — SHEEP (ভেড়া):
═══════════════════════════════════════════════════════════
- LOCAL SHEEP: Small, white/black body, thin wool
- GAROLE: Small, white/black, fecundity
- CROSSBREED: Larger, thicker wool

═══════════════════════════════════════════════════════════
🚨 STEP 6 — DOG (কুকুর):
═══════════════════════════════════════════════════════════
- LOCAL DESHI: Medium, brown/black/tricolor, wolf-like
- GERMAN SHEPHERD: Large, black-tan, upright ears
- LABRADOR: Large, yellow/black/chocolate, droopy ears
- ROTTWEILER: Large, black-tan, muscular
- PITBULL: Medium-large, muscular, short hair
- SPITZ: Small-medium, fluffy, pointed ears
- CROSSBREED

═══════════════════════════════════════════════════════════
🚨 STEP 7 — CAT (বিড়াল):
═══════════════════════════════════════════════════════════
- LOCAL DESHI: Small-medium, mixed colors, short-medium hair
- PERSIAN: Fluffy long hair, flat face
- SIAMESE: Cream body, dark face/ears/paws, blue eyes
- BENGAL: Spotted/striped, wild look
- CROSSBREED

═══════════════════════════════════════════════════════════
🚨 STEP 8 — CHICKEN (মুরগি):
═══════════════════════════════════════════════════════════
- DESHI: Small, mixed colors, thin legs
- SONALI: Brown/red, medium size
- BROILER: Large, white, fast-growing
- LAYER: Medium, brown/white

═══════════════════════════════════════════════════════════
🚨 STEP 9 — DUCK (হাঁস):
═══════════════════════════════════════════════════════════
- LOCAL DUCK: Small, brown/black/white, upright posture
- KHAKI CAMPBELL: Brown, egg-laying
- PEKIN: White, large, meat type

═══════════════════════════════════════════════════════════
🚨 STEP 10 — PIGEON (কবুতর):
═══════════════════════════════════════════════════════════
- LOCAL PIGEON: Grey/blue, small
- RACING: Slim body, longer wings
- FANCY: Various colors, ornamental

═══════════════════════════════════════════════════════════
🚨 HEALTH INTEGRITY (ALL ANIMALS):
═══════════════════════════════════════════════════════════
Detect signs of artificial fattening (steroids/hormones):
- Abnormal skin tautness and glossiness
- Severe water retention in thighs/muscles
- Dull eyes, lethargic posture
- Unnatural fat distribution

═══════════════════════════════════════════════════════════
✅ POSITIVE BUYING RECOMMENDATION:
═══════════════════════════════════════════════════════════
CASE 1 (Healthy) — shouldBuy: true
  recommendationBengali: "প্রাণীটি স্বাভাবিক ও সুস্থ অবস্থায় আছে। কোনো কৃত্রিম মোটাতাজাকরণের লক্ষণ পাওয়া যায়নি।"

CASE 2 (Medium risk) — shouldBuy: "caution"
  recommendationBengali: "প্রাণীটি প্রাথমিকভাবে সুস্থ দেখা যাচ্ছে, তবে কিছু সতর্কতার লক্ষণ আছে। ভেটেরিনারিয়ানের পরামর্শ নিয়ে ক্রয় করুন।"

CASE 3 (High risk) — shouldBuy: false
  recommendationBengali: "প্রাণীটি কৃত্রিমভাবে মোটাতাজাকরণ করা হয়েছে বলে সন্দেহ হচ্ছে। ক্রয়ের আগে অবশ্যই পশু চিকিৎসকের পরামর্শ নিন।"

═══════════════════════════════════════════════════════════
📤 OUTPUT FORMAT — RETURN ONLY VALID JSON:
═══════════════════════════════════════════════════════════
{
  "status": "success",
  "timestamp": "2026-09-25T18:25:00Z",
  "species": "goat",
  "speciesBengali": "ছাগল",
  "breedAnalysis": {
    "detectedBreed": "Black Bengal Goat",
    "originType": "Local Deshi",
    "confidenceScorePercentage": 92,
    "physicalTraitsObserved": {
      "bodyStructure": "Small compact body",
      "coatPattern": "Black coat with short hair",
      "hornShape": "Short backward-curved horns",
      "earType": "Short upright ears"
    }
  },
  "healthIntegrity": {
    "isArtificiallyFattened": false,
    "riskLevel": "Low",
    "detectedRedFlags": []
  },
  "buyingRecommendation": {
    "shouldBuy": true,
    "recommendationBengali": "প্রাণীটি স্বাভাবিক ও সুস্থ অবস্থায় আছে। কোনো কৃত্রিম মোটাতাজাকরণের লক্ষণ পাওয়া যায়নি। খাঁটি দেশী ছাগল — মাংস ও দুধ উৎপাদন ভালো।"
  },
  "verdictBengali": "প্রাণী শনাক্তকরণ: এটি একটি দেশী ছাগল (ব্ল্যাক বেঙ্গল)। ছোট শরীর, কালো রঙ ও ছোট শিং এটির প্রধান বৈশিষ্ট্য। স্বাস্থ্য সততা: ছাগলটি সম্পূর্ণ সুস্থ এবং স্বাভাবিক অবস্থায় আছে। ক্রয়ের জন্য উপযুক্ত।",
  "diyPhysicalVerificationGuide": [
    "ছাগলের গায়ে হাত বুলিয়ে চামড়া পরীক্ষা করুন। কৃত্রিম মোটাতাজা ছাগলের চামড়া অস্বাভাবিক টানটান ও চকচকে থাকে।",
    "পেছনের রানের মাংসল অংশে চাপ দিন। যদি দেবে যায় ও গর্ত হয় — কৃত্রিমভাবে ফোলানো হয়েছে।",
    "ছাগলের চোখ ও নাক ভালোভাবে লক্ষ্য করুন। সুস্থ ছাগলের চোখ উজ্জ্বল থাকে।"
  ]
}

═══════════════════════════════════════════════════════════
⚠️ STRICT OUTPUT RULES:
═══════════════════════════════════════════════════════════
- Return ONLY the JSON. No markdown, no code fences.
- "species" MUST be one of: cow, buffalo, goat, sheep, chicken, duck, pigeon, horse, dog, cat, rabbit, bird, unknown
- "speciesBengali" MUST be Bengali: গরু / মহিষ / ছাগল / ভেড়া / মুরগি / হাঁস / কবুতর / ঘোড়া / কুকুর / বিড়াল / খরগোশ / পাখি
- ALL Bengali fields MUST be in Bengali script.
- If NOT an animal: {"status": "error", "error": "Not an animal", "verdictBengali": "ছবিতে কোনো পশু/পাখি শনাক্ত করা যায়নি।"}
- NEVER default to cow. Identify the actual species.`;

/* ============================================================
   3. GEMINI VISION CALL
   ============================================================ */
async function callBreedGemini(imageBase64) {
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
                        { text: BD_BREED_PROMPT }
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
   4. SPECIES BENGALI MAP
   ============================================================ */
const SPECIES_BN = {
    cow: 'গরু', buffalo: 'মহিষ', goat: 'ছাগল', sheep: 'ভেড়া',
    chicken: 'মুরগি', duck: 'হাঁস', pigeon: 'কবুতর', horse: 'ঘোড়া',
    dog: 'কুকুর', cat: 'বিড়াল', rabbit: 'খরগোশ', bird: 'পাখি',
    fish: 'মাছ', unknown: 'অজানা'
};

const TRAIT_LABELS = {
    humpSize: '🐂 কুঁজ',
    dewlapStatus: '🦴 গলকম্বল',
    bodyStructure: '📐 শরীর',
    coatPattern: '🎨 রঙ',
    hornShape: '🦄 শিং',
    earType: '👂 কান'
};

/* ============================================================
   5. RESULT RENDERING — Premium UI
   ============================================================ */
function renderBreedResult(data) {
    const resultEl = _elBD('bdResult');
    if (!resultEl) return;

    /* ---------- ERROR STATE ---------- */
    if (data.status === 'error' || data.error) {
        resultEl.innerHTML = `
            <div style="background:#fff1f2;border:1.5px solid #fca5a5;border-radius:20px;padding:28px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;">
                <div style="width:56px;height:56px;background:#fee2e2;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;color:#dc2626;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3 style="margin:0;font-size:16px;font-weight:800;color:#991b1b;">Could Not Detect Animal</h3>
                <p style="margin:0;font-size:13px;color:#7f1d1d;line-height:1.6;">${escapeHtmlBD(data.error || data.verdictBengali || 'Please try a clearer photo with the animal fully visible.')}</p>
                <button onclick="rescanBreed()" style="margin-top:4px;padding:10px 24px;background:#dc2626;color:#fff;border:none;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-redo" style="margin-right:6px;"></i>Try Again
                </button>
            </div>
        `;
        resultEl.style.display = 'flex';
        resultEl.style.flexDirection = 'column';
        return;
    }

    const ba      = data.breedAnalysis || {};
    const hi      = data.healthIntegrity || {};
    const buying  = data.buyingRecommendation || {};
    const traits  = ba.physicalTraitsObserved || {};
    const species = (data.species || 'unknown').toLowerCase();
    const speciesBn = data.speciesBengali || SPECIES_BN[species] || '\u0985\u099c\u09be\u09a8\u09be';

    /* ---------- RISK COLOURS ---------- */
    const riskLevel  = (hi.riskLevel || 'Low').toLowerCase();
    const riskColor  = riskLevel === 'high' ? '#dc2626' : riskLevel === 'medium' ? '#d97706' : '#059669';
    const riskBg     = riskLevel === 'high' ? '#fff1f2' : riskLevel === 'medium' ? '#fffbeb' : '#f0fdf4';
    const riskBorder = riskLevel === 'high' ? '#fca5a5' : riskLevel === 'medium' ? '#fcd34d' : '#86efac';
    const riskIcon   = riskLevel === 'high' ? 'fa-triangle-exclamation' : riskLevel === 'medium' ? 'fa-circle-exclamation' : 'fa-circle-check';

    /* ---------- CONFIDENCE ---------- */
    const confidence = ba.confidenceScorePercentage || 0;
    const confColor  = confidence >= 80 ? '#059669' : confidence >= 60 ? '#d97706' : '#dc2626';
    const confBg     = confidence >= 80 ? '#dcfce7' : confidence >= 60 ? '#fef9c3' : '#fee2e2';

    /* ---------- ORIGIN BADGE ---------- */
    const originText = (ba.originType || '').toLowerCase();
    const originBg   = originText.includes('foreign') ? '#eff6ff' : originText.includes('cross') ? '#faf5ff' : '#f0fdf4';
    const originTxt  = originText.includes('foreign') ? '#1d4ed8' : originText.includes('cross') ? '#7c3aed' : '#15803d';
    const originBdr  = originText.includes('foreign') ? '#93c5fd' : originText.includes('cross') ? '#c4b5fd' : '#86efac';

    /* ---------- BUY BANNER ---------- */
    const shouldBuy = buying.shouldBuy;
    let bannerHTML = '';
    if (shouldBuy === true) {
        bannerHTML = `<div style="background:linear-gradient(135deg,#dcfce7,#d1fae5);border:1.5px solid #86efac;border-radius:18px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;"><div style="width:40px;height:40px;min-width:40px;background:#059669;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;box-shadow:0 4px 12px rgba(5,150,105,0.35);"><i class="fas fa-circle-check"></i></div><div><div style="font-size:13px;font-weight:800;color:#14532d;margin-bottom:4px;">\u2705 \u0995\u09c7\u09a8\u09be\u09b0 \u099c\u09a8\u09cd\u09af \u0989\u09aa\u09af\u09c1\u0995\u09cd\u09a4</div><div style="font-size:12px;color:#166534;line-height:1.6;">${escapeHtmlBD(buying.recommendationBengali || '\u09aa\u09cd\u09b0\u09be\u09a3\u09c0\u099f\u09bf \u09b8\u09cd\u09ac\u09be\u09ad\u09be\u09ac\u09bf\u0995 \u09cb \u09b8\u09c1\u09b8\u09cd\u09a5 \u0985\u09ac\u09b8\u09cd\u09a5\u09be\u09df \u0986\u099b\u09c7\u0964')}</div></div></div>`;
    } else if (shouldBuy === 'caution' || riskLevel === 'medium') {
        bannerHTML = `<div style="background:linear-gradient(135deg,#fef9c3,#fef3c7);border:1.5px solid #fcd34d;border-radius:18px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;"><div style="width:40px;height:40px;min-width:40px;background:#d97706;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;box-shadow:0 4px 12px rgba(217,119,6,0.35);"><i class="fas fa-triangle-exclamation"></i></div><div><div style="font-size:13px;font-weight:800;color:#78350f;margin-bottom:4px;">\u26a0\ufe0f \u09b8\u09a4\u09b0\u09cd\u0995\u09a4\u09be\u09b0 \u09b8\u09be\u09a5\u09c7 \u0995\u09bf\u09a8\u09c1\u09a8</div><div style="font-size:12px;color:#92400e;line-height:1.6;">${escapeHtmlBD(buying.recommendationBengali || '\u0995\u09bf\u099b\u09c1 \u09b8\u09a4\u09b0\u09cd\u0995\u09a4\u09be\u09b0 \u09b2\u0995\u09cd\u09b7\u09a3 \u09b0\u09df\u09c7\u099b\u09c7\u0964 \u09ad\u09c7\u099f\u09c7\u09b0\u09bf\u09a8\u09be\u09b0\u09bf\u09df\u09be\u09a8\u09c7\u09b0 \u09aa\u09b0\u09be\u09ae\u09b0\u09cd\u09b6 \u09a8\u09bf\u09a8\u0964')}</div></div></div>`;
    } else if (shouldBuy === false || hi.isArtificiallyFattened || riskLevel === 'high') {
        bannerHTML = `<div style="background:linear-gradient(135deg,#fff1f2,#fee2e2);border:2px solid #fca5a5;border-radius:18px;padding:18px 20px;display:flex;align-items:flex-start;gap:14px;"><div style="width:40px;height:40px;min-width:40px;background:#dc2626;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;box-shadow:0 4px 12px rgba(220,38,38,0.35);"><i class="fas fa-triangle-exclamation"></i></div><div><div style="font-size:13px;font-weight:800;color:#7f1d1d;margin-bottom:4px;">\ud83d\udea8 HIGH RISK \u2014 \u0995\u09c7\u09a8\u09be\u09b0 \u09aa\u09b0\u09be\u09ae\u09b0\u09cd\u09b6 \u09a6\u09c7\u0993\u09df\u09be \u09b9\u099a\u09cd\u099b\u09c7 \u09a8\u09be</div><div style="font-size:12px;color:#991b1b;line-height:1.6;">${escapeHtmlBD(buying.recommendationBengali || '\u0995\u09c3\u09a4\u09cd\u09b0\u09bf\u09ae \u09ae\u09cb\u099f\u09be\u09a4\u09be\u099c\u09be\u0995\u09b0\u09a3 \u09b8\u09a8\u09cd\u09a6\u09c7\u09b9\u0964 \u0995\u09cd\u09b0\u09df\u09c7\u09b0 \u0986\u0997\u09c7 \u09aa\u09b6\u09c1 \u099a\u09bf\u0995\u09bf\u09ce\u09b8\u0995\u09c7\u09b0 \u09aa\u09b0\u09be\u09ae\u09b0\u09cd\u09b6 \u09a8\u09bf\u09a8\u0964')}</div></div></div>`;
    }

    /* ---------- SCANNED IMAGE ---------- */
    const userImageHTML = bdSelectedImage ? `
        <div style="border-radius:20px;overflow:hidden;border:2px solid #e0f0f2;box-shadow:0 8px 24px rgba(3,93,105,0.12);">
            <img src="${bdSelectedImage}" alt="Analyzed Animal" style="width:100%;max-height:240px;object-fit:cover;display:block;" />
            <div style="background:linear-gradient(135deg,#035D69,#088F8F);padding:10px 16px;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-microchip" style="color:#fff;font-size:12px;opacity:0.9;"></i>
                <span style="font-size:11px;font-weight:700;color:#fff;letter-spacing:0.5px;text-transform:uppercase;">AI Analysis Complete</span>
            </div>
        </div>` : '';

    /* ---------- PHYSICAL TRAITS ---------- */
    const traitEntries = Object.entries(traits).filter(([, val]) => val);
    const traitsHTML = traitEntries.length ? `
        <div style="background:#fff;border:1.5px solid #e0f0f2;border-radius:20px;padding:20px;box-shadow:0 4px 16px rgba(3,93,105,0.05);">
            <div style="font-size:11px;font-weight:800;color:#088F8F;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-microscope"></i> Physical Traits Observed
            </div>
            ${traitEntries.map(([key, val], i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;${i < traitEntries.length-1 ? 'border-bottom:1px dashed #e0f0f2;' : ''}font-size:13px;">
                <span style="color:#64748b;font-weight:600;">${TRAIT_LABELS[key] || '\u2022 ' + key}</span>
                <span style="font-weight:700;color:#035D69;text-align:right;max-width:55%;">${escapeHtmlBD(val)}</span>
            </div>`).join('')}
        </div>` : '';

    /* ---------- RED FLAGS ---------- */
    const redFlagsHTML = Array.isArray(hi.detectedRedFlags) && hi.detectedRedFlags.length ? `
        <div style="background:#fff1f2;border:1.5px solid #fca5a5;border-radius:20px;padding:20px;box-shadow:0 4px 16px rgba(220,38,38,0.06);">
            <div style="font-size:11px;font-weight:800;color:#dc2626;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-flag"></i> Detected Red Flags
            </div>
            ${hi.detectedRedFlags.map(f => `
            <div style="display:flex;align-items:flex-start;gap:10px;font-size:13px;color:#7f1d1d;line-height:1.5;margin-bottom:8px;">
                <i class="fas fa-xmark" style="color:#dc2626;margin-top:2px;flex-shrink:0;"></i>
                ${escapeHtmlBD(f)}
            </div>`).join('')}
        </div>` : '';

    /* ---------- DIY GUIDE ---------- */
    const diyHTML = Array.isArray(data.diyPhysicalVerificationGuide) && data.diyPhysicalVerificationGuide.length ? `
        <div style="background:#eff6ff;border:1.5px solid #93c5fd;border-left:4px solid #2563eb;border-radius:20px;padding:20px;box-shadow:0 4px 16px rgba(37,99,235,0.06);">
            <div style="font-size:11px;font-weight:800;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-magnifying-glass"></i> \u09a8\u09bf\u099c\u09c7\u0987 \u09af\u09be\u099a\u09be\u0987 \u0995\u09b0\u09c1\u09a8 (DIY Guide)
            </div>
            ${data.diyPhysicalVerificationGuide.map((step, i) => `
            <div style="display:flex;align-items:flex-start;gap:12px;font-size:13px;color:#1e3a8a;line-height:1.6;margin-bottom:10px;">
                <span style="min-width:24px;height:24px;background:#2563eb;color:#fff;border-radius:50%;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
                ${escapeHtmlBD(step)}
            </div>`).join('')}
        </div>` : '';

    /* ---------- VERDICT ---------- */
    const verdictHTML = data.verdictBengali ? `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fcd34d;border-left:4px solid #d97706;border-radius:20px;padding:20px;">
            <div style="font-size:11px;font-weight:800;color:#b45309;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-scroll"></i> \ud83c\uddbd\ud83c\udde9 \u09b8\u09be\u09b0\u09b8\u0982\u0995\u09cd\u09b7\u09c7\u09aa (\u09ac\u09be\u0982\u09b2\u09be)
            </div>
            <p style="margin:0;font-size:13.5px;color:#78350f;line-height:1.8;font-weight:500;">${escapeHtmlBD(data.verdictBengali)}</p>
        </div>` : '';

    /* ---------- FULL RENDER ---------- */
    resultEl.innerHTML = `
        ${bannerHTML}
        ${userImageHTML}

        <div style="background:#fff;border:1.5px solid #e0f0f2;border-radius:20px;overflow:hidden;box-shadow:0 4px 20px rgba(3,93,105,0.08);">
            <div style="background:linear-gradient(135deg,#035D69,#088F8F);padding:18px 20px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:42px;height:42px;background:rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;">\ud83d\udc3e</div>
                    <div>
                        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.7px;">\u09b6\u09a8\u09be\u0995\u09cd\u09a4\u0995\u09c3\u09a4 \u09aa\u09cd\u09b0\u09be\u09a3\u09c0</div>
                        <div style="font-size:20px;font-weight:800;color:#fff;line-height:1.2;">${escapeHtmlBD(speciesBn)}</div>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.15);border-radius:10px;padding:6px 12px;font-size:11px;font-weight:700;color:#fff;display:flex;align-items:center;gap:5px;">
                    <i class="fas fa-check-circle"></i> Identified
                </div>
            </div>
            <div style="padding:20px;display:flex;flex-direction:column;gap:16px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div>
                        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px;">Breed / \u099c\u09be\u09a4</div>
                        <div style="font-size:20px;font-weight:800;color:#035D69;">${escapeHtmlBD(ba.detectedBreed || 'Unknown')}</div>
                    </div>
                    <div style="background:${originBg};color:${originTxt};border:1.5px solid ${originBdr};border-radius:10px;padding:6px 14px;font-size:11.5px;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:5px;">
                        <i class="fas fa-location-dot"></i> ${escapeHtmlBD(ba.originType || 'Unknown')}
                    </div>
                </div>
                <div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="font-size:12px;font-weight:700;color:#64748b;">Confidence Score</span>
                        <span style="font-size:15px;font-weight:800;color:${confColor};">${confidence}%</span>
                    </div>
                    <div style="height:10px;background:#eef7f8;border-radius:6px;overflow:hidden;">
                        <div style="width:${confidence}%;height:100%;background:linear-gradient(90deg,${confColor},${confColor}bb);border-radius:6px;"></div>
                    </div>
                    <div style="margin-top:6px;display:flex;justify-content:flex-end;">
                        <div style="background:${confBg};color:${confColor};border-radius:6px;padding:2px 10px;font-size:10px;font-weight:700;">
                            ${confidence >= 80 ? '\u2705 High Confidence' : confidence >= 60 ? '\u26a0\ufe0f Moderate' : '\u274c Low Confidence'}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div style="background:${riskBg};border:1.5px solid ${riskBorder};border-radius:20px;padding:20px;box-shadow:0 4px 16px rgba(3,93,105,0.06);">
            <div style="font-size:11px;font-weight:800;color:${riskColor};text-transform:uppercase;letter-spacing:0.8px;margin-bottom:14px;display:flex;align-items:center;gap:6px;">
                <i class="fas fa-heart-pulse"></i> Health Integrity Check
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.6);border-radius:12px;padding:12px 14px;">
                    <span style="font-size:12.5px;color:#475569;font-weight:600;">\u0995\u09c3\u09a4\u09cd\u09b0\u09bf\u09ae \u09ae\u09cb\u099f\u09be\u09a4\u09be\u099c\u09be\u0995\u09b0\u09a3</span>
                    <span style="font-size:13px;font-weight:800;color:${riskColor};">${hi.isArtificiallyFattened ? '\u26a0\ufe0f \u09b8\u09a8\u09be\u0995\u09cd\u09a4 \u09b9\u09df\u09c7\u099b\u09c7' : '\u2705 \u09aa\u09be\u0993\u09df\u09be \u09af\u09be\u09df\u09a8\u09bf'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.6);border-radius:12px;padding:12px 14px;">
                    <span style="font-size:12.5px;color:#475569;font-weight:600;">Risk Level</span>
                    <span style="font-size:13px;font-weight:800;color:${riskColor};display:flex;align-items:center;gap:5px;">
                        <i class="fas ${riskIcon}"></i> ${escapeHtmlBD(hi.riskLevel || 'Low').toUpperCase()}
                    </span>
                </div>
                ${hi.overallHealthSummaryBengali ? `<div style="background:rgba(255,255,255,0.6);border-radius:12px;padding:12px 14px;"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">\u09b8\u09cd\u09ac\u09be\u09b8\u09cd\u09a5\u09cd\u09af \u09b8\u09be\u09b0\u09b8\u0982\u0995\u09cd\u09b7\u09c7\u09aa</div><p style="margin:0;font-size:13px;color:#334155;line-height:1.7;">${escapeHtmlBD(hi.overallHealthSummaryBengali)}</p></div>` : ''}
            </div>
        </div>

        ${traitsHTML}
        ${redFlagsHTML}
        ${verdictHTML}
        ${diyHTML}

        <button type="button" onclick="rescanBreed()"
            style="width:100%;padding:16px 20px;background:linear-gradient(135deg,#035D69,#088F8F);color:#fff;border:none;border-radius:18px;font-size:14px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 6px 20px rgba(3,93,105,0.3);letter-spacing:0.3px;">
            <i class="fas fa-redo"></i> \u0986\u09ac\u09be\u09b0 \u09b8\u09cd\u0995\u09cd\u09af\u09be\u09a8 \u0995\u09b0\u09c1\u09a8
        </button>
    `;

    resultEl.style.display = 'flex';
    resultEl.style.flexDirection = 'column';
    resultEl.style.gap = '16px';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   6. SAVE TO FIRESTORE
   ============================================================ */
async function saveBreedScan(scanData) {

    if (!bdCurrentPhone) return;
    try {
        await _fsBD()
            .collection('users')
            .doc(bdCurrentPhone)
            .collection('breed_history')
            .add({
                ...scanData,
                user_phone: bdCurrentPhone,
                scanned_at: firebase.firestore.FieldValue.serverTimestamp(),
                scanned_at_ms: Date.now()
            });
        console.log('✅ Breed scan saved');
    } catch (err) {
        console.warn('Breed save failed:', err.message);
    }
}

/* ============================================================
   7. SCAN FLOW
   ============================================================ */
async function startBreedScan() {
    if (!bdSelectedImage) return alert('Please select or take a photo first.');

    if (!bdCurrentPhone) {
        alert('Please login first.');
        window.location.href = 'login.html';
        return;
    }

    const scanBtn = _elBD('bdScanBtn');
    const preview = _elBD('bdPreview');
    const loading = _elBD('bdLoading');
    const result = _elBD('bdResult');

    scanBtn.disabled = true;
    preview.style.display = 'none';
    result.style.display = 'none';
    loading.style.display = 'flex';

    try {
        console.log('🐾 Analyzing animal...');
        const scanData = await callBreedGemini(bdSelectedImage);
        console.log('📋 Result:', scanData);

        loading.style.display = 'none';
        renderBreedResult(scanData);

        if (scanData.status !== 'error') saveBreedScan(scanData);

    } catch (err) {
        console.error('Scan error:', err);
        loading.style.display = 'none';
        preview.style.display = 'flex';
        alert('Analysis failed: ' + (err.message || 'Please try again.'));
    } finally {
        scanBtn.disabled = false;
    }
}

window.startBreedScan = startBreedScan;

function rescanBreed() {
    if (!bdSelectedImage) return;
    showBDPreview(bdSelectedImage);
}

window.rescanBreed = rescanBreed;
window.removeBDPreview = removeBDPreview;


/* ============================================================
   8. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    bdCurrentPhone = localStorage.getItem('userPhone') || sessionStorage.getItem('userPhone');
    if (!bdCurrentPhone) {
        window.location.href = 'login.html';
        return;
    }

    /* ---------- File inputs ---------- */
    ['bdCameraInput', 'bdGalleryInput'].forEach(id => {
        _elBD(id)?.addEventListener('change', handleBDImageSelect);
    });

    /* ---------- Image field: click / drag / drop ---------- */
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

    /* ---------- Paste ---------- */
    document.addEventListener('paste', (e) => {
        const imageItem = Array.from(e.clipboardData?.items || [])
            .find(item => item.type.indexOf('image') !== -1);
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();
        handleBDImage(file);
    });

    /* ---------- Prevent browser opening dropped image on whole page ---------- */
    ['dragover', 'drop'].forEach(evt => {
        document.addEventListener(evt, (e) => {
            if (imageField && !imageField.classList.contains('hidden')) {
                e.preventDefault();
            }
        });
    });

    console.log('✅ Multi-Species Breed Detection ready v3.1');
});
