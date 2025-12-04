// Smart destination matching - finds exciting meetup spots between two locations
// Uses OpenStreetMap data to find significant cities, not just geographic midpoints

const PHOTON_API = 'https://photon.komoot.io/api/';
const NOMINATIM_API = 'https://nominatim.openstreetmap.org';

// Cache for API calls
const cityCache = new Map();

/**
 * Calculate the geographic midpoint between two coordinates
 */
function getMidpoint(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  const toDeg = (rad) => rad * 180 / Math.PI;
  
  const dLon = toRad(lon2 - lon1);
  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const lon1Rad = toRad(lon1);
  
  const Bx = Math.cos(lat2Rad) * Math.cos(dLon);
  const By = Math.cos(lat2Rad) * Math.sin(dLon);
  
  const lat3 = Math.atan2(
    Math.sin(lat1Rad) + Math.sin(lat2Rad),
    Math.sqrt((Math.cos(lat1Rad) + Bx) ** 2 + By ** 2)
  );
  const lon3 = lon1Rad + Math.atan2(By, Math.cos(lat1Rad) + Bx);
  
  return { lat: toDeg(lat3), lon: toDeg(lon3) };
}

/**
 * Calculate distance between two points in km (Haversine formula)
 */
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const toRad = (deg) => deg * Math.PI / 180;
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Search for cities in a region using Photon API
 */
async function searchCitiesInRegion(lat, lon, radiusKm, searchTerms = ['']) {
  const results = [];
  
  for (const term of searchTerms) {
    const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)},${radiusKm},${term}`;
    
    if (cityCache.has(cacheKey)) {
      results.push(...cityCache.get(cacheKey));
      continue;
    }
    
    try {
      // Search with location bias
      const query = term || 'city';
      const url = `${PHOTON_API}?q=${encodeURIComponent(query)}&lat=${lat}&lon=${lon}&limit=20&lang=en`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      const cities = data.features
        ?.filter(f => {
          const type = f.properties.type;
          // Only include significant place types
          return ['city', 'town', 'administrative', 'state', 'region'].includes(type);
        })
        .map(f => ({
          city: f.properties.name,
          country: f.properties.country,
          state: f.properties.state,
          type: f.properties.type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          // OSM importance score if available
          importance: f.properties.extent ? 
            (f.properties.extent[2] - f.properties.extent[0]) * (f.properties.extent[3] - f.properties.extent[1]) : 0
        }))
        .filter(city => {
          // Filter by distance from search point
          const dist = getDistance(lat, lon, city.lat, city.lon);
          return dist <= radiusKm;
        }) || [];
      
      cityCache.set(cacheKey, cities);
      results.push(...cities);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Error searching cities:', error);
    }
  }
  
  return results;
}

/**
 * Search for major cities along a corridor between two points
 */
async function searchCitiesAlongCorridor(lat1, lon1, lat2, lon2) {
  const results = [];
  const totalDistance = getDistance(lat1, lon1, lat2, lon2);
  
  // Sample points along the corridor (not just midpoint)
  const samplePoints = [0.3, 0.4, 0.5, 0.6, 0.7]; // 30% to 70% of the way
  
  for (const fraction of samplePoints) {
    const sampleLat = lat1 + (lat2 - lat1) * fraction;
    const sampleLon = lon1 + (lon2 - lon1) * fraction;
    
    // Search radius proportional to total distance (max 500km)
    const searchRadius = Math.min(totalDistance * 0.3, 500);
    
    const cities = await searchCitiesInRegion(sampleLat, sampleLon, searchRadius, ['']);
    results.push(...cities);
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Deduplicate by city name + country
  const unique = new Map();
  results.forEach(city => {
    const key = `${city.city}-${city.country}`;
    if (!unique.has(key)) {
      unique.set(key, city);
    }
  });
  
  return Array.from(unique.values());
}

/**
 * Get city significance score using reverse geocoding
 */
async function getCitySignificance(city, country) {
  const cacheKey = `sig-${city}-${country}`;
  if (cityCache.has(cacheKey)) {
    return cityCache.get(cacheKey);
  }
  
  try {
    // Search for the city to get more details
    const url = `${PHOTON_API}?q=${encodeURIComponent(city + ' ' + country)}&limit=1&lang=en`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.features?.[0]) {
      const f = data.features[0];
      const props = f.properties;
      
      // Score based on OSM data
      let score = 0;
      
      // City type matters
      if (props.type === 'city') score += 50;
      else if (props.type === 'town') score += 30;
      else if (props.type === 'administrative') score += 40;
      
      // Capital cities get a boost
      if (props.name?.toLowerCase().includes('capital') || 
          props.osm_value === 'capital') {
        score += 100;
      }
      
      // Extent (bounding box size) indicates importance
      if (props.extent) {
        const extent = (props.extent[2] - props.extent[0]) * (props.extent[3] - props.extent[1]);
        score += Math.min(extent * 1000, 50);
      }
      
      cityCache.set(cacheKey, score);
      return score;
    }
  } catch (error) {
    console.error('Error getting city significance:', error);
  }
  
  return 0;
}

/**
 * Search for capital cities and major hubs in countries between two points
 */
async function searchMajorCitiesBetween(lat1, lon1, lat2, lon2, country1, country2) {
  const results = [];
  
  // Get the bounding box of the two points (expanded)
  const minLat = Math.min(lat1, lat2) - 5;
  const maxLat = Math.max(lat1, lat2) + 5;
  const minLon = Math.min(lon1, lon2) - 5;
  const maxLon = Math.max(lon1, lon2) + 5;
  
  // Search for capitals and major cities in the region
  const searchTerms = [
    'capital',
    'international airport',
    'city center'
  ];
  
  for (const term of searchTerms) {
    try {
      // Search with bounding box bias
      const midpoint = getMidpoint(lat1, lon1, lat2, lon2);
      const url = `${PHOTON_API}?q=${encodeURIComponent(term)}&lat=${midpoint.lat}&lon=${midpoint.lon}&limit=15&lang=en`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      const cities = data.features
        ?.filter(f => {
          const fLat = f.geometry.coordinates[1];
          const fLon = f.geometry.coordinates[0];
          // Must be in the general region
          return fLat >= minLat && fLat <= maxLat && 
                 fLon >= minLon && fLon <= maxLon;
        })
        .filter(f => {
          const type = f.properties.type;
          return ['city', 'town', 'administrative', 'aerodrome'].includes(type);
        })
        .map(f => ({
          city: f.properties.city || f.properties.name,
          country: f.properties.country,
          state: f.properties.state,
          type: f.properties.type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }))
        .filter(c => c.city && c.country) || [];
      
      results.push(...cities);
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Error searching major cities:', error);
    }
  }
  
  return results;
}

/**
 * Score a potential meetup city based on multiple factors
 */
function scoreMeetupCity(city, lat1, lon1, lat2, lon2, totalDistance) {
  const dist1 = getDistance(lat1, lon1, city.lat, city.lon);
  const dist2 = getDistance(lat2, lon2, city.lat, city.lon);
  
  // Base score
  let score = 100;
  
  // Fairness: prefer cities that are roughly equidistant (within 30%)
  const distanceRatio = Math.min(dist1, dist2) / Math.max(dist1, dist2);
  const fairnessScore = distanceRatio * 40; // Up to 40 points
  score += fairnessScore;
  
  // Accessibility: prefer cities that aren't too far for either person
  // Ideally within 50% of total distance for each
  const maxAcceptableDist = totalDistance * 0.6;
  if (dist1 <= maxAcceptableDist && dist2 <= maxAcceptableDist) {
    score += 30;
  } else if (dist1 <= maxAcceptableDist || dist2 <= maxAcceptableDist) {
    score += 15;
  }
  
  // City type bonus
  if (city.type === 'city') score += 20;
  else if (city.type === 'administrative') score += 15;
  else if (city.type === 'town') score += 10;
  
  // Penalize very small distance differences (too close to one person)
  if (dist1 < totalDistance * 0.15 || dist2 < totalDistance * 0.15) {
    score -= 30;
  }
  
  return {
    ...city,
    score,
    distanceFrom1: Math.round(dist1),
    distanceFrom2: Math.round(dist2),
    fairnessRatio: Math.round(distanceRatio * 100),
  };
}

/**
 * Find exciting meetup destinations between two travelers
 * Main export function
 */
export async function findExcitingMeetups(
  city1, country1, lat1, lon1,
  city2, country2, lat2, lon2,
  options = {}
) {
  const { maxResults = 5, minFairnessRatio = 40 } = options;
  
  console.log(`[Destinations] Finding meetups between ${city1}, ${country1} and ${city2}, ${country2}`);
  
  const totalDistance = getDistance(lat1, lon1, lat2, lon2);
  console.log(`[Destinations] Total distance: ${Math.round(totalDistance)}km`);
  
  // If they're very close (under 200km), suggest local spots
  if (totalDistance < 200) {
    const midpoint = getMidpoint(lat1, lon1, lat2, lon2);
    const localCities = await searchCitiesInRegion(midpoint.lat, midpoint.lon, 100, ['']);
    
    return localCities
      .map(city => scoreMeetupCity(city, lat1, lon1, lat2, lon2, totalDistance))
      .filter(city => city.score > 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
  
  // Collect candidate cities from multiple sources
  const candidates = [];
  
  // 1. Search along the corridor
  console.log('[Destinations] Searching corridor...');
  const corridorCities = await searchCitiesAlongCorridor(lat1, lon1, lat2, lon2);
  candidates.push(...corridorCities);
  
  // 2. Search for major cities/capitals in the region
  console.log('[Destinations] Searching major cities...');
  const majorCities = await searchMajorCitiesBetween(lat1, lon1, lat2, lon2, country1, country2);
  candidates.push(...majorCities);
  
  // 3. Search around the midpoint specifically
  console.log('[Destinations] Searching midpoint region...');
  const midpoint = getMidpoint(lat1, lon1, lat2, lon2);
  const midpointRadius = Math.min(totalDistance * 0.4, 800);
  const midpointCities = await searchCitiesInRegion(midpoint.lat, midpoint.lon, midpointRadius, ['city', 'tourism']);
  candidates.push(...midpointCities);
  
  // Deduplicate
  const unique = new Map();
  candidates.forEach(city => {
    if (!city.city || !city.country) return;
    const key = `${city.city.toLowerCase()}-${city.country.toLowerCase()}`;
    if (!unique.has(key)) {
      unique.set(key, city);
    }
  });
  
  console.log(`[Destinations] Found ${unique.size} unique candidates`);
  
  // Score all candidates
  const scored = Array.from(unique.values())
    .map(city => scoreMeetupCity(city, lat1, lon1, lat2, lon2, totalDistance))
    .filter(city => {
      // Filter out origin cities
      const isOrigin1 = city.city.toLowerCase() === city1.toLowerCase() && 
                        city.country.toLowerCase() === country1.toLowerCase();
      const isOrigin2 = city.city.toLowerCase() === city2.toLowerCase() && 
                        city.country.toLowerCase() === country2.toLowerCase();
      return !isOrigin1 && !isOrigin2;
    })
    .filter(city => city.fairnessRatio >= minFairnessRatio)
    .sort((a, b) => b.score - a.score);
  
  console.log(`[Destinations] Returning top ${maxResults} results`);
  
  return scored.slice(0, maxResults);
}

/**
 * Generate a mini-itinerary for a meetup
 */
export async function generateMeetupItinerary(meetupCity, startDate, endDate, travelers) {
  const itinerary = {
    destination: meetupCity,
    dates: { start: startDate, end: endDate },
    travelers,
    suggestions: [],
  };
  
  try {
    // Search for attractions and things to do near the meetup city
    const attractionTypes = ['museum', 'landmark', 'restaurant', 'park'];
    
    for (const type of attractionTypes) {
      const url = `${PHOTON_API}?q=${encodeURIComponent(type + ' ' + meetupCity.city)}&lat=${meetupCity.lat}&lon=${meetupCity.lon}&limit=3&lang=en`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      const attractions = data.features
        ?.filter(f => {
          const dist = getDistance(meetupCity.lat, meetupCity.lon, 
            f.geometry.coordinates[1], f.geometry.coordinates[0]);
          return dist < 50; // Within 50km
        })
        .slice(0, 2)
        .map(f => ({
          name: f.properties.name,
          type: f.properties.type || type,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        })) || [];
      
      itinerary.suggestions.push(...attractions);
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  } catch (error) {
    console.error('Error generating itinerary suggestions:', error);
  }
  
  // Calculate travel info
  itinerary.travelInfo = {
    traveler1: {
      name: travelers[0],
      distance: meetupCity.distanceFrom1,
      estimatedFlight: estimateFlightTime(meetupCity.distanceFrom1),
    },
    traveler2: {
      name: travelers[1],
      distance: meetupCity.distanceFrom2,
      estimatedFlight: estimateFlightTime(meetupCity.distanceFrom2),
    },
  };
  
  return itinerary;
}

/**
 * Estimate flight time based on distance
 */
export function estimateFlightTime(distanceKm) {
  if (distanceKm < 500) return '~1 hour';
  if (distanceKm < 1500) return '~2 hours';
  if (distanceKm < 3000) return '~4 hours';
  if (distanceKm < 6000) return '~7 hours';
  if (distanceKm < 10000) return '~12 hours';
  return '~15+ hours';
}

/**
 * Format a meetup suggestion as a readable object
 */
export function formatMeetupSuggestion(meetup, traveler1Name, traveler2Name) {
  return {
    city: meetup.city,
    country: meetup.country,
    lat: meetup.lat,
    lon: meetup.lon,
    score: meetup.score,
    fairness: `${meetup.fairnessRatio}% balanced`,
    travel: {
      [traveler1Name]: {
        distance: `${meetup.distanceFrom1} km`,
        flight: estimateFlightTime(meetup.distanceFrom1),
      },
      [traveler2Name]: {
        distance: `${meetup.distanceFrom2} km`,
        flight: estimateFlightTime(meetup.distanceFrom2),
      },
    },
  };
}

