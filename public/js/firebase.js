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
  signInWithCustomToken,
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

const OAUTH_REDIRECT_FLAG = "taxtag-oauth-redirect";

let app = null;
export let auth = null;
export let db = null;
let lastRedirectError = null;

function isMobile() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    window.matchMedia("(max-width: 768px)").matches
  );
}

function sanitizeConfig(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Keep Firebase default authDomain — only
 * https://mypeer-501909.firebaseapp.com/__/auth/handler is registered
 * on the Google OAuth client. taxtag.web.app URIs → redirect_uri_mismatch.
 */
export function resolveAuthDomain() {
  return PROJECT_DEFAULTS.authDomain;
}

function markOAuthRedirectPending() {
  try {
    sessionStorage.setItem(OAUTH_REDIRECT_FLAG, String(Date.now()));
  } catch {
    /* private mode */
  }
}

function clearOAuthRedirectPending() {
  try {
    sessionStorage.removeItem(OAUTH_REDIRECT_FLAG);
  } catch {
    /* private mode */
  }
}

function wasOAuthRedirectPending() {
  try {
    return Boolean(sessionStorage.getItem(OAUTH_REDIRECT_FLAG));
  } catch {
    return false;
  }
}

function hasFirebasePendingRedirect() {
  try {
    return Object.keys(sessionStorage).some((key) => key.includes("pendingRedirect"));
  } catch {
    return false;
  }
}

function assertAllowedEmail(user) {
  const email = (user?.email || "").toLowerCase();
  if (email !== ALLOWED_EMAIL.toLowerCase()) {
    const denied = new Error(`อนุญาตเฉพาะ ${ALLOWED_EMAIL}`);
    denied.code = "auth/email-not-allowed";
    throw denied;
  }
  return user;
}

async function completeRedirectSignIn() {
  lastRedirectError = null;
  const expected = wasOAuthRedirectPending() || hasFirebasePendingRedirect();
  try {
    const result = await getRedirectResult(auth, browserPopupRedirectResolver);
    clearOAuthRedirectPending();
    if (result?.user) {
      try {
        assertAllowedEmail(result.user);
      } catch (err) {
        await signOut(auth);
        lastRedirectError = err;
        return null;
      }
    } else if (expected) {
      lastRedirectError = new Error(
        "กลับจาก Google แล้วแต่เซสชันไม่ติด — ลองกดล็อกอินอีกครั้ง (ใช้หน้าต่างป๊อปอัป)"
      );
    }
    return result;
  } catch (err) {
    clearOAuthRedirectPending();
    lastRedirectError = err;
    console.warn("redirect result", err?.code || err?.message || err);
    if (!expected) lastRedirectError = null;
    return null;
  }
}

export function takeRedirectError() {
  const err = lastRedirectError;
  lastRedirectError = null;
  return err;
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
  config.authDomain = PROJECT_DEFAULTS.authDomain;

  app = initializeApp(config);

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
  await completeRedirectSignIn();
  return { auth, db };
}

export function watchAuth(callback) {
  if (!auth) throw new Error("Firebase not ready");
  return onAuthStateChanged(auth, callback);
}

export async function waitAuthReady() {
  if (!auth) await initFirebase();
  if (typeof auth.authStateReady === "function") {
    await auth.authStateReady();
  }
  return auth.currentUser || null;
}

async function startPopupLogin(provider) {
  const result = await signInWithPopup(auth, provider, browserPopupRedirectResolver);
  try {
    assertAllowedEmail(result.user);
  } catch (err) {
    await signOut(auth);
    throw err;
  }
  return result.user;
}

async function startRedirectLogin(provider) {
  markOAuthRedirectPending();
  await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
  return null;
}

/**
 * Mobile must use popup first.
 * signInWithRedirect returns without a session on Safari/Chrome that block
 * third-party storage when authDomain ≠ taxtag.web.app — and switching
 * authDomain to taxtag.web.app causes redirect_uri_mismatch (handler URI
 * not registered on the Google OAuth client).
 */
export async function loginWithGoogle() {
  if (!auth) await initFirebase();
  if (!auth) throw new Error("Firebase ยังไม่พร้อม");

  const provider = new GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account", login_hint: ALLOWED_EMAIL });

  try {
    return await startPopupLogin(provider);
  } catch (err) {
    const code = err?.code || "";
    if (code === "auth/email-not-allowed") throw err;
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user" ||
      code === "auth/cancelled-popup-request" ||
      code === "auth/argument-error"
    ) {
      // Last resort — often fails on Safari ITP but better than doing nothing.
      try {
        if (code === "auth/argument-error") {
          return await startPopupLogin(new GoogleAuthProvider());
        }
      } catch {
        /* fall through to redirect */
      }
      return await startRedirectLogin(code === "auth/argument-error" ? new GoogleAuthProvider() : provider);
    }
    throw err;
  }
}

export async function logoutFirebase() {
  await signOut(auth);
}

export async function loginWithCustomToken(token) {
  if (!auth) await initFirebase();
  if (!auth) throw new Error("Firebase ยังไม่พร้อม");
  const cred = await signInWithCustomToken(auth, token);
  try {
    assertAllowedEmail(cred.user);
  } catch (err) {
    await signOut(auth);
    throw err;
  }
  return cred.user;
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
