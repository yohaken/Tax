import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  initializeAuth,
  getAuth,
  setPersistence,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
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

function isMobile() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia("(max-width: 768px)").matches
  );
}

/** Drop blank fields that Firebase SDK rejects (e.g. databaseURL: ""). */
function sanitizeConfig(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

export async function initFirebase() {
  if (app && auth && db) return { auth, db };

  let config = { ...PROJECT_DEFAULTS };
  try {
    const res = await fetch("/__/firebase/init.json");
    if (res.ok) config = { ...config, ...sanitizeConfig(await res.json()) };
  } catch {
    /* non-Firebase hosting */
  }
  config = sanitizeConfig(config);
  // Keep authDomain on *.firebaseapp.com so Google OAuth redirect stays valid.
  config.authDomain = PROJECT_DEFAULTS.authDomain;

  app = initializeApp(config);

  // Prefer getAuth (includes popup resolver). initializeAuth without resolver
  // causes auth/argument-error on signInWithPopup.
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (err) {
    console.warn("initializeAuth fallback", err?.code || err);
    auth = getAuth(app);
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
    } catch {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        /* keep default */
      }
    }
  }

  db = getFirestore(app);

  // Only resolve redirect flow when we likely returned from Google OAuth —
  // skipping this on normal loads avoids an extra auth round-trip every visit.
  const maybeFromRedirect =
    /[?&#](mode|apiKey|authType|oobCode)=/i.test(location.href) ||
    /google\.com|firebaseapp\.com/i.test(String(document.referrer || ""));
  if (maybeFromRedirect) {
    try {
      await getRedirectResult(auth, browserPopupRedirectResolver);
    } catch (err) {
      console.warn("redirect result", err?.code || err);
    }
  }
  return { auth, db };
}

export function watchAuth(callback) {
  if (!auth) throw new Error("Firebase not ready");
  return onAuthStateChanged(auth, callback);
}

/** Resolves when the first persisted auth state has been restored from IndexedDB/local. */
export async function waitAuthReady() {
  if (!auth) await initFirebase();
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  return auth.currentUser || null;
}

export async function loginWithGoogle() {
  if (!auth) await initFirebase();
  if (!auth) throw new Error("Firebase ยังไม่พร้อม");

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  let result;
  try {
    if (isMobile()) {
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return null;
    }
    result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  } catch (err) {
    const code = err?.code || "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request"
    ) {
      await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
      return null;
    }
    if (code === "auth/argument-error") {
      // Retry the simplest supported path.
      try {
        result = await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (err2) {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return null;
      }
    } else {
      throw err;
    }
  }

  const email = (result.user?.email || "").toLowerCase();
  if (email !== ALLOWED_EMAIL.toLowerCase()) {
    await signOut(auth);
    const denied = new Error(`อนุญาตเฉพาะ ${ALLOWED_EMAIL}`);
    denied.code = "auth/email-not-allowed";
    throw denied;
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
    groupNotes: data.groupNotes && typeof data.groupNotes === "object" ? data.groupNotes : {},
    groupNicknames: data.groupNicknames && typeof data.groupNicknames === "object" ? data.groupNicknames : {},
    projectSource: typeof data.projectSource === "string" ? data.projectSource : "",
    projectId: typeof data.projectId === "string" ? data.projectId : "",
    projectName: typeof data.projectName === "string" ? data.projectName : "",
    fileName: typeof data.fileName === "string" ? data.fileName : "",
    activeProjectId: typeof data.activeProjectId === "string" ? data.activeProjectId : "",
    projectsMeta: Array.isArray(data.projectsMeta) ? data.projectsMeta : [],
    updatedAt: data.updatedAt || null,
  };
}

export async function pushCloudState(uid, state, workspace) {
  const projectsMeta = Array.isArray(workspace?.projects)
    ? workspace.projects.map((p) => ({
        id: p.id,
        name: p.name,
        fileName: p.fileName || "",
        source: p.source || p.projectSource || "",
        count: Array.isArray(p.transactions) ? p.transactions.length : 0,
        updatedAt: p.updatedAt || null,
      }))
    : [];
  await setDoc(
    stateRef(uid),
    {
      transactions: state.transactions || [],
      categories: state.categories || [],
      rules: state.rules || [],
      groupNotes: state.groupNotes || {},
      groupNicknames: state.groupNicknames || {},
      projectSource: state.projectSource || "",
      projectId: state.projectId || "",
      projectName: state.projectName || "",
      fileName: state.fileName || "",
      activeProjectId: workspace?.activeId || state.projectId || "",
      projectsMeta,
      updatedAt: serverTimestamp(),
      ownerEmail: ALLOWED_EMAIL,
    },
    { merge: true }
  );
}
