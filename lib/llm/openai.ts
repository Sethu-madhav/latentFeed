import { env } from "@/lib/env";

const API_BASE = "https://api.openai.com/v1";

/**
 * Raised when OpenAI refuses in a way that retrying will not fix — an invalid
 * key, or an account with no credits. The caller stops the whole cycle rather
 * than burning through a batch collecting identical failures.
 */
export class OpenAIFatalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpenAIFatalError";
  }
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST to the OpenAI API with timeout and backoff.
 *
 * 429 and 5xx are retried; 401/403 and insufficient-quota are surfaced as
 * fatal so a misconfigured or unfunded account fails loudly on the first
 * article instead of quietly leaving every row unenriched.
 */
async function post<T>(
  path: string,
  body: unknown,
  { timeoutMs = 60_000, retries = 2 }: RequestOptions = {},
): Promise<T> {
  if (!env.openaiApiKey) {
    throw new OpenAIFatalError("OPENAI_API_KEY is not set", 0);
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.openaiApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) return (await res.json()) as T;

      const text = await res.text();
      const message = extractErrorMessage(text) ?? `HTTP ${res.status}`;

      // No point retrying a key or billing problem.
      if (
        res.status === 401 ||
        res.status === 403 ||
        /no credits|insufficient_quota|exceeded your current quota|billing/i.test(
          message,
        )
      ) {
        throw new OpenAIFatalError(message, res.status);
      }

      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(message);
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await sleep(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 30_000)
              : 1000 * 2 ** attempt,
          );
          continue;
        }
      }

      throw new Error(message);
    } catch (err) {
      if (err instanceof OpenAIFatalError) throw err;
      lastError = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`OpenAI request failed: ${path}`);
}

function extractErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return body.slice(0, 200) || null;
  }
}

// ---------------------------------------------------------------------------
// Chat completions with a strict JSON schema
// ---------------------------------------------------------------------------

interface ChatResponse {
  choices: { message: { content: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface StructuredResult<T> {
  data: T;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Call the chat API constrained to a JSON schema.
 *
 * `strict: true` makes the model's output conform to the schema, so the
 * response can be parsed without defensive shape-checking on every field.
 * Temperature is deliberately not sent — the gpt-5 family rejects it.
 */
export async function structuredCompletion<T>(opts: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  model?: string;
}): Promise<StructuredResult<T>> {
  const response = await post<ChatResponse>("/chat/completions", {
    model: opts.model ?? env.enrichmentModel,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName,
        strict: true,
        schema: opts.schema,
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty completion");

  return {
    data: JSON.parse(content) as T,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Embeddings
// ---------------------------------------------------------------------------

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[];
  usage?: { prompt_tokens?: number };
}

/**
 * Embed a batch of texts in one request, returning vectors in input order.
 *
 * The API preserves order but also returns an explicit index; sorting on it
 * means a reordered response can never silently attach the wrong vector to the
 * wrong article.
 */
export async function embedBatch(
  inputs: string[],
  model = env.embeddingModel,
): Promise<{ vectors: number[][]; promptTokens: number }> {
  if (inputs.length === 0) return { vectors: [], promptTokens: 0 };

  const response = await post<EmbeddingResponse>("/embeddings", {
    model,
    input: inputs,
  });

  const ordered = [...response.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== inputs.length) {
    throw new Error(
      `embeddings returned ${ordered.length} vectors for ${inputs.length} inputs`,
    );
  }

  return {
    vectors: ordered.map((d) => d.embedding),
    promptTokens: response.usage?.prompt_tokens ?? 0,
  };
}
