// Vercel Serverless Function - Parse Itinerary Image
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
    const { base64Image } = req.body;

    if (!base64Image) {
      return res.status(400).json({ error: 'Missing image data' });
    }

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    const prompt = `You are extracting travel itinerary information from an image. Today is ${todayStr}.

CRITICAL DATE RULES - READ CAREFULLY:
- Travel itineraries are ALWAYS for FUTURE trips, not past trips
- Today is ${todayStr} (${currentYear})
- If a date has no year specified, you MUST determine the correct year:
  
  RULE: Compare the month/day to today (${todayStr}):
  - If the month is AFTER the current month (${currentMonth}), use ${currentYear}
  - If the month is BEFORE the current month (${currentMonth}), use ${currentYear + 1} (next year)
  - If the month equals the current month (${currentMonth}) but day is after today's day (${currentDay}), use ${currentYear}
  - If the month equals the current month (${currentMonth}) but day is before/equal today's day (${currentDay}), use ${currentYear + 1}

EXAMPLES (today is ${todayStr}):
- "February 21" → ${currentMonth <= 2 ? (currentMonth < 2 || (currentMonth === 2 && currentDay < 21) ? currentYear : currentYear + 1) : currentYear + 1}-02-21 (February is ${currentMonth <= 2 ? 'this year or next' : 'next year'})
- "March 15" → ${currentMonth <= 3 ? (currentMonth < 3 || (currentMonth === 3 && currentDay < 15) ? currentYear : currentYear + 1) : currentYear + 1}-03-15
- "December 1" → ${currentMonth <= 12 ? (currentMonth < 12 || (currentMonth === 12 && currentDay < 1) ? currentYear : currentYear + 1) : currentYear}-12-01

NEVER return a date that is more than 30 days in the past from ${todayStr}.

OTHER RULES:
1. Extract ALL destinations (cities + countries)
2. Convert dates to YYYY-MM-DD format
3. If only one date shown, use it for both start and end
4. Recognize date formats: "Jan 5-10", "5-10 Jan", "1/15", "15/1", etc.
5. City names in English, full country names
6. Extract traveler name if visible

Return ONLY this JSON (no markdown, no explanation):
{
  "travelerName": "Name or null",
  "legs": [
    {"city": "City", "country": "Country", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}
  ]
}

If no itinerary found: {"travelerName": null, "legs": []}`;

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
            content: `You extract travel itineraries from images. Today is ${todayStr}. All travel dates should be in the FUTURE. If a date appears to be in the past, assume it refers to the next occurrence of that date (next year). Return only valid JSON.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for more consistent date handling
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      return res.status(500).json({ error: error.error?.message || 'Failed to process image' });
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    // Parse JSON from response
    let result;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return res.status(500).json({ error: 'Failed to parse AI response', raw: content });
    }

    // Validate result structure
    if (!result || typeof result !== 'object') {
      return res.status(500).json({ error: 'Invalid response format' });
    }

    // Ensure legs is an array
    if (!Array.isArray(result.legs)) {
      result.legs = [];
    }

    // Validate and clean each leg
    result.legs = result.legs
      .filter(leg => leg.city && leg.startDate && leg.endDate)
      .map(leg => ({
        city: leg.city.trim(),
        country: leg.country?.trim() || '',
        startDate: leg.startDate,
        endDate: leg.endDate,
      }));

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error parsing image:', error);
    return res.status(500).json({ error: error.message || 'Failed to parse image' });
  }
}

