/* ========================================
   DAILYVET — COUNTRY LIST + SHARED UI
   Used by: login.html, account.html, vet-login.html
   ======================================== */

/* ========================================
   COUNTRY DATA
   ======================================== */
const COUNTRIES = [
    { name: 'Bangladesh',    code: '+880', iso: 'BD' },
    { name: 'India',         code: '+91',  iso: 'IN' },
    { name: 'Spain',         code: '+34',  iso: 'ES' },
    { name: 'United States', code: '+1',   iso: 'US' },
    { name: 'United Kingdom',code: '+44',  iso: 'GB' },
    { name: 'Pakistan',      code: '+92',  iso: 'PK' },
    { name: 'Nepal',         code: '+977', iso: 'NP' },
    { name: 'Sri Lanka',     code: '+94',  iso: 'LK' },
    { name: 'Malaysia',      code: '+60',  iso: 'MY' },
    { name: 'Saudi Arabia',  code: '+966', iso: 'SA' },
    { name: 'UAE',           code: '+971', iso: 'AE' },
    { name: 'Qatar',         code: '+974', iso: 'QA' },
    { name: 'Kuwait',        code: '+965', iso: 'KW' },
    { name: 'Italy',         code: '+39',  iso: 'IT' },
    { name: 'France',        code: '+33',  iso: 'FR' },
    { name: 'Germany',       code: '+49',  iso: 'DE' },
    { name: 'Canada',        code: '+1',   iso: 'CA' },
    { name: 'Australia',     code: '+61',  iso: 'AU' },
    { name: 'China',         code: '+86',  iso: 'CN' },
    { name: 'Japan',         code: '+81',  iso: 'JP' },
    { name: 'South Korea',   code: '+82',  iso: 'KR' },
    { name: 'Singapore',     code: '+65',  iso: 'SG' },
    { name: 'Indonesia',     code: '+62',  iso: 'ID' },
    { name: 'Turkey',        code: '+90',  iso: 'TR' },
    { name: 'Russia',        code: '+7',   iso: 'RU' },
    { name: 'Brazil',        code: '+55',  iso: 'BR' },
    { name: 'South Africa',  code: '+27',  iso: 'ZA' },
    { name: 'Nigeria',       code: '+234', iso: 'NG' },
    { name: 'Egypt',         code: '+20',  iso: 'EG' }
];

window.COUNTRIES = COUNTRIES;
window.selectedCountry = COUNTRIES[0];   // Bangladesh default

/* Country-specific phone placeholders */
const PHONE_PLACEHOLDERS = {
    BD: '1XXXXXXXXX', IN: 'XXXXXXXXXX', ES: 'XXXXXXXXX',
    US: 'XXXXXXXXXX', GB: 'XXXXXXXXXX', PK: 'XXXXXXXXXX',
    NP: 'XXXXXXXXXX', LK: 'XXXXXXXXX',  MY: 'XXXXXXXXX',
    SA: 'XXXXXXXXX',  AE: 'XXXXXXXXX',  QA: 'XXXXXXXX',
    KW: 'XXXXXXXX',   IT: 'XXXXXXXXXX', FR: 'XXXXXXXXX',
    DE: 'XXXXXXXXXX', CA: 'XXXXXXXXXX', AU: 'XXXXXXXXX',
    CN: 'XXXXXXXXXX', JP: 'XXXXXXXXXX', KR: 'XXXXXXXXXX',
    SG: 'XXXXXXXX',   ID: 'XXXXXXXXX',  TR: 'XXXXXXXXXX',
    RU: 'XXXXXXXXXX', BR: 'XXXXXXXXXX', ZA: 'XXXXXXXXX',
    NG: 'XXXXXXXXXX', EG: 'XXXXXXXXXX'
};

window.PHONE_PLACEHOLDERS = PHONE_PLACEHOLDERS;

/* ========================================
   PHONE NUMBER LENGTH VALIDATION RANGES
   (national significant number — after the
   leading trunk "0" and country code are
   removed). Most countries have one fixed
   length; a few genuinely vary by operator/
   carrier block, so those use a min–max range
   instead of a single exact digit count.
   ======================================== */
const PHONE_LENGTH_RANGES = {
    BD: { min: 10, max: 10 },  // 01XXXXXXXXX (11 w/ leading 0)
    IN: { min: 10, max: 10 },
    ES: { min: 9,  max: 9  },
    US: { min: 10, max: 10 },
    GB: { min: 10, max: 10 },
    PK: { min: 10, max: 10 },
    NP: { min: 10, max: 10 },
    LK: { min: 9,  max: 9  },
    MY: { min: 8,  max: 9  },  // varies by operator: 01X-XXXXXXX(X)
    SA: { min: 9,  max: 9  },
    AE: { min: 9,  max: 9  },
    QA: { min: 8,  max: 8  },
    KW: { min: 8,  max: 8  },
    IT: { min: 9,  max: 10 },  // mobile numbers commonly 9–10 digits
    FR: { min: 9,  max: 9  },
    DE: { min: 10, max: 11 },  // varies by carrier prefix length
    CA: { min: 10, max: 10 },
    AU: { min: 9,  max: 9  },
    CN: { min: 11, max: 11 },  // FIX: mobile numbers are always 11 digits
    JP: { min: 10, max: 10 },
    KR: { min: 9,  max: 10 },  // 010-XXX-XXXX or 010-XXXX-XXXX
    SG: { min: 8,  max: 8  },
    ID: { min: 9,  max: 12 },  // wide legitimate range
    TR: { min: 10, max: 10 },
    RU: { min: 10, max: 10 },
    BR: { min: 10, max: 11 },  // FIX: modern 9-digit mobile → 11 w/ area code
    ZA: { min: 9,  max: 9  },
    NG: { min: 10, max: 10 },
    EG: { min: 10, max: 10 }
};
window.PHONE_LENGTH_RANGES = PHONE_LENGTH_RANGES;

const PHONE_INPUT_IDS = ['phoneInput', 'mobile', 'loginPhone', 'resetPhone'];

/* ========================================
   HELPERS
   ======================================== */
const _el = id => document.getElementById(id);

function _getPhoneInput() {
    for (const id of PHONE_INPUT_IDS) {
        const el = _el(id);
        if (el) return el;
    }
    return null;
}

function _closeCountryDropdown() {
    _el('countryList')?.classList.remove('open');
    _el('countryBtn')?.setAttribute('aria-expanded', 'false');
}

/* ========================================
   RENDER COUNTRY LIST
   ======================================== */
function renderCountries(filter = '') {
    const scroll = _el('countryScroll');
    if (!scroll) return;

    const q = filter.trim().toLowerCase();
    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.code.includes(q) ||
        c.iso.toLowerCase().includes(q)
    );

    if (!filtered.length) {
        scroll.innerHTML = '<div class="country-item flex items-center justify-center text-mute p-5 text-[14px]">No country found</div>';
        return;
    }

    const selectedIso = window.selectedCountry.iso;
    scroll.innerHTML = filtered.map(c => `
        <div class="country-item flex items-center gap-3 py-3 px-4 text-[15px] cursor-pointer border-l-[3px] border-transparent hover:bg-soft transition-colors ${c.iso === selectedIso ? '!bg-soft !border-teal font-bold' : ''}"
             data-iso="${c.iso}">
            <img class="flag-img w-[26px] h-[18px] object-cover rounded-sm"
                 src="https://flagcdn.com/w40/${c.iso.toLowerCase()}.png"
                 alt="${c.iso}" width="26" height="18" />
            <span class="name flex-1 min-w-0 truncate text-deep">${c.name}</span>
            <span class="code font-bold text-teal ml-auto">${c.code}</span>
        </div>
    `).join('');
}

/* ========================================
   TOGGLE DROPDOWN
   ======================================== */
function toggleCountryList(event) {
    if (event) event.stopPropagation();

    const list = _el('countryList');
    const btn = _el('countryBtn');
    if (!list || !btn) return;

    const isOpen = list.classList.contains('open');

    if (isOpen) {
        list.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
    } else {
        renderCountries();
        list.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        setTimeout(() => _el('countrySearch')?.focus(), 100);
    }
}

/* ========================================
   FILTER COUNTRIES
   ======================================== */
function filterCountries() {
    const el = _el('countrySearch');
    if (el) renderCountries(el.value);
}

/* ========================================
   SELECT COUNTRY
   ======================================== */
function selectCountry(iso) {
    const c = COUNTRIES.find(x => x.iso === iso);
    if (!c) return;
    window.selectedCountry = c;

    // Update flag
    const flagImg = _el('selectedFlag');
    if (flagImg) {
        flagImg.src = `https://flagcdn.com/w40/${c.iso.toLowerCase()}.png`;
        flagImg.alt = c.iso;
    }

    // Update code text
    const codeEl = _el('selectedCode');
    if (codeEl) codeEl.textContent = c.code;

    // Update phone placeholder
    const phoneInput = _getPhoneInput();
    if (phoneInput) phoneInput.placeholder = PHONE_PLACEHOLDERS[c.iso] || 'XXXXXXXXX';

    // Close dropdown
    _closeCountryDropdown();
    const search = _el('countrySearch');
    if (search) search.value = '';

    if (phoneInput) phoneInput.focus();
}

/* ========================================
   INIT
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {

    /* ---------- Country button ---------- */
    const btn = _el('countryBtn');
    if (btn) btn.addEventListener('click', toggleCountryList);

    /* ---------- Search ---------- */
    const search = _el('countrySearch');
    if (search) search.addEventListener('input', filterCountries);

    /* ---------- Country list — event delegation ---------- */
    const scroll = _el('countryScroll');
    if (scroll) {
        scroll.addEventListener('click', (e) => {
            const item = e.target.closest('.country-item[data-iso]');
            if (item) selectCountry(item.dataset.iso);
        });
    }

    /* ---------- Outside click closes dropdown ---------- */
    document.addEventListener('click', (e) => {
        const list = _el('countryList');
        const btnEl = _el('countryBtn');
        if (!list || !btnEl) return;
        if (!list.contains(e.target) && !btnEl.contains(e.target)) {
            list.classList.remove('open');
            btnEl.setAttribute('aria-expanded', 'false');
        }
    });

    /* ---------- Digits-only phone inputs ---------- */
    PHONE_INPUT_IDS.forEach(id => {
        const el = _el(id);
        if (el) {
            el.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '');
            });
        }
    });

    /* ---------- Prefill phone on reset page ---------- */
    const saved = sessionStorage.getItem('resetPhone');
    const resetPhone = _el('resetPhone');
    if (saved && resetPhone) {
        const digits = saved.replace(/\D/g, '');
        resetPhone.value = (digits.startsWith('880') && digits.length === 13)
            ? digits.slice(3)
            : digits;
    }

    /* ---------- Profile picture preview (with duplicate-guard) ---------- */
    const wrapper = _el('profilePicWrapper');
    const fileInput = _el('profilePic');
    const preview = _el('profilePreview');

    if (wrapper && fileInput && wrapper.dataset.dvPicBound !== '1') {
        wrapper.dataset.dvPicBound = '1';
        wrapper.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                alert('Image too large. Max 5MB.');
                return;
            }

            const reader = new FileReader();
            reader.onload = function (ev) {
                if (preview) {
                    preview.innerHTML = `<img src="${ev.target.result}" alt="Profile"
                        style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                }
            };
            reader.readAsDataURL(file);
        });
    }

    /* ---------- Password toggle (with duplicate-guard) ---------- */
    document.querySelectorAll('.toggle-password').forEach(btn => {
        if (btn.dataset.dvPasswordBound === '1') return;
        btn.dataset.dvPasswordBound = '1';

        btn.addEventListener('click', function () {
            const targetId = btn.dataset.target;
            if (!targetId) return;
            const input = document.getElementById(targetId);
            if (!input) return;

            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                if (icon) {
                    icon.classList.remove('fa-eye');
                    icon.classList.add('fa-eye-slash');
                }
            } else {
                input.type = 'password';
                if (icon) {
                    icon.classList.remove('fa-eye-slash');
                    icon.classList.add('fa-eye');
                }
            }
        });
    });

});