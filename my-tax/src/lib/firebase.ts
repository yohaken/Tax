import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { ALLOWED_EMAIL } from "./types";

/** Client config — ค่าเริ่มต้นเป็น Firebase web app `my-tax` ในโปรเจกต์ส่วนตัว */
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyD_b7TASutFOmoUKskH6yLjmxJzVpTUIn4",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "mypeer-501909.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mypeer-501909",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "mypeer-501909.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "470549580687",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:470549580687:web:5447b1c7b95e991ab719fa",
};

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

let app: FirebaseApp | undefined;

export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    app = getApps()[0] || initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseAuth() {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;
  return getAuth(firebaseApp);
}

export async function signInWithGooglePersonal() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("Firebase ยังไม่ได้ตั้งค่า");

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  const email = (result.user.email || "").toLowerCase();

  if (email !== ALLOWED_EMAIL.toLowerCase()) {
    await signOut(auth);
    throw new Error(`ใช้ได้เฉพาะ ${ALLOWED_EMAIL} เท่านั้น`);
  }

  return result.user;
}

export async function signOutPersonal() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function watchAuth(callback: (user: User | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    if (user && (user.email || "").toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
      signOut(auth).finally(() => callback(null));
      return;
    }
    callback(user);
  });
}

export { ALLOWED_EMAIL };
