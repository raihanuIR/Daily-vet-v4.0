/* ============================================================
   DailyVet — i18n (English / বাংলা)
   Usage in HTML:
     <h1 data-i18n="key">English fallback</h1>
     <input data-i18n-placeholder="key" placeholder="English fallback">
     data-i18n-title / data-i18n-aria-label work the same way.
   Usage in JS:  t('key')  or  t('key', { name: 'Rahim' })  ->  "Hello {name}"
   English text in the HTML is the fallback, so a missing key never blanks the UI.
   To add a page: add keys to DICT below, then tag the elements.
   ============================================================ */
(function () {
    'use strict';

    var STORAGE_KEY = 'dailyvet_lang';
    var SUPPORTED = ['en', 'bn'];

    var DICT = {
        en: {
            'lang.toggle': 'বাংলা',
            'lang.toggleTitle': 'Switch to Bangla'
        },
        bn: {
            'lang.toggle': 'English',
            'lang.toggleTitle': 'ইংরেজিতে পরিবর্তন করুন',

            /* ---- nav (shared) ---- */
            'nav.tagline': 'ক্লিনিক্যাল ও ফার্ম ইন্টেলিজেন্স',
            'nav.dashboard': 'ড্যাশবোর্ড',
            'nav.suites': 'ক্লিনিক্যাল ও ফার্ম সুইট',
            'nav.feedAdvisor': 'এআই ফিড অ্যাডভাইজার',
            'nav.feedAdvisorSub': 'স্মার্ট পুষ্টি ও খাদ্য পরিকল্পনা',
            'nav.pharma': 'ডেইলিভেট ফার্মা',
            'nav.pharmaSub': 'ওষুধের তালিকা ও ডোজ যাচাই',
            'nav.breed': 'জাত শনাক্তকরণ এআই',
            'nav.breedSub': 'গবাদি পশুর বাহ্যিক বৈশিষ্ট্য বিশ্লেষণ',
            'nav.healthScan': 'হেলথ স্ক্যান',
            'nav.healthScanSub': 'গোবর ও প্রস্রাব পরীক্ষা স্ক্যান',
            'nav.prScan': 'প্রেসক্রিপশন স্ক্যান',
            'nav.prScanSub': 'প্রেসক্রিপশন ওসিআর রিডার',
            'nav.aiConsult': 'এআই পরামর্শ',
            'nav.climate': 'নাসা জলবায়ু',
            'nav.community': 'কমিউনিটি',
            'nav.support': 'সহায়তা',
            'nav.vetsPortal': 'ভেট পোর্টাল',
            'nav.welcome': 'স্বাগতম',
            'nav.role': 'পোষা প্রাণী ও খামার মালিক',
            'nav.notifications': 'সাম্প্রতিক নোটিফিকেশন',
            'nav.read': 'পড়া হয়েছে',
            'nav.clear': 'মুছুন',
            'nav.noNotifications': 'কোনো নতুন নোটিফিকেশন নেই',
            'nav.profile': 'প্রোফাইল',
            'nav.profileSub': 'অ্যাকাউন্ট দেখুন ও সম্পাদনা করুন',

            /* bottom nav */
            'bnav.home': 'হোম',
            'bnav.aiVet': 'এআই ভেট',
            'bnav.climate': 'জলবায়ু',
            'bnav.community': 'কমিউনিটি',
            'bnav.vets': 'ভেট'
        }
    };

    function getLang() {
        try {
            var l = localStorage.getItem(STORAGE_KEY);
            if (SUPPORTED.indexOf(l) !== -1) return l;
        } catch (e) { /* storage blocked */ }
        return 'en';
    }

    var current = getLang();

    /* English text -> Bangla. Matched against the full trimmed text of a text node,
       so it works on every page without tagging. Add more pairs freely. */
    var PHRASES = {
        'Clinical & Farm Intelligence': 'ক্লিনিক্যাল ও ফার্ম ইন্টেলিজেন্স',
        'Dashboard': 'ড্যাশবোর্ড', 'Home': 'হোম', 'Clinical & Farm Suites': 'ক্লিনিক্যাল ও ফার্ম সুইট',
        'AI Feed Advisor': 'এআই ফিড অ্যাডভাইজার', 'Smart nutrition & ration planner': 'স্মার্ট পুষ্টি ও খাদ্য পরিকল্পনা',
        'DailyVet Pharma': 'ডেইলিভেট ফার্মা', 'Formulary & dose verification': 'ওষুধের তালিকা ও ডোজ যাচাই',
        'Breed Detection AI': 'জাত শনাক্তকরণ এআই', 'Bovine phenotype classifier': 'গবাদি পশুর বাহ্যিক বৈশিষ্ট্য বিশ্লেষণ',
        'Health Scan': 'হেলথ স্ক্যান', 'Dung & urine diagnostic scan': 'গোবর ও প্রস্রাব পরীক্ষা স্ক্যান',
        'PR Scan': 'প্রেসক্রিপশন স্ক্যান', 'Prescription neural OCR reader': 'প্রেসক্রিপশন ওসিআর রিডার',
        'AI Consultation': 'এআই পরামর্শ', 'NASA Climate': 'নাসা জলবায়ু', 'Community': 'কমিউনিটি',
        'Support': 'সহায়তা', 'Vets Portal': 'ভেট পোর্টাল', 'Welcome': 'স্বাগতম',
        'Pet & Farm Owner': 'পোষা প্রাণী ও খামার মালিক', 'Recent Notifications': 'সাম্প্রতিক নোটিফিকেশন',
        'Read': 'পড়া হয়েছে', 'Clear': 'মুছুন', 'No new notifications': 'কোনো নতুন নোটিফিকেশন নেই',
        'Profile': 'প্রোফাইল', 'View & edit account': 'অ্যাকাউন্ট দেখুন ও সম্পাদনা করুন',
        'AI Vet': 'এআই ভেট', 'Climate': 'জলবায়ু', 'Vets': 'ভেট',
        'Login': 'লগইন', 'Log in': 'লগইন', 'Log In': 'লগইন', 'Sign In': 'সাইন ইন', 'Sign in': 'সাইন ইন',
        'Sign Up': 'সাইন আপ', 'Sign up': 'সাইন আপ', 'Register': 'নিবন্ধন', 'Logout': 'লগআউট', 'Log out': 'লগআউট',
        'Email': 'ইমেইল', 'Password': 'পাসওয়ার্ড', 'Forgot password?': 'পাসওয়ার্ড ভুলে গেছেন?',
        'Search': 'অনুসন্ধান', 'Submit': 'জমা দিন', 'Save': 'সংরক্ষণ', 'Cancel': 'বাতিল', 'Delete': 'মুছে ফেলুন',
        'Edit': 'সম্পাদনা', 'Close': 'বন্ধ করুন', 'Back': 'পিছনে', 'Next': 'পরবর্তী', 'Loading...': 'লোড হচ্ছে...',
        'Emergency': 'জরুরি', 'Settings': 'সেটিংস', 'Account': 'অ্যাকাউন্ট'
    };
    var PH_RE = /\s+/g;
    function norm(s) { return s.replace(PH_RE, ' ').trim(); }
    var textState = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;

    function translateTextNodes(root) {
        if (!textState) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode && n.parentNode.nodeName;
                if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA' || p === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var n;
        while ((n = walker.nextNode())) {
            var st = textState.get(n);
            if (current === 'bn') {
                if (st && n.nodeValue === st.bn) continue;          /* already translated */
                var key = norm(n.nodeValue);
                var bn = key && PHRASES[key];
                if (bn) {
                    var lead = n.nodeValue.match(/^\s*/)[0], trail = n.nodeValue.match(/\s*$/)[0];
                    var out = lead + bn + trail;
                    textState.set(n, { en: n.nodeValue, bn: out });
                    n.nodeValue = out;
                }
            } else if (st && n.nodeValue === st.bn) {                 /* restore English */
                n.nodeValue = st.en;
                textState.delete(n);
            }
        }
    }

    function t(key, vars) {
        var s = (DICT[current] && DICT[current][key]);
        if (s === undefined) s = (DICT.en && DICT.en[key]);
        if (s === undefined) return key;
        if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
        return s;
    }

    /* Cache each element's original English so we can switch back without a reload */
    function remember(el, prop, value) {
        var attr = 'data-i18n-orig-' + prop;
        if (!el.hasAttribute(attr)) el.setAttribute(attr, value);
        return el.getAttribute(attr);
    }

    function applyTo(root) {
        var scope = root && root.querySelectorAll ? root : document;
        translateTextNodes(scope === document ? document.body : scope);

        var nodes = scope.querySelectorAll('[data-i18n]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var key = el.getAttribute('data-i18n');
            var orig = remember(el, 'text', el.textContent);
            var val = DICT[current] && DICT[current][key];
            el.textContent = (current !== 'en' && val !== undefined) ? val : orig;
        }

        ['placeholder', 'title', 'aria-label', 'alt'].forEach(function (attr) {
            var sel = '[data-i18n-' + attr + ']';
            var list = scope.querySelectorAll(sel);
            for (var j = 0; j < list.length; j++) {
                var e = list[j];
                var k = e.getAttribute('data-i18n-' + attr);
                var o = remember(e, attr, e.getAttribute(attr) || '');
                var v = DICT[current] && DICT[current][k];
                e.setAttribute(attr, (current !== 'en' && v !== undefined) ? v : o);
            }
        });
    }

    function updateToggle() {
        var btns = document.querySelectorAll('[data-lang-toggle]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].textContent = DICT[current]['lang.toggle'];
            btns[i].title = DICT[current]['lang.toggleTitle'];
        }
    }

    function setLang(lang) {
        if (SUPPORTED.indexOf(lang) === -1) return;
        current = lang;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
        document.documentElement.lang = lang;
        document.documentElement.classList.toggle('lang-bn', lang === 'bn');
        applyTo(document);
        updateToggle();
        document.dispatchEvent(new CustomEvent('languagechange', { detail: { lang: lang } }));
    }

    /* Extra strings can be registered by page scripts: DailyVetI18n.extend({ en:{...}, bn:{...} }) */
    function extend(more) {
        SUPPORTED.forEach(function (l) {
            if (more && more[l]) for (var k in more[l]) DICT[l][k] = more[l][k];
        });
        applyTo(document);
    }

    function injectToggle() {
        if (document.querySelector('[data-lang-toggle]')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-lang-toggle', '');
        b.setAttribute('aria-label', 'Language');
        b.style.cssText =
            'position:fixed;right:12px;bottom:84px;z-index:70;padding:8px 14px;border-radius:9999px;' +
            'border:1px solid #b2e0e6;background:#035D69;color:#fff;font:700 12px/1 system-ui,sans-serif;' +
            'cursor:pointer;box-shadow:0 4px 14px rgba(3,93,105,.3)';
        b.addEventListener('click', function () { setLang(current === 'en' ? 'bn' : 'en'); });
        document.body.appendChild(b);
        /* on desktop there is no bottom nav, so sit lower */
        var mq = window.matchMedia('(min-width:1024px)');
        var place = function () { b.style.bottom = mq.matches ? '16px' : '84px'; };
        place();
        if (mq.addEventListener) mq.addEventListener('change', place);
    }

    /* Translate elements that scripts add later (dynamic cards, modals…) */
    function observe() {
        if (!window.MutationObserver) return;
        var busy = false;
        new MutationObserver(function (muts) {
            if (busy || current === 'en') return;
            busy = true;
            muts.forEach(function (m) {
                m.addedNodes.forEach(function (n) { if (n.nodeType === 1) applyTo(n); });
            });
            busy = false;
        }).observe(document.body, { childList: true, subtree: true });
    }

    function injectFont() {
        if (document.getElementById('i18n-bn-font')) return;
        var l = document.createElement('link');
        l.id = 'i18n-bn-font'; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700;800&display=swap';
        document.head.appendChild(l);
        var st = document.createElement('style');
        st.textContent = "html.lang-bn body, html.lang-bn button, html.lang-bn input, html.lang-bn textarea, html.lang-bn select { font-family: 'Noto Sans Bengali', 'Inter', sans-serif; }";
        document.head.appendChild(st);
    }

    function init() {
        injectFont();
        document.documentElement.lang = current;
        document.documentElement.classList.toggle('lang-bn', current === 'bn');
        injectToggle();
        applyTo(document);
        updateToggle();
        observe();
    }

    window.DailyVetI18n = { t: t, setLang: setLang, getLang: function () { return current; }, extend: extend, apply: applyTo };
    window.t = t;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
