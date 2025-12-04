// Geocoding utility using Nominatim (OpenStreetMap) - free, no API key required
// For production, consider using a paid service like Google Maps or Mapbox for better rate limits

const GEOCODE_CACHE = new Map();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Geocode a city and country to get coordinates
 * Uses OpenStreetMap Nominatim API (free, but rate-limited)
 */
export async function geocodeLocation(city, country) {
  const cacheKey = `${city.toLowerCase()},${country.toLowerCase()}`;
  
  // Check cache first
  const cached = GEOCODE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    // Try with city and country first
    let query = `${city}, ${country}`;
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WherelseAtlas/1.0' // Required by Nominatim
      }
    });

    if (!response.ok) {
      throw new Error('Geocoding failed');
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        city: city,
        country: country
      };
      
      // Cache the result
      GEOCODE_CACHE.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    }

    // Fallback: try with just city name
    if (city !== country) {
      url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`;
      const fallbackResponse = await fetch(url, {
        headers: {
          'User-Agent': 'WherelseAtlas/1.0'
        }
      });
      
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData && fallbackData.length > 0) {
          const result = {
            lat: parseFloat(fallbackData[0].lat),
            lon: parseFloat(fallbackData[0].lon),
            displayName: fallbackData[0].display_name,
            city: city,
            country: country
          };
          
          GEOCODE_CACHE.set(cacheKey, {
            data: result,
            timestamp: Date.now()
          });
          
          return result;
        }
      }
    }

    throw new Error('Location not found');
  } catch (error) {
    console.error('Geocoding error:', error);
    // Return null coordinates as fallback
    return {
      lat: null,
      lon: null,
      displayName: `${city}, ${country}`,
      city: city,
      country: country,
      error: true
    };
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return null;
  }

  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Find midpoint coordinates between two locations
 */
export function findMidpoint(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return null;
  }

  return {
    lat: (lat1 + lat2) / 2,
    lon: (lon1 + lon2) / 2
  };
}

/**
 * Reverse geocode coordinates to find nearby cities
 * Used to find meetup locations near the midpoint
 */
export async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WherelseAtlas/1.0'
      }
    });

    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();
    
    if (data && data.address) {
      return {
        city: data.address.city || data.address.town || data.address.village || data.address.municipality || '',
        country: data.address.country || '',
        displayName: data.display_name,
        lat: lat,
        lon: lon
      };
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Find potential meetup cities between two locations
 * Uses midpoint calculation and reverse geocoding to find actual cities
 * @param {string} city1 - City name
 * @param {string} country1 - Country name
 * @param {string} city2 - City name
 * @param {string} country2 - Country name
 * @param {Object} coords1 - Optional: {lat, lon} for city1 to skip geocoding
 * @param {Object} coords2 - Optional: {lat, lon} for city2 to skip geocoding
 */
export async function findMeetupCities(city1, country1, city2, country2, coords1 = null, coords2 = null) {
  // Use provided coordinates or geocode
  let loc1, loc2;
  
  if (coords1 && coords1.lat && coords1.lon) {
    loc1 = { lat: coords1.lat, lon: coords1.lon, city: city1, country: country1 };
  } else {
    loc1 = await geocodeLocation(city1, country1);
  }
  
  if (coords2 && coords2.lat && coords2.lon) {
    loc2 = { lat: coords2.lat, lon: coords2.lon, city: city2, country: country2 };
  } else {
    // Only geocode if we don't have coords1, to avoid parallel requests
    if (!coords1 || !coords1.lat) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
    }
    loc2 = await geocodeLocation(city2, country2);
  }

  if (loc1.error || loc2.error || !loc1.lat || !loc2.lat) {
    return [];
  }

  const distance = calculateDistance(loc1.lat, loc1.lon, loc2.lat, loc2.lon);
  
  // Only suggest meetups if within reasonable distance (5000km)
  if (distance > 5000) {
    return [];
  }

  // Find midpoint
  const midpoint = findMidpoint(loc1.lat, loc1.lon, loc2.lat, loc2.lon);
  if (!midpoint) {
    return [];
  }

  // Find cities near the midpoint
  // We'll search in a radius around the midpoint
  const candidates = [];
  
  // Search at the midpoint and a couple offset points to find good hub cities
  // Reduced from 5 to 3 points for speed
  const searchPoints = [
    { lat: midpoint.lat, lon: midpoint.lon, weight: 1.0 },
    { lat: midpoint.lat + 0.5, lon: midpoint.lon, weight: 0.8 },
    { lat: midpoint.lat, lon: midpoint.lon + 0.5, weight: 0.8 },
  ];

  for (const point of searchPoints) {
    try {
      const result = await reverseGeocode(point.lat, point.lon);
      if (result && result.city && result.country) {
        // Check if we already have this city
        const existing = candidates.find(c => 
          c.city.toLowerCase() === result.city.toLowerCase() &&
          c.country.toLowerCase() === result.country.toLowerCase()
        );
        
        if (!existing) {
          // Calculate distances from both original locations
          const dist1 = calculateDistance(loc1.lat, loc1.lon, point.lat, point.lon);
          const dist2 = calculateDistance(loc2.lat, loc2.lon, point.lat, point.lon);
          
          candidates.push({
            city: result.city,
            country: result.country,
            displayName: result.displayName,
            lat: point.lat,
            lon: point.lon,
            distanceFrom1: dist1,
            distanceFrom2: dist2,
            totalDistance: dist1 + dist2,
            fairnessScore: Math.abs(dist1 - dist2) / (dist1 + dist2 || 1),
            weight: point.weight
          });
        }
      }
    } catch (error) {
      console.error('Error finding meetup city:', error);
    }
    
    // Reduced delay - 500ms instead of 1000ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Score and sort candidates
  candidates.forEach(candidate => {
    candidate.score = candidate.totalDistance * (1 + candidate.fairnessScore * 0.5) / candidate.weight;
  });

  return candidates
    .sort((a, b) => a.score - b.score)
    .slice(0, 5); // Return top 5 options
}

