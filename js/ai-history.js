/* ============================================================
   DailyVet — AI Chat Conversation History
   ✅ Sidebar with all conversations
   ✅ Saved to Firestore (users/{phone}/ai_conversations)
   ✅ New chat / switch / delete
   ✅ Search conversations
   ✅ User profile picture in conversation list
   ============================================================ */
(function () {
'use strict';

/* ---------- STATE ---------- */
let currentConvId = null;
function _setCurrentConvId(id) {
    currentConvId = id;
    window.__currentConvId = id; // ai.js reads this global to know if a conversation is active
}
let allConversations = [];
let unsubscribeConversations = null;
let sidebarOpen = false;
let conversationsLoaded = false;

/* ✅ NEW — user photo cache for conversation avatars */
let cachedUserPhotoURL = null;
let cachedUserName = 'U';

async function _loadUserPhoto() {
    if (cachedUserPhotoURL !== null) return;
    const phone = getMyPhone();
    if (!phone) { cachedUserPhotoURL = ''; return; }
    try {
        const doc = await _fs().collection('users').doc(phone).get();
        if (doc.exists) {
            const data = doc.data();
            cachedUserPhotoURL = data.photoURL || '';
            cachedUserName = (data.name || 'U').charAt(0).toUpperCase();
        } else {
            cachedUserPhotoURL = '';
        }
    } catch (e) {
        cachedUserPhotoURL = '';
    }
}

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

const _cleanPhone = p => String(p || '').replace(/[^0-9+]/g, '');
const getMyPhone = () =>
    _cleanPhone(localStorage.getItem('userPhone') || sessionStorage.getItem('userPhone'));

const _convRef = () => {
    const phone = getMyPhone();
    if (!phone) return null;
    return _fs().collection('users').doc(phone).collection('ai_conversations');
};

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function escapeJs(text) {
    return String(text).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function formatRelativeTime(ts) {
    if (!ts) return '';
    const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
    if (isNaN(d)) return '';

    const now = Date.now();
    const diff = now - d.getTime();
    const min = 60 * 1000;
    const hour = 60 * min;
    const day = 24 * hour;

    if (diff < min) return 'Just now';
    if (diff < hour) return Math.floor(diff / min) + 'm ago';
    if (diff < day) return Math.floor(diff / hour) + 'h ago';
    if (diff < 7 * day) return Math.floor(diff / day) + 'd ago';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/* ============================================================
   SIDEBAR OPEN / CLOSE
   ============================================================ */
function toggleSidebar() {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
}

function openSidebar() {
    const sidebar = _el('chatSidebar');
    const overlay = _el('sidebarOverlay');
    if (!sidebar) return;

    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    sidebarOpen = true;

    if (!conversationsLoaded) {
        loadConversations();
        conversationsLoaded = true;
    }
}

function closeSidebar() {
    const sidebar = _el('chatSidebar');
    const overlay = _el('sidebarOverlay');
    if (!sidebar) return;

    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    sidebarOpen = false;
}

window.toggleSidebar = toggleSidebar;
window.openSidebar = openSidebar;
window.closeSidebar = closeSidebar;

/* ============================================================
   LOAD CONVERSATIONS (real-time)
   ============================================================ */
async function loadConversations() {
    await _loadUserPhoto();   // ✅ NEW — load user profile picture before rendering
    const ref = _convRef();
    const listEl = _el('conversationList');
    if (!ref || !listEl) return;

    if (unsubscribeConversations) unsubscribeConversations();

    listEl.innerHTML = '<div class="conv-empty">Loading...</div>';

    try {
        unsubscribeConversations = ref
            .orderBy('updatedAt', 'desc')
            .limit(60)
            .onSnapshot(snapshot => {
                allConversations = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    allConversations.push({
                        id: doc.id,
                        title: data.title || 'New Chat',
                        lastMessage: data.lastMessage || '',
                        messageCount: data.messageCount || 0,
                        updatedAt: data.updatedAt,
                        createdAt: data.createdAt
                    });
                });
                renderConversations();
            }, err => {
                console.warn('Conversation load failed:', err.message);
                listEl.innerHTML = '<div class="conv-empty">Could not load conversations</div>';
            });
    } catch (err) {
        console.warn('Conversation listener failed:', err.message);
        listEl.innerHTML = '<div class="conv-empty">Could not load conversations</div>';
    }
}

/* ============================================================
   RENDER CONVERSATION LIST
   ============================================================ */
function renderConversations() {
    const listEl = _el('conversationList');
    const countEl = _el('convCount');
    if (!listEl) return;

    const q = (_el('convSearchInput')?.value || '').toLowerCase().trim();
    const filtered = q
        ? allConversations.filter(c =>
            (c.title || '').toLowerCase().includes(q) ||
            (c.lastMessage || '').toLowerCase().includes(q))
        : allConversations;

    if (countEl) {
        countEl.innerHTML = `<i class="fas fa-layer-group text-teal-400/80 text-[10px]"></i> ` +
            allConversations.length + ' conversation' + (allConversations.length !== 1 ? 's' : '');
    }

    if (!filtered.length) {
        listEl.innerHTML = q
            ? '<div class="conv-empty"><i class="fas fa-magnifying-glass text-xl text-teal-400/50 mb-2 block"></i>No matches found</div>'
            : '<div class="conv-empty"><i class="fas fa-comment-medical text-2xl text-teal-400/40 mb-2 block"></i>No consultations yet.<br><small class="text-slate-400">Start chatting to save clinical history.</small></div>';
        return;
    }

    listEl.innerHTML = filtered.map(conv => {
        const isActive = conv.id === currentConvId;
        const time = formatRelativeTime(conv.updatedAt);
        const preview = conv.lastMessage
            ? conv.lastMessage.slice(0, 75) + (conv.lastMessage.length > 75 ? '…' : '')
            : 'No messages yet';

        return `
            <div class="conv-item ${isActive ? 'active' : ''}"
                 data-conv-id="${conv.id}"
                 onclick="switchConversation('${escapeJs(conv.id)}')">
                <div class="conv-icon">
                    ${cachedUserPhotoURL 
                        ? `<img src="${cachedUserPhotoURL}" alt="${escapeHtml(cachedUserName)}" />` 
                        : `<span class="conv-icon-initial">${escapeHtml(cachedUserName)}</span>`}
                </div>
                <div class="conv-body">
                    <div class="conv-title">${escapeHtml(conv.title)}</div>
                    <div class="conv-preview">${escapeHtml(preview)}</div>
                    <div class="conv-meta">
                        <span><i class="fas fa-clock"></i> ${time || 'Just now'}</span>
                        <span><i class="fas fa-message"></i> ${conv.messageCount || 0}</span>
                    </div>
                </div>
                <button class="conv-delete-btn" title="Delete consultation"
                        onclick="event.stopPropagation(); deleteConversation('${escapeJs(conv.id)}', '${escapeJs(conv.title)}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>`;
    }).join('');
}

/* ============================================================
   SEARCH FILTER
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = _el('convSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', renderConversations);
    }
});

/* ============================================================
   CREATE / SAVE CONVERSATION
   ============================================================ */
async function createConversation(firstMessage) {
    const ref = _convRef();
    if (!ref) return null;

    try {
        const docRef = ref.doc();
        const title = (firstMessage || 'New Chat').slice(0, 40).trim() || 'New Chat';
        await docRef.set({
            title,
            lastMessage: firstMessage || '',
            messageCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        _setCurrentConvId(docRef.id);
        return docRef.id;
    } catch (err) {
        console.warn('Create conversation failed:', err.message);
        return null;
    }
}

async function saveMessage(role, text) {
    if (!currentConvId) return;
    const ref = _convRef();
    if (!ref) return;

    try {
        const convDoc = ref.doc(currentConvId);
        const update = {
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: text ? String(text).slice(0, 100) : ''
        };

        // Increment message count
        update.messageCount = firebase.firestore.FieldValue.increment(1);

        await convDoc.update(update);
    } catch (err) {
        console.warn('Save message failed:', err.message);
    }
}

async function updateConversationTitle(title) {
    if (!currentConvId) return;
    const ref = _convRef();
    if (!ref) return;
    try {
        await ref.doc(currentConvId).update({ title: String(title).slice(0, 60) });
    } catch (e) {}
}

window.createConversation = createConversation;
window.saveMessage = saveMessage;
window.updateConversationTitle = updateConversationTitle;

// ai.js (chat engine) calls these exact names + window.__currentConvId to
// know whether a conversation exists yet and to persist each message.
// Without these aliases, ai.js's `typeof window.dvPersistMessage === 'function'`
// check silently fails and nothing is ever saved.
window.dvPersistMessage = persistMessage;
window.dvCreateConversation = createConversation;

/* ============================================================
   SWITCH CONVERSATION
   ============================================================ */
async function switchConversation(convId) {
    if (!convId || convId === currentConvId) {
        closeSidebar();
        return;
    }

    const ref = _convRef();
    if (!ref) return;

    try {
        const doc = await ref.doc(convId).get();
        if (!doc.exists) {
            alert('Conversation not found');
            return;
        }

        const data = doc.data();
        _setCurrentConvId(convId);

        // Clear current chat UI
        const container = _el('chatMessages');
        if (container) container.innerHTML = '';

        // Restore messages
        const messages = Array.isArray(data.messages) ? data.messages : [];
        if (messages.length === 0) {
            // Show welcome
            showWelcomeMessage();
        } else {
            messages.forEach(msg => {
                if (window._restoreMessage) {
                    window._restoreMessage(msg.role, msg.content, msg.image);
                }
            });
        }

        // Restore AI.js conversation history
        if (window._restoreConversationHistory) {
            window._restoreConversationHistory(
                messages
                    .filter(m => m.role === 'user' || m.role === 'assistant')
                    .map(m => ({
                        role: m.role === 'assistant' ? 'assistant' : 'user',
                        content: m.content
                    }))
            );
        }

        closeSidebar();
        renderConversations();
    } catch (err) {
        console.warn('Switch conversation failed:', err.message);
        alert('Could not load conversation.');
    }
}

window.switchConversation = switchConversation;

/* ============================================================
   DELETE CONVERSATION
   ============================================================ */
async function deleteConversation(convId, title) {
    if (!convId) return;
    if (!confirm(`🗑️ Delete "${title || 'this conversation'}"?\n\nThis cannot be undone.`)) return;

    const ref = _convRef();
    if (!ref) return;

    try {
        await ref.doc(convId).delete();

        if (convId === currentConvId) {
            _setCurrentConvId(null);
            clearChatUI();
            if (window._resetConversationHistory) window._resetConversationHistory();
        }

        renderConversations();
    } catch (err) {
        console.warn('Delete conversation failed:', err.message);
        alert('Failed to delete conversation.');
    }
}

window.deleteConversation = deleteConversation;

/* ============================================================
   DELETE CURRENT CONVERSATION (from 3-dot menu)
   ============================================================ */
async function deleteCurrentConversation() {
    const menu = _el('menuDropdown');
    if (menu) menu.style.display = 'none';

    if (!currentConvId) {
        alert('No active conversation to delete.');
        return;
    }

    const conv = allConversations.find(c => c.id === currentConvId);
    const title = conv?.title || 'this conversation';

    if (!confirm(`🗑️ Delete "${title}"?\n\nThis will remove the entire conversation.`)) return;
    if (!confirm('⚠️ Are you absolutely sure?')) return;

    const ref = _convRef();
    if (!ref) return;

    try {
        await ref.doc(currentConvId).delete();
        _setCurrentConvId(null);
        clearChatUI();
        if (window._resetConversationHistory) window._resetConversationHistory();
        renderConversations();
    } catch (err) {
        console.warn('Delete current conversation failed:', err.message);
        alert('Failed to delete.');
    }
}

window.deleteCurrentConversation = deleteCurrentConversation;

/* ============================================================
   START NEW CHAT
   ============================================================ */
function startNewChat() {
    _setCurrentConvId(null);
    clearChatUI();
    if (window._resetConversationHistory) window._resetConversationHistory();
    closeSidebar();
    renderConversations();
    _el('chatInput')?.focus();
}

window.startNewChat = startNewChat;

/* ============================================================
   UI HELPERS
   ============================================================ */
function clearChatUI() {
    const container = _el('chatMessages');
    if (!container) return;
    container.innerHTML = '';
    showWelcomeMessage();

    const chips = _el('suggestionChips');
    if (chips) chips.style.display = 'flex';
}

function showWelcomeMessage() {
    const container = _el('chatMessages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'message ai-message';
    div.innerHTML = `
        <div class="avatar ai-avatar-small">
            <img src="assets/dailyvetlogo.jpeg" alt="AI" />
        </div>
        <div class="bubble">
            <p>Hello! I'm <strong>DailyVet AI</strong> — your pet care assistant. 🐾</p>
            <p>Tell me your pet's problem in English or Bangla. You can also send a photo or speak.</p>
            <span class="timestamp">now</span>
        </div>`;
    container.appendChild(div);
}

/* ============================================================
   SAVE FULL MESSAGE (called from ai.js after each exchange)
   ============================================================ */
async function persistMessage(role, content, imageBase64) {
    if (!currentConvId) {
        // Auto-create conversation on first message
        const convId = await createConversation(content);
        if (!convId) return;
    }

    const ref = _convRef();
    if (!ref || !currentConvId) return;

    try {
        const msg = {
            role,
            content: content || '',
            image: imageBase64 || null,
            timestamp: Date.now()
        };

        await ref.doc(currentConvId).update({
            messages: firebase.firestore.FieldValue.arrayUnion(msg),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastMessage: String(content || '').slice(0, 100),
            messageCount: firebase.firestore.FieldValue.increment(1)
        });
    } catch (err) {
        console.warn('Persist message failed:', err.message);
    }
}

window.persistMessage = persistMessage;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // ESC closes sidebar
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && sidebarOpen) closeSidebar();
    });

    // Auto-create conversation if none exists on first user message
    const originalSend = window.sendMessage;
    if (typeof originalSend === 'function' && !window._dvSendWrapped) {
        window._dvSendWrapped = true;
        // sendMessage is defined in ai.js; we hook persistMessage calls from there
    }

    console.log('✅ Chat history module ready');
});

})();