import { useConfigStore } from "../stores";

export function useActiveModelProvider() {
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);

  const MODEL_PROVIDER_LABELS: Record<string, string> = {
    groq: "Groq",
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Gemini",
  };
  const defaultModelProviderKeyed =
    defaultModelProvider === "groq"
      ? Boolean(groqApiKey && groqEnabled)
      : defaultModelProvider
        ? Boolean(modelProviderKeys[defaultModelProvider])
        : false;
  const activeModelProvider =
    defaultModelProvider && defaultModelProviderKeyed
      ? { id: defaultModelProvider, label: MODEL_PROVIDER_LABELS[defaultModelProvider] }
      : null;

  return activeModelProvider;
}
