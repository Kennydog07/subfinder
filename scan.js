exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured on server' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { image, text } = body;

  // Build the user message
  let userMessage;
  if (image) {
    userMessage = {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: image.mediaType, data: image.base64 }
        },
        { type: 'text', text: 'This is a bank statement. Identify all recurring subscriptions and return the JSON as instructed.' }
      ]
    };
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

    const apiData = await apiRes.json();

    if (apiData.error) {
      return { statusCode: 502, body: JSON.stringify({ error: apiData.error.message || 'API error' }) };
    }

    const raw = (apiData.content || []).find(b => b.type === 'text')?.text || '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};
