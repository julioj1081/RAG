export interface OllamaConfig {
  host: string;
  model: string;
}

export function getOllamaConfig(): OllamaConfig {
  return {
    host: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    model: process.env.OLLAMA_MODEL ?? "qwen3-vl:8b",
  };
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callOllamaChat(
  host: string,
  model: string,
  messages: OllamaChatMessage[]
): Promise<string> {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.2,
        num_ctx: 16384,
      },
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string }; error?: string };
  if (data.error) {
    throw new Error(`Ollama: ${data.error}`);
  }
  return data.message?.content ?? "";
}

export async function isOllamaAvailable(
  host: string
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, message: `Ollama respondió con HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "No se pudo conectar con Ollama. Verifica que esté corriendo y que OLLAMA_HOST sea correcto.",
    };
  }
}

export async function callOllama(
  host: string,
  model: string,
  prompt: string,
  image?: Buffer
): Promise<string> {
  const response = await callOllamaOnce(host, model, prompt, image, true);
  if (response) return response;

  // Ollama HTTP 404 / respuesta vacía con `format: "json"`: reintenta sin forzar JSON,
  // el modelo vuelve a emitir JSON válido si le enviamos el texto plano.
  return callOllamaOnce(host, model, prompt, image, false);
}

async function callOllamaOnce(
  host: string,
  model: string,
  prompt: string,
  image: Buffer | undefined,
  jsonFormat: boolean
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: 0,
      num_ctx: 16384,
    },
  };
  if (jsonFormat) body.format = "json";
  if (image && image.length > 0) {
    body.images = [image.toString("base64")];
  }

  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { response?: string; error?: string };
  if (data.error) {
    throw new Error(`Ollama: ${data.error}`);
  }
  return data.response ?? "";
}