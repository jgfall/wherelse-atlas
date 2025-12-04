// AI-powered helpers for better recommendations and parsing
// All OpenAI calls go through our serverless API to keep keys secure

/**
 * Get AI-powered date optimization suggestions
 */
export async function suggestDateOptimizations(primaryItinerary, friendItinerary) {
  // This feature is disabled for now - can be added to API later
  return null;
}

/**
 * Get AI-powered meetup recommendations for a specific overlap
 */
export async function getAIMeetupRecommendations(
  overlap,
  primaryItinerary,
  friendItinerary
) {
  // Use the meetup activities API
  try {
    const response = await fetch('/api/meetup-activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: overlap.city,
        country: overlap.country,
        dates: { start: overlap.startDate, end: overlap.endDate },
        travelers: [primaryItinerary.travelerName, friendItinerary.travelerName]
      })
    });
    
    if (!response.ok) {
      console.error('Meetup recommendations API error');
      return null;
    }
    
    const data = await response.json();
    return data.activities || [];
  } catch (error) {
    console.error('Error getting AI meetup recommendations:', error);
    return null;
  }
}

/**
 * Parse a natural language trip description into structured data
 */
export async function parseNaturalLanguageTrip(description) {
  try {
    const response = await fetch('/api/parse-trip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    
    if (!response.ok) {
      throw new Error('Failed to parse trip');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error parsing natural language trip:', error);
    return null;
  }
}

/**
 * Get AI suggestions for activities during a meetup
 */
export async function getMeetupActivities(city, country, dates, travelers) {
  try {
    const response = await fetch('/api/meetup-activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, country, dates, travelers })
    });
    
    if (!response.ok) {
      console.error('Meetup activities API error');
      return [];
    }
    
    const data = await response.json();
    return data.activities || [];
  } catch (error) {
    console.error('Error getting meetup activities:', error);
    return [];
  }
}

/**
 * MAIN COMPARISON FUNCTION
 * Compare two trip itineraries and find meetup opportunities
 * 
 * This is the SINGLE algorithm for all trip comparisons.
 * 
 * Algorithm:
 * 1. Pre-compute all leg pairs with date/distance metrics (local, fast)
 * 2. Send curated data to API for intelligent ranking and suggestions
 * 3. API validates overlaps and suggests realistic meetups only
 */
export async function compareTripsWithAI(primaryItinerary, friendItinerary, calculateDistanceFn = null) {
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
  // PHASE 2: Call our secure API endpoint
  // ============================================================
  try {
    console.log('[AI Compare] Analyzing with pre-computed metrics...');
    console.log('[AI Compare] Top pairs:', topPairs);
    
    const response = await fetch('/api/compare-trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryItinerary,
        friendItinerary,
        topPairs
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Compare trips API error:', error);
      throw new Error(error.error || 'Failed to analyze trips');
    }
    
    const result = await response.json();
    
    console.log('[AI Compare] API result:', result);
    
    // Handle "no good options" case
    if (result.noGoodOptions) {
      return {
        bestOption: null,
        overlaps: [],
        noGoodOptions: true,
        reason: result.reason || 'No realistic meetup opportunities found',
      };
    }
    
    return {
      bestOption: result.aiAnalysis || null,
      overlaps: result.overlaps || [],
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
  try {
    console.log('[More Options] Requesting more options...');
    
    const response = await fetch('/api/more-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primaryItinerary,
        friendItinerary,
        existingCities
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('More options API error:', error);
      throw new Error(error.error || 'Failed to get more options');
    }
    
    const result = await response.json();
    
    console.log('[More Options] API result:', result);
    
    return {
      overlaps: result.overlaps || [],
    };
    
  } catch (error) {
    console.error('[More Options] Error:', error);
    throw error;
  }
}
