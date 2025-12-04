// Vercel Serverless Function - Compare Trips with AI
// This keeps the OpenAI API key server-side only

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { primaryItinerary, friendItinerary, topPairs } = req.body;

    if (!primaryItinerary || !friendItinerary) {
      return res.status(400).json({ error: 'Missing itineraries' });
    }

    const name1 = primaryItinerary.travelerName || 'Traveler 1';
    const name2 = friendItinerary.travelerName || 'Traveler 2';
    const today = new Date().toISOString().split('T')[0];

    const prompt = `Analyze these travel itineraries and find REALISTIC meetup opportunities.

TODAY: ${today}

${name1.toUpperCase()}'S ITINERARY:
${primaryItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

${name2.toUpperCase()}'S ITINERARY:
${friendItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

${topPairs ? `PRE-COMPUTED LEG PAIR ANALYSIS:
${topPairs.map((p, i) => 
  `${i + 1}. ${p.leg1.city} (${p.leg1.dates}) ↔ ${p.leg2.city} (${p.leg2.dates})
     Same city: ${p.isSameCity}, Date overlap: ${p.hasDateOverlap ? `YES (${p.overlapDays} days)` : `NO (${p.gapDays} day gap)`}${p.distanceKm !== null ? `, Distance: ${p.distanceKm}km` : ''}`
).join('\n')}` : ''}

TRAVELERS:
- "${name1}" = first traveler
- "${name2}" = second traveler

STRICT RULES FOR MEETUP SUGGESTIONS:
1. "natural" = SAME CITY + dates actually overlap (overlapDays > 0)
2. "near-miss" = SAME CITY but dates don't overlap, gap ≤ 30 days
3. "potential" = ONLY when travelers are in DIFFERENT nearby cities with overlapping dates:
   - The "city" field MUST be a REAL, SPECIFIC CITY NAME (e.g., "Brussels", "Munich", "Lyon")
   - NEVER use generic text like "Meet halfway" or "Midpoint" as the city name
   - For potential meetups, choose the closest major city between their two locations
   - Example: If one is in Paris and one in Berlin, suggest "Cologne" or "Frankfurt" or "Brussels"
   - Only suggest if cities are ≤ 500km apart AND dates overlap
4. DO NOT suggest meetups when:
   - Cities are more than 500km apart with no date overlap
   - Gap between visits is more than 7 days
   - Would require someone to completely change their itinerary

CRITICAL - TRAVELER INFO MUST BE COMPLETE:
For each meetup, you MUST include where each traveler is coming FROM with their ACTUAL city from their itinerary.
- "${name1}" object: The city/dates from ${name1}'s itinerary during the meetup window
- "${name2}" object: The city/dates from ${name2}'s itinerary during the meetup window

PRIORITY ORDER:
1. Same city, dates overlap = HIGHEST priority (natural)
2. Same city, dates within 3 days = HIGH priority (near-miss)
3. Nearby cities (≤300km), dates overlap = MEDIUM priority (potential)
4. Everything else = LOW or don't include

Return ONLY this JSON structure with 1-5 meetup options (fewer is better than bad suggestions):
{
  "meetups": [
    {
      "type": "natural|near-miss|potential",
      "priority": 1,
      "city": "REAL CITY NAME (never 'Meet halfway')",
      "country": "Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "days": 5,
      "gapDays": 0,
      "${name1}": {
        "city": "${name1}'s ACTUAL city from their itinerary",
        "country": "Country",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD"
      },
      "${name2}": {
        "city": "${name2}'s ACTUAL city from their itinerary", 
        "country": "Country",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD"
      },
      "whyHere": "Short reason (max 10 words)",
      "adjustment": "What needs to change, if anything (max 15 words)"
    }
  ],
  "bestOption": {
    "summary": "One sentence using ${name1} and ${name2}'s names about best chance to meet up",
    "action": "Specific action to make it happen"
  },
  "noGoodOptions": false
}

IMPORTANT RULES:
1. Use "${name1}" and "${name2}" as the keys for traveler info, NOT "traveler1From" or "traveler2From"
2. NEVER use "Meet halfway" or any generic text as a city name - always use a REAL city
3. Each traveler's info MUST include their actual city from their itinerary

If there are NO realistic meetup opportunities (different continents, months apart, etc.), return:
{
  "meetups": [],
  "bestOption": null,
  "noGoodOptions": true,
  "reason": "Brief explanation why no meetup is feasible"
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
            content: `You are a travel meetup analyzer. You MUST follow these rules STRICTLY:

CITY NAMES:
- NEVER use "Meet halfway", "Midpoint", or any generic placeholder as a city name
- ALWAYS use REAL, SPECIFIC city names (e.g., "Brussels", "Munich", "Lyon", "Prague")
- For "potential" meetups between different cities, pick a real city between them

TRAVELER INFO:
- Each meetup MUST include complete info for BOTH travelers
- Use the traveler's NAME as the key (e.g., "Jeff": {...}, "Chris": {...})
- Include their ACTUAL city from their itinerary, not generic text

MEETUP TYPES:
- "natural" = Same city, dates overlap
- "near-miss" = Same city, dates within a few days
- "potential" = Different nearby cities, suggest a REAL city between them

QUALITY:
- Be conservative - 1-2 great options beats 5 mediocre ones
- Return ONLY valid JSON`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
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
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    // Transform meetups to UI-friendly format
    const overlaps = (result.meetups || []).map((meetup, idx) => {
      const traveler1Info = meetup[name1] || meetup.traveler1From || {};
      const traveler2Info = meetup[name2] || meetup.traveler2From || {};

      return {
        id: `ai-${Date.now()}-${idx}`,
        type: meetup.type,
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
        traveler1Location: traveler1Info,
        traveler2Location: traveler2Info,
        whyHere: meetup.whyHere || '',
        adjustment: meetup.adjustment || '',
        reason: meetup.whyHere || meetup.reason || '',
      };
    });

    return res.status(200).json({
      overlaps,
      aiAnalysis: result.bestOption,
      noGoodOptions: result.noGoodOptions || false,
      reason: result.reason
    });

  } catch (error) {
    console.error('Compare trips error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

