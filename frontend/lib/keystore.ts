const KEY_STORE_NAME = "pf_llm_key";

export function saveKey(provider: string, key: string) {
  if (typeof window === "undefined") {
    return;
  }
  const encoded = btoa(JSON.stringify({ provider, key }));
  window.localStorage.setItem(KEY_STORE_NAME, encoded);
}

export function loadKey(): { provider: string; key: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(KEY_STORE_NAME);
  if (!raw) {
    return null;
  }
  try {
    const decoded = JSON.parse(atob(raw)) as { provider: string; key: string };
    return decoded;
  } catch {
    return null;
  }
}

export function clearKey() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(KEY_STORE_NAME);
}
