/* DailyVet — Notification Engine (Production v2.0)
   - AI reply -> auto schedule medicine / follow-up / vaccine reminders
   - NASA outbreak alert -> Bangla notification (DETAILED v2.0)
   - 6-hour reminder cycle while active
   - Firestore: users/{phone}/notifications (no composite index required)
   - Duplicate guard (same type [+ pet / district] within window)
   Fast test mode: localStorage.setItem('dvNotifTest','1') then reload */
(function () {
'use strict';

/* ===== START: CONFIG - test mode, timing, limits ===== */
const _store = (name, key) => {
    try { return window[name].getItem(key); } catch (_) { return null; }
};

const TEST_MODE = _store('localStorage', 'dvNotifTest') === '1';

const REAL_DAY_MS  = 24 * 60 * 60 * 1000;
const REAL_HOUR_MS = 60 * 60 * 1000;
const DAY_MS  = TEST_MODE ? 3000 : REAL_DAY_MS;
const HOUR_MS = TEST_MODE ? 1666 : REAL_HOUR_MS;

const REMINDER_INTERVAL_HOURS = 6;
const MAX_ACTIVE_NOTIFS = 40;
const DEDUPE_LIMIT = 15;
const DEDUPE_WINDOW_MS = TEST_MODE ? 20 * 1000 : 12 * 60 * 60 * 1000;
const GENERIC_DISEASES_BN = 'মশা-বাহিত ও পানিবাহিত রোগ';
/* ===== END: CONFIG - test mode, timing, limits ===== */

/* ===== START: USER PHONE + FIRESTORE NOTIFICATION REF ===== */
const _fs = () => firebase.firestore();
const _cleanPhone = p => String(p || '').replace(/[^0-9+]/g, '');
const getMyPhone = () =>
    _cleanPhone(_store('localStorage', 'userPhone') || _store('sessionStorage', 'userPhone'));

const _notifRef = () => {
    try {
        const phone = getMyPhone();
        return phone ? _fs().collection('users').doc(phone).collection('notifications') : null;
    } catch (_) {
        return null;
    }
};
/* ===== END: USER PHONE + FIRESTORE NOTIFICATION REF ===== */

/* ===== START: AI REPLY ANALYSIS - duration, keywords, emergency ===== */
const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
const _norm = s => String(s || '').replace(/[০-৯]/g, d => BN_DIGITS[d]);

/* ===== START: DURATION EXTRACTION (days / weeks / months) ===== */
function extractDurationDays(text) {
    if (!text) return null;
    const t = _norm(text);

    let m = t.match(/(\d+)\s*(?:-\s*\d+)?\s*(দিন|din|day|days|diner)/i);
    if (m) return Math.min(30, Math.max(1, parseInt(m[1], 10)));

    m = t.match(/(\d+)\s*(সপ্তাহ|soptaho|week|weeks)/i);
    if (m) return Math.min(30, Math.max(1, parseInt(m[1], 10) * 7));

    m = t.match(/(\d+)\s*(মাস|mash|month|months)/i);
    if (m) return Math.min(90, Math.max(1, parseInt(m[1], 10) * 30));

    return null;
}
/* ===== END: DURATION EXTRACTION (days / weeks / months) ===== */

/* ===== START: KEYWORD DETECTION (medicine / follow-up / vaccine) ===== */
const _hasAny = (text, keywords) => {
    if (!text) return false;
    const l = String(text).toLowerCase();
    return keywords.some(k => l.includes(k));
};

const MEDICINE_KEYWORDS = [
    'ঔষধ', 'ওষুধ', 'osudh', 'oshudh', 'medicine', 'tablet',
    'antibiotic', 'dose', 'ডোজ', 'খাওয়ান', 'সিরাপ', 'syrup',
    'ইনজেকশন', 'injection', 'meloxicam', 'enrofloxacin', 'albendazole',
    'fenbendazole', 'ivermectin', 'oxytetracycline', 'amoxicillin'
];
const FOLLOWUP_KEYWORDS = [
    'জানান', 'পরে জানান', 'আবার জানান', 'abar janan', 'follow up', 'follow-up',
    'পরে আসুন', 'পরে দেখান', 'অবস্থা জানাবেন', 'কেমন আছে জানান'
];
const VACCINE_KEYWORDS = ['টিকা', 'vaccine', 'vaccination', 'tika', 'booster', 'immunization'];

const hasMedicineAdvice = text => _hasAny(text, MEDICINE_KEYWORDS);
const hasFollowUpHint   = text => _hasAny(text, FOLLOWUP_KEYWORDS);
const hasVaccineAdvice  = text => _hasAny(text, VACCINE_KEYWORDS);
/* ===== END: KEYWORD DETECTION (medicine / follow-up / vaccine) ===== */

/* ===== START: EMERGENCY DETECTION ===== */
/* "বিষ" (poison) must not match "বিষয়" (subject) / "বিষণ্ণ" (sad) */
const EMERGENCY_RE = /🚨|জরুরি|emergency|অজ্ঞান|খিঁচুনি|seizure|poisoning|বিষ(?![\u09AF\u09DF\u09A3])/i;
const isEmergencyReply = text => !!text && EMERGENCY_RE.test(text);
/* ===== END: EMERGENCY DETECTION ===== */
/* ===== END: AI REPLY ANALYSIS - duration, keywords, emergency ===== */

/* ===== START: DEDUPE - duplicate notification guard ===== */
const _inflight = new Set();

/* Only active docs are queried (two equality filters need no composite index),
   so old inactive docs can never crowd out the limit. */
const LEVEL_RANK = { watch: 1, alert: 2, critical: 3 };
const _rank = lv => LEVEL_RANK[lv] || 0;

async function _recentDuplicate(ref, type, petName, district, level) {
    try {
        const since = Date.now() - DEDUPE_WINDOW_MS;
        const snap = await ref
            .where('type', '==', type)
            .where('active', '==', true)
            .limit(DEDUPE_LIMIT)
            .get();

        return snap.docs.some(doc => {
            const d = doc.data();
            if ((d.createdAtMs || 0) < since) return false;
            if (petName && d.petName && d.petName !== petName) return false;
            if (district && d.meta && d.meta.district && d.meta.district !== district) return false;
            /* Escalation (e.g. alert -> critical) must NOT be swallowed by the 12h window */
            if (level && _rank(level) > _rank(d.meta && d.meta.level)) return false;
            return true;
        });
    } catch (e) {
        console.warn('[Notif] Dedupe check skipped:', e.message);
        return false;
    }
}
/* ===== END: DEDUPE - duplicate notification guard ===== */

/* ===== START: CREATE NOTIFICATION - Firestore save ===== */
async function createNotification(data) {
    const ref = _notifRef();
    if (!ref) return null;

    const type = data.type || 'general';
    const petName = data.petName || null;
    const district = (data.meta && data.meta.district) || null;
    const level = (data.meta && data.meta.level) || null;
    const lockKey = `${type}|${petName || ''}|${district || ''}|${level || ''}`;

    if (_inflight.has(lockKey)) return null;
    _inflight.add(lockKey);

    try {
        if (await _recentDuplicate(ref, type, petName, district, level)) return null;

        const now = Date.now();
        const docRef = await ref.add({
            title: data.title || 'DailyVet',
            body: data.body || '',
            icon: data.icon || '🔔',
            type,
            priority: data.priority || 'medium',
            petName,
            actionUrl: data.actionUrl || 'ai.html',
            meta: data.meta || {},
            read: false,
            active: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAtMs: now,
            scheduledForMs: data.scheduledFor || now,
            reminderIntervalMs: data.reminderInterval || (REMINDER_INTERVAL_HOURS * HOUR_MS),
            lastRemindedAt: null,
            lastRemindedAtMs: 0,
            remindCount: 0,
            maxReminds: data.maxReminds != null ? data.maxReminds : 8
        });
        return docRef.id;
    } catch (err) {
        console.warn('[Notif] Create failed:', err.message);
        return null;
    } finally {
        _inflight.delete(lockKey);
    }
}
/* ===== END: CREATE NOTIFICATION - Firestore save ===== */

/* ===== START: FIRE REMINDER - bump count + mark unread ===== */
async function _fireReminder(ref, notifId) {
    try {
        await ref.doc(notifId).update({
            lastRemindedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastRemindedAtMs: Date.now(),
            remindCount: firebase.firestore.FieldValue.increment(1),
            read: false,
            bumpedAt: Date.now()
        });
    } catch (e) {
        console.warn('[Notif] Reminder fire failed:', e.message);
    }
}
/* ===== END: FIRE REMINDER - bump count + mark unread ===== */

/* ===== START: ANALYZE AI REPLY - schedule notifications ===== */
async function analyzeAndSchedule(aiReplyText, userText, context) {
    if (typeof aiReplyText !== 'string' || !aiReplyText) return;

    context = context || {};
    const petName = context.petName || 'আপনার পশু';
    const species = context.species || null;

    if (aiReplyText.length < 40 && !hasMedicineAdvice(aiReplyText)) return;
    if (/⏸️|Too many requests|পারছে না/.test(aiReplyText)) return;

    /* ===== START: EMERGENCY NOTIFICATION ===== */
    if (isEmergencyReply(aiReplyText)) {
        await createNotification({
            title: '🚨 জরুরি যত্ন',
            body: `${petName} — জরুরি অবস্থা। ভেট/হটলাইন ১৬৩৫৮।`,
            icon: '🚨',
            type: 'emergency',
            priority: 'high',
            petName,
            actionUrl: 'ai.html',
            scheduledFor: Date.now(),
            maxReminds: 3,
            meta: { species, kind: 'emergency' }
        });
        return;
    }
    /* ===== END: EMERGENCY NOTIFICATION ===== */

    /* ===== START: MEDICINE NOTIFICATIONS (start + follow-up) ===== */
    const med = hasMedicineAdvice(aiReplyText);

    if (med) {
        const days = extractDurationDays(aiReplyText) || 3;

        await createNotification({
            title: '💊 ঔষধ শুরু করুন',
            body: `${petName}-কে vet-এর পরামর্শ অনুযায়ী ঔষধ দিন। ~${days} দিন পর ফলো-আপ।`,
            icon: '💊',
            type: 'medicine_start',
            priority: 'high',
            petName,
            actionUrl: 'ai.html',
            scheduledFor: Date.now(),
            maxReminds: 4,
            meta: { days, species, kind: 'medicine_start' }
        });

        await createNotification({
            title: '💊 ঔষধ কোর্স শেষ?',
            body: `${petName}-এর ~${days} দিনের ঔষধ শেষ হওয়ার কথা। অবস্থা জানান।`,
            icon: '💊',
            type: 'medicine_followup',
            priority: 'high',
            petName,
            actionUrl: 'ai.html',
            scheduledFor: Date.now() + days * DAY_MS,
            maxReminds: 6,
            meta: { days, species, kind: 'medicine_followup' }
        });
    }
    /* ===== END: MEDICINE NOTIFICATIONS ===== */

    /* ===== START: FOLLOW-UP NOTIFICATION ===== */
    if (!med && hasFollowUpHint(aiReplyText)) {
        await createNotification({
            title: '📋 অবস্থা জানান',
            body: `${petName}-এর অবস্থা কেমন? AI চ্যাটে জানাতে পারেন।`,
            icon: '📋',
            type: 'followup',
            priority: 'medium',
            petName,
            actionUrl: 'ai.html',
            scheduledFor: Date.now() + 2 * DAY_MS,
            maxReminds: 5,
            meta: { species, kind: 'followup' }
        });
    }
    /* ===== END: FOLLOW-UP NOTIFICATION ===== */

    /* ===== START: VACCINE NOTIFICATION ===== */
    if (hasVaccineAdvice(aiReplyText)) {
        await createNotification({
            title: '💉 টিকা মনে রাখুন',
            body: `${petName}-এর টিকা/বুস্টার সময়সূচি ভেটের সাথে নিশ্চিত করুন।`,
            icon: '💉',
            type: 'vaccine_reminder',
            priority: 'high',
            petName,
            actionUrl: 'ai.html',
            scheduledFor: Date.now() + 7 * DAY_MS,
            maxReminds: 4,
            meta: { species, kind: 'vaccine' }
        });
    }
    /* ===== END: VACCINE NOTIFICATION ===== */
}
/* ===== END: ANALYZE AI REPLY - schedule notifications ===== */

/* ===== START: REMINDER CHECK - fire due reminders ===== */
async function checkAndFireReminders() {
    const ref = _notifRef();
    if (!ref) return;

    try {
        const snap = await ref.where('active', '==', true).limit(MAX_ACTIVE_NOTIFS).get();
        if (snap.empty) return;

        const now = Date.now();
        const tasks = [];

        snap.docs.forEach(doc => {
            const d = doc.data();
            if (now < (d.scheduledForMs || 0)) return;

            const count = d.remindCount || 0;
            const maxR = d.maxReminds != null ? d.maxReminds : 8;

            if (count >= maxR) {
                tasks.push(ref.doc(doc.id).update({ active: false }).catch(e =>
                    console.warn('[Notif] Deactivate failed:', e.message)));
                return;
            }

            const interval = d.reminderIntervalMs || (REMINDER_INTERVAL_HOURS * HOUR_MS);
            if (count === 0 || now - (d.lastRemindedAtMs || 0) >= interval) {
                tasks.push(_fireReminder(ref, doc.id));
            }
        });

        await Promise.all(tasks);
    } catch (err) {
        console.warn('[Notif] checkAndFireReminders failed:', err.message);
    }
}
/* ===== END: REMINDER CHECK - fire due reminders ===== */

/* ===== START: LOCAL PUSH (browser Notification API) =====
   Shown only when the user has granted permission. Call requestPushPermission()
   from a user gesture (button click) — browsers block it otherwise. */
const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window;
const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

async function requestPushPermission() {
    if (!pushSupported()) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    try { return await Notification.requestPermission(); }
    catch (_) { return Notification.permission; }
}

async function showLocalPush(title, body, url, tag) {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const opts = { body, tag: tag || 'dailyvet', lang: 'bn', data: { url: url || 'climate-dashboard.html' } };
    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
        }
        const n = new Notification(title, opts);
        n.onclick = () => { try { window.focus(); window.location.href = opts.data.url; n.close(); } catch (_) {} };
        return true;
    } catch (e) {
        console.warn('[Notif] Local push failed:', e.message);
        return false;
    }
}
/* ===== END: LOCAL PUSH ===== */

/* ============================================================
   START: NASA CLIMATE ALERT BRIDGE v2.0 — DETAILED Bangla notification
   ------------------------------------------------------------
   v2.0 improvements:
   • Multi-line structured body (readable in notification list)
   • Shows WHY (rain, humidity, temp)
   • Lists top 2 diseases with scores
   • Actionable steps (✓ checklist style)
   • Impact numbers (farmers + livestock) if available
   • Economic loss if available
   • Helpline at bottom
   Backward compatible: works even if impact/economicImpact missing
   ============================================================ */
async function scheduleNasaOutbreakAlert() {
    const risk = window.__lastOutbreakRisk;
    if (!risk) return null;
    if (risk.level !== 'alert' && risk.level !== 'critical') return null;
    /* Never push an alert built from old saved data (offline fallback) */
    if (risk.stale) return null;

    const key = String(risk.district || '');
    const districtName = risk.districtBn ||
        (key.charAt(0).toUpperCase() + key.slice(1));
    const critical = risk.level === 'critical';

    /* ===== Top 2 diseases ===== */
    const diseases = (risk.diseases || []).slice(0, 2);

    /* ===== Build multi-line Bangla body ===== */
    const lines = [];

    /* Location header */
    lines.push(`📍 ${districtName} এলাকা`);
    lines.push('');

    /* Risk score */
    lines.push(`🦟 রোগের ঝুঁকি: ${risk.score}%`);
    lines.push('');

    /* Why (weather reasons) */
    lines.push('কারণ:');
    lines.push(`• সর্বশেষ NASA দিনের বৃষ্টি: ${Number(risk.rainMm || 0).toFixed(0)}mm`);
    if (risk.humidity !== undefined && risk.humidity !== null) {
        lines.push(`• আর্দ্রতা: ${Number(risk.humidity).toFixed(0)}%`);
    }
    if (risk.temp !== undefined && risk.temp !== null) {
        lines.push(`• তাপমাত্রা: ${Number(risk.temp).toFixed(0)}°C`);
    }
    lines.push('');

    /* Top diseases */
    if (diseases.length > 0) {
        lines.push('🎯 সবচেয়ে ঝুঁকিপূর্ণ রোগ:');
        diseases.forEach((d, i) => {
            const name = d.nameBn || d.name || 'রোগ';
            const sc = d.score !== undefined ? ` — ${d.score}%` : '';
            lines.push(`${i + 1}. ${name}${sc}`);
        });
        lines.push('');
    }

    /* Actionable steps */
    lines.push('⚡ এখনই করুন:');
    lines.push('✓ পশুকে মশারির নিচে রাখুন');
    lines.push('✓ জমা পানি ২৪ ঘণ্টায় পরিষ্কার করুন');
    lines.push('✓ গোয়াল ঘর শুকনো রাখুন');
    lines.push('✓ ভেটের পরামর্শে টিকা দিন');

    /* Impact numbers (if available) */
    if (risk.impact) {
        const farmersAtRisk = Number(risk.impact.farmersAtRisk || 0);
        const livestockAtRisk = Number(risk.impact.livestockAtRisk || 0);

        if (farmersAtRisk > 0 || livestockAtRisk > 0) {
            lines.push('');
            lines.push('📊 আপনার এলাকার প্রভাব:');
            if (farmersAtRisk > 0) {
                lines.push(`• ${farmersAtRisk.toLocaleString('en-IN')} কৃষক ঝুঁকিতে`);
            }
            if (livestockAtRisk > 0) {
                lines.push(`• ${livestockAtRisk.toLocaleString('en-IN')} পশু ঝুঁকিতে`);
            }
        }
    }

    /* Economic loss: prefer the SEDAC range (same figure the Impact card shows) */
    const loss = risk.impact && risk.impact.economicLoss;
    if (loss && Number(loss.total) > 0 && loss.minCrore && loss.maxCrore) {
        lines.push('');
        lines.push(`💰 সম্ভাব্য ক্ষতি: ৳${loss.minCrore}–${loss.maxCrore} কোটি (অনুমান)`);
    } else if (risk.economicImpact && Number(risk.economicImpact.total) > 0) {
        const crore = (Number(risk.economicImpact.total) / 10000000).toFixed(2);
        lines.push('');
        lines.push(`💰 সম্ভাব্য ক্ষতি: ৳${crore} কোটি`);
    }

    /* Helpline footer */
    lines.push('');
    lines.push('📞 হেল্পলাইন: 16358');

    const body = lines.join('\n');

    /* ===== Title ===== */
    const title = critical
        ? `🚨 ${districtName} এলাকায় জরুরি সতর্কতা`
        : `⚠️ ${districtName} এলাকায় রোগের ঝুঁকি বেড়েছে`;

    /* ===== Meta (for dedupe + filtering) ===== */
    const meta = {
        district: risk.district,
        level: risk.level,
        dataDate: risk.dataDate || null,
        score: risk.score,
        diseases: (risk.diseases || []).map(d => d.key),
        kind: 'nasa_outbreak',
        source: 'NASA POWER'
    };

    /* Attach impact snapshot (helpful for later re-open / analytics) */
    if (risk.impact) {
        meta.impact = {
            farmersAtRisk: risk.impact.farmersAtRisk || 0,
            livestockAtRisk: risk.impact.livestockAtRisk || 0,
            populationAtRisk: risk.impact.populationAtRisk || 0
        };
    }
    if (risk.economicImpact) {
        meta.economicImpact = {
            total: risk.economicImpact.total || 0,
            crore: risk.economicImpact.total
                ? Number((risk.economicImpact.total / 10000000).toFixed(2))
                : 0
        };
    }

    const id = await createNotification({
        title,
        body,
        icon: critical ? '🚨' : '⚠️',
        type: 'nasa_outbreak_alert',
        priority: 'high',
        petName: null,
        actionUrl: 'climate-dashboard.html',
        scheduledFor: Date.now(),
        maxReminds: 2,
        meta
    });

    /* Real push only for a NEW (non-duplicate) alert */
    if (id) {
        const top = diseases[0];
        const short = top
            ? `${top.nameBn || 'রোগ'} ঝুঁকি ${top.score}% — পশুকে মশারির নিচে রাখুন, ফার্ম শুকনো রাখুন।`
            : `রোগের ঝুঁকি ${risk.score}% — পশুকে মশারির নিচে রাখুন, ফার্ম শুকনো রাখুন।`;
        showLocalPush(title, short, 'climate-dashboard.html', `nasa-${key}-${risk.level}`);
    }
    return id;
}
/* ===== END: NASA CLIMATE ALERT BRIDGE v2.0 ===== */

/* ===== START: PUBLIC API - window.DVNotifications ===== */
window.DVNotifications = {
    analyzeAndSchedule,
    checkAndFireReminders,
    createNotification,
    scheduleNasaOutbreakAlert,
    requestPushPermission,
    pushPermission,
    showLocalPush,
    extractDurationDays,
    hasMedicineAdvice,
    hasFollowUpHint,
    hasVaccineAdvice,
    get TEST_MODE() { return TEST_MODE; }
};

window.triggerNasaOutbreakAlert = scheduleNasaOutbreakAlert;
/* ===== END: PUBLIC API - window.DVNotifications ===== */

})();