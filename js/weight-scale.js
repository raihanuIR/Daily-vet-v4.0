/* ============================================================
   DailyVet — Weight Scale Module
   ✅ Tape Measure Calculator (Schaeffer's Heart-Girth Formula)
   ✅ AI Camera & Photo Estimation (Gemini Vision)
   ✅ Image Paste (Ctrl+V) & Drag-and-Drop
   ✅ Live Real-time Calculation
   ✅ Seamless Integration with Feed Advisor (petWeight)
   ============================================================ */

/* ============================================================
   0. STATE + CONFIG
   ============================================================ */
let wsSelectedImage = null;
let wsEstimatedWeight = null;

const WS_GEMINI_KEYS = [
    'AQ.Ab8RN6JpOCNQXVWw4BqZz-qiUPTxB6pSvFUUd1E1lrhiRWpdQg',
    'AQ.Ab8RN6LYSx348eB177c-H-HGq90zlmX5hQD3KFOhitfCKz-Xkw',
    'AQ.Ab8RN6IVfRZ7Io9qpaWEWUhIHJhQjpsLxBpeC1duJN9MsJltlQ'
];
const WS_GEMINI_VISION_MODEL = 'gemini-3.5-flash-lite';
const WS_GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const WS_GEMINI_TIMEOUT_MS = 25000;
const WS_MAX_IMAGE_MB = 10;

const _el = id => document.getElementById(id);

/* ============================================================
   1. HELPERS
   ============================================================ */
function escapeHtmlWS(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function parseGeminiJSON(rawText) {
    try {
        return JSON.parse(rawText);
    } catch {
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[1] || match[0]);
        throw new Error('Could not parse AI response');
    }
}

function _setDisplay(ids, display) {
    (Array.isArray(ids) ? ids : [ids]).forEach(id => {
        const el = _el(id);
        if (el) el.style.display = display;
    });
}

function _clearInputs(ids) {
    ids.forEach(id => { const el = _el(id); if (el) el.value = ''; });
}

/* ============================================================
   2. AI WEIGHT ESTIMATION PROMPT
   ============================================================ */
const WS_WEIGHT_PROMPT = `You are an expert livestock weight estimator for DailyVet (Bangladesh).

Analyze this photo of a farm animal (cow, goat, buffalo, sheep) and estimate its LIVE WEIGHT.

STEPS:
1. Identify the animal type (cow, goat, buffalo, sheep, etc.)
2. Estimate body dimensions from the image proportions:
   - Heart Girth (chest circumference) in inches
   - Body Length (shoulder to tail base) in inches
3. Apply the standard formula:
   Weight (kg) = (Heart Girth² × Body Length) / 660

IMPORTANT:
- If the photo is unclear or the full body is not visible, use CONFIDENCE: LOW
- If animal is a calf/kid/lamb (young), adjust the estimation accordingly
- Give realistic ranges for Bangladeshi farm animals (Cattle: 120-450kg, Goat: 15-45kg, Buffalo: 250-600kg, Sheep: 15-40kg)

Return ONLY valid JSON:
{
  "animal_type": "cow",
  "estimated_weight_kg": 240,
  "weight_range_kg": "220-260",
  "estimated_girth_inch": 56,
  "estimated_length_inch": 51,
  "confidence": "HIGH",
  "body_condition": "Normal",
  "notes": "Adult cow, appears healthy with normal body condition.",
  "notes_bengali": "প্রাপ্তবয়স্ক গরু, স্বাভাবিক স্বাস্থ্য অবস্থায় আছে।"
}

Rules:
- Return ONLY the JSON, no markdown
- Confidence: HIGH / MED / LOW
- If NOT a farm animal, return: {"error": "Not a farm animal", "confidence": "LOW"}`;

/* ============================================================
   3. MODAL OPEN / CLOSE / RESET
   ============================================================ */
function openWeightScale() {
    const modal = _el('weightScaleModal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.classList.add('open');
    resetWeightScale();
    console.log('⚖️ Weight Scale opened');
}

function closeWeightScale() {
    const modal = _el('weightScaleModal');
    if (!modal) return;

    modal.style.display = 'none';
    modal.classList.remove('open');
    resetWeightScale();
}

function resetWeightScale() {
    wsSelectedImage = null;
    wsEstimatedWeight = null;

    // Tape tab
    _clearInputs(['wsGirth', 'wsLength']);
    const tapeResult = _el('wsTapeResult');
    if (tapeResult) tapeResult.style.display = 'none';
    const tapeWeight = _el('wsTapeWeight');
    if (tapeWeight) tapeWeight.textContent = '0';

    // AI tab
    _setDisplay(['wsAiPreview', 'wsAiLoading', 'wsAiResult'], 'none');
    const imageField = _el('wsImageField');
    if (imageField) imageField.style.display = 'flex';

    // File inputs
    _clearInputs(['wsCameraInput', 'wsGalleryInput']);

    // Apply button
    const applyBtn = _el('wsApplyBtn');
    if (applyBtn) applyBtn.disabled = true;

    switchWSTab('tape');
}

/* ============================================================
   4. TAB SWITCHING
   ============================================================ */
function switchWSTab(tab) {
    const tabTape = _el('wsTabTape');
    const tabAI = _el('wsTabAI');
    const contentTape = _el('wsContentTape');
    const contentAI = _el('wsContentAI');

    const isTape = tab === 'tape';

    if (tabTape) {
        tabTape.className = isTape
            ? 'flex-1 py-2 text-xs font-bold rounded-lg border-none cursor-pointer transition-all bg-white text-deep shadow-xs'
            : 'flex-1 py-2 text-xs font-bold rounded-lg border-none cursor-pointer transition-all bg-transparent text-mute';
    }
    if (tabAI) {
        tabAI.className = !isTape
            ? 'flex-1 py-2 text-xs font-bold rounded-lg border-none cursor-pointer transition-all bg-white text-deep shadow-xs'
            : 'flex-1 py-2 text-xs font-bold rounded-lg border-none cursor-pointer transition-all bg-transparent text-mute';
    }

    if (contentTape) contentTape.style.display = isTape ? 'flex' : 'none';
    if (contentAI) contentAI.style.display = !isTape ? 'flex' : 'none';
}

/* ============================================================
   5. TAPE MEASURE CALCULATOR (Schaeffer's Formula)
   ============================================================ */
function calculateWeight() {
    const girth = parseFloat(_el('wsGirth')?.value);
    const length = parseFloat(_el('wsLength')?.value);

    const resultBox = _el('wsTapeResult');
    const weightEl = _el('wsTapeWeight');
    const applyBtn = _el('wsApplyBtn');

    if (!girth || !length || girth <= 0 || length <= 0) {
        if (weightEl) weightEl.textContent = '0';
        if (resultBox) resultBox.style.display = 'none';
        wsEstimatedWeight = null;
        if (applyBtn) applyBtn.disabled = true;
        return;
    }

    // Schaeffer's Formula for livestock:
    // Live Weight (lbs) = (Heart Girth² × Body Length) / 300
    // Live Weight (kg) = (Heart Girth² × Body Length) / 660
    const roundedWeight = Math.round((girth * girth * length) / 660 * 10) / 10;
    wsEstimatedWeight = roundedWeight;

    if (weightEl) weightEl.textContent = roundedWeight.toFixed(1);
    if (resultBox) resultBox.style.display = 'flex';
    if (applyBtn) applyBtn.disabled = false;
}

/* ============================================================
   6. IMAGE HANDLING
   ============================================================ */
function openWeightCamera() { _el('wsCameraInput')?.click(); }
function openWeightGallery() { _el('wsGalleryInput')?.click(); }

function compressWSImage(file, maxDim = 1400, quality = 0.85) {
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

async function handleWSImage(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please provide an image file (JPG or PNG).');
        return;
    }
    if (file.size > WS_MAX_IMAGE_MB * 1024 * 1024) {
        alert(`Image too large. Please select an image under ${WS_MAX_IMAGE_MB}MB.`);
        return;
    }

    try {
        wsSelectedImage = await compressWSImage(file);
        showWSPreview(wsSelectedImage);
    } catch (err) {
        alert('Failed to read image: ' + err.message);
    }
}

function handleWSImageSelect(event) {
    const file = event.target?.files?.[0];
    if (file) handleWSImage(file);
    if (event.target) event.target.value = '';
}

/* Show preview */
function showWSPreview(dataURL) {
    const field = _el('wsImageField');
    if (field) field.style.display = 'none';

    const preview = _el('wsAiPreview');
    const previewImg = _el('wsPreviewImg');
    if (preview && previewImg) {
        previewImg.src = dataURL;
        preview.style.display = 'flex';
    }

    _setDisplay(['wsAiResult', 'wsAiLoading'], 'none');

    const applyBtn = _el('wsApplyBtn');
    if (applyBtn) applyBtn.disabled = true;
}

/* Remove preview */
function removeWSPreview() {
    wsSelectedImage = null;
    wsEstimatedWeight = null;

    _setDisplay(['wsAiPreview', 'wsAiResult', 'wsAiLoading'], 'none');
    const field = _el('wsImageField');
    if (field) field.style.display = 'flex';

    _clearInputs(['wsCameraInput', 'wsGalleryInput']);

    const applyBtn = _el('wsApplyBtn');
    if (applyBtn) applyBtn.disabled = true;
}

/* ============================================================
   7. AI WEIGHT SCAN
   ============================================================ */
async function scanWeightAI() {
    if (!wsSelectedImage) {
        alert('Please select or take an animal photo first.');
        return;
    }

    const scanBtn = _el('wsScanBtn');
    const preview = _el('wsAiPreview');
    const loading = _el('wsAiLoading');
    const aiResult = _el('wsAiResult');

    if (scanBtn) scanBtn.disabled = true;
    if (preview) preview.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (aiResult) aiResult.style.display = 'none';

    try {
        const result = await callWSGeminiVision(wsSelectedImage);
        console.log('🐄 AI weight result:', result);

        if (loading) loading.style.display = 'none';

        if (!result || result.error) {
            if (aiResult) {
                aiResult.innerHTML = `
                    <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex flex-col gap-1 text-center">
                        <div class="font-extrabold">⚠️ Could not detect animal</div>
                        <div class="text-[11px] text-rose-600">${result?.error || 'Please provide a clearer side-profile photo of standing livestock.'}</div>
                    </div>
                    <button type="button" class="mt-2 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border-none cursor-pointer" onclick="removeWSPreview()">Try Another Photo</button>`;
                aiResult.style.display = 'flex';
            }
            if (preview) preview.style.display = 'flex';
            return;
        }

        const weight = parseFloat(result.estimated_weight_kg) || 0;
        wsEstimatedWeight = weight;

        const confidenceColor = result.confidence === 'HIGH' ? '#10b981'
            : result.confidence === 'MED' ? '#d97706' : '#dc2626';

        if (aiResult) {
            aiResult.innerHTML = _buildAIResultHTML(result, weight, confidenceColor);
            aiResult.style.display = 'flex';
        }

        if (weight > 0) {
            const applyBtn = _el('wsApplyBtn');
            if (applyBtn) applyBtn.disabled = false;
        }

    } catch (err) {
        console.error('AI weight scan error:', err);
        if (loading) loading.style.display = 'none';
        if (preview) preview.style.display = 'flex';
        alert('AI estimation failed: ' + (err.message || 'Please try again.'));
    } finally {
        if (scanBtn) scanBtn.disabled = false;
    }
}

/* AI result HTML builder */
function _buildAIResultHTML(result, weight, confidenceColor) {
    const imageHTML = wsSelectedImage
        ? `<div class="mb-3 text-center"><img src="${wsSelectedImage}" alt="Scanned animal" class="max-h-40 rounded-xl mx-auto border border-line shadow-xs object-contain" /></div>`
        : '';

    const row = (label, value, style = '') =>
        `<div class="flex items-center justify-between py-1.5 border-b border-teal/15 text-xs">
            <span class="font-bold text-slate-700">${label}</span>
            <span class="font-extrabold text-slate-900"${style ? ` style="${style}"` : ''}>${value}</span>
        </div>`;

    return `
        ${imageHTML}
        <div class="flex flex-col gap-1 w-full text-left">
            ${row('🐄 Animal Type', escapeHtmlWS(result.animal_type || 'Livestock'))}
            ${row('⚖️ Estimated Weight', `${weight.toFixed(1)} kg`, 'color:#088F8F;font-size:16px;')}
            ${result.weight_range_kg ? row('📊 Realistic Range', escapeHtmlWS(result.weight_range_kg) + ' kg') : ''}
            ${row('🎯 AI Confidence', escapeHtmlWS(result.confidence || 'HIGH'), `color:${confidenceColor}`)}
            ${result.estimated_girth_inch ? row('📏 Estimated Girth', `${result.estimated_girth_inch}"`) : ''}
            ${result.estimated_length_inch ? row('📐 Estimated Length', `${result.estimated_length_inch}"`) : ''}
            ${result.notes_bengali || result.notes
                ? `<div class="mt-2.5 p-2.5 bg-white/80 border border-teal/20 rounded-xl text-xs text-slate-700 leading-relaxed">💡 ${escapeHtmlWS(result.notes_bengali || result.notes)}</div>`
                : ''}
        </div>
        <div class="mt-3 flex justify-center">
            <button type="button" class="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-deep rounded-xl text-xs font-bold border-none cursor-pointer flex items-center gap-1.5 transition-colors" onclick="rescanImage()">
                <i class="fas fa-redo text-teal"></i> Re-take / Rescan
            </button>
        </div>`;
}

function rescanImage() {
    if (!wsSelectedImage) return;
    showWSPreview(wsSelectedImage);
}

/* ============================================================
   8. GEMINI VISION CALL (with API key rotation)
   ============================================================ */
async function callWSGeminiVision(imageBase64) {
    const imageData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType = imageBase64.includes('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';

    let lastError = null;

    for (let i = 0; i < WS_GEMINI_KEYS.length; i++) {
        const apiKey = WS_GEMINI_KEYS[i];
        const url = `${WS_GEMINI_API_URL}/${WS_GEMINI_VISION_MODEL}:generateContent?key=${apiKey}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), WS_GEMINI_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: 'user',
                        parts: [
                            { inline_data: { mime_type: mimeType, data: imageData } },
                            { text: WS_WEIGHT_PROMPT }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.2,
                        maxOutputTokens: 1200,
                        topP: 1,
                        responseMimeType: 'application/json'
                    }
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                const rawText = (data.candidates?.[0]?.content?.parts || [])
                    .filter(pt => pt && pt.text && !pt.thought)
                    .map(pt => pt.text).join('');

                if (!rawText) throw new Error('Empty AI response');
                return parseGeminiJSON(rawText);
            }

            const errText = await response.text().catch(() => '');
            console.warn(`Gemini WS key ${i} failed (${response.status}):`, errText.slice(0, 200));
            lastError = new Error(`Gemini API error (${response.status})`);
        } catch (err) {
            clearTimeout(timeoutId);
            lastError = err;
        }
    }

    throw lastError || new Error('All AI weight estimation endpoints failed.');
}

/* ============================================================
   9. APPLY WEIGHT TO FEED ADVISOR
   ============================================================ */
function applyWeight() {
    if (!wsEstimatedWeight || wsEstimatedWeight <= 0) {
        alert('Please calculate or scan body weight first.');
        return;
    }

    const weightInput = _el('petWeight');
    if (weightInput) {
        weightInput.value = wsEstimatedWeight.toFixed(1);
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));
        weightInput.dispatchEvent(new Event('change', { bubbles: true }));
        weightInput.focus();
    }

    console.log('✅ Weight applied to Feed Advisor:', wsEstimatedWeight, 'kg');
    closeWeightScale();
    showWeightToast(wsEstimatedWeight);
}

function showWeightToast(weight) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #035D69;
        color: #ffffff;
        padding: 12px 24px;
        border-radius: 9999px;
        font-size: 13.5px;
        font-weight: 800;
        box-shadow: 0 10px 30px rgba(3, 93, 105, 0.35);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.3s ease;
        font-family: inherit;
    `;
    toast.innerHTML = `<i class="fas fa-check-circle text-emerald-400"></i> <span>Live Body Weight set to <strong>${weight.toFixed(1)} kg</strong></span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(15px)';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

/* ============================================================
   10. EXPOSE TO WINDOW IMMEDIATELY
   ============================================================ */
window.openWeightScale = openWeightScale;
window.closeWeightScale = closeWeightScale;
window.resetWeightScale = resetWeightScale;

window.switchWSTab = switchWSTab;
window.switchWsTab = switchWSTab;

window.calculateWeight = calculateWeight;
window.calculateTapeWeight = calculateWeight;

window.handleWSImage = handleWSImage;
window.handleWsImage = handleWSImageSelect;
window.handleWSImageSelect = handleWSImageSelect;

window.scanWeightAI = scanWeightAI;
window.runAiWeightScan = scanWeightAI;

window.applyWeight = applyWeight;
window.applyEstimatedWeight = applyWeight;

window.removeWSPreview = removeWSPreview;
window.rescanImage = rescanImage;

/* ============================================================
   11. DOM INITIALIZATION
   ============================================================ */
function initWeightScaleDOM() {
    /* File inputs */
    ['wsCameraInput', 'wsGalleryInput'].forEach(id => {
        const inp = _el(id);
        if (inp) inp.addEventListener('change', handleWSImageSelect);
    });

    /* Live calculation on input */
    ['wsGirth', 'wsLength'].forEach(id => {
        const inp = _el(id);
        if (inp) {
            inp.addEventListener('input', calculateWeight);
            inp.addEventListener('change', calculateWeight);
        }
    });

    /* ESC key to close modal */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = _el('weightScaleModal');
        if (modal && modal.style.display === 'flex') closeWeightScale();
    });

    /* Click outside modal box to close */
    const modal = _el('weightScaleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeWeightScale();
        });
    }

    /* Paste support (Ctrl+V) — only when AI tab is active */
    document.addEventListener('paste', (e) => {
        const modalEl = _el('weightScaleModal');
        if (!modalEl || modalEl.style.display !== 'flex') return;

        const aiContent = _el('wsContentAI');
        if (!aiContent || aiContent.style.display === 'none') return;

        const imageItem = Array.from(e.clipboardData?.items || [])
            .find(item => item.type.indexOf('image') !== -1);
        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        e.preventDefault();
        console.log('📋 Pasted image:', (file.size / 1024).toFixed(1), 'KB');
        handleWSImage(file);
    });

    /* Drag & Drop */
    const imageField = _el('wsImageField');
    if (imageField) {
        imageField.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageField.classList.add('border-teal', 'bg-soft');
        });
        imageField.addEventListener('dragleave', (e) => {
            e.preventDefault();
            imageField.classList.remove('border-teal', 'bg-soft');
        });
        imageField.addEventListener('drop', (e) => {
            e.preventDefault();
            imageField.classList.remove('border-teal', 'bg-soft');
            const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
            if (file) handleWSImage(file);
        });
    }

    console.log('✅ Weight Scale initialized');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWeightScaleDOM);
} else {
    initWeightScaleDOM();
}