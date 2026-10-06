/* ============================================================
   DailyVet — Profile Page (FINAL)
   ✅ Multiple pets
   ✅ Profile pic saved to FIRESTORE as Base64
   ✅ View other user's profile
   ✅ Vet Account section (only for vets)
   ✅ Delete Vet Account + View Doctor Account + Vet Dashboard
   ✅ Persistent login (localStorage) — until logout/delete
   ============================================================ */
(function () {
'use strict';

/* ---------- STATE ---------- */
let selectedPets = [];
let currentUserPhone = null;
let loadedPhotoURL = '';
let viewingPhone = null;
let isViewMode = false;
let viewedUserData = null;

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

const DEFAULT_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#d9d9d9"/>
  <circle cx="50" cy="40" r="18" fill="#ffffff"/>
  <path d="M50 62c-22 0-34 12-34 26v6h68v-6c0-14-12-26-34-26z" fill="#ffffff"/>
</svg>`);

function isPlaceholderPhoto(url) {
    if (!url) return true;
    return url.indexOf('dailyvetlogo') !== -1 || url.indexOf('data:image/svg+xml') === 0;
}

const _cleanPhone = p => String(p || '').replace(/[^0-9+]/g, '');
const _toE164 = p => {
    let clean = String(p).replace(/[\s\-+]/g, '');
    if (clean.startsWith('880')) clean = '880' + clean.slice(3);
    else if (clean.startsWith('0')) clean = '880' + clean.slice(1);
    return clean;
};

/* ---------- AUTH ---------- */
function getUserPhone() {
    return localStorage.getItem('userPhone') || sessionStorage.getItem('userPhone') || null;
}

function setUserAuth(phone, name) {
    if (phone) {
        localStorage.setItem('userPhone', phone);
        sessionStorage.setItem('userPhone', phone);
    }
    if (name !== undefined && name !== null) {
        localStorage.setItem('userName', name);
        sessionStorage.setItem('userName', name);
    }
}

function clearUserAuth() {
    try {
        localStorage.removeItem('userPhone');
        localStorage.removeItem('userName');
        localStorage.removeItem('userProfileCache');
        localStorage.removeItem('pendingGoogleLogin');
        localStorage.removeItem('vetPhone');
        localStorage.removeItem('vetName');
    } catch (e) {}
    sessionStorage.clear();
}

/* ---------- IMAGE ---------- */
function compressImageToBlob(file, maxWidth = 250, quality = 0.65) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width, height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('Compression failed')), 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/* ---------- HELPERS ---------- */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function escapeJs(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function normalizePet(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string') return raw.trim();
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'object') {
        return String(raw.name || raw.value || raw.label || raw.pet || raw.type || '').trim();
    }
    return String(raw).trim();
}

function normalizePetsArray(arr) {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    arr.forEach(item => {
        const s = normalizePet(item);
        if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    });
    return out;
}

/* ---------- MULTIPLE PETS ---------- */
function addSelectedPet() {
    if (isViewMode) return;
    const select = _el('petTypeSelect');
    if (!select) return;
    const pet = String(select.value || '').trim();
    if (!pet) { alert('Please select a pet first.'); return; }
    if (selectedPets.includes(pet)) {
        alert(pet + ' is already added.');
        select.value = '';
        return;
    }
    selectedPets.push(pet);
    renderSelectedPets();
    select.value = '';
    select.focus();
}

function removePet(petName) {
    if (isViewMode) return;
    selectedPets = selectedPets.filter(p => p !== petName);
    renderSelectedPets();
}

function renderSelectedPets() {
    const wrapper = _el('selectedPetsWrapper');
    if (!wrapper) return;
    wrapper.innerHTML = selectedPets
        .map(normalizePet)
        .filter(Boolean)
        .map(pet => `
            <div class="selected-pet-chip">
                <span class="pet-name">${escapeHtml(pet)}</span>
                <button type="button" class="remove-pet-btn"
                        onclick="removePet('${escapeJs(pet)}')" title="Remove">
                    <i class="fas fa-times"></i>
                </button>
            </div>`).join('');
}

function getSelectedPets() { return normalizePetsArray(selectedPets); }

function loadPets(petsArray) {
    selectedPets = normalizePetsArray(petsArray);
    renderSelectedPets();
}

window.addSelectedPet = addSelectedPet;
window.removePet = removePet;
window.getSelectedPets = getSelectedPets;
window.loadPets = loadPets;

/* ---------- PROFILE PICTURE PREVIEW ---------- */
function initProfilePicUpload() {
    const input = _el('profilePicInput');
    const img = _el('profileImage');
    if (!input || !img) return;

    input.addEventListener('change', (e) => {
        if (isViewMode) return;
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            alert('Image too large. Please choose under 5MB.');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            img.onerror = null;
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    img.addEventListener('error', () => { img.src = DEFAULT_AVATAR; });
}

/* ---------- LOAD PROFILE ---------- */
async function loadProfileData(userPhone) {
    try {
        const doc = await _fs().collection('users').doc(userPhone).get();
        if (!doc.exists) {
            alert('User not found.');
            window.location.href = 'home.html';
            return;
        }

        const data = doc.data();
        if (isViewMode) viewedUserData = data;

        const fields = {
            profileName: data.name || '',
            profilePhone: data.phone || userPhone || '',
            profileCity: data.city || '',
            profileArea: data.area || ''
        };
        Object.entries(fields).forEach(([id, value]) => {
            const el = _el(id);
            if (el) el.value = value;
        });

        const imgEl = _el('profileImage');
        if (imgEl) {
            loadedPhotoURL = isPlaceholderPhoto(data.photoURL) ? '' : (data.photoURL || '');
            imgEl.src = loadedPhotoURL || DEFAULT_AVATAR;
        }

        if (isViewMode) {
            const viewingNameEl = _el('viewingName');
            if (viewingNameEl) viewingNameEl.textContent = data.name || 'User';
        }

        const joinedEl = _el('profileJoined');
        if (joinedEl && data.createdAt) {
            const ts = data.createdAt;
            const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
            if (!isNaN(d)) {
                joinedEl.value = d.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric'
                });
            }
        }

        const petsArray = Array.isArray(data.pets)
            ? data.pets
            : (data.petType ? [data.petType] : []);
        loadPets(petsArray);

        /* ✅ Check if user is also a vet */
        await checkVetAccount(userPhone);

    } catch (err) {
        console.error('Load profile error:', err);
    }
}

/* ---------- CHECK VET ACCOUNT ---------- */
async function checkVetAccount(userPhone) {
    const vetSection = _el('vetAccountSection');
    if (!vetSection) return;

    if (isViewMode) {
        vetSection.style.display = 'none';
        return;
    }

    try {
        const vetDoc = await _fs().collection('vets').doc(userPhone).get();
        if (vetDoc.exists) {
            vetSection.style.display = 'flex';
            console.log('✅ Vet account detected:', userPhone);
        } else {
            vetSection.style.display = 'none';
        }
    } catch (err) {
        console.warn('Vet check skipped:', err);
        vetSection.style.display = 'none';
    }
}

/* ---------- SAVE PROFILE ---------- */
function initProfileSave() {
    const form = _el('profileForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (isViewMode) {
            alert('You cannot edit another user\'s profile.');
            return;
        }
        if (!currentUserPhone) {
            alert('Not logged in. Please login again.');
            window.location.href = 'login.html';
            return;
        }

        const name = _el('profileName').value.trim();
        const city = _el('profileCity').value.trim();
        const area = _el('profileArea').value.trim();
        const pets = getSelectedPets();

        if (!name) { alert('Please enter your name.'); return; }
        if (pets.length === 0) { alert('Please add at least one pet.'); return; }

        const saveBtn = form.querySelector('.save-btn');
        if (!saveBtn) return;
        const originalHTML = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const updateData = {
                name, city, area,
                pets,
                petType: pets[0] || '',
                photoURL: loadedPhotoURL || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const fileInput = _el('profilePicInput');
            const file = fileInput?.files?.[0];

            if (file) {
                const blob = await compressImageToBlob(file, 250, 0.65);
                if (blob.size > 700 * 1024) {
                    alert('Image too large even after compression. Try a smaller image.');
                    return;
                }
                const base64 = await blobToBase64(blob);
                updateData.photoURL = base64;
                loadedPhotoURL = base64;
            }

            await _fs().collection('users').doc(currentUserPhone).update(updateData);
            setUserAuth(currentUserPhone, name);

            alert('✅ Profile updated!');
            window.location.href = 'home.html';

        } catch (err) {
            console.error('❌ Save error:', err);
            if (err.message && err.message.includes('maximum size')) {
                alert('Image too large for Firestore. Try a smaller image.');
            } else {
                alert('❌ Failed to save: ' + (err.message || 'Try again.'));
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHTML;
        }
    });
}

/* ---------- LOGOUT ---------- */
window.logout = function () {
    if (isViewMode) { window.location.href = 'home.html'; return; }
    if (!confirm('Logout from DailyVet?')) return;
    clearUserAuth();
    window.location.href = 'login.html';
};

/* ---------- DELETE USER ACCOUNT ---------- */
window.deleteAccount = async function () {
    if (isViewMode || !currentUserPhone) return;
    if (!confirm('⚠️ Delete your account permanently?\n\nThis cannot be undone.')) return;
    if (!confirm('Are you absolutely sure?')) return;

    try {
        try { localStorage.removeItem('photo_' + currentUserPhone); } catch (e) {}
        await _fs().collection('users').doc(currentUserPhone).delete();
        clearUserAuth();
        alert('Account deleted.');
        window.location.href = 'login.html';
    } catch (err) {
        console.error('Delete error:', err);
        alert('Failed to delete: ' + err.message);
    }
};

/* ---------- DELETE VET ACCOUNT ---------- */
window.deleteVetAccount = async function () {
    if (isViewMode || !currentUserPhone) return;

    if (!confirm('⚠️ Delete your VET account?\n\nYou will no longer appear in the vet community list.\n\nYour user account stays active.\n\nThis cannot be undone.')) return;
    if (!confirm('Are you absolutely sure?')) return;

    try {
        await _fs().collection('vets').doc(currentUserPhone).delete();
        console.log('✅ Vet account deleted:', currentUserPhone);

        localStorage.removeItem('vetPhone');
        localStorage.removeItem('vetName');

        alert('✅ Your Vet account has been deleted.\n\nYour user account is still active.');

        const vetSection = _el('vetAccountSection');
        if (vetSection) vetSection.style.display = 'none';

    } catch (err) {
        console.error('Delete vet error:', err);
        alert('❌ Failed to delete vet account: ' + (err.message || 'Try again.'));
    }
};

/* ---------- OPEN DOCTOR PROFILE ---------- */
window.openMyDoctorProfile = function () {
    if (!currentUserPhone) {
        alert('Not logged in. Please login again.');
        return;
    }
    window.location.href = 'vet-profile.html?phone=' + encodeURIComponent(currentUserPhone);
};

/* ---------- VIEW MODE ---------- */
function _hide(ids, value = 'none') {
    (Array.isArray(ids) ? ids : [ids]).forEach(id => {
        const el = _el(id);
        if (el) el.style.display = value;
    });
}

function enableViewMode() {
    const titleEl = _el('profileTitle');
    if (titleEl) titleEl.textContent = 'Profile';

    _hide('logoutBtn');
    _hide('editPicBtn');
    _hide('picHint');
    _hide('petSelectWrapper');
    _hide('petHint');
    _hide('profileActions');
    _hide('dangerZone');
    _hide('vetAccountSection');
    _hide('viewModeBanner', 'flex');
    _hide('viewModeActions', 'flex');

    ['profileName', 'profileCity', 'profileArea'].forEach(id => {
        const el = _el(id);
        if (el) { el.disabled = true; el.readOnly = true; }
    });

    _el('profileContainer')?.classList.add('view-mode');
}

/* ---------- VIEW MODE ACTIONS ---------- */
function _getViewPhone() {
    if (!viewedUserData) return null;
    return viewedUserData.phone || viewingPhone || null;
}

window.callFromProfile = function () {
    const phone = _getViewPhone();
    if (!phone) return alert('Phone not available');
    window.location.href = 'tel:+' + _toE164(phone);
};

window.whatsappFromProfile = function () {
    const phone = _getViewPhone();
    if (!phone) return alert('Phone not available');
    const msg = encodeURIComponent('Hello! I found you on DailyVet. Can we talk?');
    window.open('https://wa.me/' + _toE164(phone) + '?text=' + msg, '_blank');
};

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
    initProfilePicUpload();
    initProfileSave();

    const petSelect = _el('petTypeSelect');
    if (petSelect) {
        petSelect.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addSelectedPet(); }
        });
    }

    const params = new URLSearchParams(window.location.search);
    const phoneFromUrl = params.get('phone');
    const myPhone = getUserPhone();

    if (!myPhone) {
        window.location.href = 'login.html';
        return;
    }

    currentUserPhone = myPhone;
    const cleanMy = _cleanPhone(myPhone);

    if (phoneFromUrl && _cleanPhone(phoneFromUrl) !== cleanMy) {
        isViewMode = true;
        viewingPhone = phoneFromUrl;
        enableViewMode();
        loadProfileData(phoneFromUrl);
    } else {
        isViewMode = false;
        viewingPhone = myPhone;
        renderSelectedPets();
        loadProfileData(myPhone);
    }
});

})();