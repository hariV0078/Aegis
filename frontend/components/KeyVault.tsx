"use client";

import { useEffect, useState } from "react";

import { clearKey, loadKey, saveKey } from "@/lib/keystore";

export function KeyVault() {
  const [provider, setProvider] = useState("groq");
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = loadKey();
    if (stored) {
      setProvider(stored.provider);
      setKey(stored.key);
      setSaved(true);
    }
  }, []);

  return (
    <section className="panel panel--compact">
      <div className="panel__header">
        <h2 className="panel__title">Key vault</h2>
        <p className="panel__subcopy">Optional BYOK storage in localStorage for the demo.</p>
      </div>
      <div className="field-grid">
        <label className="field">
          <span className="field__label">Provider</span>
          <select className="input" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="groq">Groq</option>
            <option value="byok_openai">OpenAI</option>
            <option value="byok_anthropic">Anthropic</option>
            <option value="ollama">Ollama</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">API key</span>
          <input
            className="input"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Enter a key for the selected provider"
          />
        </label>
      </div>
      <div className="button-row">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            saveKey(provider, key);
            setSaved(true);
          }}
        >
          Save locally
        </button>
        <button
          className="button button--ghost"
          type="button"
          onClick={() => {
            clearKey();
            setProvider("groq");
            setKey("");
            setSaved(false);
          }}
        >
          Clear
        </button>
        <span className="help-copy">{saved ? "Stored only in this browser." : "No key stored yet."}</span>
      </div>
    </section>
  );
}
