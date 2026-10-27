const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const geminiEnabled = () => !!process.env.GEMINI_API_KEY;
export const geminiModel = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// Primary model first, then GEMINI_FALLBACK_MODELS (comma separated), without duplicates.
const modelChain = () => {
  const extra = (process.env.GEMINI_FALLBACK_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...new Set([geminiModel(), ...extra])];
};

const RETRY_DELAYS_MS = [2000, 4000]; // up to 3 attempts per model on 429/5xx/invalid output

export class LlmError extends Error {
  constructor(message, { retryable = false, fatal = false } = {}) {
    super(message);
    this.retryable = retryable; // worth retrying the same model
    this.fatal = fatal; // no other model will help (bad key / permissions)
  }
}

async function callModel(model, body, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    // A timeout already cost a long wait, so move to the next model instead of retrying this one.
    throw new LlmError(timedOut ? `${model} timed out` : `${model} request failed: ${err.message}`);
  }

  if (!res.ok) {
    console.error('GEMINI API ERROR:', model, res.status, await res.text());
    throw new LlmError(`Gemini (${model}) responded ${res.status}`, {
      retryable: res.status === 429 || res.status >= 500,
      fatal: res.status === 401 || res.status === 403,
    });
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) throw new LlmError(`${model} returned an empty response`, { retryable: true });
  try {
    // Tolerate ```json fences in case the model adds them.
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new LlmError(`${model} returned invalid JSON`, { retryable: true });
  }
}

/**
 * Calls Gemini with a JSON response schema and returns the parsed JSON.
 * Per model: up to 3 attempts (waits 2s, 4s) on 429/5xx. Then the next model in the chain is tried.
 * onModel(name) is called with the model that produced the answer. The caller must still validate the shape.
 */
export async function generateJson({ system, user, responseSchema, timeoutMs = 90000, onModel }) {
  if (!geminiEnabled()) throw new LlmError('GEMINI_API_KEY is not set');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
  };

  const chain = modelChain();
  let lastErr;
  for (const [i, model] of chain.entries()) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const result = await callModel(model, body, timeoutMs);
        onModel?.(model);
        return result;
      } catch (err) {
        lastErr = err instanceof LlmError ? err : new LlmError(err?.message || 'Gemini request failed');
        if (lastErr.fatal) throw lastErr;
        if (lastErr.retryable && attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        break; // give up on this model
      }
    }
    if (i < chain.length - 1) console.warn(`Gemini: ${model} unavailable, trying ${chain[i + 1]}`);
  }
  throw lastErr;
}
