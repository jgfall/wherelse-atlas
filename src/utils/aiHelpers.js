// AI-powered helpers for better recommendations and parsing

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * Get AI-powered date optimization suggestions
 */
export async function suggestDateOptimizations(primaryItinerary, friendItinerary) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return null;
  
  try {
    const prompt = `You are a travel planning expert. Analyze these two travel itineraries and suggest the best way to adjust dates to create overlap opportunities.

PRIMARY TRAVELER: ${primaryItinerary.travelerName}
${primaryItinerary.legs.map((leg, i) => `${i + 1}. ${leg.city}, ${leg.country} - ${leg.startDate} to ${leg.endDate}`).join('\n')}

FRIEND TRAVELER: ${friendItinerary.travelerName}
${friendItinerary.legs.map((leg, i) => `${i + 1}. ${leg.city}, ${leg.country} - ${leg.startDate} to ${leg.endDate}`).join('\n')}

Provide 2-3 specific suggestions for date adjustments that would create the best meetup opportunities. Consider:
- Which dates are most flexible to adjust
- Which locations would make the best meetup spots
- How many days of overlap would be ideal

Return JSON format:
{
  "suggestions": [
    {
      "traveler": "Primary or Friend",
      "legIndex": 0,
      "currentDates": "YYYY-MM-DD to YYYY-MM-DD",
      "suggestedDates": "YYYY-MM-DD to YYYY-MM-DD",
      "reason": "Why this adjustment helps",
      "overlapDays": 3,
      "meetupLocation": "City, Country"
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
            content: 'You are a helpful travel planning assistant. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get AI suggestions');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) return null;
    
    // Parse JSON (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error('Error getting AI date suggestions:', error);
    return null;
  }
}

/**
 * Get AI-powered meetup destination recommendations with context
 */
export async function getAIMeetupRecommendations(
  primaryLeg,
  friendLeg,
  meetupOptions,
  context = {}
) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey || !meetupOptions || meetupOptions.length === 0) return meetupOptions;
  
  try {
    const prompt = `You are a travel expert. Analyze these potential meetup destinations between two travelers and rank them by desirability.

TRAVELER 1 is in: ${primaryLeg.city}, ${primaryLeg.country}
TRAVELER 2 is in: ${friendLeg.city}, ${friendLeg.country}

POTENTIAL MEETUP DESTINATIONS:
${meetupOptions.map((opt, i) => 
  `${i + 1}. ${opt.city}, ${opt.country} - ${opt.distanceFrom1}km from Traveler 1, ${opt.distanceFrom2}km from Traveler 2`
).join('\n')}

Consider:
- Which destinations are most exciting/interesting for a meetup
- Which are most accessible and balanced for both travelers
- Which offer the best travel experiences
- Cultural significance and tourist appeal

Return JSON with ranked recommendations:
{
  "ranked": [
    {
      "city": "City name",
      "country": "Country name",
      "rank": 1,
      "reason": "Why this is a great choice",
      "highlights": ["feature 1", "feature 2"],
      "bestFor": "What makes this destination special"
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
            content: 'You are a travel expert. Return only valid JSON.'
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
      return meetupOptions; // Fallback to original
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) return meetupOptions;
    
    // Parse JSON
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const aiRanking = JSON.parse(jsonStr.trim());
    
    // Merge AI insights with existing options
    return meetupOptions.map(opt => {
      const aiInfo = aiRanking.ranked?.find(r => 
        r.city.toLowerCase() === opt.city.toLowerCase() &&
        r.country.toLowerCase() === opt.country.toLowerCase()
      );
      
      return {
        ...opt,
        aiRank: aiInfo?.rank,
        aiReason: aiInfo?.reason,
        aiHighlights: aiInfo?.highlights || [],
        aiBestFor: aiInfo?.bestFor,
        // Boost score if AI ranked it highly
        score: opt.score + (aiInfo?.rank === 1 ? 20 : aiInfo?.rank === 2 ? 10 : 0)
      };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return meetupOptions; // Fallback to original
  }
}

/**
 * Parse natural language trip description
 */
export async function parseNaturalLanguageTrip(description) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  const prompt = `Extract travel itinerary information from this natural language description:

"${description}"

Extract:
- Traveler name (if mentioned)
- All destinations (cities and countries)
- Dates for each destination (convert to YYYY-MM-DD format)
- If dates are relative (e.g., "next month", "in 3 weeks"), use today's date as reference: ${new Date().toISOString().split('T')[0]}

Return JSON format:
{
  "travelerName": "Name or null",
  "legs": [
    {
      "city": "City name",
      "country": "Country name",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD"
    }
  ]
}

If you cannot extract clear travel information, return:
{"error": "Could not parse trip information", "travelerName": null, "legs": []}`;

  try {
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
            content: 'You are a travel itinerary parser. Extract structured data from natural language. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to parse description');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse JSON
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    // Add IDs to legs
    const legs = (parsed.legs || []).map((leg, idx) => ({
      ...leg,
      id: Date.now() + idx,
      canonicalCity: leg.city,
      canonicalCountry: leg.country,
    }));
    
    return {
      travelerName: parsed.travelerName,
      legs,
    };
  } catch (error) {
    console.error('Error parsing natural language:', error);
    throw error;
  }
}

/**
 * Get AI-powered activity suggestions for a meetup destination
 */
export async function getMeetupActivities(city, country, dates, travelers) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) return [];
  
  try {
    const prompt = `Suggest 5-7 exciting activities, restaurants, or experiences for a meetup in ${city}, ${country}.

Travelers: ${travelers.join(' and ')}
Dates: ${dates.start} to ${dates.end}

Focus on:
- Unique local experiences
- Great restaurants or food experiences
- Cultural attractions
- Activities that work well for groups
- Things that make this destination special

Return JSON:
{
  "activities": [
    {
      "name": "Activity name",
      "type": "restaurant|museum|activity|landmark|experience",
      "description": "Brief description",
      "whyGreat": "Why this is perfect for a meetup"
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
            content: 'You are a travel expert. Return only valid JSON.'
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
      return [];
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) return [];
    
    // Parse JSON
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    return parsed.activities || [];
  } catch (error) {
    console.error('Error getting activities:', error);
    return [];
  }
}

/**
 * CONSOLIDATED AI-powered trip comparison
 * This is the SINGLE algorithm for all trip comparisons.
 * 
 * Algorithm:
 * 1. Pre-compute all leg pairs with date/distance metrics (local, fast)
 * 2. Send curated data to AI for intelligent ranking and suggestions
 * 3. AI validates overlaps and suggests realistic meetups only
 */
export async function compareTripsWithAI(primaryItinerary, friendItinerary, calculateDistanceFn = null) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  // ============================================================
  // PHASE 1: Pre-compute leg pair metrics locally (fast)
  // ============================================================
  const legPairs = [];
  const allLegs1 = primaryItinerary.legs.map(leg => ({
    ...leg,
    traveler: primaryItinerary.travelerName,
    startTime: new Date(leg.startDate).getTime(),
    endTime: new Date(leg.endDate).getTime(),
  }));
  const allLegs2 = friendItinerary.legs.map(leg => ({
    ...leg,
    traveler: friendItinerary.travelerName,
    startTime: new Date(leg.startDate).getTime(),
    endTime: new Date(leg.endDate).getTime(),
  }));
  
  for (const leg1 of allLegs1) {
    for (const leg2 of allLegs2) {
      // Calculate date relationship
      const overlapStart = Math.max(leg1.startTime, leg2.startTime);
      const overlapEnd = Math.min(leg1.endTime, leg2.endTime);
      const hasDateOverlap = overlapStart <= overlapEnd;
      const overlapDays = hasDateOverlap 
        ? Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1 
        : 0;
      
      // Calculate gap if no overlap
      let gapDays = 0;
      if (!hasDateOverlap) {
        gapDays = Math.ceil(Math.abs(overlapStart - overlapEnd) / (1000 * 60 * 60 * 24));
      }
      
      // Calculate distance if coordinates available
      let distanceKm = null;
      const isSameCity = leg1.city?.toLowerCase().trim() === leg2.city?.toLowerCase().trim() &&
                         leg1.country?.toLowerCase().trim() === leg2.country?.toLowerCase().trim();
      
      if (calculateDistanceFn && leg1.lat && leg1.lng && leg2.lat && leg2.lng) {
        distanceKm = calculateDistanceFn(leg1.lat, leg1.lng, leg2.lat, leg2.lng);
      }
      
      legPairs.push({
        leg1: { city: leg1.city, country: leg1.country, dates: `${leg1.startDate} to ${leg1.endDate}` },
        leg2: { city: leg2.city, country: leg2.country, dates: `${leg2.startDate} to ${leg2.endDate}` },
        hasDateOverlap,
        overlapDays,
        gapDays,
        isSameCity,
        distanceKm: distanceKm !== null ? Math.round(distanceKm) : null,
      });
    }
  }
  
  // Sort by quality: same city overlaps first, then by overlap days, then by smallest gap
  legPairs.sort((a, b) => {
    // Prioritize same-city pairs
    if (a.isSameCity !== b.isSameCity) return a.isSameCity ? -1 : 1;
    // Then date overlaps
    if (a.hasDateOverlap !== b.hasDateOverlap) return a.hasDateOverlap ? -1 : 1;
    // Then by overlap days (more = better) or gap days (less = better)
    if (a.hasDateOverlap && b.hasDateOverlap) return b.overlapDays - a.overlapDays;
    return a.gapDays - b.gapDays;
  });
  
  // Take top 10 most promising pairs to send to AI
  const topPairs = legPairs.slice(0, 10);
  
  // ============================================================
  // PHASE 2: Build context-rich prompt for AI
  // ============================================================
  const name1 = primaryItinerary.travelerName || 'Traveler 1';
  const name2 = friendItinerary.travelerName || 'Traveler 2';
  
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

PRE-COMPUTED LEG PAIR ANALYSIS:
${topPairs.map((p, i) => 
  `${i + 1}. ${p.leg1.city} (${p.leg1.dates}) ↔ ${p.leg2.city} (${p.leg2.dates})
     Same city: ${p.isSameCity}, Date overlap: ${p.hasDateOverlap ? `YES (${p.overlapDays} days)` : `NO (${p.gapDays} day gap)`}${p.distanceKm !== null ? `, Distance: ${p.distanceKm}km` : ''}`
).join('\n')}

TRAVELERS:
- "${name1}" = first traveler
- "${name2}" = second traveler

STRICT RULES FOR MEETUP SUGGESTIONS:
1. "natural" = SAME CITY + dates actually overlap (overlapDays > 0)
2. "near-miss" = SAME CITY but dates don't overlap, gap ≤ 30 days
3. "potential" = ONLY for a TRUE HALFWAY POINT between two different cities:
   - The meetup city MUST be different from BOTH travelers' locations
   - It should be roughly equidistant from both, a fair compromise
   - NEVER suggest one person just travels to where the other already is
   - Both travelers must travel to meet - that's what makes it "potential"
   - Only suggest if cities are ≤ 500km apart AND dates overlap
4. DO NOT suggest meetups when:
   - Cities are more than 500km apart with no date overlap
   - Gap between visits is more than 7 days
   - The suggested meetup city is the same as either traveler's current city
   - Would require someone to completely change their itinerary

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
      "city": "Meetup City",
      "country": "Country",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "days": 5,
      "gapDays": 0,
      "${name1}": {
        "city": "City where ${name1} is coming from",
        "country": "Country",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD"
      },
      "${name2}": {
        "city": "City where ${name2} is coming from", 
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

IMPORTANT: Use "${name1}" and "${name2}" as the keys for traveler info, NOT "traveler1From" or "traveler2From".

If there are NO realistic meetup opportunities (different continents, months apart, etc.), return:
{
  "meetups": [],
  "bestOption": null,
  "noGoodOptions": true,
  "reason": "Brief explanation why no meetup is feasible"
}`;

  try {
    console.log('[AI Compare] Analyzing with pre-computed metrics...');
    console.log('[AI Compare] Top pairs:', topPairs);
    
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
            content: `You are a travel meetup analyzer. You MUST be strict about what constitutes a viable meetup:
- Same city visits that overlap or nearly overlap = ALWAYS include as "natural" or "near-miss"
- For "potential" meetups: ALWAYS suggest a TRUE HALFWAY POINT that is DIFFERENT from both travelers' cities
  * NEVER suggest one person just goes to the other's location
  * The meetup city must require BOTH people to travel
  * Example: If A is in Paris and B is in Berlin, suggest meeting in Brussels or Frankfurt, NOT Paris or Berlin
- Far-apart cities (>500km) = ONLY if dates overlap AND there's a sensible midpoint city
- Different continents or >1000km apart with no date overlap = DO NOT suggest a meetup

Be conservative. It's better to return 1-2 great options than 5 mediocre ones.
Return ONLY valid JSON.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.2, // Lower temp for more consistent/strict output
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      throw new Error(error.error?.message || 'Failed to analyze trips');
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }
    
    console.log('[AI Compare] Raw response:', content);
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const result = JSON.parse(jsonStr.trim());
    
    console.log('[AI Compare] Parsed result:', result);
    
    // Handle "no good options" case
    if (result.noGoodOptions) {
      return {
        bestOption: null,
        overlaps: [],
        noGoodOptions: true,
        reason: result.reason || 'No realistic meetup opportunities found',
      };
    }
    
    // Transform meetups to UI-friendly format
    // The AI now uses actual traveler names as keys instead of "traveler1From"/"traveler2From"
    const overlaps = (result.meetups || []).map((meetup, idx) => {
      // Try to find traveler info using actual names, fallback to old format
      const traveler1Info = meetup[name1] || meetup.traveler1From || meetup[primaryItinerary.travelerName] || {};
      const traveler2Info = meetup[name2] || meetup.traveler2From || meetup[friendItinerary.travelerName] || {};
      
      console.log(`[AI Compare] Meetup ${idx + 1}:`, {
        type: meetup.type,
        city: meetup.city,
        name1Key: name1,
        name2Key: name2,
        traveler1Info,
        traveler2Info,
        allKeys: Object.keys(meetup)
      });
      
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
        // Where each person is coming from - use actual names
        traveler1From: traveler1Info,
        traveler2From: traveler2Info,
        // Reason and adjustment
        whyHere: meetup.whyHere || '',
        adjustment: meetup.adjustment || '',
        reason: meetup.whyHere || meetup.reason || '',
      };
    });
    
    return {
      bestOption: result.bestOption || null,
      overlaps,
      noGoodOptions: false,
    };
    
  } catch (error) {
    console.error('[AI Compare] Error:', error);
    throw error;
  }
}

/**
 * Get MORE creative meetup options from AI - for "Show More" feature
 * Asks for alternative, more adventurous or flexible options
 */
export async function getMoreMeetupOptions(primaryItinerary, friendItinerary, existingCities = []) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  const name1 = primaryItinerary.travelerName || 'Traveler 1';
  const name2 = friendItinerary.travelerName || 'Traveler 2';
  const today = new Date().toISOString().split('T')[0];
  
  const prompt = `You previously suggested meetups in: ${existingCities.join(', ') || 'none yet'}.

Now suggest 3-5 MORE creative/alternative meetup options for these travelers. Think outside the box!

TODAY: ${today}

${name1.toUpperCase()}'S ITINERARY:
${primaryItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

${name2.toUpperCase()}'S ITINERARY:
${friendItinerary.legs.map(leg => 
  `  • ${leg.city}, ${leg.country}: ${leg.startDate} to ${leg.endDate}`
).join('\n')}

SUGGEST CREATIVE ALTERNATIVES:
- Hidden gem cities between their locations
- Exciting cities that are easy to reach from both locations
- Destinations with great flight connections
- Places that would make the trip extra memorable
- Consider slight date adjustments (1-3 days) to make better options work

DO NOT repeat: ${existingCities.join(', ') || 'N/A'}

Return ONLY this JSON structure:
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
      "gapDays": 0,
      "${name1}": {
        "city": "Where ${name1} is coming from",
        "country": "Country",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD"
      },
      "${name2}": {
        "city": "Where ${name2} is coming from",
        "country": "Country",
        "startDate": "YYYY-MM-DD",
        "endDate": "YYYY-MM-DD"
      },
      "whyHere": "Why this is a great alternative (10 words max)",
      "adjustment": "Any date changes needed (15 words max)"
    }
  ]
}`;

  try {
    console.log('[AI More Options] Requesting creative alternatives...');
    
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
            content: `You suggest creative, exciting meetup destinations for travelers. Focus on hidden gems, bucket-list cities, and memorable experiences. Be practical about dates but creative about locations. Return ONLY valid JSON.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7, // Higher temp for more creative suggestions
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      throw new Error(error.error?.message || 'Failed to get more options');
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }
    
    // Parse JSON
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const result = JSON.parse(jsonStr.trim());
    
    // Transform to UI format
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
        reason: meetup.whyHere || '',
        isAlternative: true, // Mark as alternative suggestion
      };
    });
    
    return { overlaps };
    
  } catch (error) {
    console.error('[AI More Options] Error:', error);
    throw error;
  }
}

// Helper to estimate flight time from distance
function estimateFlightTimeFromDistance(distanceKm) {
  if (!distanceKm || distanceKm === 0) return 'Same location';
  if (distanceKm < 100) return '< 1 hour drive';
  if (distanceKm < 500) return '~1 hour flight';
  if (distanceKm < 1500) return '~2 hour flight';
  if (distanceKm < 3000) return '~4 hour flight';
  if (distanceKm < 6000) return '~8 hour flight';
  return '10+ hour flight';
}

