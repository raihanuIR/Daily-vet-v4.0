/* ============================================================
   DAILYVET — VET PROFILE (Edit own vet account)
   ============================================================ */
(function () {
'use strict';

let vetProfilePhone = null;
let vetLoadedPhoto = '';

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function isPlaceholderPhoto(url) {
    if (!url) return true;
    return url.indexOf('dailyvetlogo') !== -1 || url.indexOf('data:image/svg+xml') === 0;
}

/* ---------- IMAGE → BASE64 ---------- */
function compressToBase64(file, maxWidth = 300, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) {
                    h = (maxWidth / w) * h;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => {
                    if (!blob) return reject(new Error('Compression failed'));
                    const r2 = new FileReader();
                    r2.onloadend = () => resolve(r2.result);
                    r2.onerror = reject;
                    r2.readAsDataURL(blob);
                }, 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ---------- LOAD VET ---------- */
async function loadVetProfile(phone) {
    try {
        const doc = await _fs().collection('vets').doc(phone).get();
        if (!doc.exists) {
            alert('Vet account not found.');
            window.location.href = 'profile.html';
            return;
        }

        const data = doc.data();

        _el('vetProfileName').value = data.name || '';
        _el('vetProfilePhone').value = data.phone || phone;
        _el('vetProfileSpeciality').value = data.speciality || '';
        _el('vetProfileInstitute').value = data.institute || '';
        _el('vetProfileCity').value = data.city || '';
        _el('vetProfileArea').value = data.area || '';

        const imgEl = _el('vetProfileImage');
        if (imgEl) {
            vetLoadedPhoto = isPlaceholderPhoto(data.photoURL) ? '' : (data.photoURL || '');
            imgEl.src = vetLoadedPhoto || 'assets/dailyvetlogo.png';
        }

        const treatments = Array.isArray(data.treatments) ? data.treatments : [];
        document.querySelectorAll('#vetTreatmentGroup input[type="checkbox"]').forEach(cb => {
            cb.checked = treatments.includes(cb.value);
        });

    } catch (err) {
        console.error('Load vet profile error:', err);
        alert('Failed to load vet profile.');
    }
}

/* ---------- PROFILE PIC PREVIEW ---------- */
function initProfilePicUpload() {
    const input = _el('vetProfilePicInput');
    const img = _el('vetProfileImage');
    if (!input || !img) return;

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('Image too large. Please choose under 5MB.');
            input.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => { img.src = ev.target.result; };
        reader.readAsDataURL(file);
    });
}

/* ---------- SAVE VET PROFILE ---------- */
function initVetProfileSave() {
    const form = _el('vetProfileForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!vetProfilePhone) { alert('Not logged in.'); return; }

        const name = _el('vetProfileName').value.trim();
        const speciality = _el('vetProfileSpeciality').value;
        const institute = _el('vetProfileInstitute').value;
        const city = _el('vetProfileCity').value.trim();
        const area = _el('vetProfileArea').value.trim();
        const treatments = Array.from(
            document.querySelectorAll('#vetTreatmentGroup input[type="checkbox"]:checked')
        ).map(cb => cb.value);

        if (!name) { alert('Please enter your name.'); return; }
        if (!speciality) { alert('Please select your speciality.'); return; }
        if (!institute) { alert('Please select your institute.'); return; }
        if (!city || !area) { alert('Please fill in city and area.'); return; }
        if (treatments.length === 0) { alert('Select at least one pet you treat.'); return; }

        const saveBtn = form.querySelector('.save-btn');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const updateData = {
                name, speciality, institute, city, area,
                treatments,
                photoURL: vetLoadedPhoto || '',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const fileInput = _el('vetProfilePicInput');
            const file = fileInput?.files?.[0];
            if (file) {
                const base64 = await compressToBase64(file, 300, 0.7);
                updateData.photoURL = base64;
                vetLoadedPhoto = base64;
            }

            await _fs().collection('vets').doc(vetProfilePhone).update(updateData);

            localStorage.setItem('vetName', name);
            localStorage.setItem('userName', name);

            alert('✅ Vet profile updated!');
            window.location.href = 'profile.html';

        } catch (err) {
            console.error('Save error:', err);
            alert('❌ Failed to save: ' + (err.message || 'Try again.'));
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalHTML;
        }
    });
}

/* ---------- DELETE VET ACCOUNT ---------- */
window.deleteVetProfileAccount = async function () {
    if (!vetProfilePhone) return;

    if (!confirm('⚠️ Delete your VET account?\n\nYou will no longer appear in the vet community list.\n\nThis cannot be undone.')) return;
    if (!confirm('Are you absolutely sure?')) return;

    try {
        await _fs().collection('vets').doc(vetProfilePhone).delete();
        console.log('✅ Vet account deleted:', vetProfilePhone);

        localStorage.removeItem('vetPhone');
        localStorage.removeItem('vetName');

        alert('✅ Your Vet account has been deleted.');
        window.location.href = 'profile.html';

    } catch (err) {
        console.error('Delete error:', err);
        alert('❌ Failed: ' + (err.message || 'Try again.'));
    }
};

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', () => {
    const myPhone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!myPhone) {
        window.location.href = 'login.html';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const phoneFromUrl = params.get('phone') || myPhone;

    const cleanMy = String(myPhone).replace(/[^0-9+]/g, '');
    const cleanTarget = String(phoneFromUrl).replace(/[^0-9+]/g, '');

    if (cleanTarget !== cleanMy) {
        alert('You can only view your own Vet profile.');
        window.location.href = 'profile.html';
        return;
    }

    vetProfilePhone = phoneFromUrl;

    initProfilePicUpload();
    initVetProfileSave();
    loadVetProfile(phoneFromUrl);
});

})();