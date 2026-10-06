/* DailyVet — Bangladesh Division Boundaries (simplified GeoJSON)
   Source: Adapted from GADM 4.1 & HDX (simplified for map performance)
   Coverage: All 8 divisions of Bangladesh
   Coordinates: [lng, lat] — GeoJSON standard
*/
(function () {
'use strict';

/* Simplified polygon boundaries for the 8 divisions.
   Each polygon is a list of [lng, lat] coordinates. */
window.BD_DIVISIONS = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { name: 'Dhaka', nameBn: 'ঢাকা', key: 'dhaka' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [89.68, 24.25], [90.10, 24.42], [90.42, 24.35], [90.60, 24.05],
                    [90.75, 23.85], [90.85, 23.55], [90.65, 23.25], [90.35, 23.05],
                    [90.10, 23.15], [89.90, 23.35], [89.65, 23.55], [89.55, 23.95],
                    [89.68, 24.25]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Chittagong', nameBn: 'চট্টগ্রাম', key: 'chittagong' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [90.85, 23.55], [91.20, 23.70], [91.55, 23.95], [91.80, 23.90],
                    [92.05, 23.55], [92.30, 23.20], [92.35, 22.55], [92.30, 21.85],
                    [92.10, 21.20], [91.85, 21.45], [91.70, 22.00], [91.60, 22.55],
                    [91.30, 22.65], [91.00, 22.60], [90.90, 22.85], [90.85, 23.15],
                    [90.85, 23.55]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Rajshahi', nameBn: 'রাজশাহী', key: 'rajshahi' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [88.02, 24.40], [88.20, 24.65], [88.60, 24.75], [88.95, 24.70],
                    [89.25, 24.55], [89.55, 24.40], [89.65, 24.05], [89.60, 23.70],
                    [89.35, 23.55], [89.05, 23.65], [88.70, 23.85], [88.35, 24.05],
                    [88.02, 24.40]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Khulna', nameBn: 'খুলনা', key: 'khulna' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [88.55, 24.05], [88.85, 23.95], [89.05, 23.65], [89.35, 23.55],
                    [89.60, 23.35], [89.65, 23.05], [89.55, 22.70], [89.35, 22.35],
                    [89.05, 22.00], [88.75, 21.85], [88.55, 22.05], [88.55, 22.55],
                    [88.60, 23.05], [88.55, 23.55], [88.55, 24.05]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Barisal', nameBn: 'বরিশাল', key: 'barisal' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [89.95, 22.90], [90.25, 22.85], [90.55, 22.65], [90.85, 22.50],
                    [91.10, 22.40], [91.15, 22.10], [91.00, 21.80], [90.70, 21.75],
                    [90.35, 21.85], [90.05, 22.05], [89.85, 22.35], [89.85, 22.65],
                    [89.95, 22.90]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Sylhet', nameBn: 'সিলেট', key: 'sylhet' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [90.95, 25.20], [91.20, 25.40], [91.55, 25.35], [91.90, 25.15],
                    [92.20, 25.05], [92.35, 24.75], [92.30, 24.45], [92.05, 24.25],
                    [91.75, 24.20], [91.45, 24.30], [91.15, 24.55], [91.00, 24.85],
                    [90.95, 25.20]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Rangpur', nameBn: 'রংপুর', key: 'rangpur' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [88.10, 25.20], [88.45, 25.60], [88.90, 25.75], [89.35, 25.70],
                    [89.75, 25.55], [89.90, 25.20], [89.80, 24.85], [89.55, 24.55],
                    [89.25, 24.55], [88.95, 24.70], [88.65, 24.85], [88.35, 25.00],
                    [88.10, 25.20]
                ]]
            }
        },
        {
            type: 'Feature',
            properties: { name: 'Mymensingh', nameBn: 'ময়মনসিংহ', key: 'mymensingh' },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [89.75, 25.55], [90.10, 25.50], [90.45, 25.35], [90.75, 25.20],
                    [90.95, 24.95], [90.85, 24.65], [90.60, 24.40], [90.30, 24.35],
                    [90.05, 24.45], [89.90, 24.70], [89.85, 25.00], [89.75, 25.55]
                ]]
            }
        }
    ]
};

})();