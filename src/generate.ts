export const GATEWAY = "https://factchat-cloud.mindlogic.ai/v1/gateway";
export const API_KEY_ENV = "KONKUK_AI_API_KEY";
export const MAX_TOKENS_CAP = 32768;

export type ApiModel = {
  id: string;
  lifecycle?: string;
  endpoints?: string[];
  context_limit?: number;
  max_output_tokens?: number;
  pricing?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
};

type Group = {
  key: string;
  name: string;
  api: string;
  baseUrl: string;
  authHeader: boolean;
  compat?: Record<string, unknown>;
};

const CHAT_COMPAT = { supportsDeveloperRole: false, supportsStore: false };

const GROUPS: Record<string, Group> = {
  openai: { key: "kupi-openai", name: "KU OpenAI", api: "openai-responses", baseUrl: GATEWAY, authHeader: true },
  claude: { key: "kupi-claude", name: "KU Claude", api: "openai-completions", baseUrl: GATEWAY, authHeader: true, compat: CHAT_COMPAT },
  claudeMessages: { key: "kupi-claude-messages", name: "KU Claude (Messages)", api: "anthropic-messages", baseUrl: `${GATEWAY}/claude`, authHeader: false },
  other: { key: "kupi", name: "KU Others", api: "openai-completions", baseUrl: GATEWAY, authHeader: true, compat: CHAT_COMPAT },
};

const CLAUDE_MESSAGES_OK = /haiku-4-5|opus-4-[0-7]|sonnet-4-[0-6]/;

const OVERRIDES: Array<[RegExp, Record<string, unknown>]> = [
  [/^glm-/, { thinkingLevelMap: { off: null, minimal: null, medium: "high" } }],
  [/^qwen3\.7-/, { compat: { thinkingFormat: "qwen" } }],
];

function groupOf(m: ApiModel): string | undefined {
  const eps = m.endpoints ?? [];
  if (eps.some((e) => e.includes("/claude/v1/messages"))) return CLAUDE_MESSAGES_OK.test(m.id) ? "claudeMessages" : "claude";
  if (eps.some((e) => e.endsWith("/responses/"))) return "openai";
  if (eps.some((e) => e.endsWith("/chat/completions/"))) return "other";
  return undefined;
}

export function buildModelsJson(models: ApiModel[]) {
  const skipped: string[] = [];
  const providers: Record<string, any> = {};

  const usable = models
    .filter((m) => {
      if (m.lifecycle && m.lifecycle !== "current") return false; // legacy 제외
      if (/audio/i.test(m.id)) return (skipped.push(`${m.id} (audio)`), false);
      if (!groupOf(m)) return (skipped.push(`${m.id} (chat endpoint 없음)`), false);
      return true;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const m of usable) {
    const g = GROUPS[groupOf(m)!];
    providers[g.key] ??= {
      name: g.name,
      baseUrl: g.baseUrl,
      api: g.api,
      apiKey: `$${API_KEY_ENV}`,
      ...(g.authHeader ? { authHeader: true } : {}),
      ...(g.compat ? { compat: g.compat } : {}),
      models: [],
    };
    const p = m.pricing ?? {};
    const entry: Record<string, unknown> = {
      id: m.id,
      reasoning: true,
      input: ["text", "image"],
      contextWindow: m.context_limit ?? 128000,
      maxTokens: Math.min(m.max_output_tokens ?? MAX_TOKENS_CAP, MAX_TOKENS_CAP),
    };
    if (p.input != null && p.output != null) {
      entry.cost = { input: p.input, output: p.output, cacheRead: p.cache_read ?? 0, cacheWrite: p.cache_write ?? 0 };
    }
    for (const [re, extra] of OVERRIDES) if (re.test(m.id)) Object.assign(entry, extra);
    providers[g.key].models.push(entry);
  }

  const ordered = ["kupi-openai", "kupi-claude", "kupi-claude-messages", "kupi"].filter((k) => providers[k]);
  return {
    json: { providers: Object.fromEntries(ordered.map((k) => [k, providers[k]])) },
    skipped,
    count: usable.length,
  };
}

export async function fetchModels(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<ApiModel[]> {
  const res = await fetchImpl(`${GATEWAY}/models/?type=llm`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GET /models HTTP ${res.status}`);
  const body = (await res.json()) as { data?: ApiModel[] };
  if (!Array.isArray(body.data)) throw new Error("/models 응답에 data 배열이 없음");
  return body.data;
}
