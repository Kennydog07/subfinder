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

  const { name, amount, category } = body;
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing service name' }) };
  }

  const SYSTEM = `You are a money-saving AI. When given a subscription service and its monthly cost, suggest 3 cheaper or free alternatives.
Return ONLY a valid JSON array — no markdown, no code fences, no preamble.
[{"name":"","emoji":"","price":"e.g. Free or £X/mo","description":"one sentence — what it does and why it's a good swap"}]
Be specific and realistic. Include at least one free option where possible. Keep descriptions under 20 words.`;

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
        max_tokens: 800,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: `Service: ${name}\nCategory: ${category || 'Other'}\nCurrent monthly cost: £${amount}\nFind 3 cheaper or free alternatives.`
        }]
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
