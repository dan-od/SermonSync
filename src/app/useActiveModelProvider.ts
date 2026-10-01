import { useConfigStore } from "../stores";

const MODEL_PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq",
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

/** The default model provider, only when it actually has a usable key. */
export function useActiveModelProvider() {
  const groqApiKey = useConfigStore((s) => s.groqApiKey);
  const groqEnabled = useConfigStore((s) => s.groqEnabled);
  const modelProviderKeys = useConfigStore((s) => s.modelProviderKeys);
  const defaultModelProvider = useConfigStore((s) => s.defaultModelProvider);
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
