// firebase-config.js  (same Firebase project as Boardwalk Night; Roulette rooms live under rooms/roulette_<CODE>)
//
// 1. Go to https://console.firebase.google.com -> Add project (free, no card needed).
// 2. In the project, click "Build > Realtime Database" -> Create Database -> start in TEST MODE
//    (we tighten the rules below in step 4).
// 3. Click the gear icon > Project settings > scroll to "Your apps" > click the web icon (</>)
//    to register a web app. Copy the config object it gives you and paste the values below.
// 4. In Realtime Database > Rules, paste this (lets any client read/write only inside /rooms
//    and /roomChats, which is fine for a small private game with friends):
//
//   {
//     "rules": {
//       "rooms": {
//         "$roomId": {
//           ".read": true,
//           ".write": true
//         }
//       },
//       "roomChats": {
//         "$roomId": {
//           ".read": true,
//           ".write": true
//         }
//       }
//     }
//   }
//
//   (roomChats is a separate path from rooms on purpose — see chatRef() in game.js.
//   If you set up Rules before the chat feature existed, re-publish with this block
//   added or chat will silently fail with a permission error.)
// 4b. HIDDEN SHELLS (recommended): enable Build > Authentication > Sign-in method > Anonymous, then in Realtime Database > Rules
//    ADD the "secure" block from database.rules.json (keep your other nodes). Without both steps rooms still work, but every
//    player's browser receives the whole game state, so a technical player can read the cylinder in the developer tools.
// 5. Fill in the values below with YOUR project's config (safe to be public in client code -
//    these are not secret keys, access is controlled by the Database Rules above).

const firebaseConfig = {
  apiKey: "AIzaSyAgbmBLnn3NFzMkTTB6Np_keMucgy59wSI",
  authDomain: "russian-roulette-dbc10.firebaseapp.com",
  databaseURL: "https://russian-roulette-dbc10-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "russian-roulette-dbc10",
  storageBucket: "russian-roulette-dbc10.firebasestorage.app",
  messagingSenderId: "710260782145",
  appId: "1:710260782145:web:60560095101c1f860f02c0",
  measurementId: "G-R5PGJJZGVK"
};

// Guarded so the game still works OFFLINE (vs bots / hot-seat) if Firebase can't load.
let db = null;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch (e) {
  console.warn('Firebase unavailable - online rooms disabled, offline mode still works.', e);
}

// Anonymous sign-in: the database rules use the uid to keep each player's private information private (see database.rules.json).
let auth = null;
try { auth = firebase.auth(); } catch (e) { console.warn('Firebase auth unavailable - rooms are not cheat-proof.', e); }
