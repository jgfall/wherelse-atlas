// Vercel Serverless Function - Get Meetup Activities
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
    const { city, country, dates, travelers } = req.body;

    if (!city || !country) {
      return res.status(400).json({ error: 'Missing city or country' });
    }

    const prompt = `You are a local expert for ${city}, ${country}. 
Two friends (${travelers?.join(' and ') || 'travelers'}) are meeting up there${dates ? ` around ${dates.start} to ${dates.end}` : ''}.

Suggest 5 activities that would be perfect for friends meeting up. Focus on:
- Things that encourage conversation and catching up
- Local experiences unique to ${city}
- A mix of day/evening activities
- Different price points

Return JSON format:
{
  "activities": [
    {
      "name": "Activity name",
      "type": "food|drinks|culture|adventure|relaxation|nightlife",
      "description": "2-3 sentences about the activity",
      "whyGreat": "Why this is perfect for friends catching up",
      "priceRange": "$|$$|$$$",
      "bestTime": "morning|afternoon|evening|night"
    }
  ]
}`;

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
            content: 'You are a knowledgeable travel concierge. Always return valid JSON. Be specific about actual places and experiences in the city.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
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

    return res.status(200).json(result);

  } catch (error) {
    console.error('Meetup activities error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

