// Vercel Serverless Function - Parse Natural Language Trip
// This keeps the OpenAI API key server-side only

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { description } = req.body;

    if (!description) {
      return res.status(400).json({ error: 'Missing description' });
    }

    const prompt = `Parse this travel description into a structured itinerary:

"${description}"

Extract:
1. The traveler's name (if mentioned)
2. Each destination with dates

Return JSON format:
{
  "travelerName": "Name or 'Traveler'",
  "legs": [
    {
      "city": "City Name",
      "country": "Country Name",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD"
    }
  ]
}

Rules:
- Use exact city and country names
- Convert relative dates (like "next month") to actual dates based on today being ${new Date().toISOString().split('T')[0]}
- If dates are vague, make reasonable assumptions
- Order legs chronologically`;

    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a travel itinerary parser. Always return valid JSON. Be accurate with city names and dates.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'OpenAI API error' });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    // Parse JSON from response
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Add IDs to legs
    if (result.legs) {
      result.legs = result.legs.map((leg, idx) => ({
        ...leg,
        id: `parsed-${Date.now()}-${idx}`
      }));
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error('Parse trip error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

