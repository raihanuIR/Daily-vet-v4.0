/* ========================================
   DAILYVET — VET DASHBOARD
   Load vets from Firestore + Search + Actions
   ======================================== */

let allVets = [];
let filteredVets = [];
let unsubscribeVets = null;

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();
const _cleanPhone = p => String(p || '').replace(/[^0-9+]/g, '');
const _myPhone = () => _cleanPhone(sessionStorage.getItem('userPhone'));

/* =============================================
   HELPERS
   ============================================= */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function isPlaceholderPhoto(url) {
    if (!url) return true;
    return url.indexOf('dailyvetlogo') !== -1 || url.indexOf('data:image/svg+xml') === 0;
}

function formatPhoneForLink(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[\s\-+]/g, '');
    if (clean.startsWith('880')) clean = '+880' + clean.slice(3);
    else if (clean.startsWith('0')) clean = '+880' + clean.slice(1);
    else clean = '+880' + clean;
    return clean;
}

/* =============================================
   NOTIFICATION DROPDOWN
   ============================================= */
window.toggleNotificationDropdown = function () {
    if (window.closeProfileDropdown) window.closeProfileDropdown();
    const dropdown = _el('notificationDropdown');
    if (!dropdown) return;
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
};

document.addEventListener('click', function (e) {
    const dropdown = _el('notificationDropdown');
    const bell = document.querySelector('.bell-wrapper');
    if (!dropdown || !bell) return;
    if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

/* =============================================
   SEARCH
   ============================================= */
let _searchTimer;

function initSearchHandler() {
    const input = _el('vetSearchInput');
    const clearBtn = _el('clearSearchBtn');
    if (!input) return;

    input.addEventListener('input', function () {
        const val = this.value.trim();
        if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
        clearTimeout(_searchTimer);
        _searchTimer = setTimeout(() => applyFilter(val), 200);
    });

    input.addEventListener('keypress', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        clearTimeout(_searchTimer);
        applyFilter(this.value.trim());
    });
}

window.clearVetSearch = function () {
    const input = _el('vetSearchInput');
    if (input) input.value = '';
    const clearBtn = _el('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    applyFilter('');
};

/* =============================================
   FILTER
   ============================================= */
function applyFilter(searchText) {
    const q = (searchText || '').toLowerCase().trim();

    filteredVets = !q ? [...allVets] : allVets.filter(vet => {
        const haystack = [
            vet.name || '',
            vet.speciality || '',
            vet.institute || '',
            vet.city || '',
            vet.area || '',
            (vet.treatments || []).join(' ')
        ].join(' ').toLowerCase();
        return haystack.includes(q);
    });

    const infoEl = _el('searchResultInfo');
    if (infoEl) {
        if (q) {
            infoEl.textContent = `${filteredVets.length} result${filteredVets.length !== 1 ? 's' : ''} for "${searchText}"`;
            infoEl.style.display = 'block';
        } else {
            infoEl.style.display = 'none';
        }
    }

    renderVetCards(filteredVets);
}

/* =============================================
   LOAD VETS
   ============================================= */
function loadVets() {
    const container = _el('vetCardContainer');
    if (!container) return;

    if (unsubscribeVets) {
        unsubscribeVets();
        unsubscribeVets = null;
    }

    container.innerHTML = `
        <div class="h-28 rounded-2xl bg-slate-100 animate-pulse border border-edge"></div>
        <div class="h-28 rounded-2xl bg-slate-100 animate-pulse border border-edge"></div>
    `;

    unsubscribeVets = _fs()
        .collection('vets')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                allVets = [];
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center p-8 bg-soft rounded-2xl border border-dashed border-line text-mute text-center gap-2">
                        <i class="fas fa-user-md text-3xl text-teal"></i>
                        <span class="text-sm font-medium">No veterinarians registered yet</span>
                    </div>`;
                return;
            }

            allVets = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.name) return;

                allVets.push({
                    id: doc.id,
                    name: data.name || '',
                    phone: data.phone || doc.id,
                    speciality: data.speciality || '',
                    institute: data.institute || '',
                    treatments: Array.isArray(data.treatments) ? data.treatments : [],
                    city: data.city || '',
                    area: data.area || '',
                    photoURL: isPlaceholderPhoto(data.photoURL) ? null : data.photoURL,
                    verified: !!data.verified
                });
            });

            const input = _el('vetSearchInput');
            applyFilter(input ? input.value.trim() : '');

        }, error => {
            console.error('Error loading vets:', error);
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 bg-soft rounded-2xl border border-dashed border-line text-mute text-center gap-2">
                    <i class="fas fa-exclamation-circle text-3xl text-danger"></i>
                    <span class="text-sm font-medium">Could not load veterinarians</span>
                </div>`;
        });
}

/* =============================================
   RENDER CARDS
   ============================================= */
function renderVetCards(vets) {
    const container = _el('vetCardContainer');
    const noVets = _el('noVetsMessage');
    if (!container) return;

    if (!vets.length) {
        container.innerHTML = '';
        if (noVets) noVets.style.display = 'flex';
        return;
    }

    if (noVets) noVets.style.display = 'none';

    const myPhone = _myPhone();

    container.innerHTML = vets.map(vet => {
        const roleText = vet.speciality ? `Veterinarian · ${vet.speciality}` : 'Veterinarian';
        const location = [vet.city, vet.area].filter(Boolean).join(', ') || 'Location not set';

        const imgHTML = vet.photoURL
            ? `<img src="${vet.photoURL}" alt="${escapeHtml(vet.name)}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user-md\\'></i>';" />`
            : `<i class="fas fa-user-md"></i>`;

        const safePhone = (vet.phone || '').replace(/'/g, "\\'");
        const isMe = myPhone && _cleanPhone(vet.phone) === myPhone;

        const viewAction = isMe
            ? `onclick="window.location.href='profile.html'"`
            : `onclick="viewVetProfile('${safePhone}')"`;

        const verifiedBadge = vet.verified
            ? '<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 ml-1.5"><i class="fas fa-circle-check"></i> Verified</span>'
            : '';

        return `
            <div class="profile-card-row flex items-center gap-3.5 p-3.5 bg-white border border-edge rounded-2xl shadow-sm hover:shadow-md transition-all">
                <div class="profile-card-img w-14 h-14 rounded-full overflow-hidden shrink-0 bg-soft flex items-center justify-center text-teal text-xl border border-line cursor-pointer" ${viewAction}>${imgHTML}</div>
                <div class="profile-card-info flex-1 min-w-0 text-left">
                    <h5 class="profile-card-name text-[15px] font-bold text-deep flex items-center flex-wrap gap-1 leading-tight">${escapeHtml(vet.name)}${isMe ? ' <span class="text-teal text-[11px] font-semibold">(You)</span>' : ''}${verifiedBadge}</h5>
                    <div class="profile-card-role text-[12px] font-semibold text-teal truncate mt-0.5">${escapeHtml(roleText)}</div>
                    <p class="profile-card-location text-[11px] text-mute truncate mt-0.5"><i class="fas fa-map-marker-alt text-[10px] mr-1"></i>${escapeHtml(location)}</p>
                    <div class="profile-card-actions flex items-center gap-2 mt-2">

                        <button class="profile-action-btn w-8 h-8 rounded-full bg-soft text-teal hover:bg-teal hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer border-none" title="Call"
                                onclick="callVet('${safePhone}')">
                            <i class="fas fa-phone"></i>
                        </button>

                        <button class="profile-action-btn w-8 h-8 rounded-full bg-[#e8f8f0] text-[#10b981] hover:bg-[#10b981] hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer border-none" title="Chat on WhatsApp"
                                onclick="whatsappVet('${safePhone}')">
                            <i class="fab fa-whatsapp"></i>
                        </button>

                        <button class="profile-action-btn w-8 h-8 rounded-full bg-soft text-deep hover:bg-deep hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer border-none" title="View Profile"
                                ${viewAction}>
                            <i class="fas fa-user-md"></i>
                        </button>

                    </div>
                </div>
            </div>`;
    }).join('');
}

/* =============================================
   ACTIONS
   ============================================= */
window.callVet = function (phone) {
    if (!phone) return alert('Phone not available');
    window.location.href = 'tel:' + formatPhoneForLink(phone);
};

window.whatsappVet = function (phone) {
    if (!phone) return alert('Phone not available');
    const clean = formatPhoneForLink(phone).replace('+', '');
    const msg = encodeURIComponent('Hello Doctor! I found you on DailyVet. Can we talk?');
    window.open('https://wa.me/' + clean + '?text=' + msg, '_blank');
};

window.viewVetProfile = function (phone) {
    if (!phone) return alert('Vet not found');
    window.location.href = 'profile.html?phone=' + encodeURIComponent(phone);
};

/* =============================================
   AUTH STATE
   ============================================= */
firebase.auth().onAuthStateChanged(async function () {
    const userPhone = sessionStorage.getItem('userPhone');
    const userName = sessionStorage.getItem('userName');

    if (!userPhone) {
        window.location.href = 'login.html';
        return;
    }

    const nameEl = _el('userName');
    if (nameEl) nameEl.textContent = userName || 'User';

    const userDocRef = _fs().collection('users').doc(userPhone);
    userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            const finalName = data.name || 'User';
            if (nameEl) nameEl.textContent = finalName;
            sessionStorage.setItem('userName', finalName);

            const profileIcon = _el('profileIconImg');
            if (profileIcon) {
                if (!isPlaceholderPhoto(data.photoURL)) {
                    profileIcon.src = data.photoURL;
                } else {
                    const initial = finalName.charAt(0).toUpperCase();
                    profileIcon.src = `https://ui-avatars.com/api/?name=${initial}&background=035D69&color=fff&size=100`;
                }
            }
        }
    });

    loadVets();
});

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
    initSearchHandler();
});