/* ============================================================
   DailyVet — Location Service  v7.16
   ✅ Get user's GPS location
   ✅ Calculate distance to vets
   ✅ Google-First (only if user consented via Yes button)
   ✅ Firestore fallback
   ✅ Species + symptom keyword search on Google
   ✅ Display in AI chat
   ✅ Auto-popup location card after DB vets shown
   ============================================================ */
(function () {
'use strict';

const _el = id => document.getElementById(id);
const _fs = () => firebase.firestore();

let cachedLocation = null;
let locationAttempts = 0;
const MAX_ATTEMPTS = 2;
const GOOGLE_SEARCH_TIMEOUT_MS = 5000;

// 🆕 v7.16 — auto-popup control
let _autoPromptTimer = null;
let _autoPromptShown = false;

/* ============================================================
   1. GET USER LOCATION
   ============================================================ */
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        if (cachedLocation) {
            resolve(cachedLocation);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                cachedLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy
                };
                console.log('📍 Location:', cachedLocation);
                resolve(cachedLocation);
            },
            err => {
                console.warn('📍 Location error:', err.message);
                let msg = 'Location পাওয়া যায়নি';
                if (err.code === 1) msg = 'Location permission বন্ধ আছে';
                else if (err.code === 2) msg = 'Location পাওয়া যাচ্ছে না';
                else if (err.code === 3) msg = 'Location timeout';
                reject(new Error(msg));
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5 * 60 * 1000
            }
        );
    });
}

/* ============================================================
   2. CALCULATE DISTANCE (Haversine formula)
   ============================================================ */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/* ============================================================
   3. GOOGLE SEARCH — v7.15: species + symptom aware keyword
   ============================================================ */
async function searchGoogleForVets(lat, lng, species, symptom) {
    console.log('🌐 Searching Google for nearby vets...');
    console.log('   Species:', species, '| Symptom:', symptom);

    // Google Maps Places API available?
    if (!window.google || !window.google.maps || !window.google.maps.places) {
        console.log('🌐 Google Maps API not loaded — skipping');
        return [];
    }

    // ✅ Build search keyword based on species + symptom
    let keyword = 'veterinary';
    if (species && symptom) {
        keyword = `${species} ${symptom} veterinary`;
    } else if (species) {
        keyword = `${species} veterinary`;
    } else if (symptom) {
        keyword = `animal ${symptom} veterinary`;
    }

    return new Promise((resolve) => {
        try {
            const service = new google.maps.places.PlacesService(
                document.createElement('div')
            );

            const timeoutId = setTimeout(() => {
                console.log('🌐 Google search timeout');
                resolve([]);
            }, GOOGLE_SEARCH_TIMEOUT_MS);

            service.nearbySearch({
                location: { lat, lng },
                radius: 15000,
                keyword: keyword,
                type: 'veterinary_care'
            }, (results, status) => {
                clearTimeout(timeoutId);

                if (status !== 'OK' || !results || !results.length) {
                    console.log('🌐 Google: no results', status);
                    resolve([]);
                    return;
                }

                const vets = results.slice(0, 5).map(r => {
                    const rLat = r.geometry.location.lat();
                    const rLng = r.geometry.location.lng();
                    const dist = calculateDistance(lat, lng, rLat, rLng);

                    return {
                        isGoogleResult: true,
                        id: 'google_' + r.place_id,
                        name: r.name,
                        speciality: 'Veterinary Clinic',
                        address: r.vicinity || r.formatted_address || '',
                        city: '',
                        area: r.vicinity || '',
                        photoURL: r.photos && r.photos[0]
                            ? r.photos[0].getUrl({ maxWidth: 200 })
                            : '',
                        rating: r.rating || null,
                        distance: dist,
                        hasLocation: true,
                        phone: null,
                        placeId: r.place_id,
                        mapsUrl: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`
                    };
                });

                console.log(`🌐 Google found ${vets.length} vets (keyword: "${keyword}")`);
                resolve(vets);
            });

        } catch (err) {
            console.warn('🌐 Google search error:', err.message);
            resolve([]);
        }
    });
}

/* ============================================================
   3A. FIRESTORE FETCH — fallback
   ============================================================ */
async function findVetsFromFirestore(userLat, userLng, species) {
    try {
        const snap = await _fs().collection('vets').limit(50).get();

        if (snap.empty) {
            console.log('📁 No vets in Firestore');
            return [];
        }

        const vets = [];

        snap.forEach(doc => {
            const data = doc.data();
            if (!data.name) return;

            let vetLat = null, vetLng = null;

            if (data.location && data.location.lat && data.location.lng) {
                vetLat = data.location.lat;
                vetLng = data.location.lng;
            } else if (data.lat && data.lng) {
                vetLat = data.lat;
                vetLng = data.lng;
            }

            if (!vetLat || !vetLng) {
                vets.push({
                    id: doc.id,
                    name: data.name,
                    phone: data.phone || doc.id,
                    speciality: data.speciality || 'General',
                    city: data.city || '',
                    area: data.area || '',
                    photoURL: data.photoURL || '',
                    distance: null,
                    hasLocation: false,
                    speciesMatch: true
                });
                return;
            }

            const distance = calculateDistance(userLat, userLng, vetLat, vetLng);
            if (distance > 100) return;

            const treatments = Array.isArray(data.treatments) ? data.treatments : [];
            const speciesMatch = species
                ? treatments.some(t => t.toLowerCase().includes(species.toLowerCase()))
                : true;

            vets.push({
                id: doc.id,
                name: data.name,
                phone: data.phone || doc.id,
                speciality: data.speciality || 'General',
                city: data.city || '',
                area: data.area || '',
                photoURL: data.photoURL || '',
                distance: distance,
                hasLocation: true,
                speciesMatch: speciesMatch
            });
        });

        vets.sort((a, b) => {
            if (a.speciesMatch && !b.speciesMatch) return -1;
            if (!a.speciesMatch && b.speciesMatch) return 1;

            if (a.distance === null && b.distance === null) return 0;
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
        });

        console.log(`📁 Firestore found ${vets.length} vets`);
        return vets.slice(0, 5);

    } catch (err) {
        console.warn('📁 Firestore fetch failed:', err.message);
        return [];
    }
}

/* ============================================================
   3B. MAIN — consent-aware Google-first, Firestore fallback
   ============================================================ */
async function findNearbyVets(userLat, userLng, species) {
    try {
        const preferGoogle = window.__preferGoogleSearch === true;
        const symptom = window.__currentSymptom || null;

        console.log('🔍 preferGoogle:', preferGoogle, '| species:', species, '| symptom:', symptom);

        if (!preferGoogle) {
            console.log('📁 User declined Google — using Firestore only');
            return await findVetsFromFirestore(userLat, userLng, species);
        }

        console.log('🌐 User wants Google — trying Google first...');
        let vets = [];

        try {
            const googlePromise = searchGoogleForVets(userLat, userLng, species, symptom);
            const timeoutPromise = new Promise(resolve =>
                setTimeout(() => resolve([]), GOOGLE_SEARCH_TIMEOUT_MS + 500)
            );

            vets = await Promise.race([googlePromise, timeoutPromise]);
        } catch (err) {
            console.log('🌐 Google failed:', err.message);
            vets = [];
        }

        if (vets && vets.length > 0) {
            console.log(`✅ Using ${vets.length} Google results`);
            return vets;
        }

        console.log('📁 No Google results — falling back to Firestore...');
        return await findVetsFromFirestore(userLat, userLng, species);

    } catch (err) {
        console.warn('📍 findNearbyVets failed:', err.message);
        return [];
    }
}

/* ============================================================
   4. FORMAT DISTANCE
   ============================================================ */
function formatDistance(km) {
    if (km === null || km === undefined) return '';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

/* ============================================================
   5. RENDER VETS — supports both Google & Firestore
   ============================================================ */
function renderNearbyVets(vets, species) {
    const card = _el('nearbyVetsCard');
    if (!card) return;

    if (!vets.length) {
        card.innerHTML = `
            <div class="nearby-vets-header">
                <i class="fas fa-user-md"></i>
                <h4>কাছের ভেটেরিনারিয়ান</h4>
            </div>
            <div class="vets-empty">
                😔 আপনার এলাকায় এখনো কোনো ভেট register করেননি।
                <br><br>
                📞 হেল্পলাইন: <strong>16358</strong>
            </div>
        `;
        card.style.display = 'flex';
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    const isGoogle = vets[0]?.isGoogleResult === true;

    const html = vets.map(v => {
        const initial = (v.name || 'V').charAt(0).toUpperCase();

        const location = v.isGoogleResult
            ? (v.address || 'Location available')
            : ([v.area, v.city].filter(Boolean).join(', ') || 'Location unknown');

        const dist = v.distance !== null && v.distance !== undefined
            ? `<span class="distance"><i class="fas fa-location-arrow"></i> ${formatDistance(v.distance)}</span>`
            : '';

        const photoHTML = v.photoURL && !v.photoURL.includes('dailyvetlogo')
            ? `<img src="${v.photoURL}" alt="${v.name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : initial;

        if (v.isGoogleResult) {
            return `
                <div class="nearby-vet-item">
                    <div class="vet-avatar">${photoHTML}</div>
                    <div class="vet-info">
                        <div class="vet-name">${v.name}</div>
                        <div class="vet-spec">
                            🌐 Google ${v.rating ? `· ⭐ ${v.rating}` : ''}
                        </div>
                        <div class="vet-meta">
                            <span><i class="fas fa-location-dot"></i> ${location}</span>
                            ${dist}
                        </div>
                    </div>
                    <div class="vet-actions">
                        <a href="${v.mapsUrl}"
                           target="_blank" rel="noopener"
                           class="vet-action-mini call" title="Google Maps">
                            <i class="fas fa-map-location-dot"></i>
                        </a>
                    </div>
                </div>
            `;
        }

        const waPhone = (v.phone || '').replace(/\D/g, '');
        const waMsg = encodeURIComponent('আসসালামু আলাইকুম, DailyVet থেকে বলছি। আমার পশুর জন্য পরামর্শ দরকার।');

        return `
            <div class="nearby-vet-item">
                <div class="vet-avatar">${photoHTML}</div>
                <div class="vet-info">
                    <div class="vet-name">${v.name}</div>
                    <div class="vet-spec">${v.speciality}</div>
                    <div class="vet-meta">
                        <span><i class="fas fa-location-dot"></i> ${location}</span>
                        ${dist}
                    </div>
                </div>
                <div class="vet-actions">
                    <a href="tel:${v.phone}" class="vet-action-mini call" title="Call">
                        <i class="fas fa-phone"></i>
                    </a>
                    <a href="https://wa.me/${waPhone}?text=${waMsg}"
                       target="_blank" rel="noopener"
                       class="vet-action-mini wa" title="WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                </div>
            </div>
        `;
    }).join('');

    const sourceLabel = isGoogle
        ? `<span class="vets-count" style="background:#e0f2fe;color:#0369a1;">🌐 Google</span>`
        : `<span class="vets-count">${vets.length} জন</span>`;

    card.innerHTML = `
        <div class="nearby-vets-header">
            <i class="fas fa-user-md"></i>
            <h4>কাছের ভেটেরিনারিয়ান</h4>
            ${sourceLabel}
        </div>
        ${html}
    `;
    card.style.display = 'flex';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   6. MAIN ENTRY — Called when user clicks "Share Location"
   ============================================================ */
async function requestUserLocation() {
    const btn = _el('shareLocationBtn');
    const card = _el('locationRequestCard');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Location খুঁজছি...</span>';
    }

    try {
        const loc = await getUserLocation();

        console.log('📍 Got location, fetching vets...');

        const species = window.__currentSpecies || null;

        const vets = await findNearbyVets(loc.lat, loc.lng, species);

        if (card) card.style.display = 'none';
        renderNearbyVets(vets, species);

        console.log(`✅ ${vets.length} vets displayed`);

    } catch (err) {
        console.warn('📍 Location failed:', err.message);
        alert('❌ ' + err.message + '\n\nঅনুগ্রহ করে browser-এ location permission দিন।');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-location-crosshairs"></i><span>Location শেয়ার করুন</span>';
        }
    }
}

/* ============================================================
   7. SHOW / HIDE CARDS
   ============================================================ */
function showLocationRequest() {
    const card = _el('locationRequestCard');
    if (!card) return;
    card.style.display = 'flex';
    setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
}

function hideLocationRequest() {
    const card = _el('locationRequestCard');
    if (card) card.style.display = 'none';
}

function hideNearbyVets() {
    const card = _el('nearbyVetsCard');
    if (card) card.style.display = 'none';
}

/* ============================================================
   🆕 7A. AUTO-POPUP — v7.16
   DB vets দেখানোর পর auto location card popup করে
   ============================================================ */
/**
 * @param {object} options
 * @param {number} options.delayMs       - কত ms পর popup আসবে (default 1200)
 * @param {boolean} options.force        - true হলে _autoPromptShown ignore করবে
 */
function autoPromptAfterVets(options) {
    const opts = options || {};
    const delayMs = typeof opts.delayMs === 'number' ? opts.delayMs : 1200;
    const force = opts.force === true;

    // Duplicate popup prevent (same conversation-এ একবারই)
    if (_autoPromptShown && !force) {
        console.log('📍 Auto-prompt already shown — skipping');
        return;
    }

    // আগের timer clear
    if (_autoPromptTimer) {
        clearTimeout(_autoPromptTimer);
        _autoPromptTimer = null;
    }

    _autoPromptTimer = setTimeout(() => {
        _autoPromptTimer = null;
        _autoPromptShown = true;
        showLocationRequest();
        console.log('📍 Auto-prompt: location card shown after DB vets');
    }, delayMs);
}

/**
 * নতুন conversation শুরু হলে auto-prompt reset করে
 * (ai.js-এর clearChat() বা নতুন conversation-এ call করা উচিত)
 */
function resetAutoPrompt() {
    if (_autoPromptTimer) {
        clearTimeout(_autoPromptTimer);
        _autoPromptTimer = null;
    }
    _autoPromptShown = false;
    console.log('📍 Auto-prompt reset');
}

/* ============================================================
   8. PUBLIC API
   ============================================================ */
window.DVLocation = {
    requestUserLocation,
    getUserLocation,
    findNearbyVets,
    findVetsFromFirestore,
    searchGoogleForVets,
    renderNearbyVets,
    showLocationRequest,
    hideLocationRequest,
    hideNearbyVets,
    calculateDistance,
    formatDistance,
    autoPromptAfterVets,        // 🆕 v7.16
    resetAutoPrompt,            // 🆕 v7.16
    getCachedLocation: () => cachedLocation
};

window.requestUserLocation = requestUserLocation;
window.showLocationRequest = showLocationRequest;
window.hideLocationRequest = hideLocationRequest;
window.hideNearbyVets = hideNearbyVets;
window.autoPromptAfterVets = autoPromptAfterVets;   // 🆕 v7.16
window.resetAutoPrompt = resetAutoPrompt;           // 🆕 v7.16

console.log('✅ Location Service loaded v7.16');

})();