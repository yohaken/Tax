import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  doc,
  getDoc,
  getFirestore,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

/** Same Google Firebase project as P-Note — login once, stay signed in. */
export const ALLOWED_EMAIL = "yohaken@gmail.com";

const PROJECT_DEFAULTS = {
  apiKey: "AIzaSyD_b7TASutFOmoUKskH6yLjmxJzVpTUIn4",
  authDomain: "mypeer-501909.firebaseapp.com",
  projectId: "mypeer-501909",
  storageBucket: "mypeer-501909.firebasestorage.app",
  messagingSenderId: "470549580687",
};

let app = null;
export let auth = null;
export let db = null;

export async function initFirebase() {
  if (app) return { auth, db };
  let config = { ...PROJECT_DEFAULTS };
  try {
    const res = await fetch("/__/firebase/init.json");
    if (res.ok) config = { ...config, ...(await res.json()) };
  } catch {
    /* local / GitHub Pages */
  }
  // Keep authDomain on *.firebaseapp.com so Google OAuth redirect stays valid.
  config.authDomain = PROJECT_DEFAULTS.authDomain;
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    /* best-effort */
  }
  return { auth, db };
}

export function watchAuth(callback) {
  if (!auth) throw new Error("Firebase not ready");
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", login_hint: ALLOWED_EMAIL });
  const result = await signInWithPopup(auth, provider);
  const email = (result.user?.email || "").toLowerCase();
  if (email !== ALLOWED_EMAIL.toLowerCase()) {
    await signOut(auth);
    const err = new Error(`อนุญาตเฉพาะ ${ALLOWED_EMAIL}`);
    err.code = "auth/email-not-allowed";
    throw err;
  }
  return result.user;
}

export async function logoutFirebase() {
  await signOut(auth);
}

function stateRef(uid) {
  return doc(db, "taxtag", uid);
}

export async function pullCloudState(uid) {
  const snap = await getDoc(stateRef(uid));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    rules: Array.isArray(data.rules) ? data.rules : [],
    updatedAt: data.updatedAt || null,
  };
}

export async function pushCloudState(uid, state) {
  await setDoc(
    stateRef(uid),
    {
      transactions: state.transactions || [],
      categories: state.categories || [],
      rules: state.rules || [],
      updatedAt: serverTimestamp(),
      ownerEmail: ALLOWED_EMAIL,
    },
    { merge: true }
  );
}
