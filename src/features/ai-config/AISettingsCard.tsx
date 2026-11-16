import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, PlugZap, Trash2 } from "lucide-react";
import { authHeaders, client, unwrap } from "../../api/client";
import { ApiError } from "../../api/errors";
import type { AISettings } from "../../api/types";
import { useWorkspace } from "../../app/workspace";
import { FieldIssue, Panel } from "../../components/ui";
import { keys } from "../../hooks/queries";
import { suggestedModels } from "../../lib/ai";

/**
 * Bring-your-own-key settings. The key field is write-only: the server encrypts the
 * key and only ever returns its last four characters, so the form never shows it.
 */
export function AISettingsCard({ settings }: { settings: AISettings }) {
  const w = useWorkspace();
  const queryClient = useQueryClient();
  const [model, setModel] = useState(settings.model ?? suggestedModels[0]);
  const [apiKey, setApiKey] = useState("");
  const [issues, setIssues] = useState<Record<string, string>>({});
  const headers = authHeaders({ token: w.token });

  async function save() {
    await w.run(async () => {
      setIssues({});
      try {
        const saved = await unwrap(client.PUT("/v1/ai/settings", { headers, body: { provider: "openai", model, ...(apiKey ? { api_key: apiKey } : {}) } }), w.token);
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
    if (!window.confirm("Remove your stored OpenAI key? Past generations are kept; new ones need a key.")) return;
    await w.run(async () => {
      await unwrap(client.DELETE("/v1/ai/settings", { headers }), w.token);
      await queryClient.invalidateQueries({ queryKey: keys.aiSettings(w.token) });
      setApiKey("");
      w.notify({ kind: "success", message: "Your AI key was removed." });
    });
  }

  return (
    <Panel title="Provider" subtitle={settings.configured ? `OpenAI · ${settings.model} · key ending ${settings.key_last4}` : "Add your own OpenAI API key. You are billed by OpenAI for what you generate."} icon={<KeyRound size={18} />}>
      <form className="stack-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <label>Provider<select value="openai" disabled><option value="openai">OpenAI</option></select></label>
        <label>Model
          <input list="ai-models" value={model} onChange={(event) => setModel(event.target.value)} required {...(issues.model ? { "aria-invalid": true, "aria-describedby": "ai-model-issue" } : {})} />
          <datalist id="ai-models">{suggestedModels.map((m) => <option key={m} value={m} />)}</datalist>
          <FieldIssue id="ai-model-issue" message={issues.model} />
        </label>
        <label>API key
          <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)}
            placeholder={settings.configured ? `Stored key ends in ${settings.key_last4}; leave blank to keep it` : "sk-…"}
            required={!settings.configured} {...(issues.api_key ? { "aria-invalid": true, "aria-describedby": "ai-key-issue" } : {})} />
          <FieldIssue id="ai-key-issue" message={issues.api_key} />
        </label>
        <p className="small-note">The key is encrypted on the server and never shown again. Only your configuration draft is sent to OpenAI, never player data or credentials.</p>
        <div className="button-row">
          <button className="button primary" disabled={w.busy}>Save</button>
          {settings.configured && <button type="button" className="button secondary" disabled={w.busy} onClick={() => void test()}><PlugZap size={14} /> Test key</button>}
          {settings.configured && <button type="button" className="button ghost-danger" disabled={w.busy} onClick={() => void remove()}><Trash2 size={14} /> Remove key</button>}
        </div>
      </form>
    </Panel>
  );
}
