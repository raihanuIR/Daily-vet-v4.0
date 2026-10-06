// ═══════════════════════════════════════════════════════════
// DAILYVET AI VET ASSISTANT  v7.19 FINAL (cleaned + optimized)
// Triple Gemini + Groq + OpenRouter | Voice | History | Vet Finder
// Fast Race | Adaptive Triage | Anti-Hindi | Medical Safety | KB/DB
// ═══════════════════════════════════════════════════════════

// ── STATE ──
let userName = 'User';
let userPetType = null;
let cachedUserPhone = null;
let cachedUserPhoto = null;
let unsubscribeUserPhoto = null;
let isProcessing = false;
let lastMessageTime = 0;
let selectedImageData = null;
let conversationHistory = [];
const MIN_MESSAGE_INTERVAL = 2000;
const MAX_HISTORY_TURNS = 8;

// 🩺 TRIAGE
const DEFAULT_TRIAGE_ROUNDS = 2;
const MIN_TRIAGE_ROUNDS = 0;
const MAX_TRIAGE_ROUNDS = 3;
let triageRounds = 0;
let triageLimit = DEFAULT_TRIAGE_ROUNDS;

function _countSymptomSignals(text) {
    if (!text || typeof SYMPTOM_KEYWORDS !== 'object' || !SYMPTOM_KEYWORDS) return 0;
    const lower = text.toLowerCase();
    let count = 0;
    try {
        for (const keywords of Object.values(SYMPTOM_KEYWORDS)) {
            if (Array.isArray(keywords) && keywords.some(kw => findKeywordIndex(lower, String(kw).toLowerCase()) !== -1)) count++;
        }
    } catch (_) {}
    return count;
}
const _DURATION_HINT_RE = /\d+\s*(din|day|days|diner|সপ্তাহ|week|weeks|ghonta|hour|hours|mash|month|months|রাত|রাত্রি|দিন)|onekdin|অনেকদিন|onek\s*din|long\s*time|koyekdin|কয়েকদিন/i;

function computeTriageLimit({ text, species, symptom, mood, isEmergency }) {
    if (isEmergency) return MIN_TRIAGE_ROUNDS;
    if (mood === 'urgent') return 1;
    const wordCount = (text || '').trim().split(/\s+/).filter(Boolean).length;
    const signalCount = _countSymptomSignals(text) + (_DURATION_HINT_RE.test(text || '') ? 1 : 0);
    if (signalCount >= 3 || wordCount >= 25) return 1;
    if (signalCount <= 1 && wordCount <= 6 && (species || symptom)) return MAX_TRIAGE_ROUNDS;
    return DEFAULT_TRIAGE_ROUNDS;
}

const _newMemory = () => ({ currentPet: null, currentDisease: null, symptoms: [], mentionedPets: [], userMood: 'neutral' });
let topicMemory = _newMemory();
let awaitingVetSpecies = false;

// ── Small helpers ──
const _el = id => document.getElementById(id);
const _scrollChatToBottom = () => {
    const shell = document.querySelector('.ai-container');
    if (shell) shell.scrollTop = shell.scrollHeight;
};
const _scrollToBottom = _scrollChatToBottom;

const _sleep = ms => new Promise(r => setTimeout(r, ms));
const _reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const _has = (text, list) => { const l = (text || '').toLowerCase(); return list.some(k => l.includes(k.toLowerCase())); };
const _nl = t => t.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const _fs = () => firebase.firestore();
const VET_HOTLINE = { bn: '\n\n📞 ২৪/৭ হটলাইন: ১৬৩৫৮', en: '\n\n📞 24/7 Helpline: 16358' };

// ═══════════════════════════════════════════════════════════
// 👤 USER PHOTO HELPERS
// ═══════════════════════════════════════════════════════════
async function getUserPhoto() {
    const phone = cachedUserPhone || sessionStorage.getItem('userPhone');
    if (!phone) return '';
    if (cachedUserPhoto !== null) return cachedUserPhoto;
    try {
        const doc = await _fs().collection('users').doc(phone).get();
        if (doc.exists) {
            cachedUserPhoto = doc.data().photoURL || '';
            return cachedUserPhoto;
        }
    } catch (err) {
        console.warn('User photo fetch failed:', err.message);
    }
    cachedUserPhoto = '';
    return '';
}

function listenToUserPhoto() {
    const phone = sessionStorage.getItem('userPhone');
    if (!phone) return;
    if (unsubscribeUserPhoto) unsubscribeUserPhoto();
    try {
        unsubscribeUserPhoto = _fs()
            .collection('users')
            .doc(phone)
            .onSnapshot(doc => {
                if (doc.exists) {
                    cachedUserPhone = phone;
                    cachedUserPhoto = doc.data().photoURL || '';
                    document.querySelectorAll('.message.user-message .user-avatar').forEach(el => {
                        el.innerHTML = cachedUserPhoto
                            ? `<img src="${cachedUserPhoto}" alt="${escapeHtml(userName)}" />`
                            : userName.charAt(0).toUpperCase();
                    });
                }
            });
    } catch (err) {
        console.warn('Photo listener failed:', err.message);
    }
}

// ── API CONFIG ──
const GEMINI_API_KEY   = 'AQ.Ab8RN6JpOCNQXVWw4BqZz-qiUPTxB6pSvFUUd1E1lrhiRWpdQg';
const GEMINI_API_KEY_2 = 'AQ.Ab8RN6LYSx348eB177c-H-HGq90zlmX5hQD3KFOhitfCKz-Xkw';
const GEMINI_API_KEY_3 = 'AQ.Ab8RN6IVfRZ7Io9qpaWEWUhIHJhQjpsLxBpeC1duJN9MsJltlQ';
const GEMINI_TEXT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_VISION_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_TIMEOUT_MS = 6000;
const GEMINI_USE_GOOGLE_SEARCH = true;
const GEMINI_SEARCH_NOTE = `

🌐 You may use Google Search for accurate, up-to-date veterinary facts, but keep the SAME structure, language, formatting and safety rules as above. Do NOT add links, citations or source lists to the reply.`;

const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';
const GROQ_TIMEOUT_MS = 7000;

const OPENROUTER_API_KEY = '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';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';
const OPENROUTER_VISION_MODEL = 'qwen/qwen2.5-vl-72b-instruct';
const OPENROUTER_TIMEOUT_MS = 8000;

const GEMINI_GRACE_MS = 5500;
const RACE_TIMEOUT_MS = 9000;
const GEMINI_HEDGE_DELAY_MS = 2500;

function _firstSuccessful(promises) {
    return new Promise(resolve => {
        if (!Array.isArray(promises) || promises.length === 0) { resolve(null); return; }
        let remaining = promises.length;
        let resolved = false;
        promises.forEach(p => {
            Promise.resolve(p).then(val => {
                if (resolved) return;
                if (val) { resolved = true; resolve(val); return; }
                if (--remaining === 0) { resolved = true; resolve(null); }
            }).catch(() => {
                if (resolved) return;
                if (--remaining === 0) { resolved = true; resolve(null); }
            });
        });
    });
}

const AI_JS_BUILD = '7.19';
const DEBUG = false;
const _log = DEBUG ? console.log.bind(console) : () => {};
if (DEBUG) console.log('%c🐾 DailyVet ai.js build ' + AI_JS_BUILD, 'color:#0a7;font-weight:bold');

const QUICK_REPLIES_ENABLED = true;
let lastGeminiFailure = null;
let lastGeminiSearchInfo = null;
let groqBlockedUntil = 0;
let searchBlockedUntil = 0;
const SEARCH_PAUSE_MS = 60 * 60 * 1000;
try { searchBlockedUntil = parseInt(localStorage.getItem('dvSearchBlockedUntil') || '0', 10) || 0; } catch (e) {}
function _searchAvailable() { return GEMINI_USE_GOOGLE_SEARCH && Date.now() >= searchBlockedUntil; }

// ── REPLY CACHE ──
const USE_REPLY_CACHE = true;
const REPLY_CACHE_TTL_MS = 60 * 60 * 1000;
const REPLY_CACHE_MAX = 200;
const replyCache = new Map();
const replyCacheKey = (text, lang, species) => `${lang}|${species || ''}|${(text || '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
function getCachedReply(key) {
    const e = replyCache.get(key);
    if (e && Date.now() - e.t > REPLY_CACHE_TTL_MS) { replyCache.delete(key); return null; }
    return e || null;
}
function setCachedReply(key, raw, searchInfo, provider) {
    replyCache.set(key, { raw, searchInfo, provider: provider || 'groq', t: Date.now() });
    if (replyCache.size > REPLY_CACHE_MAX) replyCache.delete(replyCache.keys().next().value);
}

// ── MOOD / CORRECTION / TASK ──
const MOOD_KEYWORDS = {
    worried:    ['worried', 'chinta', 'চিন্তা', 'tension', 'afraid', 'bhoy', 'ভয়'],
    sad:        ['sad', 'dukhi', 'দুঃখিত', 'kanna', 'কান্না', 'mon kharap'],
    angry:      ['angry', 'rag', 'রাগ', 'biragi', 'frustrated'],
    urgent:     ['urgent', 'তাড়াতাড়ি', 'taratari', 'joldi', 'দ্রুত', 'emergency'],
    grateful:   ['dhonnobad', 'ধন্যবাদ', 'thanks', 'thank you'],
    confused:   ['bujhte parchi na', 'বুঝতে পারছি না', 'confused', 'ki korbo'],
    happy:      ['khushi', 'খুশি', 'happy', 'bhalo', 'ভালো']
};
const CORRECTION_KEYWORDS = [
    'bhul', 'ভুল', 'wrong', 'incorrect', 'mistake', 'vul', 'bhul bolechen',
    'eta thik na', 'এটা ঠিক না', 'this is wrong', 'you are wrong'
];
const TASK_KEYWORDS = {
    math:      ['calculate', 'hisab', 'হিসাব', 'ganit', 'গণিত', 'average', 'percent'],
    summary:   ['summarize', 'summary', 'সারসংক্ষেপ', 'choto kore'],
    writing:   ['likhe dao', 'লিখে দাও', 'write', 'draft', 'letter'],
    planning:  ['plan', 'পরিকল্পনা', 'kivabe korbo', 'routine'],
    code:      ['code', 'javascript', 'python', 'html', 'css']
};
const EMOTIONAL_GUIDES = {
    worried:    { bn: 'ব্যবহারকারী চিন্তিত। সহানুভূতি ও আশ্বাস দাও।', en: 'User worried. Be reassuring.' },
    sad:        { bn: 'ব্যবহারকারী দুঃখিত। নরম সুরে সহানুভূতি।', en: 'User sad. Be gentle.' },
    angry:      { bn: 'ব্যবহারকারী রাগান্বিত। শান্ত থাকো।', en: 'User angry. Stay calm.' },
    urgent:     { bn: 'ব্যবহারকারী তাড়াহুড়ো করছে। দ্রুত উত্তর।', en: 'User urgent. Be quick.' },
    grateful:   { bn: 'ব্যবহারকারী কৃতজ্ঞ। বিনয়ের সাথে।', en: 'User grateful. Be humble.' },
    confused:   { bn: 'ব্যবহারকারী বিভ্রান্ত। ধাপে ধাপে বোঝাও।', en: 'User confused. Step by step.' },
    happy:      { bn: 'ব্যবহারকারী খুশি। ভালো লাগার কথা বলো।', en: 'User happy. Share joy.' },
    neutral:    { bn: '', en: '' }
};
const _firstMatch = (text, map) => {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [label, kws] of Object.entries(map)) if (kws.some(k => lower.includes(k.toLowerCase()))) return label;
    return null;
};
const detectMood = text => _firstMatch(text, MOOD_KEYWORDS) || 'neutral';
const detectTaskType = text => _firstMatch(text, TASK_KEYWORDS);
const isCorrectingUser = text => _has(text, CORRECTION_KEYWORDS);
function getEmotionalGuidance(mood, lang) {
    const g = EMOTIONAL_GUIDES[mood];
    return g ? (g[lang] || g.en) : '';
}

// ── SPECIES / SYMPTOM DETECTION ──
const SPECIES_KEYWORDS = {
    dog: ['dog', 'puppy', 'kukur', 'kutta ', 'doggy','কুকুর'],
    cat: ['cat', 'kitten', 'biral','bilai','meow','বিড়াল'],
    cow: ['cow', 'cattle', 'goru', 'গরু'],
    goat: ['goat', 'chagol', 'ছাগল'],
    sheep: ['sheep', 'bhira', 'ভেড়া'],
    chicken: ['chicken', 'hen', 'murgi', 'মুরগি', 'মুরগী'],
    duck: ['duck', 'hash', 'হাঁস'],
    pigeon: ['pigeon', 'kabutar', 'কবুতর'],
    buffalo: ['buffalo', 'mohish', 'মহিষ'],
    horse: ['horse', 'ghora', 'ঘোড়া'],
    rabbit: ['rabbit', 'khorgosh', 'খরগোশ'],
    bird: ['bird', 'pakhi', 'পাখি', 'parrot', 'টিয়া'],
    fish: ['fish', 'mach', 'মাছ'],
    turtle: ['turtle', 'kachhim', 'কাছিম'],
    snake: ['snake', 'shap', 'সাপ']
};
const PRE_NEGATION_WORDS = ['not', 'no', "isn't", 'isnt', "doesn't", 'doesnt', "didn't", 'didnt'];
const POST_NEGATION_WORDS = ['na', 'না', 'nai', 'নাই', 'nei', 'নেই', 'noy', 'নয়', 'hoyni', 'হয়নি'];
const NEGATION_WINDOW_WORDS = 3;
function isNegatedAt(lower, idx, len) {
    const stop = /[,.;\n]/;
    let start = idx, end = idx + len;
    while (start > 0 && !stop.test(lower[start - 1])) start--;
    while (end < lower.length && !stop.test(lower[end])) end++;
    const words = s => s.trim().split(/\s+/).filter(Boolean);
    const before = words(lower.slice(start, idx)).slice(-NEGATION_WINDOW_WORDS);
    const after = words(lower.slice(idx + len, end)).slice(0, NEGATION_WINDOW_WORDS);
    return PRE_NEGATION_WORDS.some(w => before.includes(w)) || POST_NEGATION_WORDS.some(w => after.includes(w));
}
const _kwRegexCache = {};
function findKeywordIndex(lower, kwLower) {
    if (!/^[a-z0-9' \-]+$/.test(kwLower)) return lower.indexOf(kwLower);
    let re = _kwRegexCache[kwLower];
    if (!re) {
        const esc = kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        re = kwLower.length <= 4
            ? new RegExp(`(^|[^a-z])${esc}(?:s|es|er|ke|te|ta|ti|to|r|ra|der)?(?![a-z])`)
            : new RegExp(`(^|[^a-z])${esc}`);
        _kwRegexCache[kwLower] = re;
    }
    const m = re.exec(lower);
    return m ? m.index + m[1].length : -1;
}
function detectFromKeywordMap(text, map, checkNegation) {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const [label, keywords] of Object.entries(map)) {
        for (const kw of keywords) {
            const kwLower = kw.toLowerCase();
            const idx = findKeywordIndex(lower, kwLower);
            if (idx === -1) continue;
            if (checkNegation && isNegatedAt(lower, idx, kwLower.length)) continue;
            return label;
        }
    }
    return null;
}
const detectSpecies = text => detectFromKeywordMap(text, SPECIES_KEYWORDS, true);
const detectSymptom = text => detectFromKeywordMap(text, SYMPTOM_KEYWORDS, true);
const SYMPTOM_KEYWORDS = {
    fever:       ['fever', 'jor', 'জ্বর', 'high temperature'],
    skin:        ['skin', 'chormo', 'চর্ম', 'itching', 'chulkani', 'চুলকানি', 'rash', 'mange', 'khuji', 'খুজলি', 'scab', 'hair loss', 'lom pora', 'লোম পড়া', 'bald patch', 'ringworm', 'dandruff'],
    wound:       ['wound', 'gha', 'ghae', 'ঘা', 'cut', 'injury', 'khot', 'ক্ষত', 'abscess', 'pus', 'pooj', 'পুঁজ'],
    vomiting:    ['vomit', 'bomi', 'বমি', 'boma', 'বমি বমি'],
    diarrhea:    ['diarrhea', 'patla', 'পাতলা', 'dast', 'ডায়রিয়া', 'loose motion', 'scour'],
    cough:       ['cough', 'kashi', 'কাশি'],
    breathing:   ['breathing', 'shash', 'শ্বাস', 'choking', 'nishash', 'নিঃশ্বাস', 'wheeze', 'gasping', 'respiratory'],
    appetite:    ['not eating', 'khaite chai na', 'খাচ্ছে না', 'khawa dawa', 'anorexia', 'appetite loss', 'khete chaina'],
    eye:         ['eye', 'chokh', 'চোখ', 'cokh', 'chokhe', 'cokhe', 'discharge from eye', 'cloudy eye', 'blindness'],
    ear:         ['ear', 'kan', 'kane', 'কান', 'ear infection', 'head shaking'],
    lameness:    ['lame', 'khora', 'খোঁড়া', 'limping', 'foot rot', 'hoof', 'khur', 'খুর'],
    weak:        ['weak', 'durbol', 'দুর্বল', 'lethargic', 'lethargy', 'nistej', 'নিস্তেজ', 'inactive'],
    bleeding:    ['bleeding', 'rokto', 'রক্ত', 'blood', 'blood in stool', 'blood in urine'],
    swelling:    ['swell', 'phula', 'ফোলা', 'bloat', 'lump', 'tumor', 'gotha', 'গুটা', 'distended abdomen'],
    milk:        ['milk', 'dudh', 'দুধ', 'mastitis', 'wan', 'ওলান', 'reduced milk yield'],
    pregnancy:   ['pregnant', 'gordh', 'গর্ভ', 'calving', 'labor', 'labour', 'birthing', 'stillbirth', 'abortion', 'garbhopat'],
    parasites:   ['tick', 'টিক', 'flea', 'উকুন', 'lice', 'mite', 'worm', 'কৃমি', 'kremi', 'deworm'],
    dehydration: ['dehydrat', 'পানিশূন্যতা', 'sunken eyes', 'dry mouth'],
    dental:      ['teeth', 'dant', 'দাঁত', 'tooth', 'gum', 'mashur'],
    urinary:     ['urine', 'peshab', 'প্রস্রাব', 'urinating', 'kidney', 'bladder'],
    respiratory_infection: ['pneumonia', 'নিউমোনিয়া', 'cold', 'sardi', 'সর্দি', 'sneeze', 'hachi', 'হাঁচি'],
    poultry_specific: ['egg drop', 'ডিম কমে', 'not laying', 'ডিম দিচ্ছে না', 'crop', 'নিদাগ', 'ruffled feathers', 'পালক ফোলা', 'feather loss'],
    fish_specific: ['fin rot', 'fungus on fish', 'ফাংগাস', 'gill'],
    neuro:       ['seizure', 'খিঁচুনি', 'convulsion', 'tremor', 'কাঁপুনি', 'paralysis', 'পক্ষাঘাত', 'circling', 'head tilt'],
    poisoning:   ['poison', 'বিষ', 'bish', 'toxic', 'ate something bad'],
    heatstroke:  ['heat stroke', 'heatstroke', 'হিট স্ট্রোক', 'overheating'],
    emergency:   ['emergency', 'critical', 'accident', 'unconscious']
};

// ── CONVERSATION-FLOW DETECTION ──
const NEW_QUESTION_PATTERNS = [
    /ei\s+\w+\s+(er|ar)\s+ki\s+hoise/i,
    /ei\s+\w+\s+ki\s+hoise/i,
    /eita\s+ki\s+hoise/i,
    /eitar\s+ki\s+hoise/i,
    /what.*wrong.*this/i,
    /what.*happened.*this/i,
    /this.*animal.*ki/i,
    /ei\s+\w+\s+(ke|k)\s+ki\s+hoise/i,
    /এই\s+\S+\s+এর\s+কী\s+হয়েছে/,
    /এই\s+\S+\s+কী\s+হয়েছে/,
    /এটার\s+কী\s+হয়েছে/,
    /এর\s+কী\s+হয়েছে/,
    /কি\s+হয়েছে/
];
const isNewQuestion = text => !!text && NEW_QUESTION_PATTERNS.some(p => p.test(text.toLowerCase().trim()));

function updateTopicMemory(species, symptom, mood) {
    const prev = topicMemory.currentPet;
    if (species && prev && species !== prev) {
        Object.assign(topicMemory, { currentDisease: null, symptoms: [], userMood: 'neutral', mentionedPets: [species] });
    }
    if (species) {
        topicMemory.currentPet = species;
        if (!topicMemory.mentionedPets.includes(species)) topicMemory.mentionedPets.push(species);
    }
    if (symptom) {
        topicMemory.currentDisease = symptom;
        if (!topicMemory.symptoms.includes(symptom)) topicMemory.symptoms.push(symptom);
    }
    if (mood && mood !== 'neutral') topicMemory.userMood = mood;
}

function buildMemoryHint(lang) {
    const m = topicMemory, bn = lang === 'bn';
    if (!m.currentPet && !m.currentDisease && m.userMood === 'neutral') return '';
    let hint = bn ? '\n\n🎯 বর্তমান প্রসঙ্গ:\n' : '\n\n🎯 CURRENT CONTEXT:\n';
    if (m.currentPet) hint += bn ? `- বর্তমান পশু: ${m.currentPet}\n` : `- Current pet: ${m.currentPet}\n`;
    if (m.currentDisease) hint += bn
        ? `- পূর্বের সমস্যা (শুধু ইউজার "আগের সমস্যা" বললে ব্যবহার করবে): ${m.currentDisease}\n`
        : `- Previous issue (use ONLY if user says "previous problem"): ${m.currentDisease}\n`;
    if (m.symptoms.length) hint += bn ? `- পূর্বের লক্ষণ: ${m.symptoms.join(', ')}\n` : `- Previous symptoms: ${m.symptoms.join(', ')}\n`;
    if (m.userMood && m.userMood !== 'neutral') hint += bn ? `- মনোভাব: ${m.userMood}\n` : `- Mood: ${m.userMood}\n`;
    hint += lang === 'bn'
        ? `\n🚫 কঠোর নিয়ম:
1. উপরের "বর্তমান পশু" ছাড়া অন্য প্রাণীর কথা বলবে না।
2. পূর্বের সমস্যা/লক্ষণ মিক্স করবে না।
3. ইউজার "এই [প্রাণী] এর কী হয়েছে" জিজ্ঞেস করলে → শুধু সেই প্রাণী সম্পর্কে বলো।
4. বর্তমান প্রাণীর নির্দিষ্ট সমস্যা না থাকলে → সাধারণ লক্ষণ জিজ্ঞেস করো।`
        : `\n🚫 STRICT RULES:
1. ONLY talk about the "Current pet" above.
2. NEVER mix previous diseases.
3. If user asks "what happened to this [animal]" → talk ONLY about that animal.
4. If no specific issue → ask for symptoms.`;
    return hint;
}

function splitTokens(text) {
    return (text || '').toLowerCase().split(/[\s,.;:!?।"()]+/).filter(Boolean);
}
function isReferringToPrevious(text) {
    if (!text) return false;
    const lower = text.toLowerCase().trim();
    const tokens = new Set(splitTokens(lower));
    const words = ['age', 'ager', 'আগে', 'আগের', 'previous', 'earlier',
                   'abar', 'আবার', 'again', 'same', 'sei', 'সেই', 'seita', 'সেইটা'];
    const phrases = ['আগের সমস্যা', 'আগের রোগ', 'previous problem'];
    return words.some(w => tokens.has(w)) || phrases.some(p => lower.includes(p));
}

const FOLLOWUP_TOKENS = new Set([
    'eta', 'eita', 'ota', 'oita', 'eti', 'oti', 'eke', 'oke', 'take', 'tar', 'tader', 'eder',
    'tarpor', 'tahole', 'tobe', 'aro', 'aar', 'ekhono',
    'ostudh', 'oshudh', 'osudh', 'medicine', 'dose', 'treatment', 'cure', 'kotodin',
    'এটা', 'এটি', 'ওটা', 'এটার', 'ওটার', 'তার', 'তাকে', 'ওকে', 'একে', 'তারপর', 'তাহলে',
    'আরও', 'এখনো', 'এখনও', 'ঔষধ', 'ওষুধ', 'ডোজ', 'চিকিৎসা', 'কতদিন'
]);
const FOLLOWUP_PHRASES = [
    'ki khabe', 'ki khawabo', 'ki khawano', 'ki korbo', 'ki dibo', 'koto din', 'how long',
    'how much', 'what should i', 'what about', 'কী খাওয়াব', 'কি খাওয়াব', 'কী করব', 'কি করব',
    'কত দিন', 'কী দিব', 'কি দিব'
];
function isFollowUpMessage(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    return splitTokens(lower).some(t => FOLLOWUP_TOKENS.has(t)) ||
           FOLLOWUP_PHRASES.some(p => lower.includes(p));
}
const DOCTOR_QUERIES = [
    'doctor', 'daktar', 'ডাক্তার', 'vet', 'veterinary', 'ভেট',
    'kothay nibo', 'কোথায় নিব', 'hospital', 'হাসপাতাল', 'clinic', 'ক্লিনিক',
    'doctor er number', 'daktar de', 'kake dekhabo', 'কাকে দেখাব',
    'kono vet', 'kono doctor', 'vet ase', 'doctor ase'
];
const isAskingForDoctor = text => _has(text, DOCTOR_QUERIES);

// ── LANGUAGE DETECTION ──
const BANGLISH_INDICATORS = [
    'ami', 'tumi', 'apni', 'tomar', 'amar', 'kemon', 'ki', 'korbo',
    'korte', 'hobe', 'hocche', 'chai', 'lagbe', 'jonno', 'theke',
    'bolo', 'dhonnobad', 'pari', 'parbo', 'nei', 'nai', 'ekhon',
    'bhalo', 'kharap', 'onek', 'kichu', 'jor', 'rog',
    'biral', 'kukur', 'goru', 'chagol', 'murgi', 'abar', 'ekhono',
    'jotno', 'kivabe', 'bhul', 'vul', 'keno', 'daktar', 'suggest', 'kono'
];
function detectLanguage(text) {
    if (!text) return 'en';
    if (/[\u0980-\u09FF]/.test(text)) return 'bn';
    const lower = text.toLowerCase();
    if (lower.includes('in bangla') || lower.includes('bangla') || lower.includes('banglay')) return 'bn';
    let hits = 0;
    for (const word of BANGLISH_INDICATORS) {
        const pattern = new RegExp(`\\b${word}\\b`, 'i');
        if (pattern.test(lower)) {
            hits++;
            if (hits >= 2) return 'bn';
        }
    }
    return 'en';
}

// ── MEDICAL SAFETY GUARD ──
const HUMAN_ONLY_MEDS = [
    'paracetamol', 'acetaminophen', 'nimesulide', 'ibuprofen',
    'aspirin', 'diclofenac', 'ketorolac', 'naproxen',
    'tramadol', 'morphine', 'codeine', 'analgin', 'novalgin',
    'amoxicillin 500', 'azithromycin 500', 'ciprofloxacin 500',
    'cefixime', 'ceftriaxone', 'levofloxacin', 'doxycycline 100',
    'metronidazole 400', 'fluconazole 150',
    'cetirizine', 'loratadine', 'fexofenadine', 'chlorpheniramine',
    'phenylephrine', 'pseudoephedrine', 'dextromethorphan',
    'omeprazole 20', 'esomeprazole', 'pantoprazole', 'ranitidine',
    'domperidone', 'ondansetron 4', 'loperamide',
    'metformin', 'glibenclamide', 'insulin human',
    'amlodipine', 'losartan', 'atenolol', 'propranolol',
    'prednisolone 5', 'dexamethasone 4', 'hydrocortisone cream',
    'salbutamol inhaler', 'thyroxine', 'warfarin',
    'napa', 'ace', 'napa extra', 'ace plus', 'seclo', 'sergel',
    'maxpro', 'monas', 'alatrol', 'fexo', 'fenadin', 'tusca',
    'buscopan', 'antazol', 'histacin'
];
const _tox = list => list.map(([name, bn, effect]) => ({ name, bn, effect }));
const _TOX_BIRD = _tox([
    ['avocado', 'অ্যাভোকাডো', 'হার্ট ফেইল'], ['salt', 'অতিরিক্ত লবণ', 'ডিহাইড্রেশন'],
    ['diclofenac', 'ডিক্লোফেনাক', 'কিডনি ফেইল, মৃত্যু'], ['ketoprofen', 'কিটোপ্রোফেন', 'কিডনি ফেইল']
]);
const _TOX_HUMAN_ABX = _tox([['human antibiotic', 'মানুষের অ্যান্টিবায়োটিক', 'দুধে রেসিডিউ']]);
const _TOX_IVERM = _tox([['ivermectin overdose', 'অতিরিক্ত আইভারমেকটিন', 'স্নায়ু বিষক্রিয়া']]);
const SPECIES_TOXIC_MEDS = {
    cat: _tox([
        ['paracetamol', 'প্যারাসিটামল', 'লিভার ফেইল, মৃত্যু'], ['ibuprofen', 'আইবুপ্রোফেন', 'কিডনি ফেইল'],
        ['aspirin', 'অ্যাসপিরিন', 'রক্তক্ষরণ, বিষক্রিয়া'], ['permethrin', 'পারমেথ্রিন', 'স্নায়ু বিষক্রিয়া']
    ]),
    dog: _tox([
        ['paracetamol', 'প্যারাসিটামল', 'লিভার ড্যামেজ'], ['ibuprofen', 'আইবুপ্রোফেন', 'কিডনি/পেটের আলসার'],
        ['xylitol', 'জাইলিটল', 'হাইপোগ্লাইসেমিয়া']
    ]),
    bird: _TOX_BIRD, pigeon: _TOX_BIRD,
    cow: _TOX_HUMAN_ABX, buffalo: _TOX_HUMAN_ABX,
    goat: _TOX_IVERM, sheep: _TOX_IVERM,
    chicken: _tox([
        ['chloramphenicol', 'ক্লোরামফেনিকল', 'নিষিদ্ধ'], ['nitrofuran', 'নাইট্রোফুরান', 'নিষিদ্ধ'],
        ['ibuprofen', 'আইবুপ্রোফেন', 'কিডনি ফেইল'], ['diclofenac', 'ডিক্লোফেনাক', 'কিডনি ফেইল, মৃত্যু'],
        ['ketoprofen', 'কিটোপ্রোফেন', 'কিডনি ফেইল']
    ]),
    duck: _tox([['chloramphenicol', 'ক্লোরামফেনিকল', 'নিষিদ্ধ'], ['diclofenac', 'ডিক্লোফেনাক', 'কিডনি ফেইল, মৃত্যু']]),
    rabbit: _tox([['oral antibiotics (clindamycin/penicillin class)', 'ওরাল অ্যান্টিবায়োটিক', 'মারাত্মক এন্টেরোটক্সেমিয়া']]),
    horse: _tox([['ibuprofen', 'আইবুপ্রোফেন', 'গ্যাস্ট্রিক আলসার']]),
    fish: _tox([['table salt overdose', 'অতিরিক্ত লবণ', 'অসমোটিক শক']])
};

const _medRe = (med, flags) => new RegExp(`\\b${_reEsc(med)}\\b`, flags);
const detectHumanMedicine = text => text ? HUMAN_ONLY_MEDS.filter(med => _medRe(med, 'i').test(text.toLowerCase())) : [];

function replaceHumanMedicine(reply, species, lang) {
    const found = detectHumanMedicine(reply);
    if (!found.length) return { text: reply, replaced: false, meds: [] };
    let cleaned = reply;
    found.forEach(med => { cleaned = cleaned.replace(_medRe(med, 'gi'), lang === 'bn' ? '[মানুষের ঔষধ বাদ]' : '[human med removed]'); });
    const warning = lang === 'bn'
        ? `\n\n⚠️ নিরাপত্তা: "${found.join(', ')}" এই ঔষধ সাজেস্ট করা যায় না। শুধু vet-prescribed ব্যবহার করুন।`
        : `\n\n⚠️ Safety: "${found.join(', ')}" — human medicines cannot be suggested.`;
    return { text: cleaned + warning, replaced: true, meds: found };
}

function checkSpeciesToxicMeds(reply, species, lang) {
    const list = species && SPECIES_TOXIC_MEDS[species.toLowerCase()];
    if (!list) return null;
    const lower = reply.toLowerCase();
    const hits = list.filter(t => lower.includes(t.name));
    if (!hits.length) return null;
    const warnings = hits.map(t => lang === 'bn'
        ? `🚨 ${t.bn} (${t.name}) — ${species} এর জন্য মারাত্মক! প্রভাব: ${t.effect}`
        : `🚨 ${t.name} — DEADLY for ${species}!`).join('\n');
    return lang === 'bn'
        ? `\n\n${warnings}\n\nএই ঔষধ কখনোই ${species} কে দেবেন না।`
        : `\n\n${warnings}\n\nNEVER give these to your ${species}.`;
}

const DOSAGE_PATTERNS = [
    /\d+(\.\d+)?\s*(mg|mcg|µg|ug|ml|cc|iu|g)\s*\/?\s*(kg\s*(bw)?)?/i,
    /[0-9০-৯]+([.,][0-9০-৯]+)?\s*(মিগ্রা|মিলিগ্রাম|মিলি|মিলিলিটার|গ্রাম|আইইউ)\s*\/?\s*(কেজি)?/i,
    /\b(IV\/IM|IV|IM|SC|SQ|PO|once daily|twice daily|three times daily|every \d+\s*hours?|od|bid|tid)\b/i
];
const KNOWN_DRUG_BRANDS = [
    'finadyne', 'vetalgin', 'meloxin', 'maxflox', 'renamycin', 'tylan',
    'ivomec', 'panacur', 'baytril', 'combiotic', 'oxyvet', 'engemycin',
    'nuflor', 'excenel', 'metacam', 'rimadyl'
];
function scrubDosageAndBrands(reply, lang) {
    const brandRes = KNOWN_DRUG_BRANDS.map(b => new RegExp(`\\b${b}\\b`, 'i'));
    let stripped = false;
    const kept = reply.split(/(?<=[.।!?])\s+/).filter(s => {
        const bad = DOSAGE_PATTERNS.some(p => p.test(s)) || brandRes.some(r => r.test(s));
        if (bad) stripped = true;
        return !bad;
    });
    let text = kept.join(' ').replace(/\s{2,}/g, ' ').trim();
    if (stripped) text += lang === 'bn'
        ? '\n\n⚠️ নির্দিষ্ট ডোজ/ব্র্যান্ড বাদ — ভেটেরিনারিয়ান নির্ধারণ করবেন।'
        : '\n\n⚠️ Exact dose/brand left out — a vet should determine.';
    return { text, stripped };
}

function applyMedicalSafetyGuard(reply, species, lang) {
    const result = replaceHumanMedicine(reply, species, lang);
    const toxicWarning = checkSpeciesToxicMeds(reply, species, lang);
    const dosage = scrubDosageAndBrands(result.text, lang);
    return {
        text: dosage.text + (toxicWarning || ''),
        wasBlocked: result.replaced || dosage.stripped,
        blockedMeds: result.meds
    };
}

// ── 🇧🇩🚫🇮🇳 LANGUAGE SAFETY GUARD (anti-Hindi) ──
const DEVANAGARI_RE = /[\u0900-\u097F]+\s*/g;
const HINDI_ONLY_WORDS = [
    'hai', 'nahi', 'nahin', 'kya', 'hoga', 'hogi', 'accha', 'acha',
    'theek hai', 'thik hai', 'matlab', 'bahut', 'yeh', 'woh', 'mujhe',
    'tumhe', 'tumhara', 'tumhari', 'aapka', 'aapki', 'aapko', 'karo',
    'kijiye', 'kripya', 'dhanyavaad', 'dhanyavad', 'shukriya hai',
    'ji haan', 'ji nahi', 'bhai sahab', 'kaise ho', 'kaise hain'
];
function scrubHindi(text) {
    if (!text) return { text, hadHindi: false };
    let hadHindi = false;
    let cleaned = text.replace(DEVANAGARI_RE, () => { hadHindi = true; return ''; });
    HINDI_ONLY_WORDS.forEach(w => {
        const re = new RegExp(`\\b${_reEsc(w)}\\b`, 'gi');
        if (re.test(cleaned)) { hadHindi = true; cleaned = cleaned.replace(re, ''); }
    });
    if (hadHindi) {
        cleaned = cleaned
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\s+([,।.!?])/g, '$1')
            .replace(/^\s+|\s+$/gm, '')
            .trim();
    }
    return { text: cleaned, hadHindi };
}

// ── SYSTEM PROMPT ──
const TASK_CONTEXTS = { math: 'User needs calculation/math help.', summary: 'User wants a summary.', writing: 'User wants writing help.', planning: 'User wants a plan.', code: 'User wants coding help.' };
function buildSystemPrompt(lang, species, hasImage, mood, taskType, isCorrecting, useMemory = true, reference = '', triageForce = false) {
    const name = userName && userName !== 'User' ? userName : 'the user';
    const nameRule = name !== 'the user'
        ? (lang === 'bn'
            ? `\n🔤 নামের নিয়ম: ব্যবহারকারীর নাম সবসময় ইংরেজি অক্ষরে হুবহু "${name}" লিখবে। বাংলা উত্তরেও নামটি বাংলায় লিখবে না, লিপ্যন্তর বা অনুবাদ করবে না।`
            : `\n🔤 NAME RULE: Always write the user's name exactly as "${name}" in English letters. Never transliterate or translate it.`)
        : '';
    const speciesContext = species
        ? `The user is asking about a ${species}. Answer ONLY about ${species}.`
        : `If species unclear, ask which animal.`;
    const imageContext = hasImage
        ? (lang === 'bn'
            ? `ইউজার ছবি পাঠিয়েছে।
STRICT IMAGE RULES:
1. প্রথমে ছবিতে কোন প্রাণী (গরু/ছাগল/কুকুর/বিড়াল/পাখি ইত্যাদি) স্পষ্টভাবে চিহ্নিত করো।
2. শুধু ছবিতে যা দেখা যাচ্ছে তার ভিত্তিতে লক্ষণ বলো (রঙ, ক্ষত, ফোলা, চোখ, খুর, পালক, ত্বক ইত্যাদি)।
3. সবচেয়ে সম্ভাব্য ১–২টি রোগের নাম দাও।
4. আগের কথোপকথন বা অন্য প্রাণীর তথ্য মিক্স করবে না।
5. নিশ্চিত না হলে [CONF:LOW] দাও এবং ভেট দেখাতে বলো।
6. ছবিটি অস্পষ্ট হলে বা একাধিক রোগের সম্ভাবনা কাছাকাছি থাকলে, সরাসরি নির্ণয় না দিয়ে সর্বোচ্চ ১টি ছোট স্পষ্টীকরণ প্রশ্ন করতে পারো ([STAGE:ASK])। অন্যথায় সাধারণত ছবি থেকেই সরাসরি নির্ণয় দাও ([STAGE:DIAGNOSE])।`
            : `User sent an image.
STRICT IMAGE RULES:
1. FIRST clearly identify the animal species in the image.
2. Describe ONLY visible signs (color, lesions, swelling, eyes, hooves, feathers, skin).
3. Give 1–2 most likely diseases.
4. Do NOT mix previous conversation or other animals.
5. If uncertain use [CONF:LOW] and advise seeing a vet.
6. If the image is unclear or genuinely ambiguous between diseases, you may ask ONE short clarifying question instead of diagnosing ([STAGE:ASK]). Otherwise diagnose directly from the image ([STAGE:DIAGNOSE]).`)
        : '';

    const triageRule = lang === 'bn'
        ? `\n\n🩺 রোগ নির্ণয়ের ধরন (মানুষের ডাক্তারের মতো):
- ইউজার টেক্সটে শুধু একটা/দুইটা অস্পষ্ট লক্ষণ বললে (যেমন: "বিড়ালের বমি হচ্ছে", "গরুর জ্বর") সরাসরি রোগ নির্ণয় বা ঔষধ দিও না।
- প্রথমে রোগ নির্ণয়ে সাহায্যকারী ২-৩টি ছোট, নির্দিষ্ট প্রশ্ন করো — যেমন: কতদিন ধরে সমস্যা, আর কী কী লক্ষণ আছে (খাওয়া-দাওয়া, পায়খানা, রক্ত/কৃমি, ওজন কমা), সাম্প্রতিক খাদ্য/পরিবেশ পরিবর্তন হয়েছে কিনা, বয়স/টিকা দেওয়া আছে কিনা।
- ইউজার ইতিমধ্যে যথেষ্ট তথ্য দিয়ে থাকলে (একাধিক লক্ষণ, সময়কাল, তীব্রতা ইত্যাদি একসাথে বলেছে বা আগের মেসেজেই দিয়েছে) — তাহলে আর প্রশ্ন না করে সরাসরি সম্ভাব্য রোগ নির্ণয় ও পরামর্শ দাও।
- ইউজার তোমার প্রশ্নের উত্তর দেওয়ার পর, সেই নতুন তথ্য + আগের কথোপকথন মিলিয়ে যদি এখনও নিশ্চিত না হও, আরেকটা ছোট প্রশ্ন করতে পারো (সর্বোচ্চ ২ রাউন্ড), তারপর অবশ্যই একটা সম্ভাব্য রোগ নির্ণয় দিতে হবে (অনিশ্চিত হলে [CONF:LOW]/[CONF:MED] ব্যবহার করো, কিন্তু উত্তর এড়িয়ে যেও না)।
- জরুরি লক্ষণ (রক্তক্ষরণ, অজ্ঞান, খিঁচুনি, বিষক্রিয়া, তীব্র শ্বাসকষ্ট) থাকলে প্রশ্ন করবে না — সরাসরি জরুরি নির্দেশনা দাও।
- সাধারণ তথ্যভিত্তিক প্রশ্নে (টিকার সময়সূচি, খাবার, যত্ন ইত্যাদি — কোনো অসুস্থতার লক্ষণ নেই) এই নিয়ম প্রযোজ্য নয়, স্বাভাবিকভাবে সরাসরি উত্তর দাও।
- প্রশ্ন করার সময় কোনো emoji heading কাঠামো (🩺📋🏠💊🥗🛡️) ব্যবহার করবে না — শুধু সহজ, বন্ধুত্বপূর্ণ ভাষায় ২-৩টি প্রশ্ন লিখবে, প্রতিটি প্রশ্ন আলাদা লাইনে।`
        : `\n\n🩺 DIAGNOSIS STYLE (like a real vet doing intake):
- If the user gives only a vague text symptom (e.g. "my cat is vomiting", "cow has fever"), do NOT jump straight to a diagnosis or medicine.
- First ask 2-3 short, targeted follow-up questions that help narrow the cause — e.g. how long, what else is happening (appetite, stool, blood/worms, weight loss), any recent diet/environment change, age/vaccination status.
- If the user's message already gives enough detail (multiple symptoms, duration, severity together, or given earlier in the conversation), skip questions and diagnose directly.
- After the user answers, combine that with the earlier conversation; if still unclear you may ask ONE more short question (max 2 rounds total), then you MUST commit to your best-guess diagnosis (use [CONF:LOW]/[CONF:MED] if unsure — never dodge the answer).
- Emergency signs (bleeding, unconscious, seizure, poisoning, severe breathing trouble) → skip questions, give emergency guidance immediately.
- This rule does NOT apply to plain factual questions (vaccine schedule, diet, general care) with no illness involved — answer those directly as usual.
- While asking questions, do NOT use the emoji-heading disease structure (🩺📋🏠💊🥗🛡️) — just write 2-3 friendly, simple questions, each on its own line.`;

    const triageForceNote = triageForce
        ? (lang === 'bn'
            ? `\n\n🚨 বাধ্যতামূলক এখনই: তুমি ইতিমধ্যে যথেষ্ট প্রশ্ন করেছ। আর কোনো প্রশ্ন করা যাবে না — এখন পর্যন্ত পাওয়া সব তথ্যের ভিত্তিতে সবচেয়ে সম্ভাব্য রোগ নির্ণয় করে সম্পূর্ণ কাঠামোতে (🩺📋🏠💊🥗🛡️) উত্তর দাও। নিশ্চিত না হলে [CONF:LOW] বা [CONF:MED] ব্যবহার করো, কিন্তু অবশ্যই [STAGE:DIAGNOSE] দিতে হবে।`
            : `\n\n🚨 MANDATORY NOW: You have already asked enough questions. Do NOT ask any more — based on everything gathered so far, give your best-guess diagnosis using the full structure (🩺📋🏠💊🥗🛡️). Use [CONF:LOW] or [CONF:MED] if unsure, but you MUST output [STAGE:DIAGNOSE] this time.`)
        : '';

    const memoryHint = useMemory ? buildMemoryHint(lang) : '';
    const emotionalGuide = getEmotionalGuidance(mood, lang);
    const taskContext = TASK_CONTEXTS[taskType] || '';
    const correctionContext = isCorrecting
        ? (lang === 'bn' ? 'ব্যবহারকারী ভুল ধরিয়ে দিচ্ছেন। বিনয়ের সাথে স্বীকার করো।' : 'User is correcting you. Acknowledge politely.')
        : '';

    const langRule = lang === 'bn'
        ? `\n\n🌐 ভাষা নিয়ম (বাধ্যতামূলক — Bangla-first):
- সবসময় শুদ্ধ বাংলায় উত্তর দাও (বাংলা লিপি)।
- ইউজার Banglish লিখলেও উত্তর বাংলায় দাও — ইংরেজি মিশাবে না।
- ইংরেজি শব্দ শুধু ঔষধের generic নাম / রোগের বৈজ্ঞানিক নামে ব্যবহার করো।
- কখনো পুরো বাক্য ইংরেজিতে লিখবে না যদি ইউজার বাংলা/Banglish বলে।
- 🚫🇮🇳 কখনোই হিন্দি ভাষা, হিন্দি শব্দ বা হিন্দি লিপি (Devanagari) ব্যবহার করবে না — যেমন: hai, nahi, kya, hoga, accha, theek hai, matlab, karo, tumhara, aapka ইত্যাদি সম্পূর্ণ নিষিদ্ধ। ইউজার নিজে হিন্দি লিখলেও তুমি শুধু বাংলা/ইংরেজিতেই উত্তর দেবে, হিন্দি শব্দ কপি করবে না বা মিশাবে না।`
        : `\n\n🌐 LANGUAGE RULE:
- Always reply in clear English.
- If the user later switches to Bangla/Banglish, switch to Bangla.
- 🚫🇮🇳 NEVER use Hindi words, Hindi language, or Devanagari script under any circumstance (e.g. hai, nahi, kya, hoga, accha, theek hai, matlab, karo) — even if the user writes in Hindi, reply only in English or Bangla, never copy or mix in Hindi words.`;

    const contextRule = lang === 'bn'
        ? `\n\n🚨 প্রসঙ্গ নিয়ম:
- সবসময় ইউজারের সর্বশেষ মেসেজের বিষয়ের উত্তর দাও। ইউজার বিষয় বদলালে (নতুন প্রাণী, নতুন প্রশ্ন, সাধারণ কথা) আগের রোগ/প্রাণীর কথা টেনে আনবে না।
- "এই [প্রাণী] এর কী হয়েছে" জিজ্ঞেস করলে → শুধু সেই প্রাণী সম্পর্কে বলো।
- নির্দিষ্ট সমস্যা না থাকলে → সাধারণ লক্ষণ জিজ্ঞেস করো।
- "আগের সমস্যা" / "আবার" / "same" ছাড়া পুরনো তথ্য ব্যবহার করো না।
- ছবি পাঠালে → শুধু ছবিতে যা দেখা যাচ্ছে সেটার ভিত্তিতে রোগ নির্ণয় করো।`
        : `\n\n🚨 CONTEXT RULES:
- ALWAYS answer the topic of the user's LATEST message. If the user changes topic (new animal, new question, small talk), do NOT bring back earlier diseases or animals.
- "what happened to this [animal]" → talk ONLY about that animal.
- No specific issue → ask for symptoms.
- NEVER use old info unless user says "previous problem" / "again" / "same".
- Image sent → diagnose based ONLY on visible signs.`;

    const stageRule = `

STAGE TAG (hidden tag, MANDATORY):
On a NEW LINE, add exactly one tag:
[STAGE:ASK] — if this reply is ONLY asking clarifying questions (no diagnosis yet)
[STAGE:DIAGNOSE] — if this reply gives the actual diagnosis/advice
Never explain this tag.`;

    const confidenceRule = `

CONFIDENCE SCORE (hidden tag):
At the END of your reply, on a NEW LINE, add exactly one tag:
[CONF:HIGH] [CONF:MED] [CONF:LOW]
Never explain this tag.`;

    const formattingRule = lang === 'bn'
        ? `\n\n✨ টেক্সট স্টাইল (বাধ্যতামূলক):
- প্রতিটি bullet/লক্ষণ/করণীয় MUST আলাদা লাইনে (literal \\n দিয়ে)
- একই লাইনে একাধিক bullet লেখা নিষেধ
- সেকশনগুলোর (📋 লক্ষণ, 🏠 ঘরোয়া যত্ন, 💊 ঔষধ, 🥗 খাদ্য, 🛡️ প্রতিরোধ) মাঝে একটি খালি লাইন ("\\n\\n") রাখবে
- প্রতিটি বাক্য সঠিক যতিচিহ্ন দিয়ে শেষ করবে (। , ? !)
- Markdown **, ##, * ব্যবহার করবে না
- Emoji heading ব্যবহার করবে: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️ 🚨 💡
- উদাহরণ কাঠামো:
🩺 [রোগের নাম]

📋 লক্ষণ:
• [লক্ষণ ১]
• [লক্ষণ ২]

🏠 ঘরোয়া যত্ন:
• [করণীয় ১]
• [করণীয় ২]

💊 ঔষধ (ভেটের পরামর্শে):
• [generic] — [কাজ]

🥗 খাদ্য:
• [খাদ্য ১]

🛡️ প্রতিরোধ:
• [প্রতিরোধ ১]

⚠️ [সতর্কতা]

💡 সঠিক চিকিৎসার জন্য ভেটের পরামর্শ নিন।`
        : `\n\n✨ TEXT STYLE (MANDATORY):
- Every bullet/symptom/action MUST be on its own line (using literal \\n)
- NEVER put multiple bullets on the same line
- Sections (📋 Symptoms, 🏠 Home Care, 💊 Medicine, 🥗 Diet, 🛡️ Prevention) must be separated by a blank line ("\\n\\n")
- Every sentence must end with proper punctuation
- NEVER use Markdown **, ##, *
- Use emoji headings: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️ 🚨 💡
- Example structure:
🩺 [Disease name]

📋 Symptoms:
• [symptom 1]
• [symptom 2]

🏠 Home Care:
• [action 1]
• [action 2]

💊 Medicine (vet-supervised):
• [generic] — [purpose]

🥗 Diet:
• [food 1]

🛡️ Prevention:
• [tip 1]

⚠️ [warning]

💡 For proper treatment, consult a vet.`;

    const medicineRules = lang === 'bn'
        ? `\n\n🛡️ ঔষধ নিয়ম:\n❌ মানুষের ঔষধ সাজেস্ট করবে না।\n✅ শুধু vet-approved generic:\n- Antibiotics: Amoxicillin (vet), Enrofloxacin, Oxytetracycline, Tylosin\n- Dewormers: Albendazole, Fenbendazole, Ivermectin\n- Pain: Meloxicam (vet), Carprofen (vet)\n- Skin: Povidone-iodine, Ketoconazole shampoo\n- GI: ORS, probiotics\n⚠️ সবসময় বলো: "সঠিক ডোজ ভেটেরিনারিয়ান নির্ধারণ করবেন"।\n⚠️ পাখির জন্য ডিক্লোফেনাক কখনো suggest করবে না।`
        : `\n\n🛡️ MEDICINE RULES:\n❌ NEVER suggest human medicines.\n✅ ONLY vet-approved generics:\n- Antibiotics: Amoxicillin (vet), Enrofloxacin, Oxytetracycline, Tylosin\n- Dewormers: Albendazole, Fenbendazole, Ivermectin\n- Pain: Meloxicam (vet), Carprofen (vet)\n- Skin: Povidone-iodine, Ketoconazole shampoo\n- GI: ORS, probiotics\n⚠️ Always say: "Exact dose should be confirmed by a vet".\n⚠️ NEVER suggest diclofenac for birds.`;

    const completenessRule = lang === 'bn'
        ? `\n\n📋 কাঠামো (বাধ্যতামূলক — উপরের emoji heading + আলাদা লাইন bullet অনুসরণ করো):
1. 🩺 সম্ভাব্য রোগের নাম
2. 📋 লক্ষণ (প্রতিটি • আলাদা লাইনে)
3. 🏠 ঘরোয়া যত্ন (প্রতিটি • আলাদা লাইনে)
4. 💊 ঔষধ generic (প্রতিটি • আলাদা লাইনে)
5. 🥗 খাদ্য
6. 🛡️ প্রতিরোধ / ⚠️ সতর্কতা

🧠 দৈর্ঘ্য: নতুন রোগ ৮-১৪ লাইন, ছোট প্রশ্ন ১-৩ লাইন।`
        : `\n\n📋 STRUCTURE (MANDATORY — follow emoji headings + one bullet per line):
1. 🩺 Likely disease name
2. 📋 Symptoms (each • on its own line)
3. 🏠 Home care (each • on its own line)
4. 💊 Medicine generic (each • on its own line)
5. 🥗 Diet
6. 🛡️ Prevention / ⚠️ Warning

🧠 Length: new disease 8-14 lines, small question 1-3 lines.`;

    const vetSuggestionRule = lang === 'bn'
        ? `\n\n🩺 ভেট suggest:\n- সাধারণ কেসে ধাক্কা দিও না।\n- জরুরি অবস্থায় (রক্তপাত, অজ্ঞান, খিঁচুনি, বিষক্রিয়া) — নিজেই ভেটে যেতে বলো।`
        : `\n\n🩺 Vet-suggestion:\n- Routine: don't push.\n- Emergency: proactively tell them to see a vet.`;

    const [intro, labels, outro] = lang === 'bn'
        ? [`তুমি DailyVet AI — একজন অভিজ্ঞ, সহানুভূতিশীল ভেটেরিনারিয়ান সহকারী। ব্যবহারকারীর নাম "${name}"।`, ['আবেগনির্ভর: ', 'টাস্ক: ', 'সংশোধন: '], `
মূল কাজ:
1. পশুর রোগ নির্ণয় ও ঘরোয়া প্রাথমিক চিকিৎসা
2. প্রাণীর ঔষধ suggestion — শুধু vet-approved
3. জরুরি অবস্থা detect
4. বলো: "সঠিক ডোজ ভেটেরিনারিয়ান নির্ধারণ করবেন"

⚠️ ছবি পাঠালে — ছবির প্রাণী চিহ্নিত করো, তারপর রোগ নির্ণয় করো। আগের প্রাণুর তথ্য মিক্স করো না।

গ্রিটিং নিয়ম:
- নিজে থেকে "নমস্কার", "আসসালামু আলাইকুম", "হ্যালো আমি DailyVet AI" ইত্যাদি বলবে না।
- শুধুমাত্র প্রয়োজনে ইউজারের নাম ব্যবহার করবে।
- ইউজার যদি "আসসালামু আলাইকুম" / "সালাম" বলে → "ওয়ালাইকুম আসসালাম" দিয়ে উত্তর দাও।
- ইউজার যদি "নমস্কার" বলে → "নমস্কার" দিয়ে উত্তর দাও।
- ইউজার যদি "শুভ সকাল/সন্ধ্যা/রাত্রি" বলে → সেই অনুযায়ী উত্তর দাও।
- অন্যথায় সরাসরি বিষয়ে চলে যাও। অপ্রয়োজনীয় পরিচয় বা গ্রিটিং দিও না।

ব্যক্তিত্ব: সহানুভূতিশীল, ভদ্র, সংক্ষিপ্ত — Markdown ** ব্যবহার করবে না।
`]
        : [`You are DailyVet AI — an experienced, empathetic veterinary assistant. The user's name is "${name}".`, ['EMOTIONAL GUIDANCE: ', 'TASK: ', 'CORRECTION: '], `
Core job:
1. Diagnose pet diseases and give home-care advice
2. Suggest VET-APPROVED medicines only
3. Detect emergencies
4. Always say: "Exact dose should be confirmed by a vet"

⚠️ When user sends an image — identify the animal, then diagnose based on visible signs.

Greeting rules:
- Do NOT start with "Hello, I'm DailyVet AI" or any forced greeting.
- Only use the user's name when natural (emergency/sorry cases).
- If user says "Assalamualaikum" / "Salam" → reply "Waalaikumsalam".
- If user says "Namaskar" → reply "Namaskar".
- If user says "Good morning/evening" → reply accordingly.
- Otherwise go straight to the topic. No unnecessary self-introduction.

Personality: Empathetic, polite, concise — NO Markdown **.
`];

    const referenceBlock = reference
        ? (lang === 'bn'
            ? `\n\n📚 DailyVet রেফারেন্স (শুধু সহায়ক তথ্য, উত্তর নয়):\n${reference}\n\n⚠️ রেফারেন্স ব্যবহারের নিয়ম:\n- এই তথ্য ইউজারের বর্তমান মেসেজের সাথে সরাসরি মিললে তবেই ব্যবহার করো।\n- না মিললে সম্পূর্ণ উপেক্ষা করো এবং নিজের জ্ঞান থেকে উত্তর দাও।\n- রেফারেন্স হুবহু কপি করবে না। ইউজার ঠিক যা জিজ্ঞেস করেছে, শুধু তারই উত্তর দাও।\n- রেফারেন্সে মিল থাকলেও উপরের 🩺 রোগ নির্ণয়ের ধরন (triage) নিয়ম অগ্রাধিকার পাবে — যথেষ্ট তথ্য ছাড়া রেফারেন্স দেখে সরাসরি ডাম্প করবে না।`
            : `\n\n📚 DailyVet REFERENCE (supporting data only, NOT the answer):\n${reference}\n\n⚠️ REFERENCE RULES:\n- Use it ONLY if it directly matches the user's current message.\n- If it does not match, ignore it completely and answer from your own knowledge.\n- Never copy it verbatim. Answer exactly what the user asked.\n- Even if this reference matches, the 🩺 DIAGNOSIS STYLE (triage) rule above still takes priority — don't dump it before you have enough information.`)
        : '';

    return `${intro}${nameRule}

${speciesContext}
${imageContext}
${memoryHint}

${emotionalGuide ? labels[0] + emotionalGuide : ''}
${taskContext ? labels[1] + taskContext : ''}
${correctionContext ? labels[2] + correctionContext : ''}
${langRule}
${contextRule}
${triageRule}${triageForceNote}
${medicineRules}
${completenessRule}
${vetSuggestionRule}
${outro}${formattingRule}${referenceBlock}
${stageRule}
${confidenceRule}`;
}

// ── CONFIDENCE TAG ──
function extractConfidence(reply) {
    if (!reply) return { text: '', confidence: 'MED' };
    const re = /\[\s*CONF\s*:\s*(HIGH|MED|LOW)\s*\]\.?/gi;
    const m = re.exec(reply);
    return m ? { text: reply.replace(re, '').trim(), confidence: m[1].toUpperCase() } : { text: reply, confidence: 'MED' };
}
const CONFIDENCE_NOTES = {
    LOW: { bn: '\n\n⚠️ নিশ্চিত নই — ভেটের পরামর্শ নিন।', en: '\n\n⚠️ Not fully certain — consult a vet.' },
    MED: { bn: '\n\n💡 প্রাথমিক পরামর্শ — সন্দেহ থাকলে ভেট দেখান।', en: '\n\n💡 Preliminary advice — see a vet if unsure.' }
};
const applyConfidenceWarning = (reply, confidence, lang) => reply + (CONFIDENCE_NOTES[confidence]?.[lang === 'bn' ? 'bn' : 'en'] || '');

// ── TRIAGE STAGE TAG ──
function extractStage(reply) {
    if (!reply) return { text: '', stage: 'DIAGNOSE' };
    const re = /\[\s*STAGE\s*:\s*(ASK|DIAGNOSE)\s*\]\.?/gi;
    const m = re.exec(reply);
    return m ? { text: reply.replace(re, '').trim(), stage: m[1].toUpperCase() } : { text: reply, stage: 'DIAGNOSE' };
}

// ═══════════════════════════════════════════════════════════
// 🏥 NEARBY VETS — v7.19 FIX
// ------------------------------------------------------------------
// v7.18 was looking for a non-existent `specialties` (plural, array)
// field. The vets collection actually stores:
//   • speciality (string)  — e.g. "Medicine & Surgery"
//   • treatments (array)   — e.g. ["Cow", "Goat", "Chicken"]
//   • type (string)        — 'dairy' | 'pet' | 'poultry' | 'general'
//   • location (string)    — e.g. "Dinajpur"
//   • city (string)
//   • phone (string)
//   • available (bool)
// This version matches on those real fields. Fallback returns first 3
// available vets so the user is never left empty-handed.
// ═══════════════════════════════════════════════════════════
const VET_TYPE_BY_SPECIES = {
    cow: 'dairy', buffalo: 'dairy', goat: 'dairy', sheep: 'dairy', horse: 'dairy',
    chicken: 'poultry', duck: 'poultry', pigeon: 'poultry', quail: 'poultry',
    dog: 'pet', cat: 'pet', rabbit: 'pet', bird: 'pet', fish: 'pet'
};

const VET_TYPE_LABEL = { dairy: 'Dairy', pet: 'Pet', poultry: 'Poultry', general: 'General' };

async function findNearbyVets(species, symptom) {
    try {
        const snap = await _fs().collection('vets').where('available', '==', true).limit(50).get();
        if (snap.empty) return [];

        const all = [];
        snap.forEach(doc => {
            const d = doc.data();
            if (!d || !d.name) return;
            all.push(d);
        });
        if (all.length === 0) return [];

        // Build scoring tags from species + symptom
        const speciesTag = species ? String(species).toLowerCase() : null;
        const wantType = speciesTag ? VET_TYPE_BY_SPECIES[speciesTag] : null;
        const symptomTags = [];
        if (symptom) symptomTags.push(String(symptom).toLowerCase());
        if (['skin', 'wound', 'injury', 'lameness'].includes(symptomTags[0])) symptomTags.push('surgery');
        if (['bleeding', 'unconscious', 'poisoning', 'emergency'].includes(symptomTags[0])) symptomTags.push('emergency');

        const scored = [];
        all.forEach(vet => {
            let score = 0;

            // 1) Species match via `treatments` array
            const treatments = Array.isArray(vet.treatments) ? vet.treatments.map(t => String(t).toLowerCase()) : [];
            if (speciesTag && treatments.includes(speciesTag)) score += 20;

            // 2) Type match (dairy/pet/poultry)
            if (wantType && vet.type === wantType) score += 10;

            // 3) Symptom / speciality text match
            if (symptomTags.length) {
                const spec = String(vet.speciality || '').toLowerCase();
                const loc = String(vet.location || '').toLowerCase();
                const haystack = `${spec} ${loc}`;
                symptomTags.forEach(tag => { if (haystack.includes(tag)) score += 5; });
            }

            // 4) Small boost for verified
            if (vet.verified) score += 1;

            scored.push({ vet, score });
        });

        // Prefer vets with score > 0; keep original order stable for ties
        const ranked = scored
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);

        // Fallback: if no matches, show first 3 available vets (never empty)
        if (ranked.length === 0) return all.slice(0, 3);

        return ranked.slice(0, 3).map(x => x.vet);
    } catch (error) {
        console.warn('Vet fetch failed:', error.message);
        return [];
    }
}

// Inline formatter used by sendMessage() — same visual shape as v7.3
function formatVetSuggestion(vets, lang) {
    const bn = lang === 'bn';
    const head = bn ? '🏥 নিকটস্থ ভেটেরিনারিয়ান:' : '🏥 Nearby Veterinarians:';
    const lines = vets.map(v => {
        const name = v.name || 'Vet';
        const spec = v.speciality || VET_TYPE_LABEL[v.type] || 'Veterinarian';
        const loc = v.location || v.city || '';
        const phone = v.phone || '';
        return `👨‍⚕️ ${name}\n   ${spec}${loc ? ' · ' + loc : ''}${phone ? '\n   📞 ' + phone : ''}`;
    });
    return `\n\n${head}\n\n${lines.join('\n\n')}` + VET_HOTLINE[bn ? 'bn' : 'en'];
}

// ── IMAGE PROMPT ──
const IMAGE_PROMPT = {
    bn: `এই ছবিটি খুব মনোযোগ দিয়ে দেখুন।
১. কোন প্রাণী? (গরু / ছাগল / কুকুর / বিড়াল / মুরগি / পাখি ইত্যাদি)
২. কোন অঙ্গে সমস্যা দেখা যাচ্ছে? (খুর, ত্বক, চোখ, মুখ, পালক…)
৩. দৃশ্যমান লক্ষণ কী কী? (ক্ষত, ফোলা, রক্ত, পুঁজ, চুলকানি, রঙ পরিবর্তন…)
৪. সবচেয়ে সম্ভাব্য রোগের নাম দিন।
৫. ঘরোয়া যত্ন + vet-approved generic ঔষধ + খাদ্য + প্রতিরোধ বলুন।

উত্তর অবশ্যই এই কাঠামোতে দিন (প্রতিটি bullet আলাদা লাইনে):
🩺 রোগের নাম

📋 লক্ষণ:
• ...
• ...

🏠 ঘরোয়া যত্ন:
• ...

💊 ঔষধ (ভেটের পরামর্শে):
• ...

🥗 খাদ্য:
• ...

🛡️ প্রতিরোধ:
• ...

⚠️ সতর্কতা`,
    en: `Look at this image carefully.
1. Which animal? (cow / goat / dog / cat / chicken / bird …)
2. Which body part is affected?
3. What visible signs? (wound, swelling, blood, pus, color change…)
4. Most likely disease name.
5. Home care + vet-approved generics + diet + prevention.

Reply MUST use this structure (each bullet on its own line):
🩺 Disease name

📋 Symptoms:
• ...
• ...

🏠 Home Care:
• ...

💊 Medicine (vet-supervised):
• ...

🥗 Diet:
• ...

🛡️ Prevention:
• ...

⚠️ Warning`
};

// ═══════════════════════════════════════════════════════════
// 🤖 GEMINI — single-key helper
// ═══════════════════════════════════════════════════════════
async function callGeminiWithKey(apiKey, userMessage, lang, species, imageBase64, mood, taskType, isCorrecting, useMemory, reference, triageForce) {
    if (!apiKey) return null;
    const hasImage = !!imageBase64;

    const useSearch = !hasImage && _searchAvailable();
    const systemPrompt = buildSystemPrompt(lang, species, hasImage, mood, taskType, isCorrecting, useMemory, reference, triageForce)
        + (useSearch ? GEMINI_SEARCH_NOTE : '');
    const userParts = [];
    let promptText = userMessage;
    if (hasImage) {
        userParts.push({
            inline_data: {
                mime_type: imageBase64.includes('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/jpeg',
                data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
            }
        });
        promptText = userMessage
            ? `${userMessage}\n\n(শুধু ছবিতে যা দেখা যাচ্ছে তার ভিত্তিতে উপরের কাঠামো অনুসরণ করে উত্তর দিন। প্রতিটি bullet আলাদা লাইনে।)`
            : IMAGE_PROMPT[lang === 'bn' ? 'bn' : 'en'];
    }
    userParts.push({ text: promptText });

    const contents = conversationHistory.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    contents.push({ role: 'user', parts: userParts });

    const url = `${GEMINI_API_URL}/${hasImage ? GEMINI_VISION_MODEL : GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`;
    const requestBody = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: hasImage ? 0.3 : 0.7, maxOutputTokens: hasImage ? 1500 : 900, topP: 1 }
    };
    if (useSearch) requestBody.tools = [{ google_search: {} }];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const cand = data.candidates?.[0];
            const reply = (cand?.content?.parts || [])
                .filter(pt => pt && pt.text && !pt.thought)
                .map(pt => pt.text).join('') || null;

            const gm = cand?.groundingMetadata;
            if (gm && ((gm.webSearchQueries || []).length || (gm.groundingChunks || []).length)) {
                lastGeminiSearchInfo = {
                    queries: gm.webSearchQueries || [],
                    sources: [...new Set((gm.groundingChunks || []).map(c => c?.web?.title).filter(Boolean))]
                };
            }
            return reply ? stripMarkdown(reply) : null;
        }

        const errorText = await response.text().catch(() => '');
        if (response.status === 429) {
            console.warn('Gemini 429:', (errorText || '').slice(0, 200));
            lastGeminiFailure = 'rate_limit';
        } else if (response.status === 403) {
            console.warn('Gemini 403: key invalid/expired');
            lastGeminiFailure = 'auth';
        } else if (response.status === 400 && useSearch) {
            console.warn('Gemini 400 with search tool enabled — pausing Google Search grounding');
            searchBlockedUntil = Date.now() + SEARCH_PAUSE_MS;
            try { localStorage.setItem('dvSearchBlockedUntil', String(searchBlockedUntil)); } catch (e) {}
            lastGeminiFailure = 'search_unsupported';
        } else {
            console.warn('Gemini HTTP', response.status, (errorText || '').slice(0, 200));
            lastGeminiFailure = 'http_' + response.status;
        }
        return null;
    } catch (error) {
        clearTimeout(timeoutId);
        console.warn('Gemini fetch failed:', error.message);
        lastGeminiFailure = 'network';
        return null;
    }
}

// 🛟 Groq fallback
async function callGroqFallback(userMessage, lang, species, mood, taskType, isCorrecting, useMemory, imageBase64, reference = '', triageForce = false) {
    if (!GROQ_API_KEY || !GROQ_API_KEY.startsWith('gsk_')) return null;
    if (Date.now() < groqBlockedUntil) return null;

    const hasImage = !!imageBase64;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
    try {
        const messages = [
            { role: 'system', content: buildSystemPrompt(lang, species, hasImage, mood, taskType, isCorrecting, useMemory, reference, triageForce) },
            ...conversationHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
        ];
        let userContent = userMessage;
        if (hasImage) {
            const visionPrompt = userMessage || (lang === 'bn'
                ? `এই ছবিটি মনোযোগ দিয়ে দেখুন। কোন প্রাণী, দৃশ্যমান লক্ষণ, সম্ভাব্য রোগ, ঘরোয়া যত্ন ও vet-approved generic ঔষধ বলুন। কাঠামো: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️`
                : `Look at this image carefully. Identify the animal, visible signs, likely disease, home care and vet-approved generics. Structure: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️`);
            userContent = [
                { type: 'text', text: visionPrompt },
                { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
            ];
        }
        messages.push({ role: 'user', content: userContent });

        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
                model: hasImage ? GROQ_VISION_MODEL : GROQ_MODEL,
                messages,
                temperature: hasImage ? 0.3 : 0.7,
                max_tokens: hasImage ? 1500 : 900
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.warn('Groq failed:', response.status);
            if (response.status === 429) groqBlockedUntil = Date.now() + 30 * 1000;
            return null;
        }
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || null;
        return text ? stripMarkdown(text) : null;
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('Groq failed:', err.message);
        return null;
    }
}

// 🏎️ Gemini HEDGED call — cascades across all 3 Gemini keys.
async function callGeminiHedged(userMessage, lang, species, imageBase64, mood, taskType, isCorrecting, useMemory, reference, triageForce) {
    const wrap = (reply, keyUsed) => reply
        ? { provider: 'gemini', reply, searchInfo: lastGeminiSearchInfo, keyUsed }
        : null;
    const callKey = (key, id) => callGeminiWithKey(key, userMessage, lang, species, imageBase64, mood, taskType, isCorrecting, useMemory, reference, triageForce)
        .then(r => wrap(r, id));

    const keys = [
        [GEMINI_API_KEY, 1],
        [GEMINI_API_KEY_2, 2],
        [GEMINI_API_KEY_3, 3]
    ].filter(([key]) => !!key);

    const active = [callKey(...keys[0])];

    for (let i = 1; i < keys.length; i++) {
        const hedgeExpired = _sleep(GEMINI_HEDGE_DELAY_MS).then(() => 'hedge-expired');
        const result = await Promise.race([_firstSuccessful(active), hedgeExpired]);

        if (result && result !== 'hedge-expired') {
            _log(`✅ Gemini#${result.keyUsed} answered during hedge — skipped key #${i + 1} (cost saved)`);
            return result;
        }
        active.push(callKey(...keys[i]));
    }

    return await _firstSuccessful(active);
}

// 🆘 OpenRouter — LAST-RESORT fallback
async function callOpenRouterFallback(userMessage, lang, species, mood, taskType, isCorrecting, useMemory, imageBase64, reference = '', triageForce = false) {
    if (!OPENROUTER_API_KEY || !OPENROUTER_API_KEY.startsWith('sk-or-')) return null;

    const hasImage = !!imageBase64;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
    try {
        const messages = [
            { role: 'system', content: buildSystemPrompt(lang, species, hasImage, mood, taskType, isCorrecting, useMemory, reference, triageForce) },
            ...conversationHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
        ];
        let userContent = userMessage;
        if (hasImage) {
            const visionPrompt = userMessage || (lang === 'bn'
                ? `এই ছবিটি মনোযোগ দিয়ে দেখুন। কোন প্রাণী, দৃশ্যমান লক্ষণ, সম্ভাব্য রোগ, ঘরোয়া যত্ন ও vet-approved generic ঔষধ বলুন। কাঠামো: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️`
                : `Look at this image carefully. Identify the animal, visible signs, likely disease, home care and vet-approved generics. Structure: 🩺 📋 🏠 💊 🥗 🛡️ ⚠️`);
            userContent = [
                { type: 'text', text: visionPrompt },
                { type: 'image_url', image_url: { url: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` } }
            ];
        }
        messages.push({ role: 'user', content: userContent });

        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': (typeof location !== 'undefined' && location.origin) ? location.origin : 'https://dailyvet.app',
                'X-Title': 'DailyVet'
            },
            body: JSON.stringify({
                model: hasImage ? OPENROUTER_VISION_MODEL : OPENROUTER_MODEL,
                messages,
                temperature: hasImage ? 0.3 : 0.7,
                max_tokens: hasImage ? 1500 : 900
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.warn('OpenRouter failed:', response.status, errorText.slice(0, 200));
            return null;
        }
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || null;
        return text ? stripMarkdown(text) : null;
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('OpenRouter fetch failed:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// ⚡ Priority race
// ═══════════════════════════════════════════════════════════
async function raceAIProviders(userMessage, lang, species, imageBase64, mood, taskType, isCorrecting, useMemory, reference, triageForce) {
    const startTime = Date.now();
    const hasImage = !!imageBase64;
    const elapsed = () => Date.now() - startTime;
    let geminiSucceeded = false;

    _log('🏁 Priority race: Gemini (hedged) → Groq (gated) → OpenRouter (last resort)');

    const setLoaderLabel = (text) => {
        const labelEl = _el('typingIndicator')?.querySelector('.dv-label');
        if (labelEl) labelEl.textContent = text;
    };

    const gracePromise = _sleep(GEMINI_GRACE_MS).then(() => 'grace-expired');

    const geminiPromise = (async () => {
        try {
            const result = await callGeminiHedged(userMessage, lang, species, imageBase64, mood, taskType, isCorrecting, useMemory, reference, triageForce);
            if (result) {
                geminiSucceeded = true;
                _log(`⚡ Gemini#${result.keyUsed} answered in ${elapsed()}ms`);
                if (hasImage) setLoaderLabel('Gemini Vision is Analysing');
                return result;
            }
        } catch (err) {
            console.warn('Gemini failed:', err.message);
        }
        return null;
    })();

    const groqPromise = (async () => {
        await Promise.race([geminiPromise, gracePromise]);
        if (geminiSucceeded) {
            _log('🧊 Skipping Groq — Gemini already answered (cost saved)');
            return null;
        }
        try {
            const reply = await callGroqFallback(userMessage, lang, species, mood, taskType, isCorrecting, useMemory, imageBase64, reference, triageForce);
            if (reply) {
                _log(`⚡ Groq answered in ${elapsed()}ms`);
                if (hasImage) setLoaderLabel('Groq Vision is Analysing');
                return { provider: 'groq', reply, searchInfo: null };
            }
        } catch (err) {
            console.warn('Groq failed:', err.message);
        }
        return null;
    })();

    const early = await Promise.race([geminiPromise, gracePromise]);
    if (early && early !== 'grace-expired') return early;

    const remaining = Math.max(RACE_TIMEOUT_MS - elapsed(), 0);
    const hardTimeout = _sleep(remaining).then(() => null);
    const phase2 = await Promise.race([_firstSuccessful([geminiPromise, groqPromise]), hardTimeout]);
    if (phase2) return phase2;

    console.warn(`⏰ Gemini + Groq both unavailable after ${elapsed()}ms — trying OpenRouter`);
    try {
        const orReply = await callOpenRouterFallback(userMessage, lang, species, mood, taskType, isCorrecting, useMemory, imageBase64, reference, triageForce);
        if (orReply) {
            _log(`⚡ OpenRouter answered in ${elapsed()}ms`);
            if (hasImage) setLoaderLabel('AI is Analysing');
            return { provider: 'openrouter', reply: orReply, searchInfo: null };
        }
    } catch (err) {
        console.warn('OpenRouter failed:', err.message);
    }

    return null;
}

// ── TEXT CLEANUP ──
function stripMarkdown(text) {
    if (!text) return '';
    return _nl(text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^#+\s*/gm, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, ''))
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function forcePremiumFormatting(text) {
    if (!text) return '';
    let t = _nl(text);

    ['🩺', '📋', '🏠', '💊', '🥗', '🛡️', '⚠️', '🚨', '💡', '👨‍⚕️', '📞'].forEach(em => {
        t = t.replace(new RegExp(`([^\\n])\\s*(${_reEsc(em)})`, 'g'), '$1\n\n$2');
    });

    t = t.replace(/([^\n])\s*(•|🔹|▪|‣|●|○)\s*/g, '$1\n$2 ');
    t = t.replace(/([.।!?\n])\s+-\s+/g, '$1\n• ');

    ['📋', '🏠', '💊', '🥗', '🛡️'].forEach(em => { t = t.replace(new RegExp(`(${em}\\s*[^\\n:]*:)\\s*(•)`, 'g'), '$1\n$2'); });
    t = t.replace(/(🩺\s*[^\n:]*:)\s*/g, '$1\n');
    t = t.replace(/(🩺[^\n]*নাম:)\s*([^\n•]+)/g, '$1\n$2');
    t = t.replace(/(🩺\s*Disease[^:\n]*:)\s*([^\n•]+)/gi, '$1\n$2');

    return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trim();
}

// ── QUICK REPLIES ──
const QUICK_REPLIES = {
    en: {
        greeting:  (n) => n ? `${n.trim()}, tell me about your pet's problem — text or photo. 🐾` : `Tell me about your pet's problem — text or photo. 🐾`,
        howAreYou: (n) => n ? `${n.trim()}, I'm doing well. What's your pet's problem? 🐾` : `I'm doing well. What's your pet's problem? 🐾`,
        thanks:    ()  => `You're welcome! Take good care of your pet. 🐾`
    },
    bn: {
        greeting:  (n) => n ? `${n.trim()}, বলুন আপনার পশুর সমস্যা — লেখা বা ছবি। 🐾` : `বলুন আপনার পশুর সমস্যা — লেখা বা ছবি। 🐾`,
        howAreYou: (n) => n ? `${n.trim()}, আমি ভালো আছি। আপনার পশুর কী সমস্যা? 🐾` : `আমি ভালো আছি। আপনার পশুর কী সমস্যা? 🐾`,
        thanks:    ()  => `স্বাগতম! আপনার পশুর যত্ন নিন। 🐾`
    }
};
const _QK = 'k(?:e|a|ai)?m(?:o|u)?n(?:e)?';
const _QA = '(?:aso|acho|asen|achen|asho|achho|achhen|ashen|achi|aci|asi|aco)';
const QUICK_HOWAREYOU_RE = new RegExp(
    "how\\s*(?:are|r)\\s*(?:you|u|ya)(?![a-z])|how\\s*is\\s*it\\s*going|what'?s\\s*up(?![a-z])|" +
    _QK + '\\s+' + _QA + '(?![a-z])|' +
    '(?:valo|bhalo|balo)\\s+' + _QA + '(?![a-z])|' +
    '(?:tumi|apni|tui)\\s+(?:ki\\s+)?(?:' + _QK + '|valo|bhalo|balo)(?![a-z])|' +
    'ki\\s*khobor|khobor\\s*ki|' +
    'কেমন\\s*আ(?:ছ|চ)\\S*|কি\\s*খবর|কী\\s*খবর|ভালো\\s*আ(?:ছ|চ)\\S*', 'i');
const QUICK_GREETING_RE = /^(?:hi+|hello+|helo|hallo|hey+|yo|assalam\w*|salam|slm|nomoshkar|namaskar|good\s*(?:morning|afternoon|evening|night))(?![a-z])|^(?:হ্যালো|হাই|আসসালামু|সালাম|নমস্কার|শুভ\s*(?:সকাল|সন্ধ্যা|রাত্রি))/i;
const QUICK_THANKS_RE = /^(?:thanks?|thank\s*(?:you|u)|thx|tnx|ty|dhonn?y?o?baa?[dt]|dhanyabad|dhonyobad|shukriy?a)(?![a-z])|^(?:ধন্যবাদ|শুকরিয়া|থ্যাঙ্কস|থ্যাংকস)/i;
const QUICK_GREETINGS = [
    [/assalam|salam|সালাম|আসসালামু/i, 'ওয়ালাইকুম আসসালাম'],
    [/nomoshkar|namaskar|নমস্কার/i, 'নমস্কার'],
    [/শুভ\s*সকাল|good\s*morning/i, 'শুভ সকাল'],
    [/শুভ\s*সন্ধ্যা|good\s*evening/i, 'শুভ সন্ধ্যা']
];

function getQuickReply(text, lang, hasPetContent) {
    if (!text || hasPetContent) return null;
    const clean = text.toLowerCase().replace(/[!?.,;:।"~*]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean || clean.split(' ').length > 7) return null;

    const first = userName && userName !== 'User' ? userName.split(' ')[0] : '';
    const n = first ? ' ' + first : '';
    let q = QUICK_REPLIES[lang] || QUICK_REPLIES.en;
    if (QUICK_HOWAREYOU_RE.test(clean) && !/how\s*(?:are|r|is)|what'?s\s*up/.test(clean)) q = QUICK_REPLIES.bn;

    const g = QUICK_GREETINGS.find(([re]) => re.test(clean));
    if (g) return { type: 'greeting', reply: `${first ? first + ', ' : ''}${g[1]}। বলুন আপনার পশুর সমস্যা। 🐾` };
    if (QUICK_HOWAREYOU_RE.test(clean)) return { type: 'howAreYou', reply: q.howAreYou(n) };
    if (QUICK_GREETING_RE.test(clean)) return { type: 'greeting', reply: q.greeting(n) };
    if (QUICK_THANKS_RE.test(clean)) return { type: 'thanks', reply: q.thanks() };
    return null;
}

// ── LOCAL KNOWLEDGE BASE ──
const DAILYVET_KB = {
    bn: {
        'গরুর টিকা': 'গরুর প্রধান টিকা: FMD (৬ মাস পর পর), Anthrax (বছরে ১ বার), HS (বছরে ১ বার), BQ (বছরে ১ বার)। বাছুরের বয়স ৪ মাস হলে প্রথম টিকা দিতে হয়।\n\n⚠️ সঠিক সময়সূচি এলাকাভেদে ভিন্ন হতে পারে — কাছের ভেটেরিনারিয়ানের সাথে যাচাই করুন।',
        'ছাগলের টিকা': 'ছাগলের প্রধান টিকা: PPR (৩-৪ মাস বয়সে, বছরে ১ বার বুস্টার), FMD (৬ মাস পর পর), Enterotoxaemia (বছরে ১ বার)।\n\n⚠️ সঠিক সময়সূচি ভেটেরিনারিয়ান নির্ধারণ করবেন।',
        'কুকুরের টিকা': 'কুকুরের টিকা: DHPP (৬-৮ সপ্তাহ বয়সে শুরু, মোট ৩ ডোজ, ৩-৪ সপ্তাহ পরপর), Rabies (১২ সপ্তাহ বয়সে, এরপর বছরে ১ বার বুস্টার)।\n\n⚠️ সঠিক সময়সূচি ভেটেরিনারিয়ান নির্ধারণ করবেন।',
        'বিড়ালের টিকা': 'বিড়ালের টিকা: FVRCP (৬-৮ সপ্তাহ বয়সে শুরু, মোট ৩ ডোজ), Rabies (১২ সপ্তাহ বয়সে, বছরে ১ বার বুস্টার)।\n\n⚠️ সঠিক সময়সূচি ভেটেরিনারিয়ান নির্ধারণ করবেন।',
        'মুরগির টিকা': 'মুরগির টিকা: Ranikhet/ND (৭ দিনে প্রথম, ২৮ দিনে দ্বিতীয়), Gumboro (১৪ দিনে), Fowl Pox (৬ সপ্তাহে)।\n\n⚠️ সঠিক সময়সূচি ভেটেরিনারিয়ান/হ্যাচারি অনুযায়ী কিছুটা ভিন্ন হতে পারে।',
        'গরুর দুধ বাড়ানোর উপায়': 'দুধ বাড়ানোর উপায়:\n🔹 সুষম খাদ্য\n🔹 পর্যাপ্ত পরিষ্কার পানি\n🔹 নিয়মিত ও সময়মতো দোহন\n🔹 খনিজ মিশ্রণ\n🔹 নিয়মিত কৃমিনাশক\n\n⚠️ হঠাৎ দুধ কমে গেলে এটা অসুস্থতার লক্ষণও হতে পারে।',
        'বিড়ালের খাবার': 'বিড়ালের জন্য উপযুক্ত খাবার:\n🔹 উচ্চ প্রোটিন খাবার (মাছ, মুরগি — রান্না করা)\n🔹 টাউরিন সমৃদ্ধ ক্যাট ফুড\n🔹 পর্যাপ্ত পরিষ্কার পানি\n\n❌ বিষাক্ত: চকলেট, পেঁয়াজ, রসুন, কাঁচা ডিমের সাদা অংশ, দুধ।',
        'কুকুরের খাবার': 'কুকুরের জন্য উপযুক্ত খাবার:\n🔹 রান্না করা মাংস/মুরগি (হাড় ছাড়া), ভাত, সবজি\n🔹 উচ্চমানের ডগ ফুড\n\n❌ বিষাক্ত: চকলেট, পেঁয়াজ, রসুন, আঙুর/কিশমিশ, অ্যাভোকাডো, xylitol।',
        'কৃমিনাশক কতদিন পর পর': 'সাধারণ কৃমিনাশক সময়সূচি:\n🔹 বাছুর/ছাগল/ভেড়া: প্রতি ৩ মাস পর পর\n🔹 কুকুর/বিড়াল (বাচ্চা): ২ সপ্তাহ পর পর ৩ মাস বয়স পর্যন্ত\n🔹 কুকুর/বিড়াল (বড়): প্রতি ৩ মাসে ১ বার\n\n⚠️ ওজন অনুযায়ী ডোজ ভেটেরিনারিয়ান নির্ধারণ করবেন।'
    },
    en: {
        'cow vaccination schedule': 'Cattle vaccines: FMD (every 6 months), Anthrax (yearly), HS (yearly), BQ (yearly). First dose at 4 months.\n\n⚠️ Exact schedule can vary by region.',
        'goat vaccination': 'Goat vaccines: PPR (3-4 months, yearly booster), FMD (every 6 months), Enterotoxaemia (yearly).\n\n⚠️ A vet should confirm.',
        'dog vaccination schedule': 'Dog vaccines: DHPP (starts at 6-8 weeks, 3 doses 3-4 weeks apart), Rabies (at 12 weeks, then yearly booster).\n\n⚠️ A vet should confirm.',
        'cat vaccination schedule': 'Cat vaccines: FVRCP (starts at 6-8 weeks, 3 doses), Rabies (at 12 weeks, yearly booster).\n\n⚠️ A vet should confirm.',
        'chicken vaccination': 'Poultry vaccines: Ranikhet/ND (day 7, day 28), Gumboro (day 14), Fowl Pox (week 6).\n\n⚠️ Exact schedule can vary by hatchery.',
        'increase cow milk': 'Ways to increase milk yield:\n🔹 Balanced diet\n🔹 Plenty of clean water\n🔹 Regular milking times\n🔹 Mineral mixture\n🔹 Regular deworming\n\n⚠️ Sudden drop can signal illness.',
        'cat food': 'Good food for cats:\n🔹 High-protein food (cooked fish/chicken)\n🔹 Taurine-fortified cat food\n🔹 Clean water\n\n❌ Toxic: chocolate, onion, garlic, raw egg whites, milk.',
        'dog food': 'Good food for dogs:\n🔹 Cooked meat/chicken (no bones), rice, vegetables\n🔹 Quality commercial dog food\n\n❌ Toxic: chocolate, onion, garlic, grapes/raisins, avocado, xylitol.',
        'deworming schedule': 'General deworming schedule:\n🔹 Calves/goats/sheep: every 3 months\n🔹 Puppies/kittens: every 2 weeks until 3 months, then monthly until 6 months, then every 3 months\n\n⚠️ A vet should confirm the exact dose.'
    }
};
const KB_ALIASES = {
    bn: {
        'gorur tika': 'গরুর টিকা', 'goru tika': 'গরুর টিকা', 'gorur vaccine': 'গরুর টিকা', 'gorur vaccination': 'গরুর টিকা',
        'chagoler tika': 'ছাগলের টিকা', 'chagol tika': 'ছাগলের টিকা',
        'kukurer tika': 'কুকুরের টিকা', 'kukur tika': 'কুকুরের টিকা', 'dog er tika': 'কুকুরের টিকা',
        'biraler tika': 'বিড়ালের টিকা', 'biral tika': 'বিড়ালের টিকা', 'cat er tika': 'বিড়ালের টিকা',
        'murgir tika': 'মুরগির টিকা', 'murgi tika': 'মুরগির টিকা',
        'gorur dudh': 'গরুর দুধ বাড়ানোর উপায়', 'dudh barano': 'গরুর দুধ বাড়ানোর উপায়', 'dudh baranor': 'গরুর দুধ বাড়ানোর উপায়',
        'biraler khabar': 'বিড়ালের খাবার', 'biral khabar': 'বিড়ালের খাবার', 'cat food': 'বিড়ালের খাবার',
        'kukurer khabar': 'কুকুরের খাবার', 'kukur khabar': 'কুকুরের খাবার', 'dog food': 'কুকুরের খাবার',
        'krimnashok': 'কৃমিনাশক কতদিন পর পর', 'krimi nashok': 'কৃমিনাশক কতদিন পর পর',
        'deworm': 'কৃমিনাশক কতদিন পর পর', 'deworming': 'কৃমিনাশক কতদিন পর পর', 'worm tablet': 'কৃমিনাশক কতদিন পর পর'
    },
    en: {
        'cow vaccine': 'cow vaccination schedule', 'cattle vaccine': 'cow vaccination schedule',
        'cattle vaccination': 'cow vaccination schedule',
        'goat vaccine': 'goat vaccination',
        'dog vaccine': 'dog vaccination schedule', 'puppy vaccine': 'dog vaccination schedule',
        'cat vaccine': 'cat vaccination schedule', 'kitten vaccine': 'cat vaccination schedule',
        'chicken vaccine': 'chicken vaccination', 'poultry vaccine': 'chicken vaccination', 'poultry vaccination': 'chicken vaccination',
        'milk yield': 'increase cow milk', 'increase milk': 'increase cow milk',
        'deworm': 'deworming schedule', 'worming schedule': 'deworming schedule'
    }
};

function getFromKB(text, lang) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const find = (kb, aliases) => {
        for (const [k, answer] of Object.entries(kb)) if (lower.includes(k.toLowerCase())) return answer;
        for (const [a, realKey] of Object.entries(aliases)) if (lower.includes(a.toLowerCase()) && kb[realKey]) return kb[realKey];
        return null;
    };
    return find(DAILYVET_KB[lang] || {}, KB_ALIASES[lang] || {}) ||
        (lang === 'bn' ? find(DAILYVET_KB.en || {}, KB_ALIASES.en || {}) : null);
}

// ── DISEASE DATABASE ──
let diseaseCache = null;
let diseaseCacheTime = 0;
const DISEASE_CACHE_TTL = 5 * 60 * 1000;

async function getDiseasesFromDB() {
    const now = Date.now();
    if (diseaseCache && now - diseaseCacheTime < DISEASE_CACHE_TTL) return diseaseCache;
    try {
        const snap = await _fs().collection('diseases').limit(100).get();
        if (snap.empty) return [];
        const arr = [];
        snap.forEach(doc => arr.push(doc.data()));
        diseaseCache = arr;
        diseaseCacheTime = now;
        return arr;
    } catch (err) {
        console.warn('Disease DB load failed:', err.message);
        return [];
    }
}

async function lookupDiseaseFromDB(userText, species, symptom) {
    if (!userText || (!species && !symptom)) return null;
    const diseases = await getDiseasesFromDB();
    if (!diseases.length) return null;

    const lower = userText.toLowerCase();
    let best = null, bestScore = 0;

    diseases.forEach(d => {
        let score = 0;
        let evidence = 0;
        const hit = pts => { score += pts; evidence += pts; };

        if (species && d.animal_type) {
            const dAnimal = d.animal_type.toLowerCase();
            const key = species.toLowerCase();
            const matched = dAnimal.includes(key) ||
                (key === 'chicken' && dAnimal.includes('poultry')) ||
                (key === 'cow' && dAnimal.includes('cattle')) ||
                (key === 'buffalo' && dAnimal.includes('buffalo'));
            if (!matched) return;
            score += 10;
        }
        if (d.disease_name_bn && lower.includes(d.disease_name_bn.toLowerCase())) hit(15);
        if (d.disease_name_en && lower.includes(d.disease_name_en.toLowerCase())) hit(15);
        if (d.disease_name_local && lower.includes(d.disease_name_local.toLowerCase())) hit(12);
        (d.tags || []).forEach(tag => { if (tag.length >= 3 && lower.includes(tag.toLowerCase())) hit(5); });
        [...(d.symptoms?.bn || []), ...(d.symptoms?.en || [])].forEach(s => {
            const sl = s.toLowerCase();
            if (sl.length >= 4 && lower.includes(sl)) hit(4);
        });

        if (evidence === 0) return;
        if (score > bestScore) { bestScore = score; best = d; }
    });
    return bestScore >= 10 ? best : null;
}

function formatDiseaseFromDB(d, lang) {
    const bn = lang === 'bn';
    const name = bn ? (d.disease_name_bn || d.disease_name_en) : (d.disease_name_en || d.disease_name_bn);
    const block = (title, items, max) => items.length ? `${title}\n${items.slice(0, max).map(i => `• ${i}`).join('\n')}\n\n` : '';

    let text = `🩺 ${name}${d.disease_name_local && bn ? ` (${d.disease_name_local})` : ''}\n\n`;
    text += block(bn ? '📋 লক্ষণ:' : '📋 Symptoms:', d.symptoms?.[lang] || d.symptoms?.en || [], 5);
    text += block(bn ? '🏠 ঘরোয়া যত্ন:' : '🏠 Home Care:', d.home_care?.[lang] || d.home_care?.en || [], 4);
    text += block(bn ? '💊 ঔষধ (ভেটের পরামর্শে):' : '💊 Medicine (vet-supervised):',
        (d.treatment || []).map(t => t.generic_name + (t.purpose ? ` — ${t.purpose}` : '')), 3);
    text += block(bn ? '🥗 খাদ্য:' : '🥗 Diet:', d.diet_advice?.do?.[lang] || d.diet_advice?.do?.bn || [], 3);
    text += block(bn ? '🛡️ প্রতিরোধ:' : '🛡️ Prevention:', d.prevention?.[lang] || d.prevention?.bn || [], 3);
    if (d.danger_level?.simple_bn && bn) text += `⚠️ ${d.danger_level.simple_bn}\n\n`;
    if (d.emergency_action) text += bn ? `🚨 জরুরি: ${d.emergency_action}\n\n` : `🚨 Emergency: ${d.emergency_action}\n\n`;
    return text + (bn ? '💡 সঠিক চিকিৎসার জন্য ভেটের পরামর্শ নিন।' : '💡 For proper treatment, consult a vet.');
}

// ── EMERGENCY / PERSONALIZATION ──
const EMERGENCY_KEYWORDS = [
    'bleeding', 'blood', 'seizure', 'unconscious', 'poison', 'poisoned', 'toxic',
    'choking', 'accident', 'hit by', 'gari chapa', 'গাড়ি চাপা', 'snake bite', 'সাপে কামড়',
    'not breathing', 'difficulty breathing', 'gasping', 'labor complication',
    'stuck delivery', 'prolapse', 'high fever', 'heat stroke', 'heatstroke',
    'paralysis', 'পক্ষাঘাত', 'collapsed', 'collapse', 'won\'t get up', 'uthte parche na',
    'উঠতে পারছে না', 'multiple days not eating', 'তিন দিন খাচ্ছে না',
    'রক্ত', 'খিঁচুনি', 'অচেতন', 'বিষ', 'শ্বাসকষ্ট', 'দুর্ঘটনা', 'হিট স্ট্রোক'
];
const checkEmergency = text => _has(text, EMERGENCY_KEYWORDS);

function personalizeReply(text, lang) {
    if (!userName || userName === 'User' || !text) return text;
    const firstName = userName.split(' ')[0];
    if (text.includes(firstName)) return text;
    const shouldPersonalize = /sorry|দুঃখিত|চিন্তা করবেন না|জরুরি|emergency|🚨/i.test(text);
    if (!shouldPersonalize) return text;
    return `${firstName}, ${text}`;
}

// ── RENDERING ──
function formatAiLine(line) {
    const isBullet = /^\s*(?:•|🔹|▪|‣|●|○|-|–)\s/.test(line);
    if (!isBullet) {
        if (/^\s*(?:\S{1,20},\s+)?🩺/.test(line)) return `<strong>${escapeHtml(line)}</strong>`;
        const m = line.match(/^(\s*[^\n:：]{1,45}?[:：])(?=\s|$)(.*)$/u);
        if (m) return `<strong>${escapeHtml(m[1])}</strong>${escapeHtml(m[2])}`;
    }
    return escapeHtml(line);
}

async function addMessage(type, text, imageBase64) {
    const container = _el('chatMessages');
    if (!container) return;

    if (type === 'user' && cachedUserPhoto === null) {
        await getUserPhoto();
    }

    const div = document.createElement('div');
    div.className = `message ${type}-message`;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let userAvatarHTML;
    if (cachedUserPhoto) {
        userAvatarHTML = `<img src="${cachedUserPhoto}" alt="${escapeHtml(userName)}" />`;
    } else {
        userAvatarHTML = userName.charAt(0).toUpperCase();
    }

    const avatar = type === 'ai'
        ? `<div class="avatar ai-avatar-small"><img src="assets/dailyvetlogo.jpeg" alt="AI" /></div>`
        : `<div class="avatar user-avatar">${userAvatarHTML}</div>`;

    let content = imageBase64 ? `<div class="bubble-image"><img src="${imageBase64}" alt="Sent" /></div>` : '';
    if (text) {
        const hasGoogleOption = text.includes('[[SHOW_GOOGLE_OPTION]]');
        const cleanText = text.replace('[[SHOW_GOOGLE_OPTION]]', '').trim();

        const formatted = type === 'ai'
            ? cleanText.replace(/\\n/g, '\n').split('\n').map(formatAiLine).join('<br>')
            : escapeHtml(cleanText).replace(/\\n/g, '\n').replace(/\n/g, '<br>');

        content += `<p style="white-space:pre-wrap;line-height:1.6;margin:0 0 8px;">${formatted}</p>`;

        if (hasGoogleOption && type === 'ai') {
            content += `
                <div class="google-search-options">
                    <button class="google-opt-btn google-yes-btn" onclick="handleGoogleSearchYes()">
                        <i class="fas fa-check"></i>
                        <span>হ্যাঁ, Google-এ খুঁজুন</span>
                    </button>
                    <button class="google-opt-btn google-no-btn" onclick="handleGoogleSearchNo()">
                        <i class="fas fa-times"></i>
                        <span>না, এটাই যথেষ্ট</span>
                    </button>
                </div>
            `;
        }
    }
    content += `<span class="timestamp">${time}</span>`;

    const bubble = `<div class="bubble">${content}</div>`;
    div.innerHTML = type === 'ai' ? avatar + bubble : bubble + avatar;
    container.appendChild(div);
    _scrollChatToBottom();

    if (type === 'user') {
        const chips = _el('suggestionChips');
        if (chips) chips.style.display = 'none';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// ✨ AI THINKING LOADER
// ═══════════════════════════════════════════════════════════
const THINK_TEXTS = {
    default: [
        'DailyVet is searching',
        'DailyVet is analyzing your answer',
        'DailyVet is preparing response',
        'DailyVet is almost ready'
    ],
    vision: [
        'Gemini Vision is Analysing',
        'Groq Vision is Analysing',
        'DailyVet is searching',
        'DailyVet is analyzing the image',
        'DailyVet is preparing response',
        'DailyVet is almost ready'
    ]
};
const THINK_TEXT_INTERVAL_MS = 1500;

const THINK_ICONS = {
    google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
    gemini: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M12 0C12 6.63 6.63 12 0 12c6.63 0 12 5.37 12 12 0-6.63 5.37-12 12-12-6.63 0-12-5.37-12-12z"/></svg>',
    groq: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#F55036"/><path d="M16.7 9.2A5.5 5.5 0 1 0 17.5 12H12.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    openrouter: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#6E56CF"/><path d="M8 12h8M12 8v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    pill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>'
};

function _iconHtml(name) {
    return ['google', 'gemini', 'groq', 'openrouter'].includes(name)
        ? `<span class="dv-ic dv-ic-${name}">${THINK_ICONS[name]}</span>`
        : THINK_ICONS[name];
}

const THINK_SOURCES = [
    { id: 'db', label: 'Disease DB', icon: 'book' },
    { id: 'kb', label: 'Medicine KB', icon: 'pill' },
    { id: 'google', label: 'Google Search', icon: 'google' },
    { id: 'gemini', label: 'Gemini', icon: 'gemini' },
    { id: 'groq', label: 'Groq', icon: 'groq' }
];

const THINK_STAGES = {
    db: ['db'],
    kb: ['kb'],
    search: ['google', 'gemini', 'groq'],
    gemini: ['gemini', 'groq'],
    groq: ['gemini', 'groq'],
    ai: ['gemini', 'groq'],
    vision: ['gemini', 'groq']
};
let _thinkTimers = [];

function ensureThinkingStyles() {
    if (_el('dvThinkStyles')) return;
    if (!_el('dvThinkFont')) {
        const l = document.createElement('link');
        l.id = 'dvThinkFont';
        l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500&display=swap';
        document.head.appendChild(l);
    }
    const s = document.createElement('style');
    s.id = 'dvThinkStyles';
    s.textContent = `
.dv-avatar{width:32px;height:32px;min-width:32px;border-radius:50%;overflow:hidden;flex-shrink:0;
    border:1.5px solid #b2e0e6;box-shadow:0 2px 6px rgba(3,93,105,.15);background:#fff}
.dv-avatar img{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
.dv-think{position:relative;overflow:hidden;box-sizing:border-box;
    background:#eef7f8;border:1px solid rgba(178,224,230,.7);
    border-radius:18px 18px 18px 4px;padding:12px 16px;
    max-width:280px;min-width:0;
    box-shadow:0 4px 12px rgba(3,93,105,.08)}
.dv-think::after{content:"";position:absolute;inset:0;pointer-events:none;
    background:linear-gradient(90deg,transparent,rgba(178,224,230,.4),transparent);
    transform:translateX(-100%);animation:dvShimmer 2s ease-in-out infinite}
@keyframes dvShimmer{0%{transform:translateX(-100%)}60%,100%{transform:translateX(100%)}}
.dv-row{display:flex;align-items:center;gap:8px;position:relative;z-index:1}
.dv-dots{display:inline-flex;align-items:center;gap:5px;flex-shrink:0}
.dv-dots i{width:7px;height:7px;border-radius:50%;background:#088F8F;display:block;
    box-shadow:0 0 6px rgba(8,143,143,.3);
    animation:dvBounce 1.4s ease-in-out infinite}
.dv-dots i:nth-child(2){animation-delay:.2s}
.dv-dots i:nth-child(3){animation-delay:.4s}
@keyframes dvBounce{
    0%,60%,100%{transform:translateY(0);opacity:.5}
    30%{transform:translateY(-6px);opacity:1}}
.dv-text{font-family:'Poppins','Hind Siliguri',system-ui,-apple-system,'Segoe UI',sans-serif;
    font-weight:500;font-size:13px;line-height:1.35;letter-spacing:.2px;color:#088F8F;min-width:0}
.dv-label{transition:opacity .18s ease}
.dv-label.dv-out{opacity:0}
.dv-ell i{font-style:normal;opacity:0;animation:dvEll 1.5s infinite}
.dv-ell i:nth-child(2){animation-delay:.25s}
.dv-ell i:nth-child(3){animation-delay:.5s}
@keyframes dvEll{0%{opacity:0}25%,85%{opacity:1}100%{opacity:0}}
.dv-sources{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;position:relative;z-index:1}
.dv-src{display:inline-flex;align-items:center;height:22px;padding:0 6px;border-radius:11px;
    background:rgba(178,224,230,.35);color:#035D69;
    font-family:'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;font-weight:500;
    opacity:.4;transform:scale(.85);transform-origin:left center;
    transition:opacity .3s ease,transform .3s ease}
.dv-src svg{width:12px;height:12px;flex-shrink:0;display:block}
.dv-src-label{max-width:0;overflow:hidden;white-space:nowrap;opacity:0;
    transition:max-width .3s ease,opacity .3s ease,margin .3s ease}
.dv-src.is-done{opacity:.6;transform:scale(.95)}
.dv-src.is-active{opacity:1;transform:scale(1);animation:dvPulse 1.6s ease-in-out infinite}
.dv-src.is-active .dv-src-label{max-width:90px;opacity:1;margin-left:5px}
@keyframes dvPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.dv-source-badge{display:inline-flex;align-items:center;gap:6px;max-width:100%;margin:2px 0 8px;padding:3px 9px;border-radius:12px;
    background:rgba(178,224,230,.35);color:#035D69;
    font-family:'Poppins',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;font-weight:500;line-height:1.4}
.dv-source-badge svg{width:12px;height:12px;flex-shrink:0;display:block}
.dv-source-badge span{white-space:normal;overflow-wrap:anywhere}
.dv-badge-icons{display:inline-flex;align-items:center;gap:3px;flex-shrink:0}
.dv-source-badge small{display:block;font-size:10px;font-weight:500;opacity:.75}
.dv-dark .dv-source-badge,[data-theme="dark"] .dv-source-badge{background:rgba(178,224,230,.12);color:#b2e0e6}
.dv-dark .dv-think,[data-theme="dark"] .dv-think{background:rgba(178,224,230,.08);border-color:rgba(178,224,230,.18);box-shadow:0 4px 12px rgba(0,0,0,.25)}
.dv-dark .dv-dots i,[data-theme="dark"] .dv-dots i{background:#4fd1d1;box-shadow:0 0 6px rgba(79,209,209,.4)}
.dv-dark .dv-text,[data-theme="dark"] .dv-text{color:#7fd6d6}
.dv-dark .dv-src,[data-theme="dark"] .dv-src{background:rgba(178,224,230,.12);color:#b2e0e6}
.dv-ic{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(3,93,105,.15)}
.dv-think .dv-ic svg{width:12px;height:12px}
.dv-think .dv-ic-gemini svg{width:14px;height:14px}
@media (prefers-reduced-motion:reduce){
    .dv-think::after,.dv-dots i,.dv-src.is-active{animation:none}
    .dv-ell i{animation:none;opacity:1}
}`;
    document.head.appendChild(s);
}

function _clearThinkTimers() {
    _thinkTimers.forEach(t => { clearInterval(t); clearTimeout(t); });
    _thinkTimers = [];
}

function setTypingStage(stage) {
    const el = _el('typingIndicator');
    if (!el) return;
    const active = THINK_STAGES[stage] || [];
    el.querySelectorAll('.dv-src').forEach(p => {
        if (active.includes(p.dataset.src)) {
            p.classList.add('is-active');
            p.classList.remove('is-done');
            p.dataset.seen = '1';
        } else {
            p.classList.remove('is-active');
            if (p.dataset.seen === '1') p.classList.add('is-done');
        }
    });
}

function showTyping(initialStage) {
    const container = _el('chatMessages');
    if (!container || _el('typingIndicator')) return;
    ensureThinkingStyles();
    _clearThinkTimers();

    const pills = THINK_SOURCES.filter(s => s.id !== 'google' || (initialStage !== 'vision' && _searchAvailable())).map(s =>
        `<span class="dv-src" data-src="${s.id}" title="${s.label}">${_iconHtml(s.icon)}<span class="dv-src-label">${s.label}</span></span>`
    ).join('');

    const isVision = initialStage === 'vision';
    const texts = isVision ? THINK_TEXTS.vision : THINK_TEXTS.default;

    const el = document.createElement('div');
    el.className = 'message ai-message';
    el.id = 'typingIndicator';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'DailyVet is thinking');
    el.innerHTML = `
        <div class="avatar ai-avatar-small dv-avatar"><img src="assets/dailyvetlogo.jpeg" alt="AI" /></div>
        <div class="dv-think">
            <div class="dv-row">
                <span class="dv-dots"><i></i><i></i><i></i></span>
                <span class="dv-text"><span class="dv-label">${texts[0]}</span><span class="dv-ell"><i>.</i><i>.</i><i>.</i></span></span>
            </div>
            <div class="dv-sources">${pills}</div>
        </div>
    `;
    container.appendChild(el);
    _scrollChatToBottom();
    setTypingStage(initialStage || 'db');

    const labelEl = el.querySelector('.dv-label');
    let idx = 0;
    const iv = setInterval(() => {
        if (idx >= texts.length - 1) { clearInterval(iv); return; }
        idx++;
        labelEl.classList.add('dv-out');
        _thinkTimers.push(setTimeout(() => {
            labelEl.textContent = texts[idx];
            labelEl.classList.remove('dv-out');
        }, 180));
    }, THINK_TEXT_INTERVAL_MS);
    _thinkTimers.push(iv);
}

const PROVIDER_BADGES = {
    gemini:     { icons: ['gemini'],     text: 'Gemini is collabed with DailyVet' },
    groq:       { icons: ['groq'],       text: 'Groq is collabed with DailyVet' },
    openrouter: { icons: ['openrouter'], text: 'AI is collabed with DailyVet' },
    google:     { icons: ['google', 'gemini'], text: 'Google is collabed with DailyVet' }
};
const COLLAB_LOADER_HOLD_MS = 900;

async function finishTypingWithCollab(info) {
    const provider = PROVIDER_BADGES[info?.provider] ? info.provider : 'groq';
    const cfg = PROVIDER_BADGES[provider];
    const think = _el('typingIndicator')?.querySelector('.dv-think');
    if (!think || !cfg) return;
    _clearThinkTimers();
    _log('🎯 Badge provider resolved:', provider, '(raw:', info?.provider, ') search:', info?.search);

    const search = provider === 'gemini' ? info.search : null;
    const badge = search ? PROVIDER_BADGES.google : cfg;
    const icons = badge.icons;
    const names = search ? (search.sources || []).slice(0, 3).map(escapeHtml).join(', ') : '';
    const sub = search ? `<small>Google Search${names ? ' · ' + names : ''}</small>` : '';

    think.innerHTML = `
        <div class="dv-row">
            <span class="dv-text" style="opacity:1">
                <span class="dv-source-badge" style="margin:0">
                    <span class="dv-badge-icons">${icons.map(_iconHtml).join('')}</span>
                    <span>${badge.text}${sub}</span>
                </span>
            </span>
        </div>
    `;
    const container = _el('chatMessages');
    if (container) _scrollChatToBottom();
    await _sleep(COLLAB_LOADER_HOLD_MS);
}

function removeTyping() {
    _clearThinkTimers();
    _el('typingIndicator')?.remove();
}

// ── FIRESTORE MEMORY ──
const MEMORY_TTL_MS = 30 * 60 * 1000;
function saveUserMemory() {
    if (!cachedUserPhone) return;
    try {
        _fs().collection('users').doc(cachedUserPhone).set({
            aiMemory: {
                currentPet: topicMemory.currentPet,
                currentDisease: topicMemory.currentDisease,
                symptoms: topicMemory.symptoms.slice(0, 10),
                mentionedPets: topicMemory.mentionedPets.slice(0, 10),
                userMood: topicMemory.userMood,
                lastActive: Date.now()
            }
        }, { merge: true }).catch(() => {});
    } catch (e) {}
}

async function loadUserMemoryFromFirestore(phone) {
    try {
        const doc = await _fs().collection('users').doc(phone).get();
        if (doc.exists) {
            const data = doc.data();
            const mem = data.aiMemory;
            const isFresh = mem && mem.lastActive && (Date.now() - mem.lastActive) < MEMORY_TTL_MS;
            if (isFresh && !topicMemory.currentPet && !topicMemory.currentDisease) {
                topicMemory.currentPet = mem.currentPet || null;
                topicMemory.currentDisease = mem.currentDisease || null;
                topicMemory.symptoms = mem.symptoms || [];
                topicMemory.mentionedPets = mem.mentionedPets || [];
            }
            return data;
        }
    } catch (e) {}
    return null;
}

// ═══════════════════════════════════════════════════════════
// 📨 SEND MESSAGE
// ═══════════════════════════════════════════════════════════
async function sendMessage() {
    const input = _el('chatInput');
    const since = Date.now() - lastMessageTime;
    if (since < MIN_MESSAGE_INTERVAL) {
        if (input) {
            input.placeholder = `Please wait ${Math.ceil((MIN_MESSAGE_INTERVAL - since) / 1000)}s...`;
            setTimeout(() => { input.placeholder = "Describe your pet's problem..."; }, 500);
        }
        return;
    }
    if (isProcessing || !input) return;

    const text = input.value.trim();
    const imageBase64 = selectedImageData;
    if (!text && !imageBase64) return;

    if (_voiceUtterance) stopSpeaking();

    isProcessing = true;
    lastMessageTime = Date.now();
    input.value = '';
    await addMessage('user', text, imageBase64);
    removeImage();
    showTyping(imageBase64 ? 'vision' : 'db');

    if (typeof window.dvPersistMessage === 'function') {
        try {
            if (!window.__currentConvId) {
                await window.dvCreateConversation(text || 'Image analysis');
            }
            await window.dvPersistMessage('user', text, imageBase64 || null);
        } catch (e) { console.warn('History save (user) failed:', e.message); }
    }

    try {
        const hasImage = !!imageBase64;
        const lang = detectLanguage(text || 'analyze image');

        let species = detectSpecies(text);
        const symptom = detectSymptom(text);
        const mood = detectMood(text);
        const taskType = detectTaskType(text);
        const isCorrecting = isCorrectingUser(text);
        const newQuestion = isNewQuestion(text);

        const isSpeciesCorrectionFollowUp = !!(awaitingVetSpecies && !hasImage && !newQuestion &&
            !symptom && species && topicMemory.currentPet && species !== topicMemory.currentPet);
        const askingForDoctor = isAskingForDoctor(text) || isSpeciesCorrectionFollowUp;

        // ⚡ QUICK REPLY (instant)
        if (QUICK_REPLIES_ENABLED && !hasImage) {
            const quick = getQuickReply(text, lang, !!(species || symptom));
            if (quick) {
                if (quick.type !== 'thanks') {
                    topicMemory = _newMemory();
                    conversationHistory = [];
                    triageRounds = 0;
                    triageLimit = DEFAULT_TRIAGE_ROUNDS;
                    awaitingVetSpecies = false;
                    saveUserMemory();
                }
                removeTyping();
                addMessage('ai', quick.reply);
                speakText(quick.reply);

                if (typeof window.dvPersistMessage === 'function') {
                    try { await window.dvPersistMessage('assistant', quick.reply, null); }
                    catch (e) {}
                }

                isProcessing = false;
                return;
            }
        }

        const isFollowUp = !hasImage && !newQuestion &&
            (isReferringToPrevious(text) || askingForDoctor || isFollowUpMessage(text) || (!!symptom && !species));
        const previousPet = topicMemory.currentPet;

        if (hasImage) {
            topicMemory.currentDisease = null;
            topicMemory.symptoms = [];
            if (!species) topicMemory.currentPet = null;
        } else if (newQuestion) {
            topicMemory.currentDisease = null;
            topicMemory.symptoms = [];
        } else if (!species && isFollowUp && topicMemory.currentPet) {
            species = topicMemory.currentPet;
        } else if (!species && isFollowUp && userPetType) {
            species = userPetType.toLowerCase();
        }

        const isEmergency = checkEmergency(text);
        if (newQuestion || hasImage || (species && previousPet && species !== previousPet)) {
            conversationHistory = [];
            triageRounds = 0;
            triageLimit = DEFAULT_TRIAGE_ROUNDS;
            awaitingVetSpecies = false;
        }

        updateTopicMemory(species, symptom, mood);
        saveUserMemory();

        let reply = '';
        let confidence = 'HIGH';
        const shouldShowVet = (askingForDoctor && species) || isEmergency;
        awaitingVetSpecies = !!shouldShowVet;

        if (askingForDoctor && species && !isEmergency) {
            const pet = topicMemory.currentPet || species, disease = topicMemory.currentDisease;
            reply = lang === 'bn'
                ? (disease ? `আপনার ${pet} এর ${disease} এর জন্য ভেটেরিনারিয়ান:` : `আপনার ${pet} এর জন্য ভেটেরিনারিয়ান:`)
                : (disease ? `Veterinarian for your ${pet} (${disease}):` : `Veterinarian for your ${pet}:`);
        }

        // 📚 TIER 0 + 1: DB and KB as reference only
        let usedKB = false;
        let referenceNotes = '';
        let offlineFallbackReply = '';
        const textOnly = !reply && !hasImage && !isEmergency;
        if (textOnly && (species || symptom)) {
            setTypingStage('db');
            const dbDisease = await lookupDiseaseFromDB(text, species, symptom);
            if (dbDisease) {
                const dbText = formatDiseaseFromDB(dbDisease, lang);
                referenceNotes += dbText + '\n\n';
                offlineFallbackReply = dbText;
                const dn = dbDisease.disease_name_bn || dbDisease.disease_name_en || '';
                if (dn) {
                    topicMemory.currentDisease = dn;
                    if (!topicMemory.symptoms.includes(dn)) topicMemory.symptoms.push(dn);
                }
            }
        }
        if (textOnly) {
            setTypingStage('kb');
            const kbAnswer = getFromKB(text, lang);
            if (kbAnswer) {
                referenceNotes += kbAnswer + '\n\n';
                if (!offlineFallbackReply) offlineFallbackReply = kbAnswer;
            }
        }
        referenceNotes = referenceNotes.trim().slice(0, 2500);

        let usedEmergencyFallback = false;
        let isSystemNotice = false;
        let usedGoogleSearch = null;
        let answeredBy = null;
        lastGeminiSearchInfo = null;

        // 🩺 TRIAGE
        if (triageRounds === 0) {
            triageLimit = computeTriageLimit({ text, species, symptom, mood, isEmergency });
        }
        const forceDiagnoseNow = triageRounds >= triageLimit;
        let stage = 'DIAGNOSE';

        if (!reply) {
            setTypingStage(hasImage ? 'vision' : 'ai');
            const cacheKey = (USE_REPLY_CACHE && !hasImage && !isFollowUp && !isCorrecting && !isEmergency && triageRounds === 0)
                ? replyCacheKey(text, lang, species) : null;
            const cached = cacheKey ? getCachedReply(cacheKey) : null;

            let rawReply = null;
            let fromCache = false;
            if (cached) {
                rawReply = cached.raw;
                usedGoogleSearch = cached.searchInfo;
                answeredBy = cached.provider || 'groq';
                fromCache = true;
                _log('💾 Cache hit — instant reply');
            } else {
                const raceResult = await raceAIProviders(
                    text, lang, species, imageBase64,
                    mood, taskType, isCorrecting, isFollowUp, referenceNotes, forceDiagnoseNow
                );
                if (raceResult) {
                    rawReply = raceResult.reply;
                    answeredBy = raceResult.provider;
                    usedGoogleSearch = raceResult.searchInfo;
                }
            }

            if (rawReply) {
                const confParsed = extractConfidence(rawReply);
                const stageParsed = extractStage(confParsed.text);
                reply = stageParsed.text;
                confidence = confParsed.confidence;
                stage = stageParsed.stage;

                if (!fromCache && cacheKey && stage === 'DIAGNOSE') {
                    setCachedReply(cacheKey, rawReply, usedGoogleSearch, answeredBy);
                }

                if (stage === 'DIAGNOSE' && (hasImage || !topicMemory.currentDisease)) {
                    const m = reply.match(/(?:🩺\s*)([^\n•]+)/);
                    const detected = m && m[1].trim().slice(0, 60);
                    if (detected && detected.length > 2) {
                        topicMemory.currentDisease = detected;
                        if (!topicMemory.symptoms.includes(detected)) topicMemory.symptoms.push(detected);
                    }
                }
                if (stage === 'DIAGNOSE' && hasImage && !species) {
                    const identified = detectSpecies(reply);
                    if (identified) {
                        species = identified;
                        topicMemory.currentPet = identified;
                        if (!topicMemory.mentionedPets.includes(identified)) topicMemory.mentionedPets.push(identified);
                    }
                }
            }
        }

        triageRounds = stage === 'ASK' ? triageRounds + 1 : 0;

        // 🛟 TIER 3: offline DB/KB fallback
        if (!reply && offlineFallbackReply) {
            reply = offlineFallbackReply;
            usedKB = true;
        }

        // 🛟 TIER 4: static fallbacks
        if (!reply) {
            const bn = lang === 'bn';
            if (isEmergency) {
                usedEmergencyFallback = true;
                reply = bn
                    ? `🚨 জরুরি অবস্থা!\n\n১. প্রাণীকে শান্ত রাখুন।\n২. দ্রুত কাছের ভেটেরিনারিয়ানে যান।\n৩. ২৪/৭ হেল্পলাইন: ১৬৩৫৮।`
                    : `🚨 EMERGENCY!\n\n1. Keep the animal calm.\n2. Go to the nearest vet.\n3. 24/7 Helpline: 16358.`;
            } else if (lastGeminiFailure === 'rate_limit') {
                isSystemNotice = true;
                reply = bn
                    ? '⏸️ এই মুহূর্তে অনেক বেশি অনুরোধ এসেছে। ১ মিনিট পর আবার চেষ্টা করুন।\n\n📞 ২৪/৭ হেল্পলাইন: ১৬৩৫৮'
                    : '⏸️ Too many requests right now. Please try again in 1 minute.\n\n📞 24/7 Helpline: 16358';
            } else if (species) {
                reply = bn
                    ? `${species} নিয়ে আপনার প্রশ্নটি এই মুহূর্তে সম্পূর্ণ বুঝতে পারছি না।\n\nদয়া করে:\n🔹 লক্ষণ আরেকটু বিস্তারিত লিখুন\n🔹 সম্ভব হলে একটা ছবি পাঠান\n\n📞 ২৪/৭ হেল্পলাইন: ১৬৩৫৮`
                    : `I couldn't fully process your ${species} question right now.\n\nPlease try:\n🔹 More detailed symptoms\n🔹 Send a photo\n\n📞 24/7 Helpline: 16358`;
            } else {
                reply = bn
                    ? 'দুঃখিত, এই মুহূর্তে AI উত্তর দিতে পারছে না।\n\n📞 ২৪/৭ হেল্পলাইনে কল করুন: ১৬৩৫৮'
                    : 'Sorry, the AI could not respond right now.\n\n📞 Call 24/7 Helpline: 16358';
            }
            confidence = isSystemNotice ? 'HIGH' : 'LOW';
        }

        // 🛡️ Safety guard
        if (!usedKB) {
            const safety = applyMedicalSafetyGuard(reply, species, lang);
            reply = safety.text;
            if (safety.wasBlocked) confidence = 'LOW';
        }

        // 🇧🇩🚫🇮🇳 Anti-Hindi runtime scrub
        if (!usedKB) {
            const hindiScrub = scrubHindi(reply);
            reply = hindiScrub.text;
            if (hindiScrub.hadHindi) _log('🇮🇳 Stripped stray Hindi from AI reply');
        }
        if (stage !== 'ASK') {
            reply = applyConfidenceWarning(reply, confidence, lang);
        }

        if (isEmergency && !usedEmergencyFallback) {
            reply = (lang === 'bn' ? '🚨 জরুরি অবস্থা! দ্রুত কাছের ভেটেরিনারিয়ানে যান।\n\n' : '🚨 EMERGENCY! Go to a vet immediately.\n\n') + reply;
        }

        // 🏥 v7.19 — DB-first vets + optional Google search prompt
        if (shouldShowVet) {
            const dbVets = await findNearbyVets(species, symptom || topicMemory.currentDisease || null);

            if (dbVets && dbVets.length > 0) {
                reply += '\n\n' + formatVetSuggestion(dbVets, lang);

                const googlePrompt = lang === 'bn'
                    ? `\n\n🔍 আপনি কি নিজে Google-এ আরো ভেট খুঁজতে চান?`
                    : `\n\n🔍 Would you like to search for more vets via Google?`;

                reply += googlePrompt;
                reply += '\n\n[[SHOW_GOOGLE_OPTION]]';
            } else {
                const googlePrompt = lang === 'bn'
                    ? `\n\n🔍 এই এলাকায় ডাটাবেসে কোনো ভেট পাওয়া যায়নি। Google Search দিয়ে খুঁজতে চান?`
                    : `\n\n🔍 No vets found in database. Search on Google instead?`;

                reply += googlePrompt;
                reply += '\n\n[[SHOW_GOOGLE_OPTION]]';
                reply += VET_HOTLINE[lang === 'bn' ? 'bn' : 'en'];
            }

            window.__currentSpecies = species || null;
            window.__currentSymptom = symptom || topicMemory.currentDisease || null;
        }

        reply = personalizeReply(forcePremiumFormatting(reply), lang);

        conversationHistory.push(
            { role: 'user', content: hasImage ? `[Image] ${text || 'analyze'}` : text },
            { role: 'assistant', content: reply }
        );
        conversationHistory = conversationHistory.slice(-MAX_HISTORY_TURNS * 2);

        if (answeredBy) await finishTypingWithCollab({ provider: answeredBy, search: usedGoogleSearch });
        removeTyping();
        addMessage('ai', reply);
        speakText(reply);

        if (typeof window.dvPersistMessage === 'function') {
            try { await window.dvPersistMessage('assistant', reply, null); }
            catch (e) { console.warn('History save (ai) failed:', e.message); }
        }

        // 🔔 Notification Bridge
        if (typeof window.DVNotifications?.analyzeAndSchedule === 'function') {
            try {
                await window.DVNotifications.analyzeAndSchedule(
                    reply,
                    text || 'Image analysis',
                    {
                        petName: topicMemory.currentPet || 'আপনার পশু',
                        species: species || null
                    }
                );
            } catch (e) {
                console.warn('Notification schedule failed:', e.message);
            }
        }
    } catch (error) {
        console.error('Send error:', error);
        removeTyping();
        addMessage('ai', 'Something went wrong. Please try again.');
    } finally {
        isProcessing = false;
    }
}

// ── QUICK SUGGESTION CHIPS ──
function sendQuickMessage(text) {
    const input = _el('chatInput');
    if (input) input.value = text;
    sendMessage();
}

// ── IMAGE HANDLING ──
const IMAGE_MAX_DIMENSION = 1280;
const IMAGE_JPEG_QUALITY = 0.82;
const IMAGE_TARGET_MAX_BYTES = 1.5 * 1024 * 1024;

function _resizeImageToDataURL(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            let { width, height } = img;
            if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
                const scale = IMAGE_MAX_DIMENSION / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const tryQuality = q => canvas.toDataURL('image/jpeg', q);
            let quality = IMAGE_JPEG_QUALITY;
            let dataUrl = tryQuality(quality);
            let guardLoops = 0;
            while (dataUrl.length * 0.75 > IMAGE_TARGET_MAX_BYTES && quality > 0.4 && guardLoops < 5) {
                quality -= 0.12;
                dataUrl = tryQuality(quality);
                guardLoops++;
            }
            resolve(dataUrl);
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('decode failed')); };
        img.src = objectUrl;
    });
}

async function processImageFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }

    try {
        selectedImageData = await _resizeImageToDataURL(file);
    } catch (e) {
        console.warn('Image resize failed, using original:', e.message);
        try {
            selectedImageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = ev => resolve(ev.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } catch (e2) {
            alert('Failed to read image.');
            return;
        }
    }

    const preview = _el('imagePreview'), img = _el('previewImg');
    if (preview && img) {
        img.src = selectedImageData;
        preview.style.display = 'block';
    }
}

function handleImageSelect(event) {
    const file = event.target.files[0];
    if (file) processImageFile(file);
}

function removeImage() {
    selectedImageData = null;
    const preview = _el('imagePreview'), img = _el('previewImg'), input = _el('imageInput');
    if (preview) preview.style.display = 'none';
    if (img) img.src = '';
    if (input) input.value = '';
}

// ── MENU / BANNER / CLEAR ──
function toggleMenu(e) {
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    const menu = _el('menuDropdown');
    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
}

function closeDisclaimer() {
    const banner = _el('disclaimerBanner');
    if (banner) banner.style.display = 'none';
}

function clearChat() {
    if (!confirm('Clear all chat messages?')) return;
    if (_voiceUtterance) stopSpeaking();

    if (typeof window.hideLocationRequest === 'function') window.hideLocationRequest();
    if (typeof window.hideNearbyVets === 'function') window.hideNearbyVets();

    const container = _el('chatMessages');
    if (container) {
        container.innerHTML = `
            <div class="message ai-message">
                <div class="avatar ai-avatar-small">
                    <img src="assets/dailyvetlogo.jpeg" alt="AI" />
                </div>
                <div class="bubble">
                    <p>Hello! I'm <strong>DailyVet AI</strong> — your pet care assistant. 🐾</p>
                    <p>Tell me your pet's problem — text or photo.</p>
                    <span class="timestamp">now</span>
                </div>
            </div>
        `;
    }
    const shell = document.querySelector('.ai-container');
    if (shell) shell.scrollTop = 0;
    conversationHistory = [];
    triageRounds = 0;
    triageLimit = DEFAULT_TRIAGE_ROUNDS;
    topicMemory = _newMemory();
    awaitingVetSpecies = false;
    saveUserMemory();
    const chips = _el('suggestionChips');
    if (chips) chips.style.display = 'flex';
    toggleMenu();
}

// ── USER PROFILE ──
async function loadUserProfile() {
    userName = sessionStorage.getItem('userName') || userName;
    const phone = cachedUserPhone = sessionStorage.getItem('userPhone');
    if (!phone) return;

    listenToUserPhoto();

    try {
        const cached = JSON.parse(sessionStorage.getItem('userProfileCache'));
        if (cached) {
            userName = cached.name || userName;
            userPetType = cached.petType || null;
            cachedUserPhoto = cached.photoURL || '';
            loadUserMemoryFromFirestore(phone);
            return;
        }
    } catch (e) {}

    try {
        const data = await loadUserMemoryFromFirestore(phone);
        if (data) {
            userName = data.name || userName;
            userPetType = data.petType || null;
            cachedUserPhoto = data.photoURL || '';
            sessionStorage.setItem('userProfileCache', JSON.stringify({
                name: userName, photoURL: data.photoURL || null, petType: userPetType, city: data.city || null
            }));
        }
    } catch (error) {
        console.warn('Profile load failed:', error);
    }
}

// ── 🎤 VOICE INPUT ──
let recognition = null;
let isListening = false;
let voiceIndicatorEl = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

function initVoiceInput() {
    if (!SpeechRecognition) return false;
    recognition = new SpeechRecognition();
    recognition.lang = isIOS ? 'en-US' : 'bn-BD';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => { isListening = true; updateMicUI(true); showVoiceIndicator(); };
    recognition.onresult = event => {
        let interim = '', final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const t = event.results[i][0].transcript;
            if (event.results[i].isFinal) final += t; else interim += t;
        }
        const input = _el('chatInput');
        if (input) input.value = final || interim;
    };
    recognition.onerror = event => { console.warn('Voice error:', event.error); stopVoiceInput(); };
    recognition.onend = () => { isListening = false; updateMicUI(false); hideVoiceIndicator(); };
    return true;
}

function toggleVoiceInput() {
    if (!recognition && !initVoiceInput()) {
        alert(isIOS ? 'iPhone-এ voice input সীমিত। Chrome ব্যবহার করুন।' : 'আপনার browser voice input support করে না।');
        return;
    }
    if (isListening) stopVoiceInput(); else startVoiceInput();
}

function startVoiceInput() {
    if (!recognition || isListening) return;
    if (_voiceUtterance) stopSpeaking();
    try {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(() => recognition.start())
            .catch(() => alert('Microphone permission দিন'));
    } catch (err) {
        console.error('Voice start error:', err);
    }
}

function stopVoiceInput() {
    if (recognition && isListening) { try { recognition.stop(); } catch (e) {} }
    isListening = false;
    updateMicUI(false);
    hideVoiceIndicator();
}

function updateMicUI(listening) {
    const btn = _el('micBtn'), icon = _el('micIcon');
    if (!btn || !icon) return;
    btn.classList.toggle('listening', listening);
    icon.classList.replace(listening ? 'fa-microphone' : 'fa-microphone-lines', listening ? 'fa-microphone-lines' : 'fa-microphone');
}

function showVoiceIndicator() {
    if (!voiceIndicatorEl) {
        voiceIndicatorEl = document.createElement('div');
        voiceIndicatorEl.className = 'voice-indicator';
        voiceIndicatorEl.innerHTML = `<span class="pulse-dot"></span><span>শুনছি... বলুন</span>`;
        document.body.appendChild(voiceIndicatorEl);
    }
    voiceIndicatorEl.classList.add('show');
}

function hideVoiceIndicator() {
    if (voiceIndicatorEl) voiceIndicatorEl.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════
// 🔊 VOICE ASSISTANT
// ═══════════════════════════════════════════════════════════

let voiceAssistantEnabled = (localStorage.getItem('dvVoiceAssistant') !== 'off');
let _voiceUtterance = null;

function _updateVoiceAssistantUI() {
    const textEls = document.querySelectorAll('.voice-assistant-text, #voiceAssistantText');
    textEls.forEach(el => {
        el.textContent = voiceAssistantEnabled ? 'Voice Assistant: ON' : 'Voice Assistant: OFF';
    });

    const btns = document.querySelectorAll('.voice-assistant-btn, #voiceAssistantBtn');
    btns.forEach(btn => {
        btn.classList.toggle('voice-off', !voiceAssistantEnabled);
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-volume-high', voiceAssistantEnabled);
            icon.classList.toggle('fa-volume-xmark', !voiceAssistantEnabled);
        }
    });
}

function toggleVoiceAssistant() {
    voiceAssistantEnabled = !voiceAssistantEnabled;
    localStorage.setItem('dvVoiceAssistant', voiceAssistantEnabled ? 'on' : 'off');

    if (!voiceAssistantEnabled) {
        if ('speechSynthesis' in window) speechSynthesis.cancel();
        if (isListening) stopVoiceInput();
    } else {
        if ('speechSynthesis' in window) speechSynthesis.getVoices();
    }

    _updateVoiceAssistantUI();

    const menu = _el('menuDropdown');
    if (menu) menu.style.display = 'none';

    _log(voiceAssistantEnabled ? '🔊 Voice Assistant: ON' : '🔇 Voice Assistant: OFF');
}

function speakText(text) {
    if (!voiceAssistantEnabled || !('speechSynthesis' in window) || !text) return;

    try { speechSynthesis.cancel(); } catch (_) {}

    const doSpeak = () => {
        try {
            const clean = String(text)
                .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
                .replace(/[\u{2600}-\u{27BF}]/gu, '')
                .replace(/[🔹▪‣●○•]/g, '')
                .replace(/[*_`#]/g, '')
                .replace(/https?:\/\/\S+/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 400);
            if (!clean) return;

            const utterance = new SpeechSynthesisUtterance(clean);
            utterance.lang = /[\u0980-\u09FF]/.test(text) ? 'bn-BD' : 'en-US';
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            const voices = speechSynthesis.getVoices() || [];
            const targetLang = utterance.lang.split('-')[0];
            const voice = voices.find(v => v.lang && v.lang.startsWith(targetLang));
            if (voice) utterance.voice = voice;

            _voiceUtterance = utterance;
            utterance.onend = () => { _voiceUtterance = null; };
            utterance.onerror = () => { _voiceUtterance = null; };

            speechSynthesis.speak(utterance);
        } catch (err) {
            console.warn('speakText failed:', err && err.message);
            _voiceUtterance = null;
        }
    };

    if (isIOS) setTimeout(doSpeak, 120); else doSpeak();
}

function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    _voiceUtterance = null;
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
    if (!sessionStorage.getItem('userPhone')) {
        window.location.href = 'login.html';
        return;
    }
    loadUserProfile();
    if ('speechSynthesis' in window) speechSynthesis.getVoices();

    _updateVoiceAssistantUI();

    if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = () => {
            speechSynthesis.getVoices();
        };
    }

    _el('chatInput')?.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    _el('chatInput')?.addEventListener('input', () => {
        if (_voiceUtterance) stopSpeaking();
    });

    document.addEventListener('click', e => {
        const menu = _el('menuDropdown'), menuBtn = _el('menuBtn') || document.querySelector('.menu-btn');
        if (menu && menu.style.display === 'block') {
            if (!menu.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
                menu.style.display = 'none';
            }
        }
    });

    document.addEventListener('paste', e => {
        for (const item of Array.from(e.clipboardData?.items || [])) {
            if (item.type.indexOf('image') !== -1) {
                const file = item.getAsFile();
                if (file) { e.preventDefault(); processImageFile(file); return; }
            }
        }
    });

    const dropZone = document.querySelector('.chat-messages');
    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.background = '#e0f0f2'; });
        dropZone.addEventListener('dragleave', e => { e.preventDefault(); dropZone.style.background = ''; });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.background = '';
            const img = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
            if (img) processImageFile(img);
        });
    }

    if (typeof window.DVNotifications?.checkAndFireReminders === 'function') {
        setTimeout(() => window.DVNotifications.checkAndFireReminders(), 2000);
    }
});

window.addEventListener('beforeunload', saveUserMemory);

// ═══════════════════════════════════════════════════════════
// 🆕 CHAT HISTORY BRIDGE (sidebar integration)
// ═══════════════════════════════════════════════════════════

window._restoreMessage = async function (role, content, imageBase64) {
    const container = _el('chatMessages');
    if (!container) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `message ${role === 'assistant' ? 'ai' : 'user'}-message`;

    let userAvatarHTML;
    if (cachedUserPhoto) {
        userAvatarHTML = `<img src="${cachedUserPhoto}" alt="${escapeHtml(userName)}" />`;
    } else {
        userAvatarHTML = userName.charAt(0).toUpperCase();
    }

    const avatar = role === 'assistant'
        ? `<div class="avatar ai-avatar-small"><img src="assets/dailyvetlogo.jpeg" alt="AI" /></div>`
        : `<div class="avatar user-avatar">${userAvatarHTML}</div>`;

    let contentHTML = imageBase64 ? `<div class="bubble-image"><img src="${imageBase64}" alt="Sent" /></div>` : '';
    if (content) {
        const formatted = role === 'assistant'
            ? content.replace(/\\n/g, '\n').split('\n').map(formatAiLine).join('<br>')
            : escapeHtml(content).replace(/\\n/g, '\n').replace(/\n/g, '<br>');
        contentHTML += `<p style="white-space:pre-wrap;line-height:1.6;margin:0 0 8px;">${formatted}</p>`;
    }
    contentHTML += `<span class="timestamp">${time}</span>`;

    const bubble = `<div class="bubble">${contentHTML}</div>`;
    div.innerHTML = role === 'assistant' ? avatar + bubble : bubble + avatar;
    container.appendChild(div);
    _scrollToBottom();
};

window._restoreConversationHistory = function (history) {
    conversationHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS * 2) : [];
    triageRounds = 0;
    triageLimit = DEFAULT_TRIAGE_ROUNDS;
};

window._resetConversationHistory = function () {
    conversationHistory = [];
    triageRounds = 0;
    triageLimit = DEFAULT_TRIAGE_ROUNDS;
    topicMemory = _newMemory();
    awaitingVetSpecies = false;
};

/* ============================================================
   🏥 Google Search Handlers (Yes/No buttons)
   ============================================================ */
window.handleGoogleSearchYes = async function () {
    console.log('🌐 User wants Google search');

    const species = window.__currentSpecies || null;
    const symptom = window.__currentSymptom || null;

    document.querySelectorAll('.google-search-options').forEach(el => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    });

    if (typeof window.showLocationRequest === 'function') {
        window.__preferGoogleSearch = true;
        window.__currentSpecies = species;
        window.__currentSymptom = symptom;
        window.showLocationRequest();
        console.log('📍 Location request card shown for Google search');
    } else {
        alert('Location service is not loaded.');
    }
};

window.handleGoogleSearchNo = function () {
    console.log('❌ User declined Google search');

    document.querySelectorAll('.google-search-options').forEach(el => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
    });

    window.__preferGoogleSearch = false;
};