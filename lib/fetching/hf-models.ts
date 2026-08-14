import { politeFetch } from "./http";
import type { FeedItem, FetchResult } from "./types";

interface HfModel {
  modelId?: string;
  id?: string;
  createdAt?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
}

/**
 * New model uploads for a Hugging Face org.
 *
 * This is the primary launch signal for DeepSeek, Moonshot, Z.AI and Qwen:
 * none of them publish a working blog feed, and GitHub's org timeline atoms
 * now return zero entries, but the weights always land on Hugging Face — often
 * before any announcement exists to report on.
 */
export async function fetchHfModels(
  feedUrl: string,
  meta?: Record<string, unknown>,
): Promise<FetchResult> {
  const res = await politeFetch(feedUrl, { accept: "application/json" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${feedUrl}`);

  const payload = (await res.json()) as HfModel[];
  if (!Array.isArray(payload)) return { items: [] };

  const label = typeof meta?.orgLabel === "string" ? meta.orgLabel : null;
  const items: FeedItem[] = [];

  for (const model of payload) {
    const id = model.modelId ?? model.id;
    if (!id) continue;

    // One release ships a dozen quantisations; they'd bury the actual launch.
    if (isDerivativeVariant(id)) continue;

    const publishedAt = model.createdAt ? new Date(model.createdAt) : new Date();
    if (Number.isNaN(publishedAt.getTime())) continue;

    const name = id.split("/").pop() ?? id;

    items.push({
      url: `https://huggingface.co/${id}`,
      title: `${label ?? id.split("/")[0]} released ${name} on Hugging Face`,
      publishedAt,
      content: [
        `Model weights published as ${id}.`,
        model.pipeline_tag ? `Task: ${model.pipeline_tag}.` : "",
        model.likes ? `${model.likes} likes` : "",
        model.downloads ? `${model.downloads.toLocaleString()} downloads` : "",
      ]
        .filter(Boolean)
        .join(" "),
      meta: {
        modelId: id,
        likes: model.likes ?? 0,
        downloads: model.downloads ?? 0,
        // Weights on the org's own account are a first-party announcement.
        isModelRelease: true,
      },
    });
  }

  return { items };
}

/** Quantisations, format conversions and per-size spins of a base release. */
const VARIANT_SUFFIXES =
  /-(fp8|fp4|int4|int8|awq|gptq|gguf|mlx|bnb|4bit|8bit|w4a16|w8a8|nf4|onnx|openvino|base|instruct-gguf)$/i;

export function isDerivativeVariant(modelId: string): boolean {
  const name = modelId.split("/").pop() ?? modelId;
  return VARIANT_SUFFIXES.test(name);
}
