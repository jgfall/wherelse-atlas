import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapPin, Calendar, Plus, X, Loader2, Users, Sparkles, ArrowRight, ChevronDown, ChevronUp, Upload, Edit2, Trash2, Check } from 'lucide-react';
import TripMap from '../components/TripMap';
import TripTimeline from '../components/TripTimeline';
import LocationAutocomplete from '../components/LocationAutocomplete';
import DateRangePicker from '../components/DateRangePicker';
import { 
  loadItineraryByShareCode, 
  saveItineraryToCloud,
  createSharedTrip,
  loadSharedTrip,
  addItineraryToSharedTrip,
  subscribeToItinerary,
} from '../lib/supabase';
import { geocodeLocation } from '../utils/geocoding';
import { findExcitingMeetups, generateMeetupItinerary, estimateFlightTime } from '../utils/destinations';
import { parseItineraryImage, isValidImageFile, getImagePreviewUrl } from '../utils/imageParser';
import { getAIMeetupRecommendations, getMeetupActivities, suggestDateOptimizations, compareTripsWithAI, getMoreMeetupOptions } from '../utils/aiHelpers';

export default function SharedTrip() {
  const { shareCode } = useParams();
  const navigate = useNavigate();
  
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sharedTrip, setSharedTrip] = useState(null);
  const [primaryItinerary, setPrimaryItinerary] = useState(null);
  const [friendItinerary, setFriendItinerary] = useState(null);
  const [overlaps, setOverlaps] = useState([]);
  
  // Friend's itinerary builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [friendName, setFriendName] = useState('');
  const [friendLegs, setFriendLegs] = useState([]);
  const [isAddingLeg, setIsAddingLeg] = useState(false);
  const [newLegLocation, setNewLegLocation] = useState(null);
  const [newLegDates, setNewLegDates] = useState({ startDate: null, endDate: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState('');
  const [selectedMeetup, setSelectedMeetup] = useState(null);
  const [meetupItinerary, setMeetupItinerary] = useState(null);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [isEditingFriendTrip, setIsEditingFriendTrip] = useState(false);
  const [editingLegId, setEditingLegId] = useState(null);
  const [suggestedMeetup, setSuggestedMeetup] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [primaryCollapsed, setPrimaryCollapsed] = useState(true);
  const [friendCollapsed, setFriendCollapsed] = useState(true);
  const [loadingMoreOptions, setLoadingMoreOptions] = useState(false);
  
  // File upload ref
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  
  // Image upload state
  const [imagePreview, setImagePreview] = useState(null);
  const [parsingImage, setParsingImage] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [processingStep, setProcessingStep] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  
  // Load the shared trip data
  useEffect(() => {
    loadTripData();
  }, [shareCode]);
  
  // Subscribe to real-time updates for the primary itinerary
  useEffect(() => {
    if (!primaryItinerary?.id) return;
    
    console.log('[SharedTrip] Subscribing to real-time updates for itinerary:', primaryItinerary.id);
    
    const unsubscribe = subscribeToItinerary(primaryItinerary.id, (updatedItinerary) => {
      console.log('[SharedTrip] Received real-time update:', updatedItinerary);
      setPrimaryItinerary(updatedItinerary);
    });
    
    return () => {
      console.log('[SharedTrip] Unsubscribing from real-time updates');
      unsubscribe();
    };
  }, [primaryItinerary?.id]);
  
  const loadTripData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First, try to load as a shared trip session
      let trip = await loadSharedTrip(shareCode);
      
      if (trip) {
        setSharedTrip(trip);
        setPrimaryItinerary(trip.itinerary1);
        if (trip.itinerary2) {
          setFriendItinerary(trip.itinerary2);
        }
      } else {
        // Try to load as a single itinerary share code
        const itinerary = await loadItineraryByShareCode(shareCode);
        
        if (itinerary) {
          setPrimaryItinerary(itinerary);
          // Create a shared trip session for this itinerary
          try {
            const { sessionCode, sharedTrip: newSharedTrip } = await createSharedTrip(itinerary.id);
            setSharedTrip({ ...newSharedTrip, sessionCode });
          } catch (e) {
            // If we can't create a shared trip, just show the itinerary
            console.log('Could not create shared trip session');
          }
        } else {
          setError('Trip not found. The link may have expired or be invalid.');
        }
      }
    } catch (err) {
      console.error('Error loading trip:', err);
      setError('Failed to load trip. Please try again.');
    }
    
    setLoading(false);
  };
  
  // Calculate overlaps when both itineraries are loaded
  useEffect(() => {
    if (primaryItinerary && friendItinerary) {
      findOverlapsBetweenTrips();
    }
  }, [primaryItinerary, friendItinerary]);
  
  // Geocode friend's legs in background for map display (during building)
  useEffect(() => {
    const geocodeLegsForMap = async () => {
      const legsToGeocode = friendLegs.filter(leg => !leg.lat || !leg.lng);
      
      for (const leg of legsToGeocode) {
        try {
          // geocodeLocation takes (city, country) as separate args and returns 'lon' not 'lng'
          const result = await geocodeLocation(leg.city, leg.country || '');
          if (result && result.lat && (result.lon || result.lng)) {
            setFriendLegs(prev => prev.map(l => 
              l.id === leg.id ? { ...l, lat: result.lat, lng: result.lon || result.lng } : l
            ));
          }
        } catch (error) {
          console.log(`[Map Geocode] Could not geocode ${leg.city} for map display`);
        }
      }
    };
    
    if (friendLegs.length > 0) {
      geocodeLegsForMap();
    }
  }, [friendLegs.length]); // Only trigger when legs are added/removed
  
  // Geocode itinerary legs for map display (when loaded)
  // Updates incrementally so map shows progress, with delay to avoid rate limits
  useEffect(() => {
    let cancelled = false;
    
    const geocodeItineraryLegs = async () => {
      if (!primaryItinerary?.legs) return;
      
      for (let i = 0; i < primaryItinerary.legs.length; i++) {
        if (cancelled) break;
        const leg = primaryItinerary.legs[i];
        if (!leg.lat || !leg.lng) {
          try {
            const result = await geocodeLocation(leg.city, leg.country || '');
            if (result && result.lat && (result.lon || result.lng) && !cancelled) {
              // Update state incrementally so map shows progress
              setPrimaryItinerary(prev => ({
                ...prev,
                legs: prev.legs.map((l, idx) => 
                  idx === i ? { ...l, lat: result.lat, lng: result.lon || result.lng } : l
                )
              }));
            }
            // Small delay to respect Nominatim rate limits (1 req/sec)
            await new Promise(r => setTimeout(r, 150));
          } catch (error) {
            console.log(`[Map Geocode] Could not geocode ${leg.city}`);
          }
        }
      }
    };
    
    if (primaryItinerary?.id) {
      geocodeItineraryLegs();
    }
    
    return () => { cancelled = true; };
  }, [primaryItinerary?.id]);
  
  // Geocode friend's itinerary separately (same logic)
  // Track if we've started geocoding to avoid duplicate runs
  const friendGeocodingStarted = useRef(false);
  
  useEffect(() => {
    let cancelled = false;
    
    const geocodeItineraryLegs = async () => {
      if (!friendItinerary?.legs || friendItinerary.legs.length === 0) return;
      
      // Check how many legs need geocoding
      const legsNeedingGeocode = friendItinerary.legs.filter(l => !l.lat || !l.lng);
      if (legsNeedingGeocode.length === 0) return;
      
      // Don't re-run if we've already started for this itinerary
      if (friendGeocodingStarted.current) return;
      friendGeocodingStarted.current = true;
      
      console.log(`[Map Geocode] Starting geocoding for ${legsNeedingGeocode.length} of ${friendItinerary.legs.length} friend legs`);
      
      // Get a fresh copy of the legs array
      const legsToProcess = [...friendItinerary.legs];
      
      for (let i = 0; i < legsToProcess.length; i++) {
        if (cancelled) break;
        const leg = legsToProcess[i];
        if (!leg.lat || !leg.lng) {
          try {
            const result = await geocodeLocation(leg.city, leg.country || '');
            if (result && result.lat && (result.lon || result.lng) && !cancelled) {
              console.log(`[Map Geocode] Geocoded ${leg.city}: ${result.lat}, ${result.lon || result.lng}`);
              // Update state incrementally so map shows progress
              setFriendItinerary(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  legs: prev.legs.map((l, idx) => 
                    idx === i ? { ...l, lat: result.lat, lng: result.lon || result.lng } : l
                  )
                };
              });
            }
            // Small delay to respect Nominatim rate limits (1 req/sec)
            await new Promise(r => setTimeout(r, 200));
          } catch (error) {
            console.log(`[Map Geocode] Could not geocode ${leg.city}:`, error);
          }
        }
      }
      
      console.log('[Map Geocode] Finished geocoding friend legs');
    };
    
    if (friendItinerary?.legs?.length > 0) {
      geocodeItineraryLegs();
    }
    
    return () => { 
      cancelled = true;
    };
  }, [friendItinerary?.id, friendItinerary?.legs?.length]);
  
  // Reset geocoding flag when friend itinerary changes
  useEffect(() => {
    friendGeocodingStarted.current = false;
  }, [friendItinerary?.id]);
  
  const findOverlapsBetweenTrips = async () => {
    setAnalyzing(true);
    setAnalysisStep(0);
    
    // Cheeky progress messages
    const progressMessages = [
      { message: "Comparing your calendars... 📅", emoji: "📅" },
      { message: "Checking for cosmic alignment... ✨", emoji: "✨" },
      { message: "Finding where your paths cross... 🗺️", emoji: "🗺️" },
      { message: "Scouting epic meetup spots... 🎯", emoji: "🎯" },
      { message: "Calculating adventure potential... 🚀", emoji: "🚀" },
      { message: "Almost there, this is gonna be good... 🔥", emoji: "🔥" },
    ];
    
    // Start progress animation
    let currentStep = 0;
    const progressInterval = setInterval(() => {
      if (currentStep < progressMessages.length) {
        setAnalysisStep(currentStep);
        setAnalysisMessage(progressMessages[currentStep].message);
        currentStep++;
      }
    }, 800);
    
    try {
      console.log('[SharedTrip] Using AI-powered comparison...');
      
      const result = await compareTripsWithAI(primaryItinerary, friendItinerary);
      
      console.log('[SharedTrip] AI comparison result:', result);
      
      // Clear progress
      clearInterval(progressInterval);
      
      // Store best option summary for display
      setAiAnalysis(result.bestOption);
      
      // Set overlaps from AI result
      let overlapsList = result.overlaps || [];
      
      // Check if trips are too far apart/unrealistic to meet up
      const hasNaturalOverlap = overlapsList.some(o => o.type === 'natural');
      
      // Calculate minimum gap across all suggestions
      const minGap = overlapsList.length > 0 
        ? Math.min(...overlapsList.map(o => o.gapDays || 0))
        : Infinity;
      
      // Check if all suggestions require unrealistic changes
      const allRequireMajorChanges = overlapsList.length > 0 && overlapsList.every(o => 
        o.type !== 'natural' && (
          (o.gapDays || 0) > 60 || // More than 60 days apart
          (o.type === 'near-miss' && (o.gapDays || 0) > 30) // Near-miss with >30 day gap
        )
      );
      
      // If no natural overlaps AND (no suggestions OR all require major changes OR minimum gap >60 days), show easter egg instead
      if (!hasNaturalOverlap && (overlapsList.length === 0 || allRequireMajorChanges || minGap > 60)) {
        // Replace all suggestions with just the easter egg
        const okcSuggestion = {
          id: 'easter-egg-okc',
          type: 'easter-egg',
          priority: 999,
          city: 'Oklahoma City',
          country: 'United States',
          startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
          endDate: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days later
          days: 7,
          gapDays: 0,
          travelers: [primaryItinerary.travelerName, friendItinerary.travelerName],
          traveler1From: {
            city: primaryItinerary.legs[0]?.city || 'Your location',
            country: primaryItinerary.legs[0]?.country || '',
            dates: 'Any time'
          },
          traveler2From: {
            city: friendItinerary.legs[0]?.city || 'Your location',
            country: friendItinerary.legs[0]?.country || '',
            dates: 'Any time'
          },
          whyHere: 'Because sometimes you just need to drop everything and unshelve some Old Records 🎤',
          adjustment: 'No matter how far - it\'s worth it for the karaoke!',
        };
        overlapsList = [okcSuggestion];
        
        // Update the best option summary too
        setAiAnalysis({
          summary: 'Your trips are on completely different schedules, but karaoke is always a good idea!',
          action: 'Meet in Oklahoma City for Cookie\'s 🎤'
        });
      }
      
      setOverlaps(overlapsList);
      
      // Auto-collapse trip cards when we have results
      setPrimaryCollapsed(true);
      setFriendCollapsed(true);
      
    } catch (error) {
      console.error('[SharedTrip] AI comparison failed:', error);
      clearInterval(progressInterval);
      
      // Fallback to simple comparison if AI fails
      setAnalysisMessage('Hmm, trying another approach...');
      await fallbackComparison();
    }
    
    setAnalyzing(false);
    setAnalysisStep(0);
    setAnalysisMessage('');
  };
  
  // Fallback comparison if AI fails (simple version)
  const fallbackComparison = async () => {
    const overlapsFound = [];
    
    // Simple date overlap check
    for (const pLeg of primaryItinerary.legs) {
      for (const fLeg of friendItinerary.legs) {
        const pStart = new Date(pLeg.startDate).getTime();
        const pEnd = new Date(pLeg.endDate).getTime();
        const fStart = new Date(fLeg.startDate).getTime();
        const fEnd = new Date(fLeg.endDate).getTime();
        
        // Check if dates overlap
        if (pStart <= fEnd && fStart <= pEnd) {
          const overlapStart = Math.max(pStart, fStart);
          const overlapEnd = Math.min(pEnd, fEnd);
          const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
          
          // Check if same city
          const sameCity = pLeg.city?.toLowerCase() === fLeg.city?.toLowerCase();
          
          if (sameCity) {
            overlapsFound.push({
              type: 'natural',
              city: pLeg.city,
              country: pLeg.country,
              startDate: new Date(overlapStart).toISOString().split('T')[0],
              endDate: new Date(overlapEnd).toISOString().split('T')[0],
              days,
              travelers: [primaryItinerary.travelerName, friendItinerary.travelerName],
              reason: 'You\'ll both be here at the same time!',
            });
          } else {
            // Different cities - suggest meeting point
            overlapsFound.push({
              type: 'potential',
              city: 'Meet halfway',
              country: '',
              startDate: new Date(overlapStart).toISOString().split('T')[0],
              endDate: new Date(overlapEnd).toISOString().split('T')[0],
              days,
              travelers: [primaryItinerary.travelerName, friendItinerary.travelerName],
              currentLocations: [
                { traveler: primaryItinerary.travelerName, city: pLeg.city, country: pLeg.country },
                { traveler: friendItinerary.travelerName, city: fLeg.city, country: fLeg.country },
              ],
              reason: `During this window, ${primaryItinerary.travelerName} is in ${pLeg.city} and ${friendItinerary.travelerName} is in ${fLeg.city}`,
            });
          }
        }
      }
    }
    
    setOverlaps(overlapsFound);
  };
  
  // Handle location selection
  const handleLocationSelect = (location) => {
    setNewLegLocation(location);
    setShowDatePicker(true);
  };
  
  // Handle date selection
  const handleDateChange = (dates) => {
    console.log('[SharedTrip] DateRangePicker returned:', dates);
    setNewLegDates(dates);
  };
  
  // Add a leg to friend's itinerary
  const addLeg = () => {
    if (!newLegLocation || !newLegDates.startDate || !newLegDates.endDate) return;
    
    const newLeg = {
      id: Date.now(),
      city: newLegLocation.city,
      country: newLegLocation.country,
      lat: newLegLocation.lat,
      lng: newLegLocation.lng,
      canonicalCity: newLegLocation.city,
      canonicalCountry: newLegLocation.country,
      startDate: newLegDates.startDate,
      endDate: newLegDates.endDate,
    };
    
    setFriendLegs(prev => [...prev, newLeg]);
    setNewLegLocation(null);
    setNewLegDates({ startDate: null, endDate: null });
    setShowDatePicker(false);
    setIsAddingLeg(false);
  };
  
  // Remove a leg
  const removeLeg = (legId) => {
    setFriendLegs(prev => prev.filter(leg => leg.id !== legId));
  };
  
  // Cancel adding a leg
  const cancelAddLeg = () => {
    setNewLegLocation(null);
    setNewLegDates({ startDate: null, endDate: null });
    setShowDatePicker(false);
    setIsAddingLeg(false);
  };
  
  // Handle selecting a meetup to plan
  const handleSelectMeetup = async (meetup) => {
    // For potential/compromise meetups, geocode all locations for the map
    let enrichedMeetup = { ...meetup };
    
    if (meetup.type === 'potential' || meetup.type === 'near-miss') {
      // Geocode the meetup city if no coords
      if (!meetup.lat && meetup.city) {
        try {
          const meetupCoords = await geocodeLocation(meetup.city, meetup.country || '');
          if (meetupCoords && meetupCoords.lat) {
            enrichedMeetup.lat = meetupCoords.lat;
            enrichedMeetup.lng = meetupCoords.lon || meetupCoords.lng;
          }
        } catch (e) { console.warn('Failed to geocode meetup location', e); }
      }
      
      // Geocode traveler 1's location if needed
      const t1From = meetup.traveler1From || meetup.traveler1Location;
      if (t1From?.city) {
        const existingLeg = primaryItinerary?.legs?.find(l => 
          l.city?.toLowerCase() === t1From.city?.toLowerCase()
        );
        if (existingLeg?.lat) {
          enrichedMeetup.traveler1From = { ...t1From, lat: existingLeg.lat, lng: existingLeg.lng };
        } else if (!t1From.lat) {
          try {
            const coords = await geocodeLocation(t1From.city, t1From.country || '');
            if (coords && coords.lat) {
              enrichedMeetup.traveler1From = { ...t1From, lat: coords.lat, lng: coords.lon || coords.lng };
            }
          } catch (e) { console.warn('Failed to geocode traveler 1 location', e); }
        }
      }
      
      // Geocode traveler 2's location if needed
      const t2From = meetup.traveler2From || meetup.traveler2Location;
      if (t2From?.city) {
        const existingLeg = friendItinerary?.legs?.find(l => 
          l.city?.toLowerCase() === t2From.city?.toLowerCase()
        );
        if (existingLeg?.lat) {
          enrichedMeetup.traveler2From = { ...t2From, lat: existingLeg.lat, lng: existingLeg.lng };
        } else if (!t2From.lat) {
          try {
            const coords = await geocodeLocation(t2From.city, t2From.country || '');
            if (coords && coords.lat) {
              enrichedMeetup.traveler2From = { ...t2From, lat: coords.lat, lng: coords.lon || coords.lng };
            }
          } catch (e) { console.warn('Failed to geocode traveler 2 location', e); }
        }
      }
    }
    
    setSelectedMeetup(enrichedMeetup);
    setGeneratingItinerary(true);
    
    try {
      const itinerary = await generateMeetupItinerary(
        enrichedMeetup,
        enrichedMeetup.startDate,
        enrichedMeetup.endDate,
        enrichedMeetup.travelers
      );
      
      // Enhance with AI-powered activity suggestions
      const aiActivities = await getMeetupActivities(
        enrichedMeetup.city,
        enrichedMeetup.country,
        { start: enrichedMeetup.startDate, end: enrichedMeetup.endDate },
        enrichedMeetup.travelers
      );
      
      // Merge AI activities with existing suggestions
      itinerary.suggestions = [
        ...(itinerary.suggestions || []),
        ...aiActivities.map(activity => ({
          name: activity.name,
          type: activity.type,
          description: activity.description,
          whyGreat: activity.whyGreat,
          isAI: true
        }))
      ];
      
      setMeetupItinerary(itinerary);
    } catch (error) {
      console.error('Error generating meetup itinerary:', error);
    }
    
    setGeneratingItinerary(false);
  };
  
  // Load more creative meetup options
  const handleLoadMoreOptions = async () => {
    if (!primaryItinerary || !friendItinerary || loadingMoreOptions) return;
    
    setLoadingMoreOptions(true);
    
    try {
      // Get list of cities we already have
      const existingCities = overlaps.map(o => o.city).filter(Boolean);
      
      const result = await getMoreMeetupOptions(primaryItinerary, friendItinerary, existingCities);
      
      if (result.overlaps && result.overlaps.length > 0) {
        // Add new options to the existing list
        setOverlaps(prev => [...prev, ...result.overlaps]);
      }
    } catch (error) {
      console.error('Error loading more options:', error);
    }
    
    setLoadingMoreOptions(false);
  };
  
  // Find best meetup suggestion based on closest overlap window
  const suggestBestMeetup = async () => {
    if (!primaryItinerary || !friendItinerary) return;
    
    setSuggesting(true);
    setSuggestedMeetup(null);
    
    try {
      // Get all date ranges from both itineraries
      const primaryRanges = primaryItinerary.legs.map(leg => ({
        start: new Date(leg.startDate).getTime(),
        end: new Date(leg.endDate).getTime(),
        leg
      }));
      
      const friendRanges = friendItinerary.legs.map(leg => ({
        start: new Date(leg.startDate).getTime(),
        end: new Date(leg.endDate).getTime(),
        leg
      }));
      
      // Find the closest date windows (even if they don't overlap)
      let bestWindow = null;
      let minGap = Infinity;
      
      for (const pRange of primaryRanges) {
        for (const fRange of friendRanges) {
          // Calculate gap between ranges
          let gap = 0;
          let windowStart, windowEnd;
          
          if (pRange.end < fRange.start) {
            // Primary ends before friend starts
            gap = fRange.start - pRange.end;
            windowStart = pRange.end;
            windowEnd = fRange.start;
          } else if (fRange.end < pRange.start) {
            // Friend ends before primary starts
            gap = pRange.start - fRange.end;
            windowStart = fRange.end;
            windowEnd = pRange.start;
          } else {
            // They overlap!
            windowStart = Math.max(pRange.start, fRange.start);
            windowEnd = Math.min(pRange.end, fRange.end);
            gap = 0;
          }
          
          // Convert gap to days
          const gapDays = gap / (1000 * 60 * 60 * 24);
          
          // Prefer windows with smaller gaps or actual overlaps
          if (gapDays < minGap) {
            minGap = gapDays;
            
            // If they overlap, use the overlap window
            // If they don't, suggest a 3-day window in the middle
            if (gap === 0) {
              bestWindow = {
                start: windowStart,
                end: windowEnd,
                primaryLeg: pRange.leg,
                friendLeg: fRange.leg,
                gapDays: 0,
                isOverlap: true
              };
            } else if (gapDays <= 30) {
              // Only suggest if gap is within 30 days
              const midPoint = (windowStart + windowEnd) / 2;
              const suggestedStart = midPoint - (1.5 * 24 * 60 * 60 * 1000); // 1.5 days before midpoint
              const suggestedEnd = midPoint + (1.5 * 24 * 60 * 60 * 1000); // 1.5 days after midpoint
              
              bestWindow = {
                start: suggestedStart,
                end: suggestedEnd,
                primaryLeg: pRange.leg,
                friendLeg: fRange.leg,
                gapDays: gapDays,
                isOverlap: false
              };
            }
          }
        }
      }
      
      if (!bestWindow) {
        setImageError('Could not find a suitable window. Your trips are too far apart.');
        setSuggesting(false);
        return;
      }
      
      // Find exciting meetup destination
      const primaryLeg = bestWindow.primaryLeg;
      const friendLeg = bestWindow.friendLeg;
      
      if (!primaryLeg.lat || !primaryLeg.lng || !friendLeg.lat || !friendLeg.lng) {
        setImageError('Missing location data. Please ensure all destinations have valid coordinates.');
        setSuggesting(false);
        return;
      }
      
      const meetupOptions = await findExcitingMeetups(
        primaryLeg.canonicalCity || primaryLeg.city,
        primaryLeg.canonicalCountry || primaryLeg.country,
        primaryLeg.lat,
        primaryLeg.lng,
        friendLeg.canonicalCity || friendLeg.city,
        friendLeg.canonicalCountry || friendLeg.country,
        friendLeg.lat,
        friendLeg.lng,
        { maxResults: 3, minFairnessRatio: 20 }
      );
      
      if (meetupOptions && meetupOptions.length > 0) {
        // Enhance with AI recommendations
        const aiEnhanced = await getAIMeetupRecommendations(
          primaryLeg,
          friendLeg,
          meetupOptions
        );
        
        const bestOption = aiEnhanced[0];
        
        const suggested = {
          type: 'suggested',
          city: bestOption.city,
          country: bestOption.country,
          lat: bestOption.lat,
          lng: bestOption.lon,
          score: bestOption.score,
          fairnessRatio: bestOption.fairnessRatio,
          aiRank: bestOption.aiRank,
          aiReason: bestOption.aiReason,
          aiHighlights: bestOption.aiHighlights,
          aiBestFor: bestOption.aiBestFor,
          travelers: [primaryItinerary.travelerName, friendItinerary.travelerName],
          currentLocations: [
            { 
              traveler: primaryItinerary.travelerName, 
              city: primaryLeg.city, 
              country: primaryLeg.country,
              lat: primaryLeg.lat,
              lng: primaryLeg.lng
            },
            { 
              traveler: friendItinerary.travelerName, 
              city: friendLeg.city, 
              country: friendLeg.country,
              lat: friendLeg.lat,
              lng: friendLeg.lng
            },
          ],
          startDate: new Date(bestWindow.start).toISOString().split('T')[0],
          endDate: new Date(bestWindow.end).toISOString().split('T')[0],
          days: Math.ceil((bestWindow.end - bestWindow.start) / (1000 * 60 * 60 * 24)) + 1,
          distanceFrom1: bestOption.distanceFrom1,
          distanceFrom2: bestOption.distanceFrom2,
          flightTime1: estimateFlightTime(bestOption.distanceFrom1),
          flightTime2: estimateFlightTime(bestOption.distanceFrom2),
          gapDays: Math.round(bestWindow.gapDays),
          isOverlap: bestWindow.isOverlap,
          note: bestWindow.gapDays > 0 
            ? `Your trips are ${Math.round(bestWindow.gapDays)} days apart. Consider adjusting your dates!`
            : 'Perfect timing!'
        };
        
        setSuggestedMeetup(suggested);
        setOverlaps([suggested]); // Add to overlaps so it shows in the UI
      } else {
        setImageError('Could not find a suitable meetup destination. Try adjusting your travel dates.');
      }
    } catch (error) {
      console.error('Error suggesting meetup:', error);
      setImageError('Failed to generate suggestion. Please try again.');
    }
    
    setSuggesting(false);
  };
  
  // Save friend's itinerary and compare
  const saveAndCompare = async () => {
    if (!friendName.trim() || friendLegs.length === 0) return;
    
    setSaving(true);
    
    try {
      // Save the itinerary to the database
      const { itineraryId } = await saveItineraryToCloud({
        travelerName: friendName,
        legs: friendLegs,
      });
      
      // Link it to the shared trip
      if (sharedTrip?.sessionCode) {
        await addItineraryToSharedTrip(sharedTrip.sessionCode, itineraryId);
      }
      
      // Set the friend itinerary
      setFriendItinerary({
        id: itineraryId,
        travelerName: friendName,
        legs: friendLegs,
      });
      setShowBuilder(false);
      setIsEditingFriendTrip(false);
    } catch (err) {
      console.error('Error saving itinerary:', err);
      alert('Failed to save your trip. Please try again.');
    }
    
    setSaving(false);
  };
  
  // Handle JSON/CSV file upload - instant load, AI validates at comparison time
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        let parsedData;
        
        if (file.name.endsWith('.json')) {
          parsedData = JSON.parse(content);
        } else if (file.name.endsWith('.csv')) {
          // Parse CSV
          const lines = content.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          const legs = lines.slice(1).map((line, idx) => {
            const values = line.split(',').map(v => v.trim());
            const leg = {};
            headers.forEach((header, i) => {
              if (header === 'city') leg.city = values[i];
              else if (header === 'country') leg.country = values[i];
              else if (header === 'startdate' || header === 'start_date' || header === 'start') leg.startDate = values[i];
              else if (header === 'enddate' || header === 'end_date' || header === 'end') leg.endDate = values[i];
            });
            leg.id = Date.now() + idx;
            return leg;
          }).filter(leg => leg.city && leg.country);
          
          parsedData = { legs };
        }
        
        if (parsedData && parsedData.legs) {
          // Load legs instantly - AI will handle validation at comparison time
          const legs = parsedData.legs.map((leg, idx) => ({
            id: leg.id || Date.now() + idx,
            city: leg.city,
            country: leg.country,
            startDate: leg.startDate,
            endDate: leg.endDate,
          }));
          
          setFriendLegs(legs);
          if (parsedData.travelerName) {
            setFriendName(parsedData.travelerName);
          }
          // Clear any existing comparison state
          setFriendItinerary(null);
          setOverlaps([]);
          setSelectedMeetup(null);
          setShowBuilder(true);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please check the format.');
      }
    };
    reader.readAsText(file);
    
    // Reset file input
    event.target.value = '';
  };
  
  // Edit friend's trip (go back to builder mode)
  const editFriendTrip = () => {
    if (friendItinerary) {
      setFriendName(friendItinerary.travelerName);
      setFriendLegs([...friendItinerary.legs]);
      setIsEditingFriendTrip(true);
      setShowBuilder(true);
      setFriendItinerary(null);
      setOverlaps([]);
      setSelectedMeetup(null);
      setMeetupItinerary(null);
    }
  };
  
  // Update a leg in friend's trip
  const updateFriendLeg = (legId, updates) => {
    setFriendLegs(prev => prev.map(leg => 
      leg.id === legId ? { ...leg, ...updates } : leg
    ));
    setEditingLegId(null);
  };
  
  // Delete a leg from friend's trip
  const deleteFriendLeg = (legId) => {
    setFriendLegs(prev => prev.filter(leg => leg.id !== legId));
  };
  
  // Handle image upload for AI parsing
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!isValidImageFile(file)) {
      setImageError('Please upload a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }
    
    await processImage(file);
  };
  
  // Process image with AI
  const processImage = async (file) => {
    setParsingImage(true);
    setImageError(null);
    setImagePreview(getImagePreviewUrl(file));
    setProcessingProgress(0);
    
    // Progress steps - faster since we skip validation
    const steps = [
      { progress: 25, message: 'Analyzing image...' },
      { progress: 50, message: 'Detecting destinations...' },
      { progress: 75, message: 'Extracting dates...' },
      { progress: 95, message: 'Building itinerary...' },
    ];
    
    const STEP_DURATION = 800; // 0.8 seconds per step
    
    let currentStep = 0;
    let progressInterval;
    
    // Start progress animation
    progressInterval = setInterval(() => {
      if (currentStep < steps.length) {
        setProcessingStep(steps[currentStep].message);
        setProcessingProgress(steps[currentStep].progress);
        currentStep++;
      } else {
        clearInterval(progressInterval);
      }
    }, STEP_DURATION);
    
    try {
      // Start the actual API call
      const parsePromise = parseItineraryImage(file);
      
      // Wait for parsing to complete
      const result = await parsePromise;
      
      // Clear interval and complete progress
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setProcessingStep('Complete!');
      setProcessingProgress(100);
      
      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (result.legs && result.legs.length > 0) {
        setFriendLegs(result.legs);
        if (result.travelerName) {
          setFriendName(result.travelerName);
        }
        setShowBuilder(true);
        setImagePreview(null);
        setProcessingStep('');
        setProcessingProgress(0);
      } else {
        setImageError('Could not find any travel itinerary in this image. Try a clearer photo or enter manually.');
        setProcessingStep('');
        setProcessingProgress(0);
      }
    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      console.error('Error processing image:', error);
      setImageError(error.message || 'Failed to process image. Please try again.');
      setProcessingStep('');
      setProcessingProgress(0);
    }
    
    setParsingImage(false);
  };
  
  // Format date helper - natural language with ordinals
  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = getOrdinal(date.getDate());
    return `${month} ${day}`;
  };
  
  const formatDateLong = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = getOrdinal(date.getDate());
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
  };
  
  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = getOrdinal(date.getDate());
    return `${month} ${day}`;
  };
  
  // Get trip summary for collapsed view
  const getTripSummary = (legs) => {
    if (!legs || legs.length === 0) return '';
    const allCountries = [...new Set(legs.map(l => l.country))];
    const countriesToShow = allCountries.slice(0, 3);
    const remainingCountryCount = allCountries.length - countriesToShow.length;
    let countryText = countriesToShow.join(', ');
    if (remainingCountryCount > 0) {
      countryText += ` and ${remainingCountryCount} more`;
    }
    const startDate = formatDateShort(legs[0].startDate);
    const endDate = formatDateShort(legs[legs.length - 1].endDate);
    return `${startDate} → ${endDate} • ${countryText} `;
  };
  
  // Get suggested start date for new leg (end of last leg)
  const getSuggestedStartDate = () => {
    if (friendLegs.length > 0) {
      return friendLegs[friendLegs.length - 1].endDate;
    }
    return null;
  };
  
  // Leg Edit Form Component - saves instantly, AI validates at comparison
  const LegEditForm = ({ leg, onSave, onCancel, suggestedStartDate, allLegs = [] }) => {
    const [editLocation, setEditLocation] = useState({ 
      city: leg.city, 
      country: leg.country,
      lat: leg.lat || null,
      lng: leg.lng || null
    });
    const [editDates, setEditDates] = useState({ startDate: leg.startDate, endDate: leg.endDate });

    const handleSave = () => {
      if (!editLocation.city || !editDates.startDate || !editDates.endDate) return;
      
      onSave({
        city: editLocation.city,
        country: editLocation.country,
        startDate: editDates.startDate,
        endDate: editDates.endDate,
        lat: editLocation.lat,
        lng: editLocation.lng,
        isValid: true, // Mark as valid since user selected from autocomplete
        isValidating: false,
        validationError: null,
      });
    };

    return (
      <div className="p-4 bg-wherelse-charcoal-dark rounded-lg border-2 border-wherelse-yellow animate-scale-in">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-wherelse-cream opacity-60 mb-1 block">Location</label>
            <LocationAutocomplete
              onSelect={(loc) => {
                if (loc) {
                  setEditLocation({ 
                    city: loc.city, 
                    country: loc.country,
                    lat: loc.lat,
                    lng: loc.lng
                  });
                }
              }}
              placeholder="Search for a city..."
              initialValue={editLocation}
            />
          </div>
          <div>
            <label className="text-xs text-wherelse-cream opacity-60 mb-1 block">Dates</label>
            <DateRangePicker
              startDate={editDates.startDate}
              endDate={editDates.endDate}
              onRangeSelect={setEditDates}
              suggestedStartDate={suggestedStartDate}
              blockedRanges={allLegs
                .filter(l => l.id !== leg.id)
                .map(l => ({
                  startDate: l.startDate,
                  endDate: l.endDate
                }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={!editLocation.city || !editDates.startDate || !editDates.endDate}
              className="btn-primary flex-1 py-2 text-sm disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="btn-secondary py-2 px-3 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-wherelse-charcoal flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-wherelse-yellow animate-spin mx-auto mb-4" />
          <p className="text-wherelse-cream/70 font-body">Loading trip...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-wherelse-charcoal flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🗺️</div>
          <h1 className="headline-xl text-3xl text-wherelse-cream mb-2">Trip Not Found</h1>
          <p className="text-wherelse-cream/70 font-body mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary"
          >
            Create Your Own Trip
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-wherelse-charcoal">
      {/* Header */}
      <header className="border-b border-wherelse-cream/10 bg-wherelse-charcoal-dark/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-2xl">🗺️</span>
            <span className="brand-text text-wherelse-cream text-xl">
              WHERELSE
            </span>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-wherelse-cream/70 hover:text-wherelse-cream text-sm font-body flex items-center gap-1"
          >
            Create Your Own Trip
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </header>
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-4 h-4 rounded-full bg-wherelse-yellow"></div>
            <p className="brand-text text-wherelse-cream/60 tracking-wider">SHARED TRIP</p>
          </div>
          <h1 className="headline-xl text-4xl md:text-5xl text-wherelse-cream mb-2">
            {primaryItinerary?.travelerName?.toUpperCase()}'S
            <br />
            <span className="text-wherelse-yellow">ADVENTURE</span>
          </h1>
          <p className="text-wherelse-cream/60 font-body text-lg">
            {primaryItinerary?.legs?.length} destinations • {formatDateLong(primaryItinerary?.legs?.[0]?.startDate)} → {formatDateLong(primaryItinerary?.legs?.[primaryItinerary?.legs?.length - 1]?.endDate)}
          </p>
        </div>
        
        {/* Map */}
       
        
        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Primary Itinerary */}
          <div className="card-olive p-6">
            
            <div 
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setPrimaryCollapsed(!primaryCollapsed)}
            >
              <div className="flex items-center gap-3">
                
                <div className="w-8 h-8 rounded-full bg-wherelse-yellow flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-wherelse-charcoal" />
                </div>
                <div>
                  
                  <h3 className="brand-text text-lg">{primaryItinerary?.travelerName?.toUpperCase()}'s Trip • {primaryItinerary?.legs?.length} stops</h3>
{/* Date range and countries */}
<p className="text-xs opacity-50 font-mono">
                  {getTripSummary(primaryItinerary.legs)}
                </p>
                </div>
              </div>
              <button className="p-2 opacity-60 hover:opacity-100 transition-opacity">
                {primaryCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
            </div>
            
            {/* Collapsed summary - rich view with map */}
            {primaryCollapsed && primaryItinerary?.legs && (
              <div className="mt-4 space-y-3">
                {/* Timeline */}
                <TripTimeline legs={primaryItinerary.legs} height="80px" showLabels={false} />
                
                {/* Individual map for primary traveler's trip */}
                <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
                  <TripMap 
                    itineraries={[primaryItinerary]}
                    overlaps={[]}
                    height="280px"
                  />
                </div>
              </div>
            )}
            
            {/* Expanded leg list */}
            {!primaryCollapsed && (
              <div className="space-y-4 mt-6">
                {primaryItinerary?.legs.map((leg, idx) => (
                  <div key={leg.id || idx} className="flex items-start gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-wherelse-charcoal/20 flex items-center justify-center font-mono text-sm font-bold">
                        {String(idx + 1).padStart(2, '0')}
                      </div>
                      {idx < primaryItinerary.legs.length - 1 && (
                        <div className="w-0.5 h-8 bg-wherelse-charcoal/20 my-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <h4 className="font-body font-semibold text-lg">{leg.city}</h4>
                      <p className="text-sm opacity-70">{leg.country}</p>
                      <p className="text-xs font-mono opacity-50 mt-1">
                        {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Friend's Section */}
          {friendItinerary ? (
            // Show friend's completed itinerary - distinct blue-slate styling
            <div 
              className="p-6 rounded-lg"
              style={{ 
                background: 'linear-gradient(135deg, #4A5568 0%, #2D3748 100%)',
                color: '#F7F3E9'
              }}
            >
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setFriendCollapsed(!friendCollapsed)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-wherelse-blue flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="brand-text text-lg text-wherelse-cream">{friendItinerary.travelerName.toUpperCase()}'S TRIP • {friendItinerary.legs.length} STOPS</h3>
                    <p className="text-xs text-wherelse-cream/50 font-mono">
                      {getTripSummary(friendItinerary.legs)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); editFriendTrip(); }}
                    className="p-2 text-wherelse-cream/50 hover:text-wherelse-cream transition-colors"
                    title="Edit your trip"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button className="p-2 text-wherelse-cream/60 hover:text-wherelse-cream transition-opacity">
                    {friendCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              
              {/* Collapsed summary - rich view with map */}
              {friendCollapsed && friendItinerary?.legs && (
                <div className="mt-4 space-y-3">
                  {/* Timeline */}
                  <TripTimeline legs={friendItinerary.legs} height="80px" showLabels={false} />
                  
                  {/* Individual map for friend's trip */}
                  <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
                    <TripMap 
                      itineraries={[friendItinerary]}
                      overlaps={[]}
                      height="280px"
                    />
                  </div>
                </div>
              )}
              
              {/* Expanded leg list */}
              {!friendCollapsed && (
                <>
                  <div className="space-y-4 mt-6">
                    {friendItinerary.legs.map((leg, idx) => (
                      <div key={leg.id || idx} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-wherelse-blue/30 flex items-center justify-center font-mono text-sm font-bold text-wherelse-cream">
                            {String(idx + 1).padStart(2, '0')}
                          </div>
                          {idx < friendItinerary.legs.length - 1 && (
                            <div className="w-0.5 h-8 bg-wherelse-cream/20 my-1"></div>
                          )}
                        </div>
                        <div className="flex-1 pb-2">
                          <h4 className="font-body font-semibold text-lg text-wherelse-cream">{leg.city}</h4>
                          <p className="text-sm text-wherelse-cream/70">{leg.country}</p>
                          <p className="text-xs font-mono text-wherelse-cream/50 mt-1">
                            {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Edit button at bottom */}
                  <button
                    onClick={editFriendTrip}
                    className="w-full mt-6 py-3 border border-wherelse-cream/30 text-wherelse-cream rounded-lg hover:bg-wherelse-cream/10 transition-colors font-body flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit My Trip
                  </button>
                </>
              )}
            </div>
          ) : showBuilder ? (
            // Trip Builder
            <div className="dark-glass p-6 border border-wherelse-cream/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="brand-text text-lg text-wherelse-cream">ADD YOUR TRIP</h3>
                <button 
                  onClick={() => { setShowBuilder(false); setFriendLegs([]); setFriendName(''); }}
                  className="text-wherelse-cream/50 hover:text-wherelse-cream"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Hidden file inputs */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json,.csv"
                className="hidden"
              />
              <input
                type="file"
                ref={imageInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              
              {/* Image parsing progress - enhanced view */}
              {parsingImage && (
                <div className="mb-6 animate-fade-in">
                  <div className="mb-3">
                    <h4 className="brand-text text-wherelse-cream text-sm mb-1">READING YOUR ITINERARY</h4>
                  </div>
                  
                  {/* Image Preview with overlay */}
                  {imagePreview && (
                    <div className="relative mb-4 rounded-xl overflow-hidden border-2 border-wherelse-cream/20 shadow-lg">
                      <img 
                        src={imagePreview} 
                        alt="Processing" 
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-wherelse-charcoal/80 via-wherelse-charcoal/40 to-transparent flex items-end">
                        <div className="w-full p-4">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="relative">
                              <div className="w-10 h-10 rounded-full border-4 border-wherelse-yellow/30"></div>
                              <div className="absolute inset-0 w-10 h-10 rounded-full border-4 border-transparent border-t-wherelse-yellow animate-spin"></div>
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-wherelse-cream font-body font-medium text-sm">
                                {processingStep || 'Processing...'}
                              </p>
                              <div className="mt-1 h-1.5 bg-wherelse-charcoal/30 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-wherelse-yellow rounded-full transition-all duration-300 ease-out"
                                  style={{ width: `${processingProgress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Processing Steps */}
                  <div className="space-y-1.5">
                    {[
                      { step: 'Analyzing image...', threshold: 25 },
                      { step: 'Detecting destinations...', threshold: 50 },
                      { step: 'Extracting dates...', threshold: 75 },
                      { step: 'Building itinerary...', threshold: 95 },
                    ].map((item, idx) => {
                      const isComplete = processingProgress >= item.threshold;
                      const isActive = processingProgress >= item.threshold - 20 && processingProgress < item.threshold;
                      
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center gap-2 p-2 rounded-lg transition-all duration-300 ${
                            isComplete 
                              ? 'bg-wherelse-cream/20' 
                              : isActive
                                ? 'bg-wherelse-cream/10'
                                : 'bg-wherelse-cream/5'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isComplete 
                              ? 'bg-wherelse-yellow text-wherelse-charcoal' 
                              : isActive
                                ? 'bg-wherelse-cream/30'
                                : 'bg-wherelse-cream/10'
                          }`}>
                            {isComplete ? (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="text-xs font-mono text-wherelse-cream/50">{idx + 1}</span>
                            )}
                          </div>
                          <span className={`text-xs font-body ${
                            isComplete ? 'text-wherelse-cream' : isActive ? 'text-wherelse-cream/70' : 'text-wherelse-cream/40'
                          }`}>
                            {item.step}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Image error */}
              {imageError && (
                <div className="mb-6 p-4 bg-wherelse-red/20 rounded-lg border border-wherelse-red/30">
                  <p className="text-wherelse-red text-sm font-body">{imageError}</p>
                  <button
                    onClick={() => setImageError(null)}
                    className="text-wherelse-red/70 text-xs mt-2 hover:text-wherelse-red"
                  >
                    Dismiss
                  </button>
                </div>
              )}
              
              {/* Name Input */}
              <div className="mb-6">
                <label className="block text-wherelse-cream/70 text-sm font-body mb-2">Your Name</label>
                <input
                  type="text"
                  value={friendName}
                  onChange={(e) => setFriendName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-wherelse-charcoal-dark border border-wherelse-cream/20 rounded-lg text-wherelse-cream placeholder-wherelse-cream/30 focus:border-wherelse-yellow focus:outline-none font-body"
                />
              </div>
              
              {/* Quick Import Options */}
              {friendLegs.length === 0 && !parsingImage && (
                <div className="mb-6 p-4 bg-wherelse-charcoal rounded-lg border border-wherelse-cream/10">
                  <p className="text-wherelse-cream/70 text-sm font-body mb-3">Quick import:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 bg-wherelse-yellow/10 border border-wherelse-yellow/30 rounded-lg text-wherelse-yellow text-sm font-body hover:bg-wherelse-yellow/20 transition-colors"
                    >
                      📷 Upload Photo
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 bg-wherelse-cream/5 border border-wherelse-cream/20 rounded-lg text-wherelse-cream/70 text-sm font-body hover:bg-wherelse-cream/10 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      JSON/CSV
                    </button>
                  </div>
                  <p className="text-wherelse-cream/40 text-xs font-body mt-2">
                    📷 Our AI can read screenshots, photos of booking confirmations, or handwritten itineraries
                  </p>
                </div>
              )}
              
              {/* Geocoding Progress */}
              {geocodingProgress && (
                <div className="mb-4 p-3 bg-wherelse-yellow/10 rounded-lg border border-wherelse-yellow/20 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-wherelse-yellow" />
                  <p className="text-wherelse-yellow text-sm font-mono">{geocodingProgress}</p>
                </div>
              )}
              
              {/* Added Legs */}
              {friendLegs.length > 0 && (
                <div className="mb-6 space-y-3">
                  <p className="text-wherelse-cream/70 text-sm font-body">Your destinations:</p>
                  {friendLegs.map((leg, idx) => (
                    editingLegId === leg.id ? (
                      // Edit Form
                      <LegEditForm
                        key={leg.id}
                        leg={leg}
                        allLegs={friendLegs}
                        onSave={(updated) => updateFriendLeg(leg.id, updated)}
                        onCancel={() => setEditingLegId(null)}
                        suggestedStartDate={idx > 0 ? friendLegs[idx - 1].endDate : null}
                      />
                    ) : (
                      // Display Card - simple, no validation states
                      <div 
                        key={leg.id} 
                        className="flex items-center gap-3 p-3 rounded-lg group transition-colors bg-wherelse-charcoal"
                      >
                        <div className="w-7 h-7 rounded-full flex items-center justify-center font-mono text-xs font-bold bg-wherelse-blue/20 text-wherelse-blue">
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className="flex-1">
                          <p className="font-body font-medium text-wherelse-cream">
                            {leg.city}, {leg.country}
                          </p>
                          <p className="text-wherelse-cream/50 text-xs font-mono">
                            {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEditingLegId(leg.id)}
                            className="p-1 text-wherelse-cream/30 hover:text-wherelse-yellow transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeLeg(leg.id)}
                            className="p-1 text-wherelse-cream/30 hover:text-wherelse-red transition-colors"
                            title="Delete"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
              
              {/* Add New Leg */}
              {!isAddingLeg ? (
                <button
                  onClick={() => setIsAddingLeg(true)}
                  className="w-full py-3 border-2 border-dashed border-wherelse-cream/20 rounded-lg text-wherelse-cream/60 hover:border-wherelse-yellow hover:text-wherelse-yellow transition-colors flex items-center justify-center gap-2 font-body"
                >
                  <Plus className="w-4 h-4" />
                  Add Destination
                </button>
              ) : (
                <div className="space-y-4 p-4 bg-wherelse-charcoal rounded-lg border border-wherelse-cream/10">
                  {/* Location Search */}
                  <div>
                    <label className="block text-wherelse-cream/70 text-sm font-body mb-2">
                      <MapPin className="w-4 h-4 inline mr-1" />
                      Where are you going?
                    </label>
                    <LocationAutocomplete
                      onSelect={handleLocationSelect}
                      initialValue={newLegLocation}
                      placeholder="Search for a city..."
                    />
                  </div>
                  
                  {/* Selected Location & Date Picker */}
                  {newLegLocation && (
                    <>
                      <div className="p-3 bg-wherelse-blue/10 rounded-lg border border-wherelse-blue/20">
                        <p className="text-wherelse-cream font-body font-medium">{newLegLocation.city}</p>
                        <p className="text-wherelse-cream/60 text-sm">{newLegLocation.country}</p>
                      </div>
                      
                      <div>
                        <label className="block text-wherelse-cream/70 text-sm font-body mb-2">
                          <Calendar className="w-4 h-4 inline mr-1" />
                          When will you be there?
                        </label>
                        <DateRangePicker
                          startDate={newLegDates.startDate}
                          endDate={newLegDates.endDate}
                          onRangeSelect={handleDateChange}
                          suggestedStartDate={getSuggestedStartDate()}
                          blockedRanges={friendLegs.map(leg => ({
                            startDate: leg.startDate,
                            endDate: leg.endDate
                          }))}
                        />
                      </div>
                      
                      {/* Selected Dates Summary */}
                      {newLegDates.startDate && newLegDates.endDate ? (
                        <div className="p-3 bg-wherelse-yellow/10 rounded-lg border border-wherelse-yellow/20">
                          <p className="text-wherelse-cream text-sm font-mono">
                            {formatDateLong(newLegDates.startDate)} → {formatDateLong(newLegDates.endDate)}
                          </p>
                        </div>
                      ) : newLegDates.startDate || newLegDates.endDate ? (
                        <div className="p-3 bg-wherelse-charcoal/50 rounded-lg border border-wherelse-cream/10">
                          <p className="text-wherelse-cream/50 text-xs font-mono">
                            Select end date to complete
                          </p>
                        </div>
                      ) : null}
                    </>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={cancelAddLeg}
                      className="flex-1 py-2.5 border border-wherelse-cream/20 text-wherelse-cream/70 rounded-lg hover:bg-wherelse-cream/5 transition-colors font-body"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newLegLocation && newLegDates?.startDate && newLegDates?.endDate) {
                          addLeg();
                        } else {
                          console.log('[SharedTrip] Cannot add - missing:', {
                            location: !!newLegLocation,
                            startDate: !!newLegDates?.startDate,
                            endDate: !!newLegDates?.endDate,
                            fullDates: newLegDates
                          });
                        }
                      }}
                      className={`flex-1 py-2.5 rounded-lg transition-all font-body font-medium ${
                        newLegLocation && newLegDates?.startDate && newLegDates?.endDate
                          ? 'bg-wherelse-blue text-white hover:bg-wherelse-blue/90 cursor-pointer active:scale-95 shadow-lg shadow-wherelse-blue/20'
                          : 'bg-wherelse-charcoal/30 text-wherelse-cream/30 cursor-not-allowed'
                      }`}
                    >
                      {newLegLocation && newLegDates?.startDate && newLegDates?.endDate
                        ? '✓ Add Destination'
                        : 'Select dates to add'}
                    </button>
                  </div>
                </div>
              )}
              
              {/* Compare Button */}
              {friendLegs.length > 0 && !isAddingLeg && (
                <button
                  onClick={saveAndCompare}
                  disabled={!friendName.trim() || saving}
                  className="w-full mt-6 py-4 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed brand-text text-lg flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Users className="w-5 h-5" />
                      FIND OVERLAPS
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            // CTA to start adding trip
            <div className="card-yellow p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
              {parsingImage ? (
                // Image Processing View
                <div className="w-full max-w-md animate-fade-in">
                  <div className="mb-6">
                    <h3 className="headline-xl text-2xl text-wherelse-charcoal mb-2">
                      READING YOUR ITINERARY
                    </h3>
                    <p className="text-wherelse-charcoal/60 font-body text-sm">
                      AI is analyzing your image...
                    </p>
                  </div>
                  
                  {/* Image Preview */}
                  {imagePreview && (
                    <div className="relative mb-6 rounded-xl overflow-hidden border-4 border-wherelse-yellow/30 shadow-2xl">
                      <img 
                        src={imagePreview} 
                        alt="Processing" 
                        className="w-full h-64 object-cover"
                      />
                      {/* Overlay with processing indicator */}
                      <div className="absolute inset-0 bg-gradient-to-t from-wherelse-charcoal/80 via-wherelse-charcoal/40 to-transparent flex items-end">
                        <div className="w-full p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative">
                              <div className="w-12 h-12 rounded-full border-4 border-wherelse-yellow/30"></div>
                              <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-t-wherelse-yellow animate-spin"></div>
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-wherelse-cream font-body font-medium text-sm">
                                {processingStep || 'Processing...'}
                              </p>
                              <div className="mt-1 h-1.5 bg-wherelse-charcoal/30 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-wherelse-yellow rounded-full transition-all duration-300 ease-out"
                                  style={{ width: `${processingProgress}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Processing Steps Animation */}
                  <div className="space-y-2">
                    {[
                      'Analyzing image structure...',
                      'Detecting text and dates...',
                      'Identifying destinations...',
                      'Extracting travel details...',
                      'Finalizing itinerary...'
                    ].map((step, idx) => {
                      const stepProgress = (idx + 1) * 20;
                      const isActive = processingProgress >= stepProgress - 5;
                      const isComplete = processingProgress >= stepProgress;
                      
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${
                            isComplete 
                              ? 'bg-wherelse-yellow/20 text-wherelse-charcoal' 
                              : isActive
                                ? 'bg-wherelse-charcoal/20 text-wherelse-charcoal/70'
                                : 'bg-wherelse-charcoal/5 text-wherelse-charcoal/30'
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isComplete 
                              ? 'bg-wherelse-yellow' 
                              : isActive
                                ? 'bg-wherelse-yellow/50 animate-pulse'
                                : 'bg-wherelse-charcoal/20'
                          }`}>
                            {isComplete ? (
                              <Check className="w-4 h-4 text-wherelse-charcoal" />
                            ) : isActive ? (
                              <Loader2 className="w-3 h-3 text-wherelse-charcoal animate-spin" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-wherelse-charcoal/30" />
                            )}
                          </div>
                          <p className={`text-sm font-body flex-1 text-left ${
                            isComplete 
                              ? 'font-medium' 
                              : isActive
                                ? ''
                                : 'opacity-50'
                          }`}>
                            {step}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Default CTA View
                <>
                  <div className="w-20 h-20 bg-wherelse-charcoal/10 rounded-full flex items-center justify-center mb-6">
                    <Users className="w-10 h-10 text-wherelse-charcoal" />
                  </div>
                  <h3 className="headline-xl text-3xl text-wherelse-charcoal mb-3">
                    YOUR TURN!
                  </h3>
                  <p className="text-wherelse-charcoal/70 font-body mb-6 max-w-xs">
                    Add your travel plans to find where you and {primaryItinerary?.travelerName} can meet up.
                  </p>
                  
                  {/* Hidden file inputs for CTA */}
                  <input
                    type="file"
                    id="cta-image-input"
                    onChange={handleImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <input
                    type="file"
                    id="cta-file-input"
                    onChange={handleFileUpload}
                    accept=".json,.csv"
                    className="hidden"
                  />
                  
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                      onClick={() => setShowBuilder(true)}
                      className="w-full px-6 py-4 bg-wherelse-charcoal text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal-dark transition-colors brand-text text-lg flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5" />
                      ADD MANUALLY
                    </button>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => document.getElementById('cta-image-input')?.click()}
                        className="flex-1 px-4 py-3 bg-wherelse-charcoal/80 text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal transition-colors font-body text-sm flex items-center justify-center gap-2"
                      >
                        📷 Upload Photo
                      </button>
                      <button
                        onClick={() => document.getElementById('cta-file-input')?.click()}
                        className="flex-1 px-4 py-3 bg-wherelse-charcoal/80 text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal transition-colors font-body text-sm flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Import
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-wherelse-charcoal/50 text-xs font-body mt-4 max-w-xs text-center">
                    AI can read screenshots, booking confirmations, or photos of your itinerary
                  </p>
                </>
              )}
              
              {/* Error Display */}
              {imageError && (
                <div className="mt-6 w-full max-w-md p-4 bg-wherelse-red/20 rounded-lg border border-wherelse-red/30 animate-fade-in">
                  <p className="text-wherelse-red text-sm font-body mb-2">{imageError}</p>
                  <button
                    onClick={() => {
                      setImageError(null);
                      setImagePreview(null);
                      setParsingImage(false);
                      setProcessingStep('');
                      setProcessingProgress(0);
                    }}
                    className="text-wherelse-red/70 text-xs hover:text-wherelse-red"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Overlaps Section */}
        {friendItinerary && (
          <div className="mt-12">
            <div className="flex items-center gap-3 mb-6">
              <Sparkles className="w-6 h-6 text-wherelse-yellow" />
              <h2 className="headline-xl text-3xl text-wherelse-cream">
                {analyzing ? 'FINDING ADVENTURES...' : 'MEETUP OPPORTUNITIES'}
              </h2>
            </div>
            
            {analyzing ? (
              <div className="card-olive p-8 md:p-12">
                {/* Fun animated progress */}
                <div className="max-w-md mx-auto">
                  {/* Animated emoji */}
                  <div className="text-6xl mb-6 animate-bounce text-center">
                    {['📅', '✨', '🗺️', '🎯', '🚀', '🔥'][analysisStep] || '🔍'}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="h-2 bg-wherelse-charcoal/20 rounded-full mb-4 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-wherelse-yellow to-wherelse-blue rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.min(((analysisStep + 1) / 6) * 100, 95)}%` }}
                    />
                  </div>
                  
                  {/* Message */}
                  <p className="text-wherelse-charcoal font-body text-lg text-center mb-2 transition-all">
                    {analysisMessage || 'Getting started...'}
                  </p>
                  
                  {/* Sub-message */}
                  <p className="text-wherelse-charcoal/50 text-sm font-body text-center">
                    Hang tight, we're finding the magic ✨
                  </p>
                </div>
              </div>
            ) : overlaps.length > 0 ? (
              <div className="space-y-6">
                {/* Best option summary banner */}
                {aiAnalysis && (
                  <div className="p-4 rounded-xl bg-wherelse-yellow/10 border border-wherelse-yellow/30 mb-6">
                    <p className="text-wherelse-cream font-body text-lg">
                      <span className="text-wherelse-yellow">✨ Best bet:</span> {aiAnalysis.summary}
                    </p>
                    {aiAnalysis.action && (
                      <p className="text-wherelse-cream/60 text-sm font-body mt-1">
                        💡 {aiAnalysis.action}
                      </p>
                    )}
                  </div>
                )}
                
                {/* All meetup options */}
                <div>
                  <p className="brand-text text-wherelse-yellow text-sm mb-4">
                    🗺️ YOUR OPTIONS
                  </p>
                  
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {overlaps.map((overlap, idx) => (
                      <div 
                        key={`meetup-${idx}`}
                        onClick={() => handleSelectMeetup(overlap)}
                        className={`p-5 rounded-xl cursor-pointer transition-all hover:scale-[1.02] ${
                          selectedMeetup?.id === overlap.id 
                            ? 'bg-wherelse-yellow text-wherelse-charcoal ring-4 ring-wherelse-yellow/30' 
                            : overlap.type === 'easter-egg'
                              ? 'bg-gradient-to-br from-purple-600/60 to-pink-600/60 border-2 border-purple-400/50 hover:shadow-lg text-wherelse-cream'
                              : 'card-cream hover:shadow-lg'
                        }`}
                      >
                        {/* Header with type badge */}
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                            overlap.type === 'easter-egg' ? 'bg-purple-400/30' : 'bg-wherelse-charcoal/10'
                          }`}>
                            {overlap.type === 'easter-egg' ? '🍪' : overlap.type === 'natural' ? '🎉' : overlap.type === 'potential' ? '✈️' : '📅'}
                          </div>
                          <span className={`text-xs font-mono px-2 py-1 rounded-full ${
                            selectedMeetup?.id === overlap.id 
                              ? 'bg-wherelse-charcoal/20 text-wherelse-charcoal' 
                              : overlap.type === 'easter-egg' ? 'bg-purple-400/30 text-wherelse-cream border border-purple-300/50'
                              : overlap.type === 'natural' ? 'bg-green-500/20 text-green-600' 
                              : overlap.type === 'potential' ? 'bg-wherelse-yellow/20 text-wherelse-yellow'
                              : 'bg-wherelse-blue/20 text-wherelse-blue'
                          }`}>
                            {overlap.type === 'easter-egg' ? '🎤 KARAOKE TIME' : overlap.type === 'natural' ? 'DIRECT OVERLAP' : overlap.type === 'potential' ? 'GREAT OPTION' : `${overlap.gapDays || 0} DAYS APART`}
                          </span>
                        </div>
                        
                        {/* City name */}
                        <h4 className={`headline-xl text-xl mb-1 ${
                          selectedMeetup?.id === overlap.id 
                            ? '' 
                            : overlap.type === 'easter-egg' 
                              ? 'text-wherelse-cream' 
                              : 'text-wherelse-charcoal'
                        }`}>
                          {overlap.city?.toUpperCase()}
                        </h4>
                        <p className={`font-body text-sm mb-3 ${
                          selectedMeetup?.id === overlap.id 
                            ? 'opacity-70' 
                            : overlap.type === 'easter-egg'
                              ? 'text-wherelse-cream/80'
                              : 'text-wherelse-charcoal/60'
                        }`}>
                          {overlap.country}
                        </p>
                        
                        {/* Why here */}
                        {overlap.whyHere && (
                          <p className={`text-sm font-body mb-3 ${
                            selectedMeetup?.id === overlap.id 
                              ? 'opacity-80' 
                              : overlap.type === 'easter-egg'
                                ? 'text-wherelse-cream/90 italic'
                                : 'text-wherelse-charcoal/70'
                          }`}>
                            {overlap.whyHere}
                          </p>
                        )}
                        
                        {/* Where each person is coming from */}
                        <div className={`space-y-1 text-xs mb-3 ${
                          selectedMeetup?.id === overlap.id 
                            ? 'opacity-80' 
                            : overlap.type === 'easter-egg'
                              ? 'text-wherelse-cream/80'
                              : 'text-wherelse-charcoal/70'
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-wherelse-yellow text-wherelse-charcoal text-xs flex items-center justify-center font-bold">
                              {overlap.travelers?.[0]?.[0] || 'J'}
                            </span>
                            <span>from {overlap.traveler1From?.city || '...'}</span>
                            {overlap.traveler1From?.dates && (
                              <span className="opacity-60">({overlap.traveler1From.dates})</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-wherelse-blue text-white text-xs flex items-center justify-center font-bold">
                              {overlap.travelers?.[1]?.[0] || 'C'}
                            </span>
                            <span>from {overlap.traveler2From?.city || '...'}</span>
                            {overlap.traveler2From?.dates && (
                              <span className="opacity-60">({overlap.traveler2From.dates})</span>
                            )}
                          </div>
                        </div>
                        
                        {/* Adjustment needed */}
                        {overlap.adjustment && overlap.type !== 'natural' && (
                          <div className={`p-2 rounded-lg text-xs mb-3 ${
                            selectedMeetup?.id === overlap.id 
                              ? 'bg-wherelse-charcoal/10' 
                              : overlap.type === 'easter-egg'
                                ? 'bg-purple-400/20 border border-purple-300/30 text-wherelse-cream/90'
                                : 'bg-wherelse-yellow/10'
                          }`}>
                            <span className="opacity-60">💡</span> {overlap.adjustment}
                          </div>
                        )}
                        
                        {/* Date window */}
                        <div className={`pt-3 border-t border-current/10 text-xs font-mono ${
                          selectedMeetup?.id === overlap.id 
                            ? 'opacity-70' 
                            : overlap.type === 'easter-egg'
                              ? 'text-wherelse-cream/70 border-wherelse-cream/20'
                              : 'text-wherelse-charcoal/60'
                        }`}>
                          {formatDate(overlap.startDate)} — {formatDate(overlap.endDate)} • {overlap.days} days
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Find More Options Button */}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={handleLoadMoreOptions}
                      disabled={loadingMoreOptions || !primaryItinerary || !friendItinerary}
                      className="px-6 py-3 bg-wherelse-charcoal/50 hover:bg-wherelse-charcoal/70 text-wherelse-cream border border-wherelse-cream/20 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-body"
                    >
                      {loadingMoreOptions ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Finding more options...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Find More Options
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Selected meetup details */}
                {selectedMeetup && (
                  <div className="mt-8 p-6 rounded-xl bg-gradient-to-br from-wherelse-yellow/20 to-wherelse-yellow/5 border border-wherelse-yellow/30">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="brand-text text-wherelse-yellow text-sm mb-1">PLAN YOUR MEETUP</p>
                        <h3 className="headline-xl text-2xl text-wherelse-cream">
                          {selectedMeetup.city.toUpperCase()}, {selectedMeetup.country.toUpperCase()}
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedMeetup(null);
                          setMeetupItinerary(null);
                        }}
                        className="p-2 text-wherelse-cream/50 hover:text-wherelse-cream"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    {/* For NATURAL and NEAR-MISS (same city): Show Timeline */}
                    {/* For POTENTIAL (meeting halfway): Show Map of locations */}
                    {(selectedMeetup.type !== 'potential') ? (
                      // Timeline for natural overlaps (same city)
                      (() => {
                        const parseDateRange = (dateStr) => {
                          if (!dateStr) return { start: null, end: null };
                          const match = dateStr.match(/(\w+\s+\d+)\s*[-–]\s*(\w+\s+\d+)/);
                          if (match) {
                            const currentYear = new Date().getFullYear();
                            const start = new Date(`${match[1]}, ${currentYear}`);
                            let end = new Date(`${match[2]}, ${currentYear}`);
                            if (end < start) end = new Date(`${match[2]}, ${currentYear + 1}`);
                            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) return { start, end };
                          }
                          return { start: null, end: null };
                        };
                        
                        const t1Info = selectedMeetup.traveler1From || selectedMeetup.traveler1Location || {};
                        const t2Info = selectedMeetup.traveler2From || selectedMeetup.traveler2Location || {};
                        
                        let t1Start = t1Info.startDate ? new Date(t1Info.startDate) : null;
                        let t1End = t1Info.endDate ? new Date(t1Info.endDate) : null;
                        let t2Start = t2Info.startDate ? new Date(t2Info.startDate) : null;
                        let t2End = t2Info.endDate ? new Date(t2Info.endDate) : null;
                        
                        if (!t1Start && t1Info.dates) {
                          const p = parseDateRange(t1Info.dates);
                          t1Start = p.start; t1End = p.end;
                        }
                        if (!t2Start && t2Info.dates) {
                          const p = parseDateRange(t2Info.dates);
                          t2Start = p.start; t2End = p.end;
                        }
                        
                        const allDates = [t1Start, t1End, t2Start, t2End].filter(Boolean);
                        if (allDates.length < 4) return null;
                        
                        const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
                        const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
                        
                        const rangeStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
                        const rangeEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
                        const totalDays = Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1;
                        
                        const getPos = (d) => ((d.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                        const getWidth = (s, e) => ((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) + 1) / totalDays * 100;
                        
                        const months = [];
                        let current = new Date(rangeStart);
                        while (current <= rangeEnd) {
                          months.push({
                            label: current.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
                            pos: getPos(current)
                          });
                          current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                        }
                        
                        const formatDateShort = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
                        
                        return (
                          <div className="mb-6 p-5 bg-wherelse-charcoal/60 rounded-xl">
                            <p className="text-xs text-wherelse-cream/50 font-condensed tracking-widest mb-4 uppercase">
                              Timeline in {selectedMeetup.city}
                            </p>
                            
                            <div className="relative" style={{ height: '150px' }}>
                              {months.map((m, i) => (
                                <div
                                  key={i}
                                  className="absolute top-0 bottom-6 w-px bg-wherelse-cream/10"
                                  style={{ left: `${m.pos}%` }}
                                />
                              ))}
                              
                              <div 
                                className="absolute"
                                style={{ 
                                  left: `${getPos(t1Start)}%`, 
                                  width: `${getWidth(t1Start, t1End)}%`,
                                  top: '8px'
                                }}
                              >
                                <div className="flex justify-between mb-1 text-[11px] font-mono text-wherelse-yellow font-medium">
                                  <span>{formatDateShort(t1Start)}</span>
                                  <span>{formatDateShort(t1End)}</span>
                                </div>
                                <div className="h-9 bg-wherelse-yellow rounded-full flex items-center justify-center shadow-lg">
                                  <span className="text-sm font-bold text-wherelse-charcoal tracking-wider uppercase">
                                    {selectedMeetup.travelers?.[0]}
                                  </span>
                                </div>
                              </div>
                              
                              <div 
                                className="absolute"
                                style={{ 
                                  left: `${getPos(t2Start)}%`, 
                                  width: `${getWidth(t2Start, t2End)}%`,
                                  top: '70px'
                                }}
                              >
                                <div className="flex justify-between mb-1 text-[11px] font-mono text-[#8ba4c7] font-medium">
                                  <span>{formatDateShort(t2Start)}</span>
                                  <span>{formatDateShort(t2End)}</span>
                                </div>
                                <div className="h-9 bg-[#7a9ac4] rounded-full flex items-center justify-center shadow-lg">
                                  <span className="text-sm font-bold text-wherelse-charcoal tracking-wider uppercase">
                                    {selectedMeetup.travelers?.[1]}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="absolute bottom-0 left-0 right-0">
                                {months.map((m, i) => (
                                  <span
                                    key={i}
                                    className="absolute text-xs font-condensed text-wherelse-cream/30 tracking-widest"
                                    style={{ left: `${m.pos}%`, transform: 'translateX(8px)' }}
                                  >
                                    {m.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      // Map for potential/compromise meetups
                      (() => {
                        const mapItineraries = [
                          // Traveler 1's location
                          selectedMeetup.traveler1From?.lat && {
                            id: 'traveler1-loc',
                            travelerName: selectedMeetup.travelers?.[0] || 'Traveler 1',
                            legs: [{
                              id: 't1-from',
                              city: selectedMeetup.traveler1From.city,
                              country: selectedMeetup.traveler1From.country || '',
                              startDate: selectedMeetup.startDate,
                              endDate: selectedMeetup.endDate,
                              lat: selectedMeetup.traveler1From.lat,
                              lng: selectedMeetup.traveler1From.lng
                            }]
                          },
                          // Traveler 2's location
                          selectedMeetup.traveler2From?.lat && {
                            id: 'traveler2-loc',
                            travelerName: selectedMeetup.travelers?.[1] || 'Traveler 2',
                            legs: [{
                              id: 't2-from',
                              city: selectedMeetup.traveler2From.city,
                              country: selectedMeetup.traveler2From.country || '',
                              startDate: selectedMeetup.startDate,
                              endDate: selectedMeetup.endDate,
                              lat: selectedMeetup.traveler2From.lat,
                              lng: selectedMeetup.traveler2From.lng
                            }]
                          }
                        ].filter(Boolean);
                        
                        const mapOverlaps = selectedMeetup.lat ? [{
                          city: selectedMeetup.city,
                          country: selectedMeetup.country,
                          startDate: selectedMeetup.startDate,
                          endDate: selectedMeetup.endDate,
                          travelers: selectedMeetup.travelers,
                          type: 'potential',
                          lat: selectedMeetup.lat,
                          lng: selectedMeetup.lng
                        }] : [];
                        
                        return (
                          <div className="mb-6 rounded-xl overflow-hidden border border-wherelse-cream/10">
                            <div className="bg-wherelse-charcoal/60 px-4 py-2">
                              <p className="text-xs text-wherelse-cream/50 font-condensed tracking-widest uppercase">
                                Meeting Halfway
                              </p>
                            </div>
                            <div className="h-[250px]">
                              <TripMap
                                itineraries={mapItineraries}
                                overlaps={mapOverlaps}
                                height="250px"
                                showRoute={false}
                                interactive={true}
                                colorByCountry={false}
                                showMeetupLines={true}
                              />
                            </div>
                            {/* Legend */}
                            <div className="bg-wherelse-charcoal/40 px-4 py-3 flex flex-wrap items-center gap-4 text-xs">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-wherelse-yellow" />
                                <span className="text-wherelse-cream/70">{selectedMeetup.travelers?.[0]} in {selectedMeetup.traveler1From?.city}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-wherelse-blue" />
                                <span className="text-wherelse-cream/70">{selectedMeetup.travelers?.[1]} in {selectedMeetup.traveler2From?.city}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500" />
                                <span className="text-wherelse-cream/70">Meet in {selectedMeetup.city}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                    
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Where each person is coming from */}
                        <div className="space-y-4">
                          <p className="brand-text text-wherelse-cream/60 text-xs">WHERE YOU'RE COMING FROM</p>
                          
                          {/* Traveler 1 */}
                          <div className="p-4 bg-wherelse-charcoal/30 rounded-lg">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-wherelse-yellow text-wherelse-charcoal">
                                {selectedMeetup.travelers?.[0]?.[0] || 'T'}
                              </div>
                              <div>
                                <p className="text-wherelse-cream font-body font-medium">{selectedMeetup.travelers?.[0]}</p>
                                <p className="text-wherelse-cream/50 text-sm font-body">
                                  📍 {selectedMeetup.traveler1From?.city || selectedMeetup.traveler1Location?.city || selectedMeetup.currentLocations?.[0]?.city}, {selectedMeetup.traveler1From?.country || selectedMeetup.traveler1Location?.country || selectedMeetup.currentLocations?.[0]?.country}
                                </p>
                              </div>
                            </div>
                            <p className="text-wherelse-cream/40 text-xs font-mono ml-11">
                              {selectedMeetup.traveler1From?.dates || 
                               (selectedMeetup.traveler1From?.startDate && selectedMeetup.traveler1From?.endDate 
                                 ? `${new Date(selectedMeetup.traveler1From.startDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${new Date(selectedMeetup.traveler1From.endDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`
                                 : selectedMeetup.traveler1Location?.dates || '')}
                            </p>
                          </div>
                          
                          {/* Traveler 2 */}
                          <div className="p-4 bg-wherelse-charcoal/30 rounded-lg">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-[#7a9ac4] text-wherelse-charcoal">
                                {selectedMeetup.travelers?.[1]?.[0] || 'T'}
                              </div>
                              <div>
                                <p className="text-wherelse-cream font-body font-medium">{selectedMeetup.travelers?.[1]}</p>
                                <p className="text-wherelse-cream/50 text-sm font-body">
                                  📍 {selectedMeetup.traveler2From?.city || selectedMeetup.traveler2Location?.city || selectedMeetup.currentLocations?.[1]?.city}, {selectedMeetup.traveler2From?.country || selectedMeetup.traveler2Location?.country || selectedMeetup.currentLocations?.[1]?.country}
                                </p>
                              </div>
                            </div>
                            <p className="text-wherelse-cream/40 text-xs font-mono ml-11">
                              {selectedMeetup.traveler2From?.dates || 
                               (selectedMeetup.traveler2From?.startDate && selectedMeetup.traveler2From?.endDate 
                                 ? `${new Date(selectedMeetup.traveler2From.startDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})} - ${new Date(selectedMeetup.traveler2From.endDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}`
                                 : selectedMeetup.traveler2Location?.dates || '')}
                            </p>
                          </div>
                        </div>
                        
                        {/* Suggested meetup dates */}
                        <div className="space-y-4">
                          <p className="brand-text text-wherelse-cream/60 text-xs">SUGGESTED MEETUP</p>
                          
                          <div className="p-4 bg-wherelse-charcoal/30 rounded-lg">
                            <div className="flex items-center gap-3 mb-3">
                              <Calendar className="w-5 h-5 text-wherelse-yellow" />
                              <div>
                                <p className="text-wherelse-cream font-mono">
                                  {formatDateLong(selectedMeetup.startDate)}
                                </p>
                                <p className="text-wherelse-cream/50 text-xs">to</p>
                                <p className="text-wherelse-cream font-mono">
                                  {formatDateLong(selectedMeetup.endDate)}
                                </p>
                              </div>
                            </div>
                            <p className="text-wherelse-yellow brand-text">
                              {selectedMeetup.days} DAYS TOGETHER
                            </p>
                          </div>
                          
                          {/* Why this spot */}
                          {selectedMeetup.reason && (
                            <div className="p-3 bg-wherelse-yellow/10 rounded-lg border border-wherelse-yellow/20">
                              <p className="text-wherelse-cream/80 text-sm font-body italic">
                                {selectedMeetup.reason}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    
                    <div className="mt-6 pt-6 border-t border-wherelse-cream/10 flex gap-3">
                      <button
                        className="flex-1 py-3 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors brand-text flex items-center justify-center gap-2"
                        onClick={() => {
                          // Copy meetup details to clipboard
                          const t1 = selectedMeetup.travelers?.[0] || 'Traveler 1';
                          const t2 = selectedMeetup.travelers?.[1] || 'Traveler 2';
                          const loc1 = selectedMeetup.traveler1Location?.city || selectedMeetup.currentLocations?.[0]?.city || '';
                          const loc2 = selectedMeetup.traveler2Location?.city || selectedMeetup.currentLocations?.[1]?.city || '';
                          
                          const text = `Let's meet up in ${selectedMeetup.city}, ${selectedMeetup.country}! 🎉\n\n` +
                            `📅 ${formatDateLong(selectedMeetup.startDate)} - ${formatDateLong(selectedMeetup.endDate)}\n` +
                            `⏱️ ${selectedMeetup.days} days together\n\n` +
                            `${t1} coming from ${loc1}\n` +
                            `${t2} coming from ${loc2}`;
                          navigator.clipboard.writeText(text);
                          alert('Meetup details copied!');
                        }}
                      >
                        📋 COPY DETAILS
                      </button>
                      <button
                        className="flex-1 py-3 bg-wherelse-charcoal text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal-dark transition-colors brand-text flex items-center justify-center gap-2"
                        onClick={() => {
                          // Open in Google Maps
                          window.open(`https://www.google.com/maps/search/${encodeURIComponent(selectedMeetup.city + ', ' + selectedMeetup.country)}`, '_blank');
                        }}
                      >
                        🗺️ VIEW ON MAP
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card-olive p-12 text-center">
                <div className="text-5xl mb-4">🌍</div>
                <h3 className="headline-xl text-2xl text-wherelse-charcoal mb-2">EXPLORING OPTIONS...</h3>
                <p className="text-wherelse-charcoal/70 font-body max-w-md mx-auto mb-6">
                  We couldn't find direct overlaps in your schedules. But we can still find the best option!
                </p>
                
                <button
                  onClick={suggestBestMeetup}
                  disabled={suggesting || !primaryItinerary || !friendItinerary}
                  className="px-8 py-4 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed brand-text text-lg flex items-center justify-center gap-2 mx-auto"
                >
                  {suggesting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Finding best option...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      SUGGEST BEST MEETUP
                    </>
                  )}
                </button>
                
                {imageError && (
                  <div className="mt-4 p-4 bg-wherelse-red/20 rounded-lg border border-wherelse-red/30 max-w-md mx-auto">
                    <p className="text-sm font-body">{imageError}</p>
                    <button
                      onClick={() => setImageError(null)}
                      className=" text-xs mt-2 hover:text-wherelse-red"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Footer */}
      <footer className="border-t border-wherelse-cream/10 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <p className="brand-text text-wherelse-cream/70">WHERELSE</p>
            <p className="text-xs text-wherelse-cream/30 font-body">
              Find where your paths cross
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
