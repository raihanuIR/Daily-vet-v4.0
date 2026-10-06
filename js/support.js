/* ========================================
   DAILYVET — SUPPORT PAGE
   ======================================== */
(function () {
'use strict';

const _el = id => document.getElementById(id);

/* ========================================
   SUPPORT FORM
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
    const userPhone = sessionStorage.getItem('userPhone');
    const userName = sessionStorage.getItem('userName');

    /* Prefill if logged in */
    const nameInput = _el('supportName');
    const phoneInput = _el('supportPhone');
    if (userPhone) {
        if (userName) nameInput && (nameInput.value = userName);
        if (phoneInput) phoneInput.value = userPhone.replace(/^\+\d+/, '');
    }

    /* Form submit */
    const form = _el('supportForm');
    if (form) form.addEventListener('submit', handleSupportSubmit);
});

/* ---------- Prevent duplicate submit ---------- */
let _supportSubmitting = false;

async function handleSupportSubmit(e) {
    e.preventDefault();
    if (_supportSubmitting) return;

    const name = _el('supportName').value.trim();
    const phone = _el('supportPhone').value.trim().replace(/\D/g, '');
    const type = _el('supportType').value;
    const subject = _el('supportSubject').value.trim();
    const message = _el('supportMessage').value.trim();

    /* Validation */
    if (name.length < 2)     return alert('Enter your name');
    if (phone.length < 6)    return alert('Enter a valid phone number');
    if (!type)               return alert('Select an issue type');
    if (subject.length < 3)  return alert('Enter a subject');
    if (message.length < 5)  return alert('Describe your issue');

    _supportSubmitting = true;

    const btn = _el('supportSubmitBtn');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Sending...</span>';

    /* Hide previous messages */
    const successMsg = _el('successMsg');
    const errorMsg = _el('errorMsg');
    if (successMsg) successMsg.style.display = 'none';
    if (errorMsg) errorMsg.style.display = 'none';

    try {
        await firebase.firestore().collection('support_tickets').add({
            name,
            phone: '+880' + phone.replace(/^0/, ''),
            type,
            subject,
            message,
            userPhone: sessionStorage.getItem('userPhone') || null,
            status: 'open',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        /* Show success */
        if (successMsg) {
            successMsg.style.display = 'flex';
            successMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => { successMsg.style.display = 'none'; }, 6000);
        }
        _el('supportForm')?.reset();

    } catch (err) {
        console.error('Support submit failed:', err);
        const errText = _el('errorText');
        if (errText) errText.textContent = err.message || 'Failed to send message.';
        if (errorMsg) errorMsg.style.display = 'flex';

    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
        _supportSubmitting = false;
    }
}

/* ========================================
   QUICK ACTIONS
   ======================================== */
function _fillReport(type, subject) {
    const typeSelect = _el('supportType');
    const subjectInput = _el('supportSubject');
    if (typeSelect) typeSelect.value = type;
    if (subjectInput) subjectInput.value = subject;
    scrollToForm();
}

function reportFakeVet()  { _fillReport('vet-fake', 'Report Fake Vet'); }
function reportFakeUser() { _fillReport('fake',     'Report Fake User'); }

function scrollToForm() {
    const form = _el('supportForm');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => _el('supportMessage')?.focus(), 400);
}

/* ========================================
   GLOBAL EXPORTS
   (needed for inline onclick handlers in HTML)
   ======================================== */
window.reportFakeVet = reportFakeVet;
window.reportFakeUser = reportFakeUser;
window.scrollToForm = scrollToForm;

})();