import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  initializeAuth,
  getAuth,
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
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.matchMedia("(max-width: 768px)").matches;
}

export async function initFirebase() {
  if (app) return { auth, db };
  let config = { ...PROJECT_DEFAULTS };
  try {
    const res = await fetch("/__/firebase/init.json");
    if (res.ok) config = { ...config, ...(await res.json()) };
  } catch {
    /* non-Firebase hosting */
  }
  // Keep authDomain on *.firebaseapp.com so Google OAuth redirect stays valid.
  config.authDomain = PROJECT_DEFAULTS.authDomain;
  app = initializeApp(config);
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    auth = getAuth(app);
  }
  db = getFirestore(app);
  try {
    await getRedirectResult(auth);
  } catch (err) {
    console.warn("redirect result", err);
  }
  return { auth, db };
}

export function watchAuth(callback) {
  if (!auth) throw new Error("Firebase not ready");
  return onAuthStateChanged(auth, callback);
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: ALLOWED_EMAIL });
  let result;
  try {
    if (isMobile()) {
      await signInWithRedirect(auth, provider);
      return null; // page will reload
    }
    result = await signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/popup-closed-by-user") {
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
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
    groupNotes: data.groupNotes && typeof data.groupNotes === "object" ? data.groupNotes : {},
    projectSource: typeof data.projectSource === "string" ? data.projectSource : "",
    projectId: typeof data.projectId === "string" ? data.projectId : "",
    projectName: typeof data.projectName === "string" ? data.projectName : "",
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
      projectSource: state.projectSource || "",
      projectId: state.projectId || "",
      projectName: state.projectName || "",
      activeProjectId: workspace?.activeId || state.projectId || "",
      projectsMeta,
      updatedAt: serverTimestamp(),
      ownerEmail: ALLOWED_EMAIL,
    },
    { merge: true }
  );
}
