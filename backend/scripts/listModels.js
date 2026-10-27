// Lists the Gemini models your API key can call with generateContent.
// Usage (from /backend):  node scripts/listModels.js
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set in backend/.env');
  process.exit(1);
}

const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
  headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
});
const json = await res.json();
if (!res.ok) {
  console.error(res.status, json?.error?.message || json);
  process.exit(1);
}

const models = (json.models || [])
  .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
  .map((m) => m.name.replace('models/', ''));

console.log(`Models available to your key (${models.length}):\n`);
console.log(models.join('\n'));
