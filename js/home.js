/* ========================================
   DAILYVET — HOME DASHBOARD JS
   Profile cards + Pet/Name/City search
   ✅ Reads `pets` array (with legacy petType fallback)
   ✅ View-other-profile: opens profile.html?phone=XXX
   ✅ Notification system (bell badge + dropdown list)
   ✅ Mark all read button
   ✅ NEW — Individual delete + Clear all
   ======================================== */
(function () {
'use strict';

let allUsers = [];
let unsubscribeProfileCards = null;
let _unsubNotifs = null;

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

/* =============================================
   SKELETON
   ============================================= */
(function injectShimmerCSS() {
    if (document.getElementById('shimmer-style')) return;
    const style = document.createElement('style');
    style.id = 'shimmer-style';
    style.textContent = `@keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
    }`;
    document.head.appendChild(style);
})();

function showInitialSkeletons() {
    const el = _el('profileCardContainer');
    if (!el) return;

    let html = '';
    for (let i = 0; i < 3; i++) {
        html += `<div class="skeleton-card" style="
            height: 120px;
            background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 12px;
            margin-bottom: 12px;"></div>`;
    }
    el.innerHTML = html;
}

/* =============================================
   HELPERS
   ============================================= */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isPlaceholderPhoto(url) {
    if (!url) return true;
    return url.indexOf('dailyvetlogo') !== -1 || url.indexOf('data:image/svg+xml') === 0;
}

function getUserPetsString(user) {
    if (Array.isArray(user.pets) && user.pets.length) return user.pets.join(', ');
    return user.petType || '';
}

const _cleanPhone = p => String(p || '').replace(/[^0-9+]/g, '');
const _myPhone = () => _cleanPhone(sessionStorage.getItem('userPhone'));

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
   🔔 NOTIFICATION SYSTEM
   ============================================= */
function initNotifications() {
    const phone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!phone) {
        console.warn('🔔 No phone — notification skipped');
        return;
    }

    console.log('🔔 Init notifications for:', phone);

    const ref = _fs().collection('users').doc(phone).collection('notifications');

    // Real-time listener
    if (_unsubNotifs) _unsubNotifs();
    _unsubNotifs = ref.onSnapshot(snap => {
        const items = [];
        let unread = 0;

        snap.forEach(d => {
            const n = { id: d.id, ...d.data() };
            items.push(n);
            if (!n.read && n.active !== false) unread++;
        });

        // Client-side sort (newest first)
        items.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));

        console.log('🔔 Notifications:', items.length, '| Unread:', unread);

        _updateBadge(unread);
        _renderNotifList(items);
        _updateMarkAllBtn(unread);
        _updateClearBtn(items.length);

    }, err => {
        console.warn('🔔 Notification listener failed:', err.message);
    });

    // Check pending reminders
    if (window.DVNotifications?.checkAndFireReminders) {
        setTimeout(() => window.DVNotifications.checkAndFireReminders(), 2000);
    }
}

function _updateBadge(count) {
    const badge = _el('notificationBadge');
    if (!badge) {
        console.warn('🔔 Badge element not found');
        return;
    }
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function _updateMarkAllBtn(unread) {
    const btn = _el('markAllReadBtn');
    if (!btn) return;
    btn.disabled = unread === 0;
    btn.style.opacity = unread === 0 ? '0.5' : '1';
}

function _updateClearBtn(total) {
    const btn = _el('clearAllNotifBtn');
    if (!btn) return;
    btn.disabled = total === 0;
    btn.style.opacity = total === 0 ? '0.5' : '1';
}

function _renderNotifList(items) {
    const list = _el('notificationList');
    if (!list) {
        console.warn('🔔 List element not found');
        return;
    }

    if (!items.length) {
        list.innerHTML = '<div class="notif-empty">No notifications</div>';
        return;
    }

    list.innerHTML = items.map(n => {
        const isUnread = !n.read && n.active !== false;
        const isDone = n.active === false;
        const time = _relativeTime(n.createdAtMs);
        const safeId = String(n.id).replace(/'/g, "\\'");
        const safeUrl = String(n.actionUrl || 'ai.html').replace(/'/g, "\\'");

        return `
            <div class="notif-item flex items-start gap-3 p-3.5 hover:bg-soft transition-colors cursor-pointer relative ${isUnread ? 'bg-[#f0f9fa]' : ''} ${isDone ? 'opacity-50' : ''}">
                <div class="notif-item-icon text-lg flex-shrink-0">${n.icon || '🔔'}</div>
                <div class="notif-item-body flex-1 min-w-0"
                     onclick="window.__openNotification('${safeId}', '${safeUrl}')">
                    <div class="notif-item-title text-[14px] font-bold text-deep">${escapeHtml(n.title || '')}</div>
                    <div class="notif-item-text text-[13px] text-[#557b82] mt-0.5 line-clamp-2">${escapeHtml(n.body || '')}</div>
                    <div class="notif-item-time text-[11px] text-mute mt-1">${time}${n.remindCount ? ` • ${n.remindCount}×` : ''}</div>
                </div>
                ${isUnread ? '<div class="notif-dot w-2 h-2 rounded-full bg-teal flex-shrink-0 self-center"></div>' : ''}
                <button class="notif-delete-btn text-mute hover:text-[#e74c3c] p-1.5 rounded-full hover:bg-edge border-none bg-transparent cursor-pointer flex-shrink-0 transition-colors"
                        title="Delete notification"
                        onclick="event.stopPropagation(); window.__deleteNotification('${safeId}')">
                    <i class="fas fa-trash-alt text-[12px]"></i>
                </button>
            </div>
        `;
    }).join('');
}

function _relativeTime(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
    if (diff < min) return 'Just now';
    if (diff < hour) return Math.floor(diff / min) + 'm ago';
    if (diff < day) return Math.floor(diff / hour) + 'h ago';
    return Math.floor(diff / day) + 'd ago';
}

window.__openNotification = async function (notifId, url) {
    try {
        const phone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
        await _fs().collection('users').doc(phone)
            .collection('notifications').doc(notifId)
            .update({
                read: true,
                readAt: firebase.firestore.FieldValue.serverTimestamp(),
                readAtMs: Date.now()
            });
        console.log('✅ Marked read:', notifId);
    } catch (e) {
        console.warn('Mark read failed:', e.message);
    }
    const dd = _el('notificationDropdown');
    if (dd) dd.style.display = 'none';
    if (url) window.location.href = url;
};

/* =============================================
   🗑️ DELETE — Individual notification
   ============================================= */
window.__deleteNotification = async function (notifId) {
    if (!notifId) return;
    if (!confirm('🗑️ Delete this notification?')) return;

    const phone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!phone) return;

    try {
        await _fs().collection('users').doc(phone)
            .collection('notifications').doc(notifId)
            .delete();

        console.log('🗑️ Deleted notification:', notifId);
        // Firestore listener will auto-update UI + badge

    } catch (err) {
        console.warn('❌ Delete failed:', err.message);
        alert('Failed to delete. Please try again.');
    }
};

/* =============================================
   🔔 MARK ALL NOTIFICATIONS AS READ
   ============================================= */
async function markAllNotificationsRead() {
    const phone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!phone) {
        console.warn('🔔 No phone — cannot mark read');
        return;
    }

    const btn = _el('markAllReadBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const ref = _fs().collection('users').doc(phone).collection('notifications');

        // Only unread docs (single-field query, no composite index needed)
        const snap = await ref.where('read', '==', false).get();

        if (snap.empty) {
            console.log('🔔 Nothing to mark as read');
            return;
        }

        // Batch update
        const batch = _fs().batch();
        snap.forEach(d => {
            batch.update(d.ref, {
                read: true,
                readAt: firebase.firestore.FieldValue.serverTimestamp(),
                readAtMs: Date.now()
            });
        });
        await batch.commit();

        console.log(`✅ Marked ${snap.size} notification(s) as read`);

        // Instant UI feedback
        _updateBadge(0);
        _updateMarkAllBtn(0);

        document.querySelectorAll('.notif-item.unread').forEach(el => {
            el.classList.remove('unread');
            const dot = el.querySelector('.notif-dot');
            if (dot) dot.remove();
        });

    } catch (err) {
        console.warn('❌ Mark all read failed:', err.message);
        alert('Failed to mark as read. Please try again.');
    } finally {
        if (btn) btn.innerHTML = originalHTML;
    }
}

window.markAllNotificationsRead = markAllNotificationsRead;

/* =============================================
   🗑️ CLEAR ALL — Delete all notifications
   ============================================= */
async function clearAllNotifications() {
    const phone = sessionStorage.getItem('userPhone') || localStorage.getItem('userPhone');
    if (!phone) {
        console.warn('🔔 No phone — cannot clear');
        return;
    }

    // Double confirmation for safety
    if (!confirm('🗑️ Delete ALL notifications?\n\nThis cannot be undone.')) return;

    const btn = _el('clearAllNotifBtn');
    const originalHTML = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
        const ref = _fs().collection('users').doc(phone).collection('notifications');
        const snap = await ref.get();

        if (snap.empty) {
            console.log('🔔 Nothing to clear');
            return;
        }

        // Batch delete
        const batch = _fs().batch();
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();

        console.log(`🗑️ Cleared ${snap.size} notification(s)`);

        // Instant UI feedback
        _updateBadge(0);
        _updateMarkAllBtn(0);
        _updateClearBtn(0);

        const list = _el('notificationList');
        if (list) list.innerHTML = '<div class="notif-empty">No notifications</div>';

    } catch (err) {
        console.warn('❌ Clear all failed:', err.message);
        alert('Failed to clear. Please try again.');
    } finally {
        if (btn) btn.innerHTML = originalHTML;
    }
}

window.clearAllNotifications = clearAllNotifications;

/* =============================================
   SEARCH INIT
   ============================================= */
let _searchTimer;

function initSearchHandler() {
    const input = _el('petSearchInput');
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

function clearPetSearch() {
    const input = _el('petSearchInput');
    if (input) input.value = '';
    const clearBtn = _el('clearSearchBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    applyFilter('');
}

/* =============================================
   FILTER APPLY
   ============================================= */
function applyFilter(searchText) {
    const q = (searchText || '').toLowerCase().trim();

    const filtered = !q ? allUsers : allUsers.filter(user => {
        const haystack = [
            user.name || '',
            getUserPetsString(user),
            user.city || '',
            user.area || ''
        ].join(' ').toLowerCase();
        return haystack.includes(q);
    });

    const infoEl = _el('searchResultInfo');
    if (infoEl) {
        if (q) {
            infoEl.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${searchText}"`;
            infoEl.style.display = 'block';
        } else {
            infoEl.style.display = 'none';
        }
    }

    renderProfileCards(filtered);
}

/* =============================================
   LOAD PROFILE CARDS — Live via onSnapshot
   ============================================= */
function loadProfileCards() {
    const container = _el('profileCardContainer');
    if (!container) return;

    if (unsubscribeProfileCards) {
        unsubscribeProfileCards();
        unsubscribeProfileCards = null;
    }

    unsubscribeProfileCards = _fs()
        .collection('users')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                allUsers = [];
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-users"></i>
                        No users yet
                    </div>`;
                return;
            }

            allUsers = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (!data.name) return;

                const petsArray = Array.isArray(data.pets)
                    ? data.pets
                    : (data.petType ? [data.petType] : []);

                allUsers.push({
                    id: doc.id,
                    name: data.name,
                    pets: petsArray,
                    petType: data.petType || '',
                    city: data.city || '',
                    area: data.area || '',
                    photoURL: isPlaceholderPhoto(data.photoURL) ? null : data.photoURL,
                    phone: data.phone || doc.id
                });
            });

            const input = _el('petSearchInput');
            applyFilter(input ? input.value.trim() : '');

        }, error => {
            console.error('Error loading profile cards:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    Could not load users
                </div>`;
        });
}

/* =============================================
   RENDER PROFILE CARDS
   ============================================= */
function renderProfileCards(users) {
    const container = _el('profileCardContainer');
    const noUsers = _el('noUsersMessage');
    if (!container) return;

    if (!users.length) {
        container.innerHTML = '';
        if (noUsers) noUsers.style.display = 'flex';
        return;
    }

    if (noUsers) noUsers.style.display = 'none';

    const myPhone = _myPhone();

    container.innerHTML = users.map(user => {
        const petsStr = getUserPetsString(user);
        const roleText = petsStr ? `Pet Owner · ${petsStr}` : 'Pet Owner';
        const location = [user.city, user.area].filter(Boolean).join(', ') || 'Location not set';

        const imgHTML = user.photoURL
            ? `<img src="${user.photoURL}" alt="${escapeHtml(user.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>';" />`
            : `<i class="fas fa-user"></i>`;

        const safePhone = (user.phone || '').replace(/'/g, "\\'");
        const isMe = myPhone && _cleanPhone(user.phone) === myPhone;

        const isCommunity = typeof window !== 'undefined' && window.location.pathname.includes('community.html');
        const fromParam = isCommunity ? '?from=community' : '';

        const viewAction = isMe
            ? `onclick="window.location.href='profile.html${fromParam}'"`
            : `onclick="viewUserProfile('${safePhone}')"`;

        return `
            <div class="profile-card-row flex items-center gap-3.5 p-3.5 bg-white border border-edge rounded-2xl shadow-sm hover:border-line transition-all">
                <div class="profile-card-img w-14 h-14 rounded-full border border-line overflow-hidden flex-shrink-0 flex items-center justify-center bg-soft text-teal text-xl cursor-pointer" ${viewAction}>${imgHTML}</div>
                <div class="profile-card-info flex-1 min-w-0">
                    <h5 class="profile-card-name text-[15px] font-bold text-deep truncate m-0">${escapeHtml(user.name)}${isMe ? ' <span class="text-teal text-[11px] font-semibold">(You)</span>' : ''}</h5>
                    <div class="profile-card-role text-[12px] font-medium text-teal truncate mt-0.5">${escapeHtml(roleText)}</div>
                    <p class="profile-card-location text-[12px] text-mute truncate mt-0.5 mb-0">${escapeHtml(location)}</p>
                    <div class="profile-card-actions flex items-center gap-2 mt-2">
                        <button class="profile-action-btn w-8 h-8 rounded-full bg-soft border border-line text-deep hover:bg-deep hover:text-white flex items-center justify-center text-[12px] transition-colors cursor-pointer" title="Call"
                                onclick="callUser('${safePhone}')">
                            <i class="fas fa-phone"></i>
                        </button>
                        <button class="profile-action-btn w-8 h-8 rounded-full bg-soft border border-line text-deep hover:bg-deep hover:text-white flex items-center justify-center text-[12px] transition-colors cursor-pointer" title="Chat on WhatsApp"
                                onclick="whatsappUser('${safePhone}')">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                        <button class="profile-action-btn w-8 h-8 rounded-full bg-soft border border-line text-deep hover:bg-deep hover:text-white flex items-center justify-center text-[12px] transition-colors cursor-pointer" title="View Profile"
                                ${viewAction}>
                            <i class="fas fa-user"></i>
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

/* =============================================
   PROFILE ACTIONS
   ============================================= */
function formatPhoneForLink(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/[\s\-+]/g, '');
    if (clean.startsWith('880')) clean = '+880' + clean.slice(3);
    else if (clean.startsWith('0')) clean = '+880' + clean.slice(1);
    else clean = '+880' + clean;
    return clean;
}

window.callUser = function (phone) {
    if (!phone) return alert('Phone not available');
    window.location.href = 'tel:' + formatPhoneForLink(phone);
};

window.whatsappUser = function (phone) {
    if (!phone) return alert('Phone not available');
    const clean = formatPhoneForLink(phone).replace('+', '');
    const message = encodeURIComponent('Hello! I found you on DailyVet. Can we talk?');
    window.open('https://wa.me/' + clean + '?text=' + message, '_blank');
};

/* =============================================
   VIEW USER PROFILE
   ✅ Own card → profile.html (edit mode)
   ✅ Other card → profile.html?phone=XXX (view mode)
   ============================================= */
window.viewUserProfile = function (phone) {
    if (!phone) return alert('User not found');

    const myPhone = _myPhone();
    const cleanPhone = _cleanPhone(phone);
    const isCommunity = typeof window !== 'undefined' && window.location.pathname.includes('community.html');

    if (myPhone && cleanPhone === myPhone) {
        window.location.href = isCommunity ? 'profile.html?from=community' : 'profile.html';
        return;
    }

    const fromParam = isCommunity ? '&from=community' : '';
    window.location.href = 'profile.html?phone=' + encodeURIComponent(phone) + fromParam;
};

/* =============================================
   AUTH STATE
   ============================================= */
firebase.auth().onAuthStateChanged(async function () {
    const userPhone = sessionStorage.getItem('userPhone');

    if (!userPhone) {
        window.location.href = 'login.html';
        return;
    }

    const nameEl = _el('userName');
    if (nameEl) nameEl.textContent = sessionStorage.getItem('userName') || 'User';

    _fs().collection('users').doc(userPhone).onSnapshot(doc => {
        if (!doc.exists) return;
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
            const profileMenuAvatar = _el('profileMenuAvatar');
            if (profileMenuAvatar) profileMenuAvatar.src = profileIcon.src;
        }
        const profileMenuName = _el('profileMenuName');
        if (profileMenuName) profileMenuName.textContent = finalName;
    });

    await loadProfileCards();

    // 🔔 Init notification system
    setTimeout(initNotifications, 800);
});

/* =============================================
   INIT
   ============================================= */
document.addEventListener('DOMContentLoaded', function () {
    showInitialSkeletons();
    initSearchHandler();
});

/* ========================================
   GLOBAL EXPORTS
   (needed for inline onclick handlers in HTML)
   ======================================== */
window.clearPetSearch = clearPetSearch;

})();