import React, { useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, Users, Sparkles, Globe, Plane, Navigation, Upload, FileText, Plus, X, ChevronDown, Route, Clock, Trash2, Share2, Download, Loader2, ArrowRight, ArrowUpRight, Edit2, Copy, Check, ExternalLink, GripVertical } from 'lucide-react';
import { geocodeLocation, calculateDistance } from './utils/geocoding';
import { saveItineraries, loadItineraries, exportItinerary, exportAllItineraries, generateShareLink, parseShareLink } from './utils/storage';
import { saveItineraryToCloud, createSharedTrip, updateItineraryInCloud } from './lib/supabase';
import LocationAutocomplete from './components/LocationAutocomplete';
import DateRangePicker from './components/DateRangePicker';
import TripMap from './components/TripMap';
import TripTimeline from './components/TripTimeline';
import DraggableLegList from './components/DraggableLegList';
import { parseItineraryImage, isValidImageFile, getImagePreviewUrl } from './utils/imageParser';
import { compareTripsWithAI } from './utils/aiHelpers';

const WherelseAtlas = () => {
  const [itineraries, setItineraries] = useState([]);
  const [overlaps, setOverlaps] = useState([]);
  const [activeView, setActiveView] = useState('upload');
  const [currentItinerary, setCurrentItinerary] = useState({ travelerName: '', legs: [] });
  const [isAddingLeg, setIsAddingLeg] = useState(false);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  
  // Image upload state
  const [imagePreview, setImagePreview] = useState(null);
  const [parsingImage, setParsingImage] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [processingStep, setProcessingStep] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  
  const [isAnimating, setIsAnimating] = useState(false);
  const [expandedItinerary, setExpandedItinerary] = useState(null);
  const [viewingItineraryId, setViewingItineraryId] = useState(null);
  const [editingLegInSavedItinerary, setEditingLegInSavedItinerary] = useState(null); // Format: "itineraryId-legId"
  const [addingLegToItinerary, setAddingLegToItinerary] = useState(null); // itineraryId
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState('');

  // New leg form state
  const [newLegLocation, setNewLegLocation] = useState(null);
  const [newLegDates, setNewLegDates] = useState({ startDate: null, endDate: null });
  const [validatingLocation, setValidatingLocation] = useState(false);
  const [locationValidationError, setLocationValidationError] = useState(null);
  const [editingLegId, setEditingLegId] = useState(null);
  const [editingItineraryId, setEditingItineraryId] = useState(null);

  // Card color rotation for visual interest
  const cardColors = ['card-olive', 'card-yellow', 'card-cream', 'card-sand', 'card-gray', 'card-blue'];

  useEffect(() => {
    // Only load on initial mount, not on every render
    const saved = loadItineraries();
    if (saved && Array.isArray(saved)) {
      setItineraries(saved);
    }

    const shared = parseShareLink();
    if (shared) {
      setCurrentItinerary(shared);
      setActiveView('upload');
    }
  }, []); // Empty deps - only run on mount

  useEffect(() => {
    // Always save, even if empty, to clear localStorage when all are deleted
    saveItineraries(itineraries);
  }, [itineraries]);

  const parseDate = (dateStr) => new Date(dateStr);
  
  // Natural date formatting with ordinals
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
  
  const calculateTotalDays = (legs) => {
    if (legs.length === 0) return 0;
    const start = parseDate(legs[0].startDate);
    const end = parseDate(legs[legs.length - 1].endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  };

  // Normalize legs - only add normalized strings, don't geocode here
  // Geocoding will happen on-demand when needed for meetup finding
  const normalizeLegs = (legs) => {
    return legs.map(leg => ({
      ...leg,
      normalizedCity: leg.city.toLowerCase().trim(),
      normalizedCountry: leg.country.toLowerCase().trim(),
      canonicalCity: leg.canonicalCity || leg.city,
      canonicalCountry: leg.canonicalCountry || leg.country
    }));
  };

  // Check if two locations are the same (using coordinates if available, otherwise string matching)
  const isSameLocation = (leg1, leg2) => {
    // If both have coordinates, check if they're within 50km (same city)
    if (leg1.lat && leg1.lng && leg2.lat && leg2.lng) {
      const distance = calculateDistance(leg1.lat, leg1.lng, leg2.lat, leg2.lng);
      const isSame = distance !== null && distance < 50;
      console.log(`[isSameLocation] Using coordinates: distance=${distance}km, isSame=${isSame}`);
      return isSame;
    }
    
    // Fallback to string matching with normalization
    const city1 = leg1.normalizedCity || (leg1.city || '').toLowerCase().trim();
    const city2 = leg2.normalizedCity || (leg2.city || '').toLowerCase().trim();
    const country1 = leg1.normalizedCountry || (leg1.country || '').toLowerCase().trim();
    const country2 = leg2.normalizedCountry || (leg2.country || '').toLowerCase().trim();
    
    const isSame = city1 === city2 && country1 === country2;
    console.log(`[isSameLocation] Using string matching:`, {
      leg1City: leg1.city, leg1Country: leg1.country,
      leg2City: leg2.city, leg2Country: leg2.country,
      normalizedCity1: city1, normalizedCity2: city2, cityMatch: city1 === city2,
      normalizedCountry1: country1, normalizedCountry2: country2, countryMatch: country1 === country2,
      isSame
    });
    return isSame;
  };

  const findOverlaps = async () => {
    setIsAnimating(true);
    setIsGeocoding(true);
    setGeocodingProgress('Analyzing travel itineraries with AI...');
    
    // Validate we have at least 2 itineraries
    if (itineraries.length < 2) {
      setIsGeocoding(false);
      setOverlaps([]);
      setActiveView('overlaps');
      setIsAnimating(false);
      return;
    }
    
    // For now, compare the first two itineraries
    // TODO: Support multi-itinerary comparison
    const primaryItinerary = itineraries[0];
    const friendItinerary = itineraries[1];
    
    if (!primaryItinerary.legs.length || !friendItinerary.legs.length) {
      setIsGeocoding(false);
      setOverlaps([]);
      setActiveView('overlaps');
      setIsAnimating(false);
      return;
    }
    
    console.log(`[AI Compare] Comparing ${primaryItinerary.travelerName} with ${friendItinerary.travelerName}`);
    
    try {
      setGeocodingProgress('AI is analyzing your trips...');
      
      // Use the consolidated AI comparison
      const result = await compareTripsWithAI(
        primaryItinerary,
        friendItinerary,
        calculateDistance // Pass the distance function for pre-computation
      );
      
      console.log('[AI Compare] Result:', result);
      
      if (result.noGoodOptions) {
        console.log('[AI Compare] No viable meetup options found:', result.reason);
        setOverlaps([]);
      } else {
        // Sort by type priority: natural > near-miss > potential
        const sortedOverlaps = (result.overlaps || []).sort((a, b) => {
          const typePriority = { 'natural': 0, 'near-miss': 1, 'potential': 2 };
          const typeA = typePriority[a.type] ?? 3;
          const typeB = typePriority[b.type] ?? 3;
          if (typeA !== typeB) return typeA - typeB;
          return (a.priority || 0) - (b.priority || 0);
        });
        
        setOverlaps(sortedOverlaps);
      }
      
      // Store best option for potential UI display
      if (result.bestOption) {
        console.log('[AI Compare] Best option:', result.bestOption.summary);
      }
      
    } catch (error) {
      console.error('[AI Compare] Error:', error);
      // On error, set empty overlaps
      setOverlaps([]);
    }
    
    setIsGeocoding(false);
    setGeocodingProgress('');
    
    setTimeout(() => {
      setActiveView('overlaps');
      setIsAnimating(false);
    }, 300);
  };

  const addLegToCurrentItinerary = (legData) => {
    setCurrentItinerary(prev => {
      const updated = {
        ...prev,
        legs: [...prev.legs, { ...legData, id: Date.now() }]
      };
      // Sync to cloud if shared
      if (prev.supabaseId) {
        syncItineraryToCloud(updated);
      }
      return updated;
    });
    setIsAddingLeg(false);
    // Reset form state
    setNewLegLocation(null);
    setNewLegDates({ startDate: null, endDate: null });
  };

  // Add leg instantly - no validation needed
  const handleAddLeg = () => {
    if (newLegLocation && newLegDates.startDate && newLegDates.endDate) {
      addLegToCurrentItinerary({
        city: newLegLocation.city,
        country: newLegLocation.country,
        startDate: newLegDates.startDate,
        endDate: newLegDates.endDate,
        lat: newLegLocation.lat,
        lng: newLegLocation.lng,
        isValid: true, // Valid since selected from autocomplete
      });
    }
  };

  const canAddLeg = newLegLocation && newLegDates.startDate && newLegDates.endDate && !validatingLocation;

  // Update leg in current itinerary
  const updateLegInCurrentItinerary = (legId, updatedLeg) => {
    setCurrentItinerary(prev => {
      const updated = {
        ...prev,
        legs: prev.legs.map(leg => leg.id === legId ? { ...leg, ...updatedLeg } : leg)
      };
      // Sync to cloud if shared
      if (prev.supabaseId) {
        syncItineraryToCloud(updated);
      }
      return updated;
    });
    
    // If this leg is now valid, automatically move to the next invalid leg
    if (updatedLeg.isValid) {
      const invalidLeg = currentItinerary.legs.find(leg => 
        leg.id !== legId && leg.isValid === false
      );
      if (invalidLeg) {
        setEditingLegId(invalidLeg.id);
      } else {
        setEditingLegId(null);
      }
    } else {
      // Keep editing this leg if it's still invalid
      setEditingLegId(legId);
    }
  };

  // Reorder legs in a saved itinerary
  const reorderLegsInItinerary = (itineraryId, newOrder) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.id === itineraryId) {
        const updated = { ...itin, legs: newOrder };
        // Sync to cloud if shared
        if (itin.supabaseId) {
          syncItineraryToCloud(updated);
        }
        return updated;
      }
      return itin;
    }));
  };
  
  // Add leg to saved itinerary
  const addLegToItinerary = async (itineraryId, legData) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.id === itineraryId) {
        const updated = {
          ...itin,
          legs: [...itin.legs, { ...legData, id: Date.now() }]
        };
        // Sync to cloud if shared
        if (itin.supabaseId) {
          syncItineraryToCloud(updated);
        }
        return updated;
      }
      return itin;
    }));
    setAddingLegToItinerary(null);
  };
  
  // Remove leg from saved itinerary
  const removeLegFromItinerary = (itineraryId, legId) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.id === itineraryId) {
        const updated = {
          ...itin,
          legs: itin.legs.filter(leg => leg.id !== legId)
        };
        // Sync to cloud if shared
        if (itin.supabaseId) {
          syncItineraryToCloud(updated);
        }
        return updated;
      }
      return itin;
    }));
  };
  
  // Update leg in saved itinerary - instant, no validation
  const updateLegInItinerary = (itineraryId, legId, updatedLeg) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.id === itineraryId) {
        const updated = {
          ...itin,
          legs: itin.legs.map(leg => leg.id === legId ? { ...leg, ...updatedLeg } : leg)
        };
        // Sync to cloud if shared
        if (itin.supabaseId) {
          syncItineraryToCloud(updated);
        }
        return updated;
      }
      return itin;
    }));
    setEditingLegInSavedItinerary(null);
  };

  // Delete leg from saved itinerary
  const deleteLegFromItinerary = (itineraryId, legId) => {
    setItineraries(prev => prev.map(itin => {
      if (itin.id === itineraryId) {
        return {
          ...itin,
          legs: itin.legs.filter(leg => leg.id !== legId)
        };
      }
      return itin;
    }));
  };
  
  const removeLegFromCurrentItinerary = (legId) => {
    setCurrentItinerary(prev => {
      const updated = {
        ...prev,
        legs: prev.legs.filter(leg => leg.id !== legId)
      };
      // Sync to cloud if shared
      if (prev.supabaseId) {
        syncItineraryToCloud(updated);
      }
      return updated;
    });
  };
  
  // Reorder legs (for drag and drop)
  const reorderLegs = (newOrder) => {
    setCurrentItinerary(prev => {
      const updated = {
        ...prev,
        legs: newOrder
      };
      // Sync to cloud if shared
      if (prev.supabaseId) {
        syncItineraryToCloud(updated);
      }
      return updated;
    });
  };
  
  const saveItinerary = async () => {
    if (currentItinerary.travelerName && currentItinerary.legs.length > 0) {
      // Check for invalid legs (no coordinates and not marked as valid)
      const invalidLegs = currentItinerary.legs.filter(leg => 
        (!leg.lat || !leg.lng) && leg.isValid !== true
      );
      
      if (invalidLegs.length > 0) {
        alert(`Cannot save itinerary: ${invalidLegs.length} location(s) are invalid. Please fix or remove them before saving.`);
        return;
      }
      
      const sortedLegs = [...currentItinerary.legs].sort((a, b) => 
        parseDate(a.startDate) - parseDate(b.startDate)
      );
      
      if (editingItineraryId) {
        // Update existing itinerary
        const updatedItinerary = { ...currentItinerary, legs: sortedLegs, id: editingItineraryId };
        
        setItineraries(prev => prev.map(itin => 
          itin.id === editingItineraryId 
            ? updatedItinerary
            : itin
        ));
        
        // Sync to cloud if shared
        if (currentItinerary.supabaseId) {
          await syncItineraryToCloud(updatedItinerary);
        }
        
        setEditingItineraryId(null);
      } else {
        // Create new itinerary
        const newItinerary = {
          ...currentItinerary,
          legs: sortedLegs,
          id: Date.now(),
          createdAt: new Date().toISOString()
        };
        setItineraries(prev => [...prev, newItinerary]);
      }
      
      setCurrentItinerary({ travelerName: '', legs: [] });
      setActiveView('view');
    }
  };

  const deleteItinerary = (id) => {
    if (window.confirm('Are you sure you want to delete this itinerary?')) {
      setItineraries(prev => prev.filter(it => it.id !== id));
    }
  };

  // Share modal state
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareModalData, setShareModalData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  
  const shareItinerary = async (itinerary) => {
    setShareModalOpen(true);
    setShareModalData(null);
    setShareLoading(true);
    setShareCopied(false);
    
    try {
      let itineraryId = itinerary.supabaseId;
      let shareCode = itinerary.shareCode;
      
      // If not already saved to cloud, save it now
      if (!itineraryId) {
        const result = await saveItineraryToCloud(itinerary);
        itineraryId = result.itineraryId;
        shareCode = result.shareCode;
        
        // Update the itinerary in local state with Supabase ID
        setItineraries(prev => prev.map(itin => 
          itin.id === itinerary.id 
            ? { ...itin, supabaseId: itineraryId, shareCode }
            : itin
        ));
        
        // If this is the current itinerary, update it too
        if (currentItinerary.id === itinerary.id) {
          setCurrentItinerary(prev => ({ ...prev, supabaseId: itineraryId, shareCode }));
        }
      }
      
      // Create a shared trip session if it doesn't exist
      let sessionCode;
      try {
        const result = await createSharedTrip(itineraryId);
        sessionCode = result.sessionCode;
      } catch (e) {
        // Session might already exist, that's okay
        console.log('Shared trip session may already exist');
      }
      
      const shareUrl = `${window.location.origin}/trip/${shareCode}`;
      
      setShareModalData({
        shareCode,
        sessionCode,
        shareUrl,
        travelerName: itinerary.travelerName,
        itineraryId,
      });
    } catch (error) {
      console.error('Error sharing itinerary:', error);
      // Fallback to local share link
      const shareLink = generateShareLink(itinerary);
      setShareModalData({
        shareUrl: shareLink,
        travelerName: itinerary.travelerName,
        isLocal: true,
      });
    }
    
    setShareLoading(false);
  };
  
  // Sync current itinerary to Supabase if it's shared
  const syncItineraryToCloud = async (itinerary) => {
    if (!itinerary.supabaseId) return; // Not shared, no need to sync
    
    try {
      await updateItineraryInCloud(itinerary.supabaseId, itinerary);
      console.log('[Sync] Itinerary synced to cloud');
    } catch (error) {
      console.error('[Sync] Error syncing itinerary:', error);
    }
  };
  
  const copyShareLink = () => {
    if (shareModalData?.shareUrl) {
      navigator.clipboard.writeText(shareModalData.shareUrl).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      });
    }
  };
  
  // File upload - instant load, no validation (handled at comparison time)
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
          const lines = content.split('\n');
          const legs = [];
          let currentTraveler = '';
          
          for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
              const values = lines[i].split(',').map(v => v.trim());
              const leg = {
                city: values[1],
                country: values[2],
                startDate: values[3],
                endDate: values[4],
                id: Date.now() + i
              };
              if (!currentTraveler) currentTraveler = values[0];
              legs.push(leg);
            }
          }
          
          parsedData = { travelerName: currentTraveler, legs };
        }
        
        if (parsedData) {
          if (parsedData.travelerName && parsedData.legs) {
            // Load legs instantly, then geocode in background for map
            const legs = parsedData.legs.map((leg, idx) => ({
              id: leg.id || Date.now() + idx,
              city: leg.city,
              country: leg.country,
              startDate: leg.startDate,
              endDate: leg.endDate,
              isValidating: true, // Show loading state
            }));
            
            setCurrentItinerary({
              travelerName: parsedData.travelerName,
              legs
            });
            setActiveView('upload');
            
            // Geocode each leg in background for map display
            geocodeLegsInBackground(legs);
          } else if (Array.isArray(parsedData)) {
            // Multiple itineraries - load instantly, then geocode
            const newItineraries = parsedData.map((itin, itinIdx) => ({
              id: itin.id || Date.now() + itinIdx,
              travelerName: itin.travelerName,
              legs: itin.legs.map((leg, legIdx) => ({
                id: leg.id || Date.now() + legIdx,
                city: leg.city,
                country: leg.country,
                startDate: leg.startDate,
                endDate: leg.endDate,
                isValidating: true,
              }))
            }));
            
            setItineraries(prev => [...prev, ...newItineraries]);
            setActiveView('view');
            
            // Geocode all legs across all itineraries
            newItineraries.forEach(itin => {
              geocodeLegsInBackground(itin.legs, itin.id);
            });
          }
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please check the format.');
      }
    };
    
    reader.readAsText(file);
  };
  
  // Geocode legs in background for map display
  const geocodeLegsInBackground = async (legs, itineraryId = null) => {
    for (const leg of legs) {
      try {
        const result = await geocodeLocation(leg.city, leg.country);
        
        // Note: geocodeLocation returns 'lon' not 'lng'
        if (result && result.lat && (result.lng || result.lon)) {
          // Successfully geocoded
          const updates = {
            lat: result.lat,
            lng: result.lng || result.lon, // Handle both property names
            canonicalCity: result.city || leg.city,
            canonicalCountry: result.country || leg.country,
            isValid: true,
            isValidating: false,
          };
          
          if (itineraryId) {
            // Update in saved itineraries
            setItineraries(prev => prev.map(itin => 
              itin.id === itineraryId 
                ? { ...itin, legs: itin.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l) }
                : itin
            ));
          } else {
            // Update in current itinerary
            setCurrentItinerary(prev => ({
              ...prev,
              legs: prev.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l)
            }));
          }
        } else {
          // Could not geocode - mark as needing attention but don't auto-open edit
          const updates = {
            isValid: false,
            isValidating: false,
            validationError: `Could not find "${leg.city}, ${leg.country}". Click to edit.`,
          };
          
          if (itineraryId) {
            setItineraries(prev => prev.map(itin => 
              itin.id === itineraryId 
                ? { ...itin, legs: itin.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l) }
                : itin
            ));
          } else {
            setCurrentItinerary(prev => ({
              ...prev,
              legs: prev.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l)
            }));
          }
        }
      } catch (error) {
        console.error(`[Geocode] Error geocoding ${leg.city}:`, error);
        // Mark as needs attention
        const updates = {
          isValid: false,
          isValidating: false,
          validationError: `Could not verify "${leg.city}, ${leg.country}". Click to edit.`,
        };
        
        if (itineraryId) {
          setItineraries(prev => prev.map(itin => 
            itin.id === itineraryId 
              ? { ...itin, legs: itin.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l) }
              : itin
          ));
        } else {
          setCurrentItinerary(prev => ({
            ...prev,
            legs: prev.legs.map(l => l.id === leg.id ? { ...l, ...updates } : l)
          }));
        }
      }
      
      // Small delay between geocoding calls to respect rate limits
      await new Promise(r => setTimeout(r, 500));
    }
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
    
    // Progress steps
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
      const result = await parseItineraryImage(file);
      
      // Clear interval and complete progress
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      setProcessingStep('Complete!');
      setProcessingProgress(100);
      
      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (result.legs && result.legs.length > 0) {
        // Set the traveler name if found
        if (result.travelerName) {
          setCurrentItinerary(prev => ({ ...prev, travelerName: result.travelerName }));
        }
        
        // Add all legs to current itinerary with validating state
        const newLegs = result.legs.map((leg, idx) => ({
          ...leg,
          id: leg.id || Date.now() + idx,
          isValidating: true,
        }));
        
        setCurrentItinerary(prev => ({
          ...prev,
          legs: [...prev.legs, ...newLegs]
        }));
        
        setImagePreview(null);
        setImageError(null);
        setProcessingStep('');
        setProcessingProgress(0);
        
        // Geocode legs in background for map
        geocodeLegsInBackground(newLegs);
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
  
  const downloadTemplate = () => {
    const template = {
      travelerName: "Your Name",
      legs: [
        { city: "Tokyo", country: "Japan", startDate: "2025-01-15", endDate: "2025-02-14" },
        { city: "Seoul", country: "South Korea", startDate: "2025-02-15", endDate: "2025-03-10" }
      ]
    };
    exportItinerary(template);
  };

  // Leg Edit Form Component - saves instantly, no validation
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
      <div className="flex-shrink-0 w-64 bg-wherelse-charcoal-dark p-4 border-2 border-wherelse-yellow animate-scale-in">
        <p className="text-wherelse-yellow text-xs font-medium mb-3">EDITING</p>
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

  return (
    <div className="min-h-screen bg-wherelse-charcoal">
      {/* Compact Header */}
      <header className="border-b border-wherelse-charcoal-dark sticky top-0 bg-wherelse-charcoal z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <h1 className="text-wherelse-cream font-condensed font-bold text-xl tracking-wider">
              WHERELSE
            </h1>
            
            {/* Navigation */}
            <nav className="flex items-center">
              <button
                onClick={() => setActiveView('upload')}
                className={`tab-item ${activeView === 'upload' ? 'active' : ''}`}
              >
                Build
              </button>
              <button
                onClick={() => setActiveView('view')}
                className={`tab-item ${activeView === 'view' ? 'active' : ''}`}
              >
                Routes
                {itineraries.length > 0 && (
                  <span className="ml-1.5 text-wherelse-yellow">{itineraries.length}</span>
                )}
              </button>
              <button
                onClick={findOverlaps}
                disabled={itineraries.length < 2 || isGeocoding}
                className={`tab-item ${activeView === 'overlaps' ? 'active' : ''} disabled:opacity-40`}
              >
                {isGeocoding ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  'Overlaps'
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Geocoding Progress */}
      {isGeocoding && (
        <div className="bg-wherelse-charcoal-dark border-b border-wherelse-charcoal">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-wherelse-yellow animate-spin" />
            <p className="text-wherelse-gray text-sm font-mono">{geocodingProgress}</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload/Build View */}
        {activeView === 'upload' && (
          <div className="animate-fade-in">
            {/* Inline Hero + First Step */}
            <div className="grid lg:grid-cols-2 gap-6 mb-8">
              {/* Left: Value prop + Start */}
              <div className="card-yellow p-6 lg:p-8">
                <p className="brand-text text-wherelse-charcoal opacity-60 mb-2">START HERE</p>
                <h2 className="headline-xl text-3xl lg:text-4xl text-wherelse-charcoal leading-tight mb-4">
                  ADD YOUR<br />
                  <span className="text-wherelse-red">TRAVEL PLANS</span>
                </h2>
                <p className="text-wherelse-charcoal opacity-70 font-body text-sm mb-6">
                  Enter your name and add your upcoming destinations. 
                  Then invite friends to find where your paths cross.
                </p>
                
                {/* Drop Zone for quick upload */}
                {currentItinerary.legs.length === 0 && !parsingImage && (
                  <div 
                    className="mb-6 p-6 bg-wherelse-charcoal/10 rounded-lg border-2 border-dashed border-wherelse-charcoal/40 hover:border-wherelse-charcoal/60 hover:bg-wherelse-charcoal/20 cursor-pointer transition-all text-center"
                    onClick={() => imageInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-wherelse-yellow', 'bg-wherelse-charcoal/30'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-wherelse-yellow', 'bg-wherelse-charcoal/30'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-wherelse-yellow', 'bg-wherelse-charcoal/30');
                      const file = e.dataTransfer.files[0];
                      if (file) {
                        if (file.type.startsWith('image/')) {
                          const event = { target: { files: [file] } };
                          handleImageUpload(event);
                        } else if (file.name.endsWith('.json') || file.name.endsWith('.csv')) {
                          const event = { target: { files: [file] } };
                          handleFileUpload(event);
                        }
                      }
                    }}
                  >
                    <input
                      type="file"
                      ref={imageInputRef}
                      onChange={handleImageUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <p className="text-wherelse-charcoal/70 text-sm font-body mb-1">
                      📷 Drop or click to upload
                    </p>
                    <p className="text-wherelse-charcoal/50 text-xs font-body">
                      Try a screenshot, booking confirmation, or photo of your itinerary
                    </p>
                  </div>
                )}
                
                {/* Image parsing progress - enhanced view */}
                {parsingImage && (
                  <div className="mb-6 animate-fade-in">
                    <div className="mb-3">
                      <h4 className="brand-text text-wherelse-charcoal text-sm mb-1">READING YOUR ITINERARY</h4>
                    </div>
                    
                    {/* Image Preview with overlay */}
                    {imagePreview && (
                      <div className="relative mb-4 rounded-xl overflow-hidden border-2 border-wherelse-charcoal/30 shadow-lg">
                        <img 
                          src={imagePreview} 
                          alt="Processing" 
                          className="w-full h-48 object-cover"
                        />
                        {/* Overlay with processing indicator */}
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
                                ? 'bg-wherelse-charcoal/30' 
                                : isActive
                                  ? 'bg-wherelse-charcoal/20'
                                  : 'bg-wherelse-charcoal/5'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isComplete 
                                ? 'bg-wherelse-yellow text-wherelse-charcoal' 
                                : isActive
                                  ? 'bg-wherelse-charcoal/30'
                                  : 'bg-wherelse-charcoal/10'
                            }`}>
                              {isComplete ? (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <span className="text-xs font-mono">{idx + 1}</span>
                              )}
                            </div>
                            <span className={`text-xs font-body ${
                              isComplete ? 'text-wherelse-charcoal' : isActive ? 'text-wherelse-charcoal/70' : 'text-wherelse-charcoal/40'
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
                
                {/* Step 1: Name Input */}
                <div className="space-y-3">
                  <label className="brand-text text-wherelse-charcoal text-xs">STEP 1: YOUR NAME</label>
                  <input
                    type="text"
                    value={currentItinerary.travelerName}
                    onChange={(e) => setCurrentItinerary(prev => ({ ...prev, travelerName: e.target.value }))}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-wherelse-charcoal text-wherelse-cream placeholder:text-wherelse-gray text-lg"
                    autoFocus
                  />
                </div>
              </div>

              {/* Right: Add Destination - only show when no legs uploaded yet */}
              {currentItinerary.legs.length === 0 && (
              <div className={`card-cream p-6 lg:p-8 transition-opacity ${!currentItinerary.travelerName ? 'opacity-40' : ''}`}>
                <p className="brand-text text-wherelse-charcoal opacity-60 mb-2">STEP 2</p>
                <h3 className="headline-xl text-2xl lg:text-3xl text-wherelse-charcoal leading-tight mb-4">
                  ADD A<br />DESTINATION
                </h3>
                
                {!currentItinerary.travelerName ? (
                  <p className="text-wherelse-charcoal opacity-50 font-body text-sm">
                    ← Enter your name first to unlock this step
                  </p>
                ) : isAddingLeg ? (
                  <div className="space-y-4">
                    {/* Location Search */}
                    <div>
                      <label className="brand-text text-wherelse-charcoal text-xs block mb-2">WHERE</label>
                      <LocationAutocomplete
                        onSelect={setNewLegLocation}
                        placeholder="Search for a city..."
                        initialValue={newLegLocation}
                      />
                      {newLegLocation && (
                        <p className="text-xs text-wherelse-charcoal/60 mt-1 font-mono">
                          {newLegLocation.city}, {newLegLocation.country}
                        </p>
                      )}
                    </div>

                    {/* Date Range */}
                    <div>
                      <label className="brand-text text-wherelse-charcoal text-xs block mb-2">WHEN</label>
                      <DateRangePicker
                        startDate={newLegDates.startDate}
                        endDate={newLegDates.endDate}
                        onRangeSelect={setNewLegDates}
                        suggestedStartDate={
                          currentItinerary.legs.length > 0
                            ? currentItinerary.legs[currentItinerary.legs.length - 1].endDate
                            : null
                        }
                        blockedRanges={currentItinerary.legs.map(leg => ({
                          startDate: leg.startDate,
                          endDate: leg.endDate
                        }))}
                      />
                    </div>

                    {/* Validation Error */}
                    {locationValidationError && (
                      <div className="bg-wherelse-red/20 border border-wherelse-red/50 p-4 animate-fade-in">
                        <p className="text-wherelse-charcoal text-sm font-medium mb-2">
                          {locationValidationError.message}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-wherelse-charcoal opacity-70 mb-3">
                          <span>Current: {locationValidationError.city}, {locationValidationError.country}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLocationValidationError(null);
                              setNewLegLocation(null);
                            }}
                            className="btn-primary text-sm py-2 px-4"
                          >
                            Edit Location
                          </button>
                          <button
                            type="button"
                            onClick={() => setLocationValidationError(null)}
                            className="btn-secondary text-sm py-2 px-4"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button 
                        type="button"
                        onClick={handleAddLeg}
                        disabled={!canAddLeg}
                        className="btn-primary flex-1 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {validatingLocation ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          'Add Destination'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLeg(false);
                          setNewLegLocation(null);
                          setNewLegDates({ startDate: null, endDate: null });
                          setLocationValidationError(null);
                        }}
                        className="btn-secondary py-2.5 px-4"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingLeg(true)}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add First Destination
                  </button>
                )}
              </div>
              )}
            </div>


            {/* Dynamic Trip Preview / Builder */}
            {currentItinerary.legs.length > 0 && (
              <div className="w-full animate-slide-up">
                {/* Full-width header */}
                <div className="card-olive p-6 mb-6">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <p className="brand-text text-wherelse-cream opacity-60 mb-1">YOUR ITINERARY</p>
                      <h3 className="headline-xl text-3xl text-wherelse-cream">
                        {currentItinerary.travelerName.toUpperCase()}'S ROUTE
                      </h3>
                      <p className="text-sm text-wherelse-cream opacity-50 font-mono mt-2">
                        {currentItinerary.legs.length} {currentItinerary.legs.length === 1 ? 'leg' : 'legs'} • {calculateTotalDays(currentItinerary.legs)} days
                        {currentItinerary.legs.filter(l => l.isValid === false).length > 0 && (
                          <span className="text-wherelse-red ml-2">
                            • {currentItinerary.legs.filter(l => l.isValid === false).length} invalid
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setNewLegLocation(null);
                          setNewLegDates({ startDate: null, endDate: null });
                          setIsAddingLeg(true);
                        }}
                        className="btn-secondary text-wherelse-cream border-wherelse-cream/30 hover:border-wherelse-cream flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Quick Add
                      </button>
                      <button 
                        onClick={saveItinerary} 
                        disabled={currentItinerary.legs.some(l => l.isValid === false)}
                        className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {editingItineraryId ? 'Update Itinerary' : 'Save & Continue'}
                      </button>
                    </div>
                  </div>
                  
                  {/* Timeline Visualization */}
                  <div className="mb-6">
                    <p className="brand-text text-wherelse-cream opacity-60 mb-3 text-xs">TIMELINE</p>
                    <TripTimeline legs={currentItinerary.legs} height="120px" />
                  </div>
                </div>
                
                {/* Map and Legs Layout */}
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Left: Draggable Leg List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="brand-text text-wherelse-cream opacity-60 text-sm">DESTINATIONS</p>
                      <p className="text-xs text-wherelse-cream/50 font-mono">
                        Drag to reorder
                      </p>
                    </div>
                    
                    {editingLegId ? (
                      <div className="bg-wherelse-charcoal-dark p-4 rounded-lg border-2 border-wherelse-yellow">
                        {(() => {
                          const editingLeg = currentItinerary.legs.find(l => l.id === editingLegId);
                          const legIndex = currentItinerary.legs.findIndex(l => l.id === editingLegId);
                          return editingLeg ? (
                            <LegEditForm
                              leg={editingLeg}
                              allLegs={currentItinerary.legs}
                              onSave={(updated) => updateLegInCurrentItinerary(editingLegId, updated)}
                              onCancel={() => setEditingLegId(null)}
                              suggestedStartDate={legIndex > 0 ? currentItinerary.legs[legIndex - 1].endDate : null}
                            />
                          ) : null;
                        })()}
                      </div>
                    ) : (
                      <DraggableLegList
                        legs={currentItinerary.legs}
                        onReorder={reorderLegs}
                        onEdit={(legId) => setEditingLegId(legId)}
                        onDelete={removeLegFromCurrentItinerary}
                        formatDate={formatDate}
                      />
                    )}
                    
                    {/* Quick Add Form */}
                    {isAddingLeg && !editingLegId && (
                      <div className="bg-wherelse-charcoal-dark p-5 rounded-lg border-2 border-wherelse-yellow/30 space-y-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="brand-text text-wherelse-cream text-sm">QUICK ADD</p>
                          <button
                            onClick={() => {
                              setIsAddingLeg(false);
                              setNewLegLocation(null);
                              setNewLegDates({ startDate: null, endDate: null });
                            }}
                            className="text-wherelse-cream/50 hover:text-wherelse-cream"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        
                        {/* Location Search */}
                        <div>
                          <label className="block text-wherelse-cream/70 text-xs font-body mb-2">
                            Where?
                          </label>
                          <LocationAutocomplete
                            onSelect={setNewLegLocation}
                            placeholder="Search for a city..."
                            initialValue={newLegLocation}
                          />
                        </div>
                        
                        {/* Date Picker */}
                        {newLegLocation && (
                          <div>
                            <label className="block text-wherelse-cream/70 text-xs font-body mb-2">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              When?
                            </label>
                            <DateRangePicker
                              startDate={newLegDates.startDate}
                              endDate={newLegDates.endDate}
                              onRangeSelect={setNewLegDates}
                              suggestedStartDate={
                                currentItinerary.legs.length > 0
                                  ? currentItinerary.legs[currentItinerary.legs.length - 1].endDate
                                  : null
                              }
                              blockedRanges={currentItinerary.legs.map(leg => ({
                                startDate: leg.startDate,
                                endDate: leg.endDate
                              }))}
                            />
                          </div>
                        )}
                        
                        {/* Add Button */}
                        {newLegLocation && newLegDates.startDate && newLegDates.endDate && (
                          <button
                            onClick={handleAddLeg}
                            disabled={validatingLocation}
                            className="w-full py-3 bg-wherelse-yellow text-wherelse-charcoal font-bold rounded-lg hover:bg-wherelse-yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {validatingLocation ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Validating...
                              </>
                            ) : (
                              <>
                                <Plus className="w-4 h-4" />
                                Add to Route
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                    
                    {/* Quick Add Button */}
                    {!isAddingLeg && !editingLegId && (
                      <button
                        onClick={() => {
                          setNewLegLocation(null);
                          setNewLegDates({ startDate: null, endDate: null });
                          setIsAddingLeg(true);
                        }}
                        className="w-full py-4 border-2 border-dashed border-wherelse-cream/20 rounded-lg text-wherelse-cream/60 hover:border-wherelse-yellow hover:text-wherelse-yellow transition-colors flex items-center justify-center gap-2 font-body"
                      >
                        <Plus className="w-5 h-5" />
                        Add Destination
                      </button>
                    )}
                  </div>
                  
                  {/* Right: Map Preview */}
                  <div className="sticky top-4 h-fit">
                    <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
                      <TripMap 
                        itineraries={[currentItinerary]}
                        overlaps={[]}
                        height="600px"
                        showRoute={true}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* File import + Template download */}
            <div className="mt-8 flex items-center justify-center gap-6 text-sm">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".json,.csv"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-wherelse-gray hover:text-wherelse-cream transition-colors flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import JSON/CSV
              </button>
              <button
                onClick={downloadTemplate}
                className="text-wherelse-gray hover:text-wherelse-cream transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Get template
              </button>
            </div>
          </div>
        )}

        {/* View All Routes */}
        {activeView === 'view' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="headline-xl text-2xl text-wherelse-cream">
                  ALL ROUTES
                  <span className="text-wherelse-yellow ml-3">{itineraries.length}</span>
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveView('upload')}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add New
                </button>
                {itineraries.length > 0 && (
                  <button
                    onClick={() => exportAllItineraries(itineraries)}
                    className="text-wherelse-gray hover:text-wherelse-cream transition-colors flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                )}
              </div>
            </div>
            
            {/* Map Preview */}
            {itineraries.length > 0 && (
              <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
                <TripMap 
                  itineraries={itineraries}
                  overlaps={overlaps}
                  height="300px"
                />
              </div>
            )}
            
            {itineraries.length === 0 ? (
              <div className="card-olive p-12 text-center">
                <p className="text-wherelse-cream opacity-70 mb-4">No itineraries yet</p>
                <button onClick={() => setActiveView('upload')} className="btn-primary">
                  Build Your First Route
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {itineraries.map((itinerary, index) => {
                  const isViewing = viewingItineraryId === itinerary.id;
                  const isEditingLeg = editingLegInSavedItinerary?.startsWith(`${itinerary.id}-`);
                  const isAddingLeg = addingLegToItinerary === itinerary.id;
                  
                  return (
                    <div
                      key={itinerary.id}
                      className="w-full animate-slide-up"
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {/* Full-width header */}
                      <div className={`${cardColors[index % cardColors.length]} p-6 mb-6`}>
                        <div className="flex items-start justify-between mb-6">
                          <div>
                            <p className="brand-text text-wherelse-cream opacity-60 mb-1">TRAVELER</p>
                            <h3 className="headline-xl text-3xl text-wherelse-cream">
                              {itinerary.travelerName.toUpperCase()}'S ROUTE
                            </h3>
                            <p className="text-sm text-wherelse-cream opacity-50 font-mono mt-2">
                              {itinerary.legs.length} {itinerary.legs.length === 1 ? 'leg' : 'legs'} • {calculateTotalDays(itinerary.legs)} days
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setViewingItineraryId(isViewing ? null : itinerary.id)}
                              className="btn-secondary text-wherelse-cream border-wherelse-cream/30 hover:border-wherelse-cream flex items-center gap-2"
                            >
                              {isViewing ? <ChevronDown className="w-4 h-4" /> : <ChevronDown className="w-4 h-4 rotate-180" />}
                              {isViewing ? 'Collapse' : 'Expand'}
                            </button>
                            <button
                              onClick={() => shareItinerary(itinerary)}
                              className="btn-secondary text-wherelse-cream border-wherelse-cream/30 hover:border-wherelse-cream flex items-center gap-2"
                              title="Share"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => exportItinerary(itinerary)}
                              className="btn-secondary text-wherelse-cream border-wherelse-cream/30 hover:border-wherelse-cream flex items-center gap-2"
                              title="Export"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm('Are you sure you want to delete this itinerary?')) {
                                  deleteItinerary(itinerary.id);
                                }
                              }}
                              className="p-2 text-wherelse-cream/50 hover:text-wherelse-red transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Timeline Visualization */}
                        {isViewing && (
                          <div className="mb-6">
                            <p className="brand-text text-wherelse-cream opacity-60 mb-3 text-xs">TIMELINE</p>
                            <TripTimeline legs={itinerary.legs} height="120px" />
                          </div>
                        )}
                      </div>
                      
                      {/* Expanded View: Map and Legs */}
                      {isViewing && (
                        <div className="grid lg:grid-cols-2 gap-6">
                          {/* Left: Draggable Leg List */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                              <p className="brand-text text-wherelse-cream opacity-60 text-sm">DESTINATIONS</p>
                              <p className="text-xs text-wherelse-cream/50 font-mono">
                                Drag to reorder
                              </p>
                            </div>
                            
                            {isEditingLeg ? (
                              <div className="bg-wherelse-charcoal-dark p-4 rounded-lg border-2 border-wherelse-yellow">
                                {(() => {
                                  const [itinId, legId] = editingLegInSavedItinerary.split('-');
                                  const editingLeg = itinerary.legs.find(l => l.id === parseInt(legId));
                                  const legIndex = itinerary.legs.findIndex(l => l.id === parseInt(legId));
                                  return editingLeg ? (
                                    <LegEditForm
                                      leg={editingLeg}
                                      allLegs={itinerary.legs}
                                      onSave={(updated) => {
                                        updateLegInItinerary(itinerary.id, parseInt(legId), updated);
                                        setEditingLegInSavedItinerary(null);
                                      }}
                                      onCancel={() => setEditingLegInSavedItinerary(null)}
                                      suggestedStartDate={legIndex > 0 ? itinerary.legs[legIndex - 1].endDate : null}
                                    />
                                  ) : null;
                                })()}
                              </div>
                            ) : (
                              <DraggableLegList
                                legs={itinerary.legs}
                                onReorder={(newOrder) => reorderLegsInItinerary(itinerary.id, newOrder)}
                                onEdit={(legId) => setEditingLegInSavedItinerary(`${itinerary.id}-${legId}`)}
                                onDelete={(legId) => removeLegFromItinerary(itinerary.id, legId)}
                                formatDate={formatDate}
                              />
                            )}
                            
                            {/* Quick Add Form */}
                            {isAddingLeg && !isEditingLeg && (
                              <div className="bg-wherelse-charcoal-dark p-5 rounded-lg border-2 border-wherelse-yellow/30 space-y-4">
                                <div className="flex items-center justify-between mb-3">
                                  <p className="brand-text text-wherelse-cream text-sm">QUICK ADD</p>
                                  <button
                                    onClick={() => {
                                      setAddingLegToItinerary(null);
                                      setNewLegLocation(null);
                                      setNewLegDates({ startDate: null, endDate: null });
                                    }}
                                    className="text-wherelse-cream/50 hover:text-wherelse-cream"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                
                                {/* Location Search */}
                                <div>
                                  <label className="block text-wherelse-cream/70 text-xs font-body mb-2">
                                    Where?
                                  </label>
                                  <LocationAutocomplete
                                    onSelect={setNewLegLocation}
                                    placeholder="Search for a city..."
                                    initialValue={newLegLocation}
                                  />
                                </div>
                                
                                {/* Validation Error */}
                                {locationValidationError && (
                                  <div className="p-3 bg-wherelse-red/20 border border-wherelse-red/50 rounded-lg">
                                    <p className="text-wherelse-red text-sm font-body">{locationValidationError}</p>
                                  </div>
                                )}
                                
                                {/* Date Picker */}
                                {newLegLocation && (
                                  <div>
                                    <label className="block text-wherelse-cream/70 text-xs font-body mb-2">
                                      <Calendar className="w-3 h-3 inline mr-1" />
                                      When?
                                    </label>
                                    <DateRangePicker
                                      startDate={newLegDates.startDate}
                                      endDate={newLegDates.endDate}
                                      onRangeSelect={setNewLegDates}
                                      suggestedStartDate={
                                        itinerary.legs.length > 0
                                          ? itinerary.legs[itinerary.legs.length - 1].endDate
                                          : null
                                      }
                                      blockedRanges={itinerary.legs.map(leg => ({
                                        startDate: leg.startDate,
                                        endDate: leg.endDate
                                      }))}
                                    />
                                  </div>
                                )}
                                
                                {/* Add Button */}
                                {newLegLocation && newLegDates.startDate && newLegDates.endDate && (
                                  <button
                                    onClick={async () => {
                                      if (newLegLocation && newLegDates.startDate && newLegDates.endDate) {
                                        setValidatingLocation(true);
                                        setLocationValidationError(null);
                                        
                                        try {
                                          const geocoded = await geocodeLocation(newLegLocation.city, newLegLocation.country);
                                          
                                          if (geocoded && !geocoded.error && geocoded.lat && geocoded.lon) {
                                            await addLegToItinerary(itinerary.id, {
                                              city: geocoded.city || newLegLocation.city,
                                              country: geocoded.country || newLegLocation.country,
                                              startDate: newLegDates.startDate,
                                              endDate: newLegDates.endDate,
                                              lat: geocoded.lat,
                                              lng: geocoded.lon,
                                              canonicalCity: geocoded.city,
                                              canonicalCountry: geocoded.country,
                                              isValid: true
                                            });
                                            setNewLegLocation(null);
                                            setNewLegDates({ startDate: null, endDate: null });
                                            setLocationValidationError(null);
                                          } else {
                                            setLocationValidationError('Could not find this location. Please check the spelling.');
                                          }
                                        } catch (error) {
                                          console.error('Error validating location:', error);
                                          setLocationValidationError('Error validating location. Please try again.');
                                        } finally {
                                          setValidatingLocation(false);
                                        }
                                      }
                                    }}
                                    disabled={validatingLocation}
                                    className="w-full py-3 bg-wherelse-yellow text-wherelse-charcoal font-bold rounded-lg hover:bg-wherelse-yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                  >
                                    {validatingLocation ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Validating...
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-4 h-4" />
                                        Add to Route
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {/* Quick Add Button */}
                            {!isAddingLeg && !isEditingLeg && (
                              <button
                                onClick={() => {
                                  setAddingLegToItinerary(itinerary.id);
                                  setNewLegLocation(null);
                                  setNewLegDates({ startDate: null, endDate: null });
                                }}
                                className="w-full py-4 border-2 border-dashed border-wherelse-cream/20 rounded-lg text-wherelse-cream/60 hover:border-wherelse-yellow hover:text-wherelse-yellow transition-colors flex items-center justify-center gap-2 font-body"
                              >
                                <Plus className="w-5 h-5" />
                                Add Destination
                              </button>
                            )}
                          </div>
                          
                          {/* Right: Map Preview */}
                          <div className="sticky top-4 h-fit">
                            <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
                              <TripMap 
                                itineraries={[itinerary]}
                                overlaps={[]}
                                height="600px"
                                showRoute={true}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Overlaps View */}
        {activeView === 'overlaps' && (
          <div className="space-y-6 animate-fade-in">
            {/* Header with stats inline */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="headline-xl text-2xl text-wherelse-cream">
                WHERE PATHS <span className="text-wherelse-yellow">CROSS</span>
              </h2>
              {overlaps.length > 0 && (
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  {overlaps.filter(o => o.type === 'natural').length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-wherelse-yellow"></span>
                      <span className="text-wherelse-cream">{overlaps.filter(o => o.type === 'natural').length} perfect</span>
                    </span>
                  )}
                  {overlaps.filter(o => o.type === 'near-miss').length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-wherelse-olive"></span>
                      <span className="text-wherelse-cream">{overlaps.filter(o => o.type === 'near-miss').length} near-miss</span>
                    </span>
                  )}
                  {overlaps.filter(o => o.type === 'potential').length > 0 && (
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-wherelse-blue"></span>
                      <span className="text-wherelse-cream">{overlaps.filter(o => o.type === 'potential').length} potential</span>
                    </span>
                  )}
                </div>
              )}
            </div>
            
            {overlaps.length === 0 ? (
              <div className="card-olive p-12 text-center">
                <p className="text-wherelse-cream opacity-70 mb-2">No meetup opportunities found</p>
                <p className="text-sm text-wherelse-cream opacity-50">
                  {itineraries.length < 2 
                    ? 'Add at least 2 itineraries to find meetups'
                    : 'Your paths are too far apart'}
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Natural Overlaps */}
                {overlaps.filter(o => o.type === 'natural').length > 0 && (
                  <div className="animate-slide-up stagger-2">
                    <p className="brand-text text-wherelse-yellow mb-4 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      SAME PLACE, SAME TIME
                    </p>
                    <div className="space-y-4">
                      {overlaps.filter(o => o.type === 'natural').map((overlap, index) => {
                        // Debug logging
                        console.log('[Timeline Debug] Natural overlap:', {
                          city: overlap.city,
                          traveler1From: overlap.traveler1From,
                          traveler2From: overlap.traveler2From,
                          travelers: overlap.travelers
                        });
                        
                        // Helper to parse date string like "Apr 1 - Apr 10" or "Mar 14 - Apr 4"
                        const parseDateRange = (dateStr) => {
                          if (!dateStr) return { start: null, end: null };
                          // Try to parse "Apr 1 - Apr 10" format
                          const match = dateStr.match(/(\w+\s+\d+)\s*[-–]\s*(\w+\s+\d+)/);
                          if (match) {
                            const currentYear = new Date().getFullYear();
                            // Handle year rollover (if end month < start month, end is next year)
                            const start = new Date(`${match[1]}, ${currentYear}`);
                            let end = new Date(`${match[2]}, ${currentYear}`);
                            if (end < start) {
                              end = new Date(`${match[2]}, ${currentYear + 1}`);
                            }
                            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                              return { start, end };
                            }
                          }
                          return { start: null, end: null };
                        };
                        
                        // Calculate timeline data for visual display
                        // Try new format first, then fallback to parsing dates string
                        let t1Start = overlap.traveler1From?.startDate ? new Date(overlap.traveler1From.startDate) : null;
                        let t1End = overlap.traveler1From?.endDate ? new Date(overlap.traveler1From.endDate) : null;
                        let t2Start = overlap.traveler2From?.startDate ? new Date(overlap.traveler2From.startDate) : null;
                        let t2End = overlap.traveler2From?.endDate ? new Date(overlap.traveler2From.endDate) : null;
                        
                        // Fallback: parse from dates string
                        if (!t1Start && overlap.traveler1From?.dates) {
                          const parsed = parseDateRange(overlap.traveler1From.dates);
                          t1Start = parsed.start;
                          t1End = parsed.end;
                        }
                        if (!t2Start && overlap.traveler2From?.dates) {
                          const parsed = parseDateRange(overlap.traveler2From.dates);
                          t2Start = parsed.start;
                          t2End = parsed.end;
                        }
                        
                        // Debug: log parsed dates
                        console.log('[Timeline Debug] Parsed dates:', {
                          t1Start, t1End, t2Start, t2End
                        });
                        
                        // Get the full range (earliest arrival to latest departure)
                        const allDates = [t1Start, t1End, t2Start, t2End].filter(Boolean);
                        const rangeStart = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
                        const rangeEnd = allDates.length ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;
                        const totalDays = rangeStart && rangeEnd ? Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1 : 0;
                        
                        // Calculate positions as percentages
                        const getPosition = (date) => {
                          if (!date || !rangeStart || totalDays === 0) return 0;
                          return ((date.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                        };
                        const getWidth = (start, end) => {
                          if (!start || !end || totalDays === 0) return 0;
                          return ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1) / totalDays * 100;
                        };
                        
                        const t1Left = getPosition(t1Start);
                        const t1Width = getWidth(t1Start, t1End);
                        const t2Left = getPosition(t2Start);
                        const t2Width = getWidth(t2Start, t2End);
                        
                        // Format short date
                        const formatShortDate = (dateStr) => {
                          if (!dateStr) return '';
                          const d = new Date(dateStr);
                          if (isNaN(d.getTime())) return dateStr;
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        };
                        
                        // Get display dates - prefer parsed dates, fallback to original strings
                        const t1DisplayStart = t1Start ? formatShortDate(t1Start) : '';
                        const t1DisplayEnd = t1End ? formatShortDate(t1End) : '';
                        const t2DisplayStart = t2Start ? formatShortDate(t2Start) : '';
                        const t2DisplayEnd = t2End ? formatShortDate(t2End) : '';
                        
                        return (
                        <div
                          key={`natural-${index}`}
                          className="card-yellow p-6 animate-slide-up"
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex-1">
                              <span className="badge badge-olive mb-3 inline-block">Perfect Overlap</span>
                              <h4 className="headline-xl text-3xl md:text-4xl text-wherelse-charcoal mb-2">
                                {overlap.city.toUpperCase()}
                              </h4>
                              <p className="text-wherelse-charcoal opacity-60 font-body mb-4">
                                {overlap.country}
                              </p>
                              
                              {/* Visual Timeline - Calendar Style */}
                              {totalDays > 0 && (() => {
                                // Extend range to full months for cleaner display
                                const extRangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
                                const extRangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 2, 0);
                                const extTotalDays = Math.ceil((extRangeEnd - extRangeStart) / (1000 * 60 * 60 * 24)) + 1;
                                
                                const getExtPos = (d) => ((d.getTime() - extRangeStart.getTime()) / (1000 * 60 * 60 * 24)) / extTotalDays * 100;
                                const getExtWidth = (s, e) => ((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) + 1) / extTotalDays * 100;
                                
                                // Generate month markers
                                const months = [];
                                let current = new Date(extRangeStart);
                                while (current <= extRangeEnd) {
                                  months.push({
                                    label: current.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
                                    pos: getExtPos(current)
                                  });
                                  current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                                }
                                
                                const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
                                
                                return (
                                  <div className="bg-wherelse-olive/90 rounded-xl p-5 mb-4">
                                    <p className="text-sm text-wherelse-cream/60 font-condensed tracking-widest mb-5 uppercase">
                                      Timeline in {overlap.city}
                                    </p>
                                    
                                    {/* Timeline container */}
                                    <div className="relative" style={{ height: '160px' }}>
                                      {/* Vertical grid lines for each month */}
                                      {months.map((m, i) => (
                                        <div
                                          key={i}
                                          className="absolute top-0 bottom-6 w-px bg-wherelse-cream/20"
                                          style={{ left: `${m.pos}%` }}
                                        />
                                      ))}
                                      
                                      {/* Traveler 1 bar - upper position */}
                                      <div 
                                        className="absolute"
                                        style={{ 
                                          left: `${getExtPos(t1Start)}%`, 
                                          width: `${getExtWidth(t1Start, t1End)}%`,
                                          top: '10px'
                                        }}
                                      >
                                        <div className="flex justify-between mb-1 text-xs font-mono text-wherelse-yellow">
                                          <span>{formatDate(t1Start)}</span>
                                          <span>{formatDate(t1End)}</span>
                                        </div>
                                        <div className="h-9 bg-wherelse-yellow rounded-full flex items-center justify-center">
                                          <span className="text-sm font-bold text-wherelse-charcoal tracking-wider uppercase">
                                            {overlap.travelers[0]}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Traveler 2 bar - lower position */}
                                      <div 
                                        className="absolute"
                                        style={{ 
                                          left: `${getExtPos(t2Start)}%`, 
                                          width: `${getExtWidth(t2Start, t2End)}%`,
                                          top: '75px'
                                        }}
                                      >
                                        <div className="flex justify-between mb-1 text-xs font-mono text-wherelse-blue">
                                          <span>{formatDate(t2Start)}</span>
                                          <span>{formatDate(t2End)}</span>
                                        </div>
                                        <div className="h-9 bg-wherelse-blue/70 rounded-full flex items-center justify-center">
                                          <span className="text-sm font-bold text-wherelse-cream tracking-wider uppercase">
                                            {overlap.travelers[1]}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Month labels at bottom */}
                                      <div className="absolute bottom-0 left-0 right-0">
                                        {months.map((m, i) => (
                                          <span
                                            key={i}
                                            className="absolute text-sm font-condensed text-wherelse-cream/40 tracking-widest"
                                            style={{ left: `${m.pos}%`, transform: 'translateX(8px)' }}
                                          >
                                            {m.label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Fallback to text if no timeline data */}
                              {totalDays === 0 && (overlap.traveler1From || overlap.traveler2From) && (
                                <div className="grid md:grid-cols-2 gap-2 mb-4 text-sm">
                                  {overlap.traveler1From && (
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-wherelse-yellow rounded-full" />
                                      <span className="text-wherelse-charcoal">
                                        <strong>{overlap.travelers[0]}</strong>: {overlap.traveler1From.dates || `${formatShortDate(overlap.traveler1From.startDate)} - ${formatShortDate(overlap.traveler1From.endDate)}`}
                                      </span>
                                    </div>
                                  )}
                                  {overlap.traveler2From && (
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-wherelse-olive rounded-full" />
                                      <span className="text-wherelse-charcoal">
                                        <strong>{overlap.travelers[1]}</strong>: {overlap.traveler2From.dates || `${formatShortDate(overlap.traveler2From.startDate)} - ${formatShortDate(overlap.traveler2From.endDate)}`}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-wherelse-charcoal opacity-70">
                                <span>{formatDateLong(overlap.startDate)} – {formatDateLong(overlap.endDate)}</span>
                                <span className="badge badge-olive">
                                  {overlap.days} {overlap.days === 1 ? 'day' : 'days'} together
                                </span>
                              </div>
                              
                              {overlap.whyHere && (
                                <p className="text-sm text-wherelse-charcoal opacity-60 mt-3 italic">
                                  {overlap.whyHere}
                                </p>
                              )}
                            </div>
                            
                            <button className="btn-olive whitespace-nowrap">
                              Perfect Match!
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                )}
                
                {/* Near-Miss Overlaps - Same city, dates just barely don't overlap */}
                {overlaps.filter(o => o.type === 'near-miss').length > 0 && (
                  <div className="animate-slide-up stagger-2">
                    <p className="brand-text text-wherelse-olive mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      SO CLOSE! JUST DAYS APART
                    </p>
                    <div className="space-y-4">
                      {overlaps.filter(o => o.type === 'near-miss').map((overlap, index) => {
                        // Helper to parse date string like "Apr 1 - Apr 10" or "Mar 14 - Apr 4"
                        const parseDateRange = (dateStr) => {
                          if (!dateStr) return { start: null, end: null };
                          const match = dateStr.match(/(\w+\s+\d+)\s*[-–]\s*(\w+\s+\d+)/);
                          if (match) {
                            const currentYear = new Date().getFullYear();
                            const start = new Date(`${match[1]}, ${currentYear}`);
                            let end = new Date(`${match[2]}, ${currentYear}`);
                            if (end < start) {
                              end = new Date(`${match[2]}, ${currentYear + 1}`);
                            }
                            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                              return { start, end };
                            }
                          }
                          return { start: null, end: null };
                        };
                        
                        // Calculate timeline data - try new format first, then fallback to parsing dates string
                        let t1Start = overlap.traveler1From?.startDate ? new Date(overlap.traveler1From.startDate) : null;
                        let t1End = overlap.traveler1From?.endDate ? new Date(overlap.traveler1From.endDate) : null;
                        let t2Start = overlap.traveler2From?.startDate ? new Date(overlap.traveler2From.startDate) : null;
                        let t2End = overlap.traveler2From?.endDate ? new Date(overlap.traveler2From.endDate) : null;
                        
                        // Fallback: parse from dates string
                        if (!t1Start && overlap.traveler1From?.dates) {
                          const parsed = parseDateRange(overlap.traveler1From.dates);
                          t1Start = parsed.start;
                          t1End = parsed.end;
                        }
                        if (!t2Start && overlap.traveler2From?.dates) {
                          const parsed = parseDateRange(overlap.traveler2From.dates);
                          t2Start = parsed.start;
                          t2End = parsed.end;
                        }
                        
                        // Get the full range
                        const allDates = [t1Start, t1End, t2Start, t2End].filter(Boolean);
                        const rangeStart = allDates.length ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
                        const rangeEnd = allDates.length ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;
                        const totalDays = rangeStart && rangeEnd ? Math.ceil((rangeEnd - rangeStart) / (1000 * 60 * 60 * 24)) + 1 : 0;
                        
                        const getPosition = (date) => {
                          if (!date || !rangeStart || totalDays === 0) return 0;
                          return ((date.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) / totalDays * 100;
                        };
                        const getWidth = (start, end) => {
                          if (!start || !end || totalDays === 0) return 0;
                          return ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1) / totalDays * 100;
                        };
                        
                        const t1Left = getPosition(t1Start);
                        const t1Width = getWidth(t1Start, t1End);
                        const t2Left = getPosition(t2Start);
                        const t2Width = getWidth(t2Start, t2End);
                        
                        const formatShortDate = (dateStr) => {
                          if (!dateStr) return '';
                          const d = new Date(dateStr);
                          if (isNaN(d.getTime())) return dateStr;
                          return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        };
                        
                        // Get display dates
                        const t1DisplayStart = t1Start ? formatShortDate(t1Start) : '';
                        const t1DisplayEnd = t1End ? formatShortDate(t1End) : '';
                        const t2DisplayStart = t2Start ? formatShortDate(t2Start) : '';
                        const t2DisplayEnd = t2End ? formatShortDate(t2End) : '';
                        
                        return (
                        <div
                          key={`near-miss-${index}`}
                          className="card-olive p-6 animate-slide-up"
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="badge badge-yellow">Near Miss</span>
                                {overlap.gapDays > 0 && (
                                  <span className="badge badge-outline text-wherelse-cream">
                                    {overlap.gapDays} day{overlap.gapDays !== 1 ? 's' : ''} apart
                                  </span>
                                )}
                              </div>
                              
                              <h4 className="headline-xl text-2xl md:text-3xl text-wherelse-cream mb-2">
                                {overlap.city.toUpperCase()}
                              </h4>
                              <p className="text-wherelse-cream opacity-60 font-body mb-4">
                                {overlap.country}
                              </p>
                              
                              {/* Visual Timeline - Calendar Style */}
                              {totalDays > 0 && (() => {
                                // Extend range to full months
                                const extRangeStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
                                const extRangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() + 2, 0);
                                const extTotalDays = Math.ceil((extRangeEnd - extRangeStart) / (1000 * 60 * 60 * 24)) + 1;
                                
                                const getExtPos = (d) => ((d.getTime() - extRangeStart.getTime()) / (1000 * 60 * 60 * 24)) / extTotalDays * 100;
                                const getExtWidth = (s, e) => ((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) + 1) / extTotalDays * 100;
                                
                                // Generate month markers
                                const months = [];
                                let current = new Date(extRangeStart);
                                while (current <= extRangeEnd) {
                                  months.push({
                                    label: current.toLocaleDateString('en-US', { month: 'long' }).toUpperCase(),
                                    pos: getExtPos(current)
                                  });
                                  current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                                }
                                
                                const formatDate = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
                                
                                return (
                                  <div className="bg-wherelse-charcoal/50 rounded-xl p-5 mb-4">
                                    <p className="text-sm text-wherelse-cream/60 font-condensed tracking-widest mb-5 uppercase">
                                      Timeline in {overlap.city}
                                    </p>
                                    
                                    {/* Timeline container */}
                                    <div className="relative" style={{ height: '160px' }}>
                                      {/* Vertical grid lines for each month */}
                                      {months.map((m, i) => (
                                        <div
                                          key={i}
                                          className="absolute top-0 bottom-6 w-px bg-wherelse-cream/10"
                                          style={{ left: `${m.pos}%` }}
                                        />
                                      ))}
                                      
                                      {/* Traveler 1 bar - upper position */}
                                      <div 
                                        className="absolute"
                                        style={{ 
                                          left: `${getExtPos(t1Start)}%`, 
                                          width: `${getExtWidth(t1Start, t1End)}%`,
                                          top: '10px'
                                        }}
                                      >
                                        <div className="flex justify-between mb-1 text-xs font-mono text-wherelse-yellow">
                                          <span>{formatDate(t1Start)}</span>
                                          <span>{formatDate(t1End)}</span>
                                        </div>
                                        <div className="h-9 bg-wherelse-yellow rounded-full flex items-center justify-center">
                                          <span className="text-sm font-bold text-wherelse-charcoal tracking-wider uppercase">
                                            {overlap.travelers[0]}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Traveler 2 bar - lower position */}
                                      <div 
                                        className="absolute"
                                        style={{ 
                                          left: `${getExtPos(t2Start)}%`, 
                                          width: `${getExtWidth(t2Start, t2End)}%`,
                                          top: '75px'
                                        }}
                                      >
                                        <div className="flex justify-between mb-1 text-xs font-mono text-wherelse-blue">
                                          <span>{formatDate(t2Start)}</span>
                                          <span>{formatDate(t2End)}</span>
                                        </div>
                                        <div className="h-9 bg-wherelse-blue/70 rounded-full flex items-center justify-center">
                                          <span className="text-sm font-bold text-wherelse-cream tracking-wider uppercase">
                                            {overlap.travelers[1]}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Month labels at bottom */}
                                      <div className="absolute bottom-0 left-0 right-0">
                                        {months.map((m, i) => (
                                          <span
                                            key={i}
                                            className="absolute text-sm font-condensed text-wherelse-cream/30 tracking-widest"
                                            style={{ left: `${m.pos}%`, transform: 'translateX(8px)' }}
                                          >
                                            {m.label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              
                              {/* Fallback to text if no timeline data */}
                              {totalDays === 0 && (
                                <div className="grid md:grid-cols-2 gap-3 mb-4">
                                  {overlap.traveler1From && (
                                    <div className="flex items-start gap-2 text-sm">
                                      <div className="w-2 h-2 bg-wherelse-yellow mt-1.5 rounded-full" />
                                      <div>
                                        <span className="font-bold text-wherelse-cream">{overlap.travelers[0]}</span>
                                        <span className="text-wherelse-cream opacity-70 block">
                                          {overlap.traveler1From.dates || `${formatShortDate(overlap.traveler1From.startDate)} - ${formatShortDate(overlap.traveler1From.endDate)}`}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                  {overlap.traveler2From && (
                                    <div className="flex items-start gap-2 text-sm">
                                      <div className="w-2 h-2 bg-wherelse-blue mt-1.5 rounded-full" />
                                      <div>
                                        <span className="font-bold text-wherelse-cream">{overlap.travelers[1]}</span>
                                        <span className="text-wherelse-cream opacity-70 block">
                                          {overlap.traveler2From.dates || `${formatShortDate(overlap.traveler2From.startDate)} - ${formatShortDate(overlap.traveler2From.endDate)}`}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              {overlap.adjustment && (
                                <p className="text-sm text-wherelse-yellow font-medium mt-2">
                                  💡 {overlap.adjustment}
                                </p>
                              )}
                            </div>
                            
                            <button className="btn-yellow whitespace-nowrap">
                              Worth Adjusting!
                            </button>
                          </div>
                        </div>
                      )})}
                    </div>
                  </div>
                )}
                
                {/* Potential Meetups */}
                {overlaps.filter(o => o.type === 'potential').length > 0 && (
                  <div className="animate-slide-up stagger-3">
                    <p className="brand-text text-wherelse-blue mb-4 flex items-center gap-2">
                      <Navigation className="w-4 h-4" />
                      MEET IN THE MIDDLE
                    </p>
                    <div className="space-y-4">
                      {overlaps
                        .filter(o => o.type === 'potential')
                        .sort((a, b) => (a.priority || 0) - (b.priority || 0))
                        .slice(0, 10)
                        .map((overlap, index) => (
                        <div
                          key={`potential-${index}`}
                          className="card-cream p-6 animate-slide-up"
                          style={{ animationDelay: `${index * 0.1}s` }}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                <span className="badge badge-blue">Potential Meetup</span>
                              </div>
                              
                              <h4 className="headline-xl text-2xl md:text-3xl text-wherelse-charcoal mb-1">
                                MEET IN {overlap.city.toUpperCase()}
                              </h4>
                              <p className="text-wherelse-charcoal opacity-60 font-body mb-4">
                                {overlap.country}
                              </p>
                              
                              {/* Visual Route Diagram - Meeting Halfway */}
                              {(overlap.traveler1From || overlap.traveler2From) && (
                                <div className="bg-wherelse-olive/10 rounded-xl p-4 mb-4">
                                  <div className="flex items-center justify-between gap-2">
                                    {/* Traveler 1 origin */}
                                    <div className="flex-1 text-center">
                                      <div className="w-10 h-10 mx-auto rounded-full bg-wherelse-yellow flex items-center justify-center text-wherelse-charcoal font-bold text-sm mb-1">
                                        {overlap.travelers?.[0]?.[0] || 'T'}
                                      </div>
                                      <p className="text-xs font-medium text-wherelse-charcoal truncate">
                                        {overlap.traveler1From?.city || '?'}
                                      </p>
                                      <p className="text-[10px] text-wherelse-charcoal/50 truncate">
                                        {overlap.travelers?.[0]}
                                      </p>
                                    </div>
                                    
                                    {/* Arrow */}
                                    <div className="flex items-center gap-1 text-wherelse-olive/50">
                                      <div className="w-8 h-px bg-wherelse-olive/30" />
                                      <ArrowRight className="w-3 h-3" />
                                    </div>
                                    
                                    {/* Meetup Point */}
                                    <div className="flex-1 text-center">
                                      <div className="w-12 h-12 mx-auto rounded-full bg-green-500 flex items-center justify-center shadow-lg ring-4 ring-green-500/20">
                                        <MapPin className="w-5 h-5 text-white" />
                                      </div>
                                      <p className="text-sm font-bold text-wherelse-charcoal mt-1">
                                        {overlap.city}
                                      </p>
                                      <p className="text-[10px] text-green-600 font-medium">
                                        Meet here!
                                      </p>
                                    </div>
                                    
                                    {/* Arrow */}
                                    <div className="flex items-center gap-1 text-wherelse-olive/50">
                                      <ArrowRight className="w-3 h-3 rotate-180" />
                                      <div className="w-8 h-px bg-wherelse-olive/30" />
                                    </div>
                                    
                                    {/* Traveler 2 origin */}
                                    <div className="flex-1 text-center">
                                      <div className="w-10 h-10 mx-auto rounded-full bg-wherelse-blue flex items-center justify-center text-white font-bold text-sm mb-1">
                                        {overlap.travelers?.[1]?.[0] || 'T'}
                                      </div>
                                      <p className="text-xs font-medium text-wherelse-charcoal truncate">
                                        {overlap.traveler2From?.city || '?'}
                                      </p>
                                      <p className="text-[10px] text-wherelse-charcoal/50 truncate">
                                        {overlap.travelers?.[1]}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {/* Travel info */}
                                  <div className="flex justify-center gap-6 mt-3 text-[10px] text-wherelse-charcoal/60">
                                    {overlap.traveler1From?.dates && (
                                      <span>{overlap.travelers?.[0]}: {overlap.traveler1From.dates}</span>
                                    )}
                                    {overlap.traveler2From?.dates && (
                                      <span>{overlap.travelers?.[1]}: {overlap.traveler2From.dates}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                              
                              {/* Fallback to text list if no traveler info */}
                              {!overlap.traveler1From && !overlap.traveler2From && overlap.currentLocations && (
                                <div className="grid md:grid-cols-2 gap-3 mb-4">
                                  {overlap.currentLocations.map((loc, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm">
                                      <div className="w-2 h-2 bg-wherelse-olive rounded-full" />
                                      <span className="font-body text-wherelse-charcoal">
                                        <strong>{loc.traveler}</strong> from {loc.city}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              <div className="flex flex-wrap items-center gap-4 text-sm">
                                <span className="font-mono text-wherelse-charcoal opacity-60">
                                  {formatDateLong(overlap.startDate)} – {formatDateLong(overlap.endDate)}
                                </span>
                                <span className="badge badge-outline">
                                  {overlap.days} days available
                                </span>
                              </div>
                              
                              {overlap.whyHere && (
                                <p className="text-sm text-wherelse-olive font-medium mt-3">
                                  💡 {overlap.whyHere}
                                </p>
                              )}
                              
                              {overlap.adjustment && (
                                <p className="text-xs text-wherelse-charcoal opacity-60 mt-2 italic">
                                  {overlap.adjustment}
                                </p>
                              )}
                            </div>
                            
                            <button className="btn-primary whitespace-nowrap">
                              Explore Option
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-wherelse-charcoal-dark mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <p className="text-wherelse-cream font-condensed font-bold tracking-wider">WHERELSE</p>
            <p className="text-xs text-wherelse-gray opacity-50">
              A living guide to living good everywhere we go
            </p>
          </div>
        </div>
      </footer>
      
      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShareModalOpen(false)}
          />
          <div className="relative bg-wherelse-charcoal border border-wherelse-cream/20 rounded-2xl p-6 w-full max-w-md animate-scale-in">
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 text-wherelse-cream/50 hover:text-wherelse-cream"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-wherelse-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Share2 className="w-8 h-8 text-wherelse-yellow" />
              </div>
              <h3 className="font-headline-xl text-2xl text-wherelse-cream mb-2">
                Share Your Trip
              </h3>
              {shareModalData?.travelerName && (
                <p className="text-wherelse-cream/60 text-sm">
                  {shareModalData.travelerName}'s adventure is ready to share
                </p>
              )}
            </div>
            
            {shareLoading ? (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="w-8 h-8 text-wherelse-yellow animate-spin mb-3" />
                <p className="text-wherelse-cream/70 text-sm">Creating share link...</p>
              </div>
            ) : shareModalData ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-wherelse-cream/70 text-sm mb-2">Share Link</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shareModalData.shareUrl}
                      readOnly
                      className="flex-1 px-4 py-3 bg-wherelse-charcoal-dark border border-wherelse-cream/20 rounded-lg text-wherelse-cream text-sm font-mono"
                    />
                    <button
                      onClick={copyShareLink}
                      className={`px-4 py-3 rounded-lg font-bold transition-all ${
                        shareCopied 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-wherelse-yellow text-wherelse-charcoal hover:bg-wherelse-yellow/90'
                      }`}
                    >
                      {shareCopied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                
                <p className="text-wherelse-cream/50 text-xs text-center">
                  {shareModalData.isLocal 
                    ? 'Note: This is a local link. Set up Supabase for cloud sharing.'
                    : 'Anyone with this link can view your trip and add their own to find overlaps.'
                  }
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => window.open(shareModalData.shareUrl, '_blank')}
                    className="flex-1 py-3 border border-wherelse-cream/20 text-wherelse-cream rounded-lg hover:bg-wherelse-cream/5 transition-colors flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      copyShareLink();
                      setShareModalOpen(false);
                    }}
                    className="flex-1 py-3 bg-wherelse-yellow text-wherelse-charcoal font-bold rounded-lg hover:bg-wherelse-yellow/90 transition-colors"
                  >
                    Copy & Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default WherelseAtlas;
