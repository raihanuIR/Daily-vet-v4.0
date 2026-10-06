/* ============================================================
   DailyVet — PR Scanner
   AI Prescription & Medical Report Scanner
   ✅ Gemini Vision API
   ✅ Firestore medical_history subcollection
   ✅ Bengali summary for farmers
   ✅ Firebase caching (loaded scans = no API re-call)
   ✅ Delete history item
   ============================================================ */

/* ============================================================
   0. STATE & CONFIG
   ============================================================ */
let currentUserPhone = null;
let selectedImageBase64 = null;

const GEMINI_API_KEY = 'AQ.Ab8RN6JpOCNQXVWw4BqZz-qiUPTxB6pSvFUUd1E1lrhiRWpdQg';
const GEMINI_VISION_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT_MS = 30000;
const MAX_IMAGE_MB = 10;

const IMAGE_MAX_DIMENSION = 1600;
const IMAGE_JPEG_QUALITY = 0.85;

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

/* ============================================================
   1. SYSTEM PROMPT (Prescription Scanner)
   ============================================================ */
const PR_SCANNER_PROMPT = `You are an expert veterinary document scanner for DailyVet (Bangladesh).

Analyze the attached image of a hand-written or printed veterinary prescription or medical report.

Your task:
1. Identify the document type (Prescription / Medical Report / Lab Report / Vaccine Card / Other)
2. Extract the following info if present:
   - Doctor or Hospital name
   - Animal type (cow, goat, chicken, dog, cat, etc.)
   - Detected disease or condition
   - List of medicines (name, dosage, frequency, duration, instructions)
   - Additional advice
3. Translate everything into clear, easy-to-read BENGALI for a local farmer.

Return ONLY a valid JSON object with this exact structure:
{
  "document_type": "Prescription",
  "doctor_or_hospital": "Upazila Veterinary Hospital",
  "animal_type": "cow",
  "detected_disease": "Foot and Mouth Disease (FMD)",
  "medicines": [
    {
      "name": "FMD Vet Vaccine",
      "dosage": "5 ml",
      "frequency": "Once a day",
      "duration": "Single dose",
      "instructions": "Inject subcutaneously as advised by the vet."
    }
  ],
  "additional_advice": "Keep the infected animal isolated and wash the hooves with potassium permanganate solution.",
  "raw_llm_response_bengali": "উপজেলা ভেটেরিনারি হাসপাতালের প্রেসক্রিপশন অনুযায়ী পশুর ক্ষুরা রোগ সনাক্ত হয়েছে। ওষুধের নাম: এফএমডি ভেট ভ্যাকসিন, ডোজ: ৫ মিলি, নিয়ম: চামড়ার নিচে পুশ করতে হবে। অতিরিক্ত পরামর্শ: আক্রান্ত পশুকে আলাদা রাখুন এবং পটাশিয়াম পারম্যাঙ্গানেট পানি দিয়ে ক্ষুর ধুয়ে দিন।"
}

IMPORTANT RULES:
- Return ONLY the JSON. No markdown, no explanation, no code fences.
- If a field is not present in the document, use empty string "" or empty array [].
- Bengali text must be in Bengali script (not transliteration).
- Animal type must be lowercase English (cow, goat, chicken, dog, cat, buffalo, sheep, duck, pigeon, etc.)
- If the image is NOT a medical document, return: {"document_type": "Unknown", "error": "Not a medical document"}`;

/* ============================================================
   2. HELPERS
   ============================================================ */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function formatDate(timestamp) {
    if (!timestamp) return '';
    const d = (timestamp && typeof timestamp.toDate === 'function')
        ? timestamp.toDate()
        : new Date(timestamp);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
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
   3. IMAGE HANDLING
   ============================================================ */
function openCamera() { _el('cameraInput')?.click(); }
function openGallery() { _el('galleryInput')?.click(); }

window.openCamera = openCamera;
window.openGallery = openGallery;

function compressImageToDataURL(file, maxDim = IMAGE_MAX_DIMENSION, quality = IMAGE_JPEG_QUALITY) {
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

async function handleImageSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        alert(`Image too large. Please choose under ${MAX_IMAGE_MB}MB.`);
        event.target.value = '';
        return;
    }

    try {
        selectedImageBase64 = await compressImageToDataURL(file);
        showPreview(selectedImageBase64);
    } catch (err) {
        alert('Failed to read image: ' + err.message);
    }
}

function showPreview(dataURL) {
    const preview = _el('prPreview');
    const img = _el('previewImage');
    if (!preview || !img) return;

    img.src = dataURL;
    preview.style.display = 'flex';
    _el('prResult').style.display = 'none';
    _el('prLoading').style.display = 'none';
}

function removePreview() {
    selectedImageBase64 = null;
    _el('prPreview').style.display = 'none';
    _el('prResult').style.display = 'none';
    _el('prLoading').style.display = 'none';
    _el('cameraInput').value = '';
    _el('galleryInput').value = '';
}

window.removePreview = removePreview;

/* ============================================================
   4. GEMINI VISION API CALL
   ============================================================ */
async function callGeminiVision(imageBase64) {
    const url = `${GEMINI_API_URL}/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const imageData = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
    const mimeType = imageBase64.includes('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inline_data: { mime_type: mimeType, data: imageData } },
                        { text: PR_SCANNER_PROMPT }
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
   5. FIRESTORE SAVE & LOAD
   ============================================================ */
async function saveScanToFirestore(scanData) {
    if (!currentUserPhone) throw new Error('Not logged in');

    const docRef = _fs()
        .collection('users')
        .doc(currentUserPhone)
        .collection('medical_history')
        .doc();

    await docRef.set({
        ...scanData,
        scan_id: docRef.id,
        user_phone: currentUserPhone,
        scanned_at: firebase.firestore.FieldValue.serverTimestamp(),
        scanned_at_ms: Date.now()
    });

    console.log('✅ Scan saved:', docRef.id);
    return docRef.id;
}

async function loadHistory() {
    if (!currentUserPhone) return;

    const listEl = _el('historyList');
    if (!listEl) return;

    listEl.innerHTML = '<div class="pr-history-empty">Loading...</div>';

    try {
        const snap = await _fs()
            .collection('users')
            .doc(currentUserPhone)
            .collection('medical_history')
            .orderBy('scanned_at_ms', 'desc')
            .limit(20)
            .get();

        if (snap.empty) {
            listEl.innerHTML = '<div class="pr-history-empty">No scans yet. Take your first photo above.</div>';
            return;
        }

        listEl.innerHTML = snap.docs.map(doc => _historyItemHtml(doc)).join('');
        _attachHistoryHandlers(listEl);

    } catch (err) {
        console.error('History load error:', err);
        listEl.innerHTML = '<div class="pr-history-empty">Failed to load history</div>';
    }
}

window.loadHistory = loadHistory;

/* ---------- History item HTML ---------- */
function _historyItemHtml(doc) {
    const data = doc.data();
    const scanId = doc.id;

    const animalType = data.animal_type ? data.animal_type.toUpperCase() : '';
    const docType = data.document_type || 'Scan';
    const title = animalType ? `${animalType} — ${docType}` : docType;

    const disease = data.detected_disease || '';
    const medsCount = Array.isArray(data.medicines) ? data.medicines.length : 0;
    const dateStr = formatDate(data.scanned_at_ms);

    const riskColor = data.detected_disease ? '#dc2626' : '#059669';
    const riskBg = data.detected_disease ? '#fff1f2' : '#f0fdf4';
    const riskBorder = data.detected_disease ? '#fca5a5' : '#86efac';
    const riskIcon = data.detected_disease ? 'fa-triangle-exclamation' : 'fa-circle-check';

    return `
        <div class="pr-history-item" data-scan-id="${scanId}">
            <div class="pr-history-item-bar"></div>
            <div class="pr-history-item-body">
                <div class="pr-history-item-header">
                    <div class="pr-history-item-title">${escapeHtml(title)}</div>
                    <div class="pr-history-item-date">${dateStr}</div>
                </div>
                ${disease ? `
                <div style="display:flex;align-items:flex-start;gap:7px;font-size:12px;color:${riskColor};font-weight:600;background:${riskBg};border:1px solid ${riskBorder};border-radius:9px;padding:6px 10px;line-height:1.4;">
                    <i class="fas ${riskIcon}" style="margin-top:1px;flex-shrink:0;"></i>
                    ${escapeHtml(disease)}
                </div>` : `
                <div style="font-size:11.5px;color:#64748b;font-weight:500;">✓ No disease recorded</div>`}
                <div class="pr-history-item-footer">
                    <div class="pr-history-item-meds">
                        <i class="fas fa-pills"></i>
                        ${medsCount} medicine${medsCount !== 1 ? 's' : ''}
                    </div>
                    <button class="pr-history-delete-btn" title="Delete this scan">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

/* ---------- Attach click handlers to history items ---------- */
function _attachHistoryHandlers(listEl) {
    listEl.querySelectorAll('.pr-history-item').forEach(item => {
        const scanId = item.dataset.scanId;
        if (!scanId) return;

        // Click on body → show detail
        item.addEventListener('click', async (e) => {
            if (e.target.closest('.pr-history-delete-btn')) return;
            const doc = await _fs()
                .collection('users')
                .doc(currentUserPhone)
                .collection('medical_history')
                .doc(scanId)
                .get();
            if (doc.exists) showHistoryDetail(doc.data(), scanId);
        });

        // Click on delete button → delete
        item.querySelector('.pr-history-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            // Re-fetch data for delete label
            _fs()
                .collection('users')
                .doc(currentUserPhone)
                .collection('medical_history')
                .doc(scanId)
                .get()
                .then(d => deleteScan(scanId, d.exists ? d.data() : null));
        });
    });
}

/* ============================================================
   6. RESULT RENDERING
   ============================================================ */
function _sectionHtml(label, value) {
    if (!value) return '';
    return `
        <div class="pr-result-section">
            <div class="pr-result-label">${label}</div>
            <div class="pr-result-value">${value}</div>
        </div>`;
}

function renderResult(data) {
    const resultEl = _el('prResult');
    if (!resultEl) return;

    if (!data || data.document_type === 'Unknown') {
        resultEl.innerHTML = `
            <div class="pr-result-header" style="background:linear-gradient(135deg,#d97706,#f59e0b);">
                <div style="width:40px;height:40px;min-width:40px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div>
                    <h3>Not Recognized</h3>
                    <div style="font-size:11px;opacity:0.85;font-weight:500;margin-top:2px;">Not a medical document</div>
                </div>
            </div>
            <div class="pr-result-section">
                <div class="pr-result-value" style="color:#64748b;">This doesn't look like a prescription or medical report. Please try a clearer photo.</div>
            </div>`;
        resultEl.style.display = 'flex';
        return;
    }

    const medsCount = Array.isArray(data.medicines) ? data.medicines.length : 0;

    /* ---------- Medicines ---------- */
    const medsHTML = Array.isArray(data.medicines) && data.medicines.length > 0
        ? data.medicines.map(med => `
            <div class="pr-medicine-card">
                <div class="pr-medicine-name">💊 ${escapeHtml(med.name || 'Unknown Medicine')}</div>
                ${med.dosage     ? `<div class="pr-medicine-detail"><i class="fas fa-syringe"></i><span><strong>ডোজ:</strong> ${escapeHtml(med.dosage)}</span></div>` : ''}
                ${med.frequency  ? `<div class="pr-medicine-detail"><i class="fas fa-clock"></i><span><strong>নিয়ম:</strong> ${escapeHtml(med.frequency)}</span></div>` : ''}
                ${med.duration   ? `<div class="pr-medicine-detail"><i class="fas fa-calendar-days"></i><span><strong>সময়কাল:</strong> ${escapeHtml(med.duration)}</span></div>` : ''}
                ${med.instructions ? `<div class="pr-medicine-detail"><i class="fas fa-circle-info"></i><span>${escapeHtml(med.instructions)}</span></div>` : ''}
            </div>`).join('')
        : '<div style="font-size:12px;color:#8ab8be;font-weight:600;padding:8px 0;">No medicines detected in this document</div>';

    resultEl.innerHTML = `
        <div class="pr-result-header">
            <div style="width:40px;height:40px;min-width:40px;background:rgba(255,255,255,0.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;">
                <i class="fas fa-check-circle"></i>
            </div>
            <div style="flex:1;">
                <h3>Scan Complete</h3>
                <div style="font-size:11px;opacity:0.85;font-weight:500;margin-top:2px;">${medsCount} medicine${medsCount !== 1 ? 's' : ''} detected</div>
            </div>
            <div style="background:rgba(255,255,255,0.2);border-radius:8px;padding:4px 10px;font-size:10px;font-weight:700;white-space:nowrap;">
                ${escapeHtml(data.document_type || 'Prescription')}
            </div>
        </div>

        ${data.doctor_or_hospital ? `
        <div class="pr-result-section">
            <div class="pr-result-label"><i class="fas fa-hospital"></i> Hospital / Doctor</div>
            <div class="pr-result-value">${escapeHtml(data.doctor_or_hospital)}</div>
        </div>` : ''}

        ${(data.animal_type || data.detected_disease) ? `
        <div class="pr-result-section">
            ${data.animal_type ? `
            <div class="pr-result-label"><i class="fas fa-paw"></i> Animal</div>
            <div style="margin-bottom:${data.detected_disease ? '12px' : '0'};">
                <span style="background:#eef7f8;color:#035D69;border:1px solid #b2e0e6;border-radius:8px;padding:4px 14px;font-size:12px;font-weight:800;">
                    ${escapeHtml(data.animal_type.toUpperCase())}
                </span>
            </div>` : ''}
            ${data.detected_disease ? `
            <div class="pr-result-label" style="color:#dc2626;"><i class="fas fa-stethoscope"></i> Detected Disease</div>
            <div style="display:flex;align-items:flex-start;gap:8px;background:#fff1f2;border:1px solid #fca5a5;border-radius:10px;padding:10px 12px;font-size:13px;font-weight:600;color:#7f1d1d;line-height:1.5;">
                <i class="fas fa-triangle-exclamation" style="color:#dc2626;margin-top:2px;flex-shrink:0;"></i>
                ${escapeHtml(data.detected_disease)}
            </div>` : ''}
        </div>` : ''}

        <div class="pr-result-section">
            <div class="pr-result-label"><i class="fas fa-pills"></i> Medicines (${medsCount})</div>
            ${medsHTML}
        </div>

        ${data.additional_advice ? `
        <div class="pr-result-section" style="background:#f0fdf4;border-color:#86efac;">
            <div class="pr-result-label" style="color:#059669;"><i class="fas fa-lightbulb"></i> Additional Advice</div>
            <div class="pr-result-value" style="color:#14532d;">${escapeHtml(data.additional_advice)}</div>
        </div>` : ''}

        ${data.raw_llm_response_bengali ? `
        <div class="pr-result-section" style="padding:0;border-color:#fcd34d;overflow:hidden;">
            <div style="padding:12px 16px 8px;">
                <div class="pr-result-label" style="color:#b45309;"><i class="fas fa-scroll"></i> 🇧🇩 বাংলা সারাংশ</div>
            </div>
            <div class="pr-bengali-summary" style="border-radius:0 0 14px 14px;border:none;margin:0;">${escapeHtml(data.raw_llm_response_bengali)}</div>
        </div>` : ''}
    `;
    resultEl.style.display = 'flex';
}

/* ============================================================
   7. SCAN FLOW
   ============================================================ */
async function startScan() {
    if (!selectedImageBase64) return alert('Please select or take a photo first.');

    if (!currentUserPhone) {
        alert('Please login first.');
        window.location.href = 'login.html';
        return;
    }

    const scanBtn = _el('scanBtn');
    const preview = _el('prPreview');
    const loading = _el('prLoading');
    const result = _el('prResult');
    const loadingText = _el('loadingText');

    scanBtn.disabled = true;
    preview.style.display = 'none';
    result.style.display = 'none';
    loading.style.display = 'flex';

    try {
        if (loadingText) loadingText.textContent = 'Analyzing prescription...';
        const scanData = await callGeminiVision(selectedImageBase64);
        console.log('📋 Scan result:', scanData);

        if (loadingText) loadingText.textContent = 'Saving to your history...';
        await saveScanToFirestore(scanData);

        loading.style.display = 'none';
        renderResult(scanData);
        loadHistory();

        selectedImageBase64 = null;
        _el('cameraInput').value = '';
        _el('galleryInput').value = '';

    } catch (err) {
        console.error('Scan error:', err);
        loading.style.display = 'none';
        preview.style.display = 'flex';
        alert('Scan failed: ' + (err.message || 'Please try again.'));
    } finally {
        scanBtn.disabled = false;
    }
}

window.startScan = startScan;

/* ============================================================
   8. SHOW HISTORY DETAIL
   ============================================================ */
function showHistoryDetail(data, scanId) {
    const resultEl = _el('prResult');
    if (!resultEl) return;

    resultEl.dataset.currentScanId = scanId || '';
    renderResult(data);
    resultEl.style.display = 'flex';
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.showHistoryDetail = showHistoryDetail;

/* ============================================================
   9. DELETE HISTORY ITEM
   ============================================================ */
async function deleteScan(scanId, scanInfo) {
    if (!scanId || !currentUserPhone) return;

    const label = scanInfo
        ? `${scanInfo.document_type || 'Scan'} — ${scanInfo.detected_disease || 'No disease'}`
        : 'this scan';

    if (!confirm(`🗑️ Delete ${label}?\n\nThis action cannot be undone.`)) return;
    if (!confirm('⚠️ Are you absolutely sure?')) return;

    try {
        await _fs()
            .collection('users')
            .doc(currentUserPhone)
            .collection('medical_history')
            .doc(scanId)
            .delete();

        console.log('✅ Deleted scan:', scanId);

        const resultEl = _el('prResult');
        if (resultEl && resultEl.dataset.currentScanId === scanId) {
            resultEl.style.display = 'none';
            resultEl.dataset.currentScanId = '';
        }

        loadHistory();

    } catch (err) {
        console.error('Delete error:', err);
        alert('❌ Failed to delete: ' + (err.message || 'Please try again.'));
    }
}

window.deleteScan = deleteScan;

/* ============================================================
   10. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    currentUserPhone = sessionStorage.getItem('userPhone');
    if (!currentUserPhone) {
        window.location.href = 'login.html';
        return;
    }

    _el('cameraInput')?.addEventListener('change', handleImageSelect);
    _el('galleryInput')?.addEventListener('change', handleImageSelect);

    loadHistory();

    console.log('✅ PR Scanner ready (with delete feature)');
});
