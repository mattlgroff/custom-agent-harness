import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
// Run this from your own terminal to compare against an IDE-managed request path.
// This makes a small real generation request. It never prints the key or full headers.
const response = await fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-5.6-sol', input: 'Reply with OK.', reasoning: { effort: 'medium' }, max_output_tokens: 128, store: false }),
  signal: AbortSignal.timeout(30000),
});
const body = await response.json();
console.log(JSON.stringify({ status: response.status, code: body.error?.code, message: body.error?.message, model: body.model, responseId: body.id, requestId: response.headers.get('x-request-id'), ideCaller: response.headers.get('x-openai-internal-caller') }, null, 2));
if (!response.ok) process.exitCode = 1;
