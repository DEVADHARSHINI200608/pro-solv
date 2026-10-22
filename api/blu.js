'use strict';

const CHAT_SYSTEM = `You are BLU, the AI assistant inside ProSolv, a platform that turns real-world problems into practical solutions. Help users understand problems, explore possible solutions, compare advantages and limitations, and identify practical next steps. Be clear, concrete and concise. Use short paragraphs or simple bullet points. If a question is unrelated to problem solving, briefly steer back to it. Do not claim to have performed real-world actions.`;

function problemText(p) {
  if (!p) return '';
  return `Title: ${p.title || ''}\nDescription: ${p.description || ''}\nPeople affected: ${p.people || ''}\nWhy it matters: ${p.why || ''}\nKnown challenges: ${(p.challenges || []).join('; ')}`;
}

function getBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const body = await getBody(req);
  const message = String(body.message || '').trim().slice(0, 2000);

  if (!message) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Please enter a message.' }));
  }

  if (!API_KEY) {
    // Helpful guidance when API key is not configured in environment
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: `I received your question: "${message}". BLU is currently running in local mode. To enable live Gemini AI generation on Vercel, add GEMINI_API_KEY in your Vercel Project Settings > Environment Variables!`
    }));
  }

  let system = CHAT_SYSTEM;
  if (body.problem) {
    system += `\n\nThe user selected this problem on ProSolv:\n${problemText(body.problem)}\nUse it as context. Do not ask the user to restate it.`;
  }

  const safeHistory = Array.isArray(body.history)
    ? body.history
        .slice(-10)
        .filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.text === 'string')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.text.slice(0, 4000) }]
        }))
    : [];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [...safeHistory, { role: 'user', parts: [{ text: message }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
        }),
        signal: AbortSignal.timeout(30000)
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || 'Gemini returned an error.');
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) throw new Error('Empty response from AI.');

    res.statusCode = 200;
    return res.end(JSON.stringify({ reply: text }));
  } catch (err) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      reply: `BLU thinking tip: For this stage, focus on verifying the core assumptions with your target users. What is the smallest test you can run today?`
    }));
  }
};
