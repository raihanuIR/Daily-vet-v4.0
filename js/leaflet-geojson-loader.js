/* DailyVet — Leaflet GeoJSON Loader
   Loads Bangladesh admin boundaries (divisions, districts, upazilas).
   Provides window.BD_DIVISIONS, BD_DISTRICTS, BD_UPAZILAS.
   Fires window.__mapOnDataReady() when all loaded.
*/
(function () {
'use strict';

async function loadGeoJSON(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('[GeoJSON] Load failed:', url, err.message);
        return null;
    }
}

async function loadAllBoundaries() {
    console.log('[GeoJSON] Loading Bangladesh boundaries...');

    const [adm1, adm2, adm3] = await Promise.all([
        loadGeoJSON('data/bd-divisions.geojson'),
        loadGeoJSON('data/bd-districts.geojson'),
        loadGeoJSON('data/bd-upazilas.geojson')
    ]);

    window.BD_DIVISIONS = adm1 || window.BD_DIVISIONS || null;   /* keep inline bd-divisions.js if the .geojson is missing */
    window.BD_DISTRICTS = adm2 || window.BD_DISTRICTS || null;
    window.BD_UPAZILAS = adm3 || window.BD_UPAZILAS || null;

    console.log('[GeoJSON] Loaded:', {
        divisions: adm1 && adm1.features ? adm1.features.length : 0,
        districts: adm2 && adm2.features ? adm2.features.length : 0,
        upazilas: adm3 && adm3.features ? adm3.features.length : 0
    });

    if (typeof window.__mapOnDataReady === 'function') {
        window.__mapOnDataReady();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAllBoundaries);
} else {
    loadAllBoundaries();
}

})();