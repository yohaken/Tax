"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { Button, Heading, Separator, Text } from "moduix";
import {
  ALLOWED_EMAIL,
  isFirebaseConfigured,
  signInWithGooglePersonal,
  signOutPersonal,
  watchAuth,
} from "@/lib/firebase";
import { AgentDrawer } from "@/components/AgentDrawer";
import { TaxHubNav } from "@/components/TaxHubNav";

const LOCAL_DEV_KEY = "my-tax-local-dev";

function isLocalHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function subscribeLocalDev(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getLocalDevSnapshot() {
  return isLocalHost() && window.localStorage.getItem(LOCAL_DEV_KEY) === "1";
}

function getLocalDevServerSnapshot() {
  return false;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!configured);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLocal, setShowLocal] = useState(false);
  const localDev = useSyncExternalStore(
    subscribeLocalDev,
    getLocalDevSnapshot,
    getLocalDevServerSnapshot,
  );

  useEffect(() => {
    setShowLocal(isLocalHost());
  }, []);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    return watchAuth((next) => {
      setUser(next);
      setReady(true);
    });
  }, [configured]);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGooglePersonal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function enableLocalDev() {
    if (!isLocalHost()) return;
    window.localStorage.setItem(LOCAL_DEV_KEY, "1");
    window.dispatchEvent(new Event("storage"));
  }

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      window.localStorage.removeItem(LOCAL_DEV_KEY);
      window.dispatchEvent(new Event("storage"));
      await signOutPersonal();
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="app-shell flex items-center justify-center">
        <Text tone="muted">กำลังเตรียมระบบ...</Text>
      </div>
    );
  }

  // Production: ต้อง Google login — Local Mac ได้เฉพาะ localhost
  const allowed = Boolean(user) || localDev;

  if (!allowed) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="app-panel auth-panel">
          <Heading as="h1" size="xl" weight="semibold">
            my-tax
          </Heading>
          <Text tone="muted">เข้าสู่ระบบด้วย {ALLOWED_EMAIL}</Text>
          {error ? <Text className="text-red-700">{error}</Text> : null}
          <div className="auth-actions">
            <Button onClick={handleGoogle} disabled={busy || !configured}>
              {busy
                ? "กำลังเข้าสู่ระบบ..."
                : configured
                  ? "Sign in with Google"
                  : "ยังไม่ได้ตั้งค่า Firebase"}
            </Button>
            {showLocal ? (
              <Button variant="outline" onClick={enableLocalDev}>
                Local Mac
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-main app-header-bar">
          <div className="app-header-left">
            <Link href="/">
              <Heading as="h1" size="md" weight="semibold">
                Tax
              </Heading>
            </Link>
          </div>
          <div className="app-header-right">
            <Text size="sm" tone="muted" className="app-user-email">
              {user?.email || (localDev ? "local-dev" : ALLOWED_EMAIL)}
            </Text>
            <button
              type="button"
              className="logout-btn"
              onClick={() => void handleSignOut()}
              disabled={busy}
            >
              {busy ? "…" : "Logout"}
            </button>
            <AgentDrawer />
          </div>
        </div>
      </header>
      <Separator />
      <main className="app-main app-main-with-hub">{children}</main>
      <TaxHubNav />
    </div>
  );
}
