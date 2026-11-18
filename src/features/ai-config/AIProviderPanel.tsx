import { PowerOff } from "lucide-react";
import { ApiError } from "../../api/errors";
import { Panel } from "../../components/ui";
import { useAISettings, useReportError } from "../../hooks/queries";
import { AISettingsCard } from "./AISettingsCard";

/**
 * The AI provider section of Project settings. Provider settings belong to the signed-in
 * user, not the project, so they apply in every project; the AI assistant screen only
 * reads them and links here.
 */
export function AIProviderPanel() {
  const settings = useAISettings();
  const disabled = settings.error instanceof ApiError && settings.error.code === "AI_UNAVAILABLE";
  useReportError(disabled ? null : settings.error, "Could not load AI settings.");
  if (disabled) {
    return (
      <Panel title="AI provider" subtitle="Bring your own key for the AI assistant." icon={<PowerOff size={18} />}>
        <p className="empty-text">AI is turned off on this deployment: the server has no <code>AI_ENCRYPTION_KEY</code>, so provider keys cannot be stored safely. Every other feature works without it.</p>
      </Panel>
    );
  }
  if (settings.isPending) {
    return <Panel title="AI provider" subtitle="Bring your own key for the AI assistant."><p className="empty-text">Loading AI settings…</p></Panel>;
  }
  return settings.data ? <AISettingsCard key={settings.data.updated_at ?? "new"} settings={settings.data} /> : null;
}
