import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { storage } from "@/server/storage";
import { getSettings } from "@/server/settings";
import { isPlaceholderVideo } from "@/server/demo-media";
import { extractFrames } from "@/server/muse-frames";

export { extractFrames };

const MUSE_API_BASE = "https://api.meta.ai/v1";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function museConfig() {
  const settings = await getSettings();
  const apiKey = settings.MUSE_API_KEY?.trim();
  if (!apiKey) throw new Error("MUSE_NOT_CONFIGURED");
  return {
    apiKey,
    textModel: settings.MUSE_TEXT_MODEL || "muse-spark-1.3",
    imageModel: settings.MUSE_IMAGE_MODEL || "muse-image-1.0",
  };
}

function clampString(maxLength: number) {
  return z.string().transform((value) => value.trim().slice(0, maxLength).trim());
}

function clampArray(maxItems: number, maxItemLength: number) {
  return z.array(clampString(maxItemLength)).transform((values) => values.slice(0, maxItems));
}

const suggestionSchema = z.object({
  title: clampString(160).pipe(z.string().min(1)),
  synopsis: clampString(4_000).pipe(z.string().min(1)),
  genres: clampArray(6, 80).pipe(z.array(z.string().min(1)).min(1)),
  tropeTags: clampArray(6, 80).pipe(z.array(z.string().min(1)).min(1)),
  seo: z.object({
    title: clampString(60),
    description: clampString(160),
    focusKeyword: clampString(120),
    keywords: clampArray(20, 80),
  }),
  posterPrompt: clampString(1_500).pipe(z.string().min(1)),
  episodeTitles: z
    .array(
      z.object({
        number: z.number().int(),
        title: clampString(120).pipe(z.string().min(1)),
      }),
    )
    .transform((values) => values.slice(0, 100)),
});

type MuseSuggestionPayload = z.infer<typeof suggestionSchema>;
export type MuseSuggestion = Omit<MuseSuggestionPayload, "episodeTitles"> & {
  episodeTitles: { episodeId: string; number: number; title: string }[];
};

type MuseEpisodeCandidate = {
  number: number;
  title: string;
  hlsPath: string;
  originalFilename: string | null;
};

export function selectMuseEpisodes(episodes: MuseEpisodeCandidate[]) {
  const playable = episodes
    .filter((episode) => episode.hlsPath.trim() && !isPlaceholderVideo(episode.hlsPath.trim()))
    .sort((a, b) => a.number - b.number);
  const uploaded = playable.filter((episode) => Boolean(episode.originalFilename?.trim()));
  return (uploaded.length ? uploaded : playable).slice(0, 3);
}

export function parseMuseSuggestion(
  reply: string,
  existingEpisodes: { id: string; number: number }[],
): MuseSuggestion {
  try {
    const cleaned = reply
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("MUSE_BAD_RESPONSE");
    const parsed = suggestionSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    const episodesByNumber = new Map(existingEpisodes.map((episode) => [episode.number, episode]));
    const seenNumbers = new Set<number>();
    return {
      ...parsed,
      episodeTitles: parsed.episodeTitles.flatMap(({ number, title }) => {
        const episode = episodesByNumber.get(number);
        if (!episode || seenNumbers.has(number)) return [];
        seenNumbers.add(number);
        return [{ episodeId: episode.id, number, title }];
      }),
    };
  } catch {
    throw new Error("MUSE_BAD_RESPONSE");
  }
}

async function museJson(path: string, body: unknown, apiKey: string) {
  let response: Response;
  try {
    response = await fetch(`${MUSE_API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("MUSE_REQUEST_FAILED");
  }
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "MUSE_KEY_REJECTED"
        : "MUSE_REQUEST_FAILED",
    );
  try {
    return await response.json();
  } catch {
    throw new Error("MUSE_BAD_RESPONSE");
  }
}

function outputText(response: unknown) {
  if (!response || typeof response !== "object" || !("output" in response)) return "";
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  return output
    .filter(
      (item): item is { type: string; content?: unknown } =>
        !!item && typeof item === "object" && "type" in item,
    )
    .filter((item) => item.type === "message" && Array.isArray(item.content))
    .flatMap((item) =>
      (item.content as unknown[])
        .filter(
          (content): content is { type: string; text?: unknown } =>
            !!content && typeof content === "object" && "type" in content,
        )
        .filter(
          (content) => content.type === "output_text" && typeof content.text === "string",
        )
        .map((content) => content.text as string),
    )
    .join("\n");
}

export async function suggestSeriesDetails({
  seriesId,
  language,
  hint,
}: {
  seriesId: string;
  language: "hi" | "en" | "hinglish";
  hint?: string;
}) {
  const [config, series] = await Promise.all([
    museConfig(),
    prisma.series.findUnique({
      where: { id: seriesId },
      select: {
        id: true,
        title: true,
        synopsis: true,
        episodes: { select: { id: true, number: true } },
      },
    }),
  ]);
  if (!series) throw new Error("MUSE_SERIES_NOT_FOUND");

  const candidates = await prisma.episode.findMany({
    where: {
      seriesId,
      hlsPath: { not: "" },
      processingStatus: "READY",
    },
    orderBy: { number: "asc" },
    select: { number: true, title: true, hlsPath: true, originalFilename: true },
  });
  const episodes = selectMuseEpisodes(candidates);
  if (!episodes.length) throw new Error("MUSE_NO_VIDEO");

  const frameCounts = [4, 3, 3];
  const framesByEpisode = await Promise.all(
    episodes.map((episode, index) =>
      extractFrames(episode.hlsPath, frameCounts[index] ?? 3).then((frames) => ({
        number: episode.number,
        frames,
      })),
    ),
  );
  const languageName = { hi: "Hindi", en: "English", hinglish: "Hinglish" }[language];
  const prompt = [
    "You are helping an administrator prepare an Intube Drama vertical micro-drama series.",
    `Write every suggested field in ${languageName}.`,
    "Return only one valid JSON object matching the requested schema, without markdown.",
    "The synopsis must be 2–4 sentences and must not spoil the ending.",
    "The SEO title must be no more than 60 characters; the SEO description no more than 160 characters.",
    "Return 3–6 genres and 3–6 trope tags.",
    "The posterPrompt must describe a vertical 2:3 cinematic poster with no text and no watermark.",
    `Existing series title: ${series.title}`,
    `Existing series synopsis: ${series.synopsis}`,
    `Administrator hint: ${hint?.trim() || "None"}`,
    `Existing episode numbers: ${series.episodes.map((episode) => episode.number).join(", ") || "None"}`,
    "Suggest episode titles only for existing episode numbers shown in the labeled frames.",
    'Schema: {"title":"string","synopsis":"string","genres":["string"],"tropeTags":["string"],"seo":{"title":"string","description":"string","focusKeyword":"string","keywords":["string"]},"posterPrompt":"string","episodeTitles":[{"number":1,"title":"string"}]}',
  ].join("\n\n");
  const content: Array<Record<string, string>> = [{ type: "input_text", text: prompt }];
  for (const entry of framesByEpisode) {
    for (const frame of entry.frames) {
      content.push({
        type: "input_text",
        text: `Frame from episode number ${entry.number}:`,
      });
      content.push({ type: "input_image", image_url: frame });
    }
  }
  const response = await museJson(
    "/responses",
    {
      model: config.textModel,
      input: [{ type: "message", role: "user", content }],
    },
    config.apiKey,
  );
  const reply = outputText(response);
  if (!reply) throw new Error("MUSE_BAD_RESPONSE");
  return parseMuseSuggestion(
    reply,
    series.episodes,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function imageFormat(image: Buffer) {
  if (
    image.length >= 12 &&
    image.subarray(0, 4).toString("ascii") === "RIFF" &&
    image.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "png";
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff)
    return "jpg";
  return null;
}

async function downloadImage(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("MUSE_BAD_RESPONSE");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("MUSE_BAD_RESPONSE");
  let response: Response;
  try {
    response = await fetch(parsed, {
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      redirect: "error",
    });
  } catch {
    throw new Error("MUSE_REQUEST_FAILED");
  }
  if (!response.ok) throw new Error("MUSE_REQUEST_FAILED");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES)
    throw new Error("MUSE_BAD_RESPONSE");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("MUSE_BAD_RESPONSE");
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("MUSE_BAD_RESPONSE");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof Error && error.message === "MUSE_BAD_RESPONSE") throw error;
    throw new Error("MUSE_REQUEST_FAILED");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes);
}

export async function generatePoster({
  prompt,
  seriesId,
  title,
  synopsis,
}: {
  prompt: string;
  seriesId?: string;
  title?: string;
  synopsis?: string;
}) {
  const config = await museConfig();
  const series = seriesId && (title === undefined || synopsis === undefined)
    ? await prisma.series.findUnique({
        where: { id: seriesId },
        select: { title: true, synopsis: true },
      })
    : null;
  const contextTitle = title ?? series?.title ?? "";
  const contextSynopsis = synopsis ?? series?.synopsis ?? "";
  const context = contextTitle || contextSynopsis
    ? `Series title: ${contextTitle}\nSeries synopsis: ${contextSynopsis}\n\n`
    : "";
  const response = await museJson(
    "/images/generations",
    {
      model: config.imageModel,
      prompt: `${context}${prompt.trim()}, vertical 2:3 streaming series poster, cinematic lighting, no text, no watermark`,
      size: "1024x1536",
      output_format: "webp",
    },
    config.apiKey,
  );
  const data = record(response)?.data;
  if (!Array.isArray(data) || !data.length) throw new Error("MUSE_BAD_RESPONSE");
  const imageData = record(data[0]);
  if (!imageData) throw new Error("MUSE_BAD_RESPONSE");

  let image: Buffer;
  if (typeof imageData.b64_json === "string" && imageData.b64_json) {
    const base64 = imageData.b64_json;
    if (
      base64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      base64.length % 4 === 1
    )
      throw new Error("MUSE_BAD_RESPONSE");
    image = Buffer.from(base64, "base64");
  } else if (typeof imageData.url === "string") {
    image = await downloadImage(imageData.url);
  } else {
    throw new Error("MUSE_BAD_RESPONSE");
  }
  if (image.length > MAX_IMAGE_BYTES) throw new Error("MUSE_BAD_RESPONSE");
  const extension = imageFormat(image);
  if (!extension) throw new Error("MUSE_BAD_RESPONSE");

  const key = `admin/poster/muse-${randomUUID()}.${extension}`;
  await storage.put(key, image);
  return { key, url: storage.url(key) };
}
