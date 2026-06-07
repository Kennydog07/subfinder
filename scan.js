const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify environment variables.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) }; }

  const { image, text } = body;
  let userMessage;

  if (image) {
    userMessage = { role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
      { type: 'text', text: 'This is a bank statement. Identify all recurring subscriptions and return the JSON as instructed.' }
    ]};
  } else if (text) {
    userMessage = { role: 'user', content: 'Bank statement data:\n\n' + text };
  } else {
    return { statusCode: 400, body: JSON.stringify({ error: 'Provide image or text' }) };
  }

  const SYSTEM = `You are a financial AI that identifies recurring subscriptions from bank statement data or images.
Return ONLY a valid JSON object — no markdown, no code fences, no preamble.
{"subscriptions":[{"name":"","amount":0,"currency":"GBP","frequency":"monthly","category":"","cancelPriority":"high|medium|low|keep","cancelReason":"","lastCharge":""}],"totalMonthly":0,"totalAnnual":0,"cancelSaving":0,"insight":"2-3 sentence insight about their spend"}
cancelPriority: high=unused/duplicate/overpriced, medium=worth reviewing, low=reviewable, keep=essential.
Only genuine recurring subscriptions — NOT groceries, fuel, restaurants, one-offs, salary.
Categories: Entertainment, Music, Shopping, Design, AI Tools, Productivity, Storage, Communication, Business, Marketing, Finance, Other`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: SYSTEM,
        messages: [userMessage]
      })
    });

    const rawText = await apiRes.text();
    let apiData;
    try { apiData = JSON.parse(rawText); }
    catch { return { statusCode: 502, body: JSON.stringify({ error: 'Image may be too large. Try a cleaner screenshot or paste text instead.' }) }; }

    if (apiData.error) {
      return { statusCode: 502, body: JSON.stringify({ error: apiData.error.message || 'Anthropic API error' }) };
    }

    const raw = (apiData.content || []).find(b => b.type === 'text')?.text || '';
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
    catch { return { statusCode: 502, body: JSON.stringify({ error: 'Could not parse AI response. Try again or paste transaction text.' }) }; }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};

module.exports = { handler };
