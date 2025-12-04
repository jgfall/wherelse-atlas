import { createClient } from '@supabase/supabase-js';

// These will be replaced with your actual Supabase project credentials
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Generate a unique share code (8 characters, URL-safe)
export function generateShareCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ============================================================
// ITINERARY OPERATIONS
// ============================================================

/**
 * Save an itinerary to the database
 * Returns the share code for the itinerary
 */
export async function saveItineraryToCloud(itinerary) {
  const shareCode = generateShareCode();
  
  // Insert the itinerary
  const { data: itinData, error: itinError } = await supabase
    .from('itineraries')
    .insert({
      share_code: shareCode,
      traveler_name: itinerary.travelerName,
      title: itinerary.title || `${itinerary.travelerName}'s Trip`,
    })
    .select()
    .single();
  
  if (itinError) {
    console.error('Error saving itinerary:', itinError);
    throw itinError;
  }
  
  // Insert all legs
  const legsToInsert = itinerary.legs.map((leg, index) => ({
    itinerary_id: itinData.id,
    city: leg.city,
    country: leg.country,
    lat: leg.lat || null,
    lng: leg.lng || null,
    canonical_city: leg.canonicalCity || leg.city,
    canonical_country: leg.canonicalCountry || leg.country,
    start_date: leg.startDate,
    end_date: leg.endDate,
    leg_order: index,
  }));
  
  const { error: legsError } = await supabase
    .from('legs')
    .insert(legsToInsert);
  
  if (legsError) {
    console.error('Error saving legs:', legsError);
    throw legsError;
  }
  
  return { shareCode, itineraryId: itinData.id };
}

/**
 * Load an itinerary by share code
 */
export async function loadItineraryByShareCode(shareCode) {
  const { data: itinData, error: itinError } = await supabase
    .from('itineraries')
    .select(`
      *,
      legs (*)
    `)
    .eq('share_code', shareCode)
    .single();
  
  if (itinError) {
    console.error('Error loading itinerary:', itinError);
    return null;
  }
  
  // Transform to our app's format
  return {
    id: itinData.id,
    shareCode: itinData.share_code,
    travelerName: itinData.traveler_name,
    title: itinData.title,
    legs: itinData.legs
      .sort((a, b) => a.leg_order - b.leg_order)
      .map(leg => ({
        id: leg.id,
        city: leg.city,
        country: leg.country,
        lat: leg.lat,
        lng: leg.lng,
        canonicalCity: leg.canonical_city,
        canonicalCountry: leg.canonical_country,
        startDate: leg.start_date,
        endDate: leg.end_date,
      })),
    createdAt: itinData.created_at,
  };
}

/**
 * Load an itinerary by ID
 */
export async function loadItineraryById(id) {
  const { data: itinData, error: itinError } = await supabase
    .from('itineraries')
    .select(`
      *,
      legs (*)
    `)
    .eq('id', id)
    .single();
  
  if (itinError) {
    console.error('Error loading itinerary:', itinError);
    return null;
  }
  
  return {
    id: itinData.id,
    shareCode: itinData.share_code,
    travelerName: itinData.traveler_name,
    title: itinData.title,
    legs: itinData.legs
      .sort((a, b) => a.leg_order - b.leg_order)
      .map(leg => ({
        id: leg.id,
        city: leg.city,
        country: leg.country,
        lat: leg.lat,
        lng: leg.lng,
        canonicalCity: leg.canonical_city,
        canonicalCountry: leg.canonical_country,
        startDate: leg.start_date,
        endDate: leg.end_date,
      })),
    createdAt: itinData.created_at,
  };
}

/**
 * Update an existing itinerary in the database
 */
export async function updateItineraryInCloud(itineraryId, itinerary) {
  // Update the itinerary metadata
  const { error: itinError } = await supabase
    .from('itineraries')
    .update({
      traveler_name: itinerary.travelerName,
      title: itinerary.title || `${itinerary.travelerName}'s Trip`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', itineraryId);
  
  if (itinError) {
    console.error('Error updating itinerary:', itinError);
    throw itinError;
  }
  
  // Delete all existing legs
  const { error: deleteError } = await supabase
    .from('legs')
    .delete()
    .eq('itinerary_id', itineraryId);
  
  if (deleteError) {
    console.error('Error deleting legs:', deleteError);
    throw deleteError;
  }
  
  // Insert updated legs
  if (itinerary.legs && itinerary.legs.length > 0) {
    const legsToInsert = itinerary.legs.map((leg, index) => ({
      itinerary_id: itineraryId,
      city: leg.city,
      country: leg.country,
      lat: leg.lat || null,
      lng: leg.lng || null,
      canonical_city: leg.canonicalCity || leg.city,
      canonical_country: leg.canonicalCountry || leg.country,
      start_date: leg.startDate,
      end_date: leg.endDate,
      leg_order: index,
    }));
    
    const { error: legsError } = await supabase
      .from('legs')
      .insert(legsToInsert);
    
    if (legsError) {
      console.error('Error updating legs:', legsError);
      throw legsError;
    }
  }
  
  return { success: true };
}

/**
 * Subscribe to real-time updates on an itinerary
 */
export function subscribeToItinerary(itineraryId, callback) {
  const channel = supabase
    .channel(`itinerary:${itineraryId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'itineraries',
        filter: `id=eq.${itineraryId}`,
      },
      async (payload) => {
        // Reload the full itinerary when it changes
        const updated = await loadItineraryById(itineraryId);
        if (updated) callback(updated);
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'legs',
        filter: `itinerary_id=eq.${itineraryId}`,
      },
      async () => {
        // Reload the full itinerary when legs change
        const updated = await loadItineraryById(itineraryId);
        if (updated) callback(updated);
      }
    )
    .subscribe();
  
  return () => {
    supabase.removeChannel(channel);
  };
}

// ============================================================
// SHARED TRIP OPERATIONS
// ============================================================

/**
 * Create a shared trip session (links two itineraries for comparison)
 */
export async function createSharedTrip(itinerary1Id, itinerary2Id = null) {
  const sessionCode = generateShareCode();
  
  const { data, error } = await supabase
    .from('shared_trips')
    .insert({
      session_code: sessionCode,
      itinerary_1_id: itinerary1Id,
      itinerary_2_id: itinerary2Id,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating shared trip:', error);
    throw error;
  }
  
  return { sessionCode, sharedTrip: data };
}

/**
 * Load a shared trip session
 */
export async function loadSharedTrip(sessionCode) {
  const { data, error } = await supabase
    .from('shared_trips')
    .select(`
      *,
      itinerary_1:itineraries!shared_trips_itinerary_1_id_fkey (
        *,
        legs (*)
      ),
      itinerary_2:itineraries!shared_trips_itinerary_2_id_fkey (
        *,
        legs (*)
      )
    `)
    .eq('session_code', sessionCode)
    .single();
  
  if (error) {
    console.error('Error loading shared trip:', error);
    return null;
  }
  
  const transformItinerary = (itin) => {
    if (!itin) return null;
    return {
      id: itin.id,
      shareCode: itin.share_code,
      travelerName: itin.traveler_name,
      title: itin.title,
      legs: itin.legs
        .sort((a, b) => a.leg_order - b.leg_order)
        .map(leg => ({
          id: leg.id,
          city: leg.city,
          country: leg.country,
          lat: leg.lat,
          lng: leg.lng,
          canonicalCity: leg.canonical_city,
          canonicalCountry: leg.canonical_country,
          startDate: leg.start_date,
          endDate: leg.end_date,
        })),
    };
  };
  
  return {
    id: data.id,
    sessionCode: data.session_code,
    itinerary1: transformItinerary(data.itinerary_1),
    itinerary2: transformItinerary(data.itinerary_2),
    createdAt: data.created_at,
  };
}

/**
 * Add the second itinerary to a shared trip
 */
export async function addItineraryToSharedTrip(sessionCode, itineraryId) {
  const { data, error } = await supabase
    .from('shared_trips')
    .update({ itinerary_2_id: itineraryId })
    .eq('session_code', sessionCode)
    .select()
    .single();
  
  if (error) {
    console.error('Error updating shared trip:', error);
    throw error;
  }
  
  return data;
}

/**
 * Subscribe to real-time updates on a shared trip
 */
export function subscribeToSharedTrip(sessionCode, callback) {
  return supabase
    .channel(`shared_trip:${sessionCode}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_trips',
        filter: `session_code=eq.${sessionCode}`,
      },
      callback
    )
    .subscribe();
}

