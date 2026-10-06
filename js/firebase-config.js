/* ========================================
   DAILYVET — FIREBASE CONFIG
   Project: dailyvet-3954
   ✅ Auth + Firestore only (Base64 for images)
   ======================================== */

const firebaseConfig = {
    apiKey: "AIzaSyArjs_zuJ69Bys2RKlN7RMwfwL_px3eN6I",
    authDomain: "dailyvet-3954.firebaseapp.com",
    projectId: "dailyvet-3954",
    storageBucket: "dailyvet-3954.firebasestorage.app",
    messagingSenderId: "244593275467",
    appId: "1:244593275467:web:964eede4dab11e5a1293ce",
    measurementId: "G-1Y7F75608P"
};

/* Initialize Firebase (compat style) */
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

/* Global references — Auth + Firestore only (no Storage) */
const auth = firebase.auth();
const db = firebase.firestore();

console.log('✅ Firebase initialized:', firebase.app().options.projectId);
console.log('   Auth: loaded | Firestore: loaded | Storage: not used (Base64 mode)');