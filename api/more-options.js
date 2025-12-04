// Vercel Serverless Function - Get More Meetup Options
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
    const { primaryItinerary, friendItinerary, existingCities } = req.body;

    if (!primaryItinerary || !friendItinerary) {
      return res.status(400).json({ error: 'Missing itineraries' });
    }

    const name1 = primaryItinerary.travelerName || 'Traveler 1';
    const name2 = friendItinerary.travelerName || 'Traveler 2';

    const prompt = `You are a creative travel meetup planner. Find 3 MORE unique meetup opportunities for these travelers.

${name1}'s ITINERARY:
${primaryItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

${name2}'s ITINERARY:
${friendItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

ALREADY SUGGESTED (avoid these cities): ${existingCities?.join(', ') || 'none'}

Find 3 creative but REALISTIC meetup options. Think about:
- Hidden gem cities between their routes
- Places both could easily day-trip or short-flight to
- Cities with good transport connections to both travelers' locations

IMPORTANT RULES:
- Suggested meetup city must be DIFFERENT from both travelers' current locations
- Both travelers should travel roughly equal distances to meet
- Must be geographically sensible (not suggesting a city farther than either's current location)

Return JSON:
{
  "meetups": [
    {
      "type": "potential",
      "priority": 1,
      "city": "City Name",
      "country": "Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "days": 3,
      "${name1}": {
        "city": "Coming from city",
        "country": "Country"
      },
      "${name2}": {
        "city": "Coming from city",
        "country": "Country"
      },
      "whyHere": "Creative reason this works (max 15 words)",
      "adjustment": "What slight changes needed (max 15 words)"
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
            content: 'You are a creative travel planner who finds unique meetup opportunities. Always return valid JSON. Be geographically accurate and realistic.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.8,
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

    // Transform meetups
    const overlaps = (result.meetups || []).map((meetup, idx) => {
      const traveler1Info = meetup[name1] || meetup.traveler1From || {};
      const traveler2Info = meetup[name2] || meetup.traveler2From || {};

      return {
        id: `more-${Date.now()}-${idx}`,
        type: meetup.type || 'potential',
        priority: meetup.priority || idx + 1,
        city: meetup.city,
        country: meetup.country,
        startDate: meetup.startDate,
        endDate: meetup.endDate,
        days: meetup.days || 1,
        gapDays: meetup.gapDays || 0,
        travelers: [name1, name2],
        traveler1From: traveler1Info,
        traveler2From: traveler2Info,
        whyHere: meetup.whyHere || '',
        adjustment: meetup.adjustment || '',
      };
    });

    return res.status(200).json({ overlaps });

  } catch (error) {
    console.error('More options error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

