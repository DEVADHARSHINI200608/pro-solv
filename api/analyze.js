'use strict';

const STEPS = [
  'Define the problem',
  'Identify who is affected',
  'Map the root causes',
  'Review existing efforts',
  'Assess the local context',
  'Generate solution options',
  'Compare trade-offs',
  'Choose a practical approach',
  'Plan next steps'
];

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
  const problem = body.problem;

  if (!problem || !problem.title) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'A problem with a title is required.' }));
  }

  // Fallback 9-step analysis if no API key is provided
  const fallbackSteps = STEPS.map((s, i) => ({
    title: s,
    content: `Guided analysis for stage ${i + 1}: Examine how "${problem.title}" impacts stakeholders and focus on measurable, practical interventions.`
  }));

  if (!API_KEY) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ steps: fallbackSteps }));
  }

  const problemText = `Title: ${problem.title}\nDescription: ${problem.description || ''}\nPeople: ${problem.people || ''}\nWhy: ${problem.why || ''}`;
  const system = `You are BLU, the AI analyst inside ProSolv. Produce a clear, practical 9-step analysis. Return ONLY a JSON array of exactly 9 objects, each with a "content" string. Step order: ${STEPS.map((s, i) => `${i + 1}. ${s}`).join('; ')}. Each content must be 2 to 4 plain sentences, specific and realistic, no markdown.`;

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
          contents: [{ role: 'user', parts: [{ text: problemText }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json'
          }
        }),
        signal: AbortSignal.timeout(35000)
      }
    );

    const raw = await response.json();
    const text = raw.candidates?.[0]?.content?.parts?.[0]?.text;
    const items = JSON.parse(text);

    if (Array.isArray(items) && items.length === 9) {
      res.statusCode = 200;
      return res.end(JSON.stringify({
        steps: items.map((s, i) => ({
          title: STEPS[i],
          content: String(s.content || '').trim().slice(0, 800)
        }))
      }));
    }
    throw new Error('Incomplete steps from AI');
  } catch (err) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ steps: fallbackSteps }));
  }
};
