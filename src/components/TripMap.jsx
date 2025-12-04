import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Same color palette as TripTimeline for country-based coloring
const COUNTRY_COLORS = [
  '#F7D400', // Yellow
  '#5B7BC0', // Blue
  '#E57373', // Red/coral
  '#81C784', // Green
  '#BA68C8', // Purple
  '#4DD0E1', // Cyan
  '#FFB74D', // Orange
  '#A1887F', // Brown
  '#90A4AE', // Blue-grey
  '#F48FB1', // Pink
];

// Custom marker icons with colors
const createIcon = (color, size = 24) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
};

// Component to auto-fit bounds
function FitBounds({ bounds }) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, bounds]);
  
  return null;
}

export default function TripMap({ 
  itineraries = [], 
  overlaps = [],
  height = '400px',
  showRoute = true,
  interactive = true,
  colorByCountry = true, // New prop to enable country-based coloring
  showMeetupLines = false // Draw lines from travelers to meetup point
}) {
  // Build country color map from all itineraries (same logic as TripTimeline)
  const countryColorMap = useMemo(() => {
    const colorMap = new Map();
    let colorIndex = 0;
    
    itineraries.forEach(itin => {
      (itin.legs || []).forEach(leg => {
        if (leg.country && !colorMap.has(leg.country)) {
          colorMap.set(leg.country, COUNTRY_COLORS[colorIndex % COUNTRY_COLORS.length]);
          colorIndex++;
        }
      });
    });
    
    return colorMap;
  }, [itineraries]);
  
  // Get color for a country
  const getCountryColor = (country) => {
    return countryColorMap.get(country) || COUNTRY_COLORS[0];
  };
  
  // Collect all points for bounds calculation (including overlaps)
  const allPoints = [];
  itineraries.forEach(itin => {
    itin.legs?.forEach(leg => {
      if (leg.lat && leg.lng) {
        allPoints.push([leg.lat, leg.lng]);
      }
    });
  });
  
  // Add overlap points to bounds
  overlaps.forEach(overlap => {
    if (overlap.lat && overlap.lng) {
      allPoints.push([overlap.lat, overlap.lng]);
    }
  });
  
  // Default center if no points
  const defaultCenter = [40, 0];
  const center = allPoints.length > 0 
    ? [
        allPoints.reduce((sum, p) => sum + p[0], 0) / allPoints.length,
        allPoints.reduce((sum, p) => sum + p[1], 0) / allPoints.length
      ]
    : defaultCenter;
  
  // Format date for popup
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  return (
    <MapContainer
      center={center}
      zoom={3}
      style={{ height, width: '100%', borderRadius: '12px' }}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
    >
      <TileLayer
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>'
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
      />
      
      {allPoints.length > 0 && <FitBounds bounds={allPoints} />}
      
      {itineraries.map((itin, itinIdx) => {
        const legsWithCoords = (itin.legs || []).filter(leg => leg.lat && leg.lng);
        
        return (
          <div key={itin.id || itinIdx}>
            {/* Markers for each destination - colored by country */}
            {legsWithCoords.map((leg, legIdx) => {
              const color = colorByCountry 
                ? getCountryColor(leg.country)
                : COUNTRY_COLORS[itinIdx % COUNTRY_COLORS.length];
              const icon = createIcon(color);
              
              return (
                <Marker
                  key={leg.id || legIdx}
                  position={[leg.lat, leg.lng]}
                  icon={icon}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-bold text-wherelse-charcoal flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: color }}
                        />
                        {leg.city}, {leg.country}
                      </div>
                      <div className="text-wherelse-olive">{itin.travelerName}</div>
                      <div className="text-xs mt-1">
                        {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            
            {/* Route line connecting destinations - gradient effect using segments */}
            {showRoute && legsWithCoords.length > 1 && (
              <>
                {legsWithCoords.slice(0, -1).map((leg, idx) => {
                  const nextLeg = legsWithCoords[idx + 1];
                  const color = colorByCountry 
                    ? getCountryColor(leg.country)
                    : COUNTRY_COLORS[itinIdx % COUNTRY_COLORS.length];
                  
                  return (
                    <Polyline
                      key={`route-${leg.id || idx}`}
                      positions={[[leg.lat, leg.lng], [nextLeg.lat, nextLeg.lng]]}
                      color={color}
                      weight={3}
                      opacity={0.7}
                      dashArray="8, 8"
                    />
                  );
                })}
              </>
            )}
          </div>
        );
      })}
      
      {/* Overlap markers */}
      {overlaps.map((overlap, idx) => {
        const lat = overlap.lat;
        const lng = overlap.lng;
        
        if (!lat || !lng) return null;
        
        return (
          <Marker
            key={`overlap-${idx}`}
            position={[lat, lng]}
            icon={createIcon('#22C55E', 30)} // Larger green marker for overlaps
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold text-green-600">
                  {overlap.type === 'natural' ? '✨ Natural Overlap!' : '📍 Meetup Spot'}
                </div>
                <div className="font-medium">{overlap.city}, {overlap.country}</div>
                <div className="text-xs mt-1">
                  {overlap.travelers?.join(' & ')}
                </div>
                <div className="text-xs">
                  {formatDate(overlap.startDate)} — {formatDate(overlap.endDate)}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
      
      {/* Lines from each traveler to meetup point */}
      {showMeetupLines && overlaps.length > 0 && overlaps[0].lat && overlaps[0].lng && (
        <>
          {itineraries.map((itin, itinIdx) => {
            const legsWithCoords = (itin.legs || []).filter(leg => leg.lat && leg.lng);
            if (legsWithCoords.length === 0) return null;
            
            // Draw line from first leg to meetup point
            const firstLeg = legsWithCoords[0];
            const meetupPoint = [overlaps[0].lat, overlaps[0].lng];
            const color = COUNTRY_COLORS[itinIdx % COUNTRY_COLORS.length];
            
            return (
              <Polyline
                key={`meetup-line-${itinIdx}`}
                positions={[[firstLeg.lat, firstLeg.lng], meetupPoint]}
                color={color}
                weight={3}
                opacity={0.8}
                dashArray="10, 6"
              />
            );
          })}
        </>
      )}
    </MapContainer>
  );
}
