import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, PlugZap, Trash2 } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AISettings } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { FieldIssue, Panel } from "../../components/ui";
import { keys } from "../../hooks/queries";
import { asProvider, destinationChanged, hostOf, providerLabels, suggestedModels, type ProviderId } from "../../lib/ai";

/**
 * Bring-your-own-key settings: OpenAI, or any OpenAI-compatible service at a base URL
 * (OpenRouter, Together, Groq, a local Ollama...). The key field is write-only: the
 * server encrypts the key and only ever returns its last four characters, so the form
 * never shows it. A stored key is kept only for the destination it was saved with, so
 * changing the provider or base URL requires typing the key again.
 */
export function AISettingsCard({ settings }: { settings: AISettings }) {
  const w = useWorkspace();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<ProviderId>(asProvider(settings.provider));
  const [baseUrl, setBaseUrl] = useState(settings.base_url ?? "");
  const [model, setModel] = useState(settings.model ?? (asProvider(settings.provider) === "openai" ? suggestedModels[0] : ""));
  const [apiKey, setApiKey] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const headers = authHeaders({ token: w.token });
  const compatible = provider === "openai_compatible";
  // Required for a first save, and whenever the stored key would be sent somewhere new.
  const keyRequired = !settings.configured || destinationChanged(settings, provider, baseUrl);

  // A model ID only means something to its own provider, so do not carry one across:
  // OpenAI's suggestion would otherwise be sent to OpenRouter, and a vendor/model ID to OpenAI.
  function changeProvider(next: ProviderId) {
    setProvider(next);
    if (next === "openai_compatible" && suggestedModels.includes(model)) setModel("");
    if (next === "openai" && (model === "" || model.includes("/"))) setModel(suggestedModels[0]);
  }

  async function save() {
    await w.run(async () => {
      setIssues({});
      try {
        const saved = await unwrap(client.PUT("/v1/ai/settings", {
          headers,
          body: { provider, model, ...(compatible ? { base_url: baseUrl.trim() } : {}), ...(apiKey ? { api_key: apiKey } : {}) },
        }), w.token);
        queryClient.setQueryData(keys.aiSettings(w.token), saved);
      } catch (error) {
        if (error instanceof ApiError && error.fieldErrors.length) setIssues(Object.fromEntries(error.fieldErrors.map((e) => [e.field, e.message])));
        throw error;
      }
      setApiKey("");
      w.notify({ kind: "success", message: "AI settings saved. The key is stored encrypted." });
    });
  }

  async function test() {
    await w.run(async () => {
      const result = await unwrap(client.POST("/v1/ai/settings/test", { headers }), w.token);
      w.notify({ kind: "success", message: `The key works and ${result.model} is reachable.` });
    });
  }

  async function remove() {
    if (!window.confirm("Remove your stored API key? Past generations are kept; new ones need a key.")) return;
    await w.run(async () => {
      await unwrap(client.DELETE("/v1/ai/settings", { headers }), w.token);
      await queryClient.invalidateQueries({ queryKey: keys.aiSettings(w.token) });
      setApiKey("");
      w.notify({ kind: "success", message: "Your AI key was removed." });
    });
  }

  const saved = asProvider(settings.provider);
  const subtitle = settings.configured
    ? `${providerLabels[saved]}${settings.base_url ? ` (${hostOf(settings.base_url)})` : ""} · ${settings.model} · key ending ${settings.key_last4}`
    : "Add your own API key: OpenAI, or any OpenAI-compatible service. You are billed by your provider for what you generate.";

  return (
    <Panel title="AI provider" subtitle={subtitle} icon={<KeyRound size={20} />} className="ai-provider">
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Provider
          <select value={provider} onChange={(event) => changeProvider(asProvider(event.target.value))}>
            {(Object.keys(providerLabels) as ProviderId[]).map((id) => <option key={id} value={id}>{providerLabels[id]}</option>)}
          </select>
        </label>
        {compatible && (
          <label>Base URL
            <input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required placeholder="https://openrouter.ai/api/v1" autoComplete="off"
              {...(issues.base_url ? { "aria-invalid": true, "aria-describedby": "ai-base-url-issue" } : {})} />
            <FieldIssue id="ai-base-url-issue" message={issues.base_url} />
          </label>
        )}
        <label>Model
          <input list={compatible ? undefined : "ai-models"} value={model} onChange={(event) => setModel(event.target.value)} required
            placeholder={compatible ? "vendor/model-name" : undefined} {...(issues.model ? { "aria-invalid": true, "aria-describedby": "ai-model-issue" } : {})} />
          {!compatible && <datalist id="ai-models">{suggestedModels.map((m) => <option key={m} value={m} />)}</datalist>}
          <FieldIssue id="ai-model-issue" message={issues.model} />
        </label>
        <label>API key
          <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)}
            placeholder={keyRequired ? (settings.configured ? "Enter the key again: the provider or base URL changed" : compatible ? "Your provider's API key" : "sk-…") : `Stored key ends in ${settings.key_last4}; leave blank to keep it`}
            required={keyRequired} {...(issues.api_key ? { "aria-invalid": true, "aria-describedby": "ai-key-issue" } : {})} />
          <FieldIssue id="ai-key-issue" message={issues.api_key} />
        </label>
        <p className="small-note">
          The key is encrypted on the server and never shown again. Only your configuration draft is sent to {compatible ? "the base URL you enter" : "OpenAI"}, never player data or credentials.
          {compatible && " The service must support strict JSON Schema output; models that ignore it produce invalid proposals, which are rejected, never applied."}
          {" Saving checks the key and model with the provider first; if the check fails, nothing is saved. These settings belong to your account and apply in every project."}
        </p>
        <div className="button-row">
          <button className="button primary" disabled={w.busy}>Save</button>
          {settings.configured && <button type="button" className="button secondary" disabled={w.busy} onClick={() => void test()}><PlugZap size={16} /> Re-check saved key</button>}
          {settings.configured && <button type="button" className="button ghost-danger" disabled={w.busy} onClick={() => void remove()}><Trash2 size={16} /> Remove key</button>}
        </div>
      </form>
    </Panel>
  );
}
