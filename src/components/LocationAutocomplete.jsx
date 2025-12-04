import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

// Using Photon API (free, based on OpenStreetMap, no API key needed)
const searchPlaces = async (query) => {
  if (!query || query.length < 2) return [];
  
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.features || data.features.length === 0) return [];
    
    // Filter and format results to show cities/places - optimized
    const allowedTypes = new Set(['city', 'town', 'village', 'municipality', 'administrative', 'locality', 'suburb', 'district', 'county', 'state', 'region', 'country']);
    
    // Use Map for faster duplicate checking
    const seen = new Map();
    
    const filtered = [];
    for (const f of data.features) {
      if (!allowedTypes.has(f.properties.type)) continue;
      
      const city = f.properties.name;
      const country = f.properties.country || '';
      const key = `${city}|${country}`;
      
      // Skip duplicates
      if (seen.has(key)) continue;
      seen.set(key, true);
      
      filtered.push({
        id: f.properties.osm_id,
        city,
        country,
        state: f.properties.state,
        type: f.properties.type,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        display: formatDisplayName(f.properties)
      });
      
      // Limit to 10 results for performance
      if (filtered.length >= 10) break;
    }
    
    return filtered;
  } catch (error) {
    console.error('[Geocoding] Error:', error);
    return [];
  }
};

const formatDisplayName = (props) => {
  const parts = [props.name];
  if (props.state && props.state !== props.name) {
    parts.push(props.state);
  }
  if (props.country) {
    parts.push(props.country);
  }
  return parts.join(', ');
};

const LocationAutocomplete = ({ 
  onSelect, 
  placeholder = "Search for a city...",
  initialValue = null,
  className = ""
}) => {
  const [query, setQuery] = useState(initialValue?.city || '');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(query);
      setResults(places);
      setIsLoading(false);
      setIsOpen(true);
    }, 150); // Reduced from 300ms for faster response

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (place) => {
    setQuery(place.city);
    setIsOpen(false);
    setResults([]);
    onSelect({
      city: place.city,
      country: place.country,
      lat: place.lat,
      lng: place.lng
    });
  };

  const handleKeyDown = (e) => {
    if (!isOpen || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const clearInput = () => {
    setQuery('');
    setResults([]);
    onSelect(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wherelse-gray" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-10 py-3 bg-wherelse-charcoal-dark text-wherelse-cream placeholder:text-wherelse-gray text-sm"
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wherelse-gray animate-spin" />
        )}
        {!isLoading && query && (
          <button
            type="button"
            onClick={clearInput}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-wherelse-gray hover:text-wherelse-cream transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-wherelse-charcoal border border-wherelse-charcoal-dark shadow-xl max-h-64 overflow-y-auto">
          {results.map((place, index) => (
            <button
              key={`${place.id}-${index}`}
              type="button"
              onClick={() => handleSelect(place)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-4 py-3 text-left flex items-start gap-3 transition-colors ${
                index === selectedIndex 
                  ? 'bg-wherelse-yellow text-wherelse-charcoal' 
                  : 'text-wherelse-cream hover:bg-wherelse-charcoal-dark'
              }`}
            >
              <MapPin className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                index === selectedIndex ? 'text-wherelse-charcoal' : 'text-wherelse-gray'
              }`} />
              <div className="min-w-0">
                <p className="font-medium truncate">{place.city}</p>
                <p className={`text-xs truncate ${
                  index === selectedIndex ? 'text-wherelse-charcoal/70' : 'text-wherelse-gray'
                }`}>
                  {place.state ? `${place.state}, ` : ''}{place.country}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-wherelse-charcoal border border-wherelse-charcoal-dark shadow-xl p-4 text-center">
          <p className="text-wherelse-gray text-sm">No places found for "{query}"</p>
        </div>
      )}
    </div>
  );
};

export default LocationAutocomplete;

