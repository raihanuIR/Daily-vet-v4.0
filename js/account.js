/* ============================================================
   DailyVet — Account Page UI Logic
   ⚠️ Form submit is handled by auth.js (registerForm ID)
   This file handles ONLY: pet chips + hidden pets field
   Country picker + password toggle are handled by js/script.js
   ============================================================ */

(function () {
'use strict';

/* ============================================================
   STATE + HELPERS
   ============================================================ */
let selectedPets = [];

const _el = id => document.getElementById(id);

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeJs(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

/* ============================================================
   1. MULTIPLE PET SELECTION
   ============================================================ */
function addSelectedPet() {
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
    selectedPets = selectedPets.filter(p => p !== petName);
    renderSelectedPets();
}

function renderSelectedPets() {
    const wrapper = _el('selectedPetsWrapper');
    if (!wrapper) return;

    wrapper.innerHTML = selectedPets.map(pet => `
        <div class="selected-pet-chip inline-flex items-center gap-1.5 py-1 px-3 bg-soft border border-line rounded-full text-deep font-semibold text-[13px] shadow-sm">
            <span class="pet-name">${escapeHtml(pet)}</span>
            <button type="button"
                    class="remove-pet-btn border-none bg-transparent text-mute hover:text-[#e74c3c] cursor-pointer p-0.5 text-[12px] flex items-center justify-center transition-colors"
                    onclick="removePet('${escapeJs(pet)}')"
                    title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    // Hidden field so auth.js can read the pets array
    let hidden = _el('petsHidden');
    if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id = 'petsHidden';
        hidden.name = 'pets';
        _el('registerForm')?.appendChild(hidden);
    }
    hidden.value = selectedPets.join(',');
}

function getSelectedPets() {
    return selectedPets.slice();
}

function loadPets(petsArray) {
    selectedPets = Array.isArray(petsArray) ? petsArray.slice() : [];
    renderSelectedPets();
}

window.addSelectedPet = addSelectedPet;
window.removePet = removePet;
window.getSelectedPets = getSelectedPets;
window.loadPets = loadPets;

/* ============================================================
   2. INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    renderSelectedPets();

    const petSelect = _el('petTypeSelect');
    if (petSelect) {
        petSelect.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addSelectedPet();
        });
    }
});

})();