import { useMemo } from 'react';

// Color palette for countries
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

export default function TripTimeline({ legs, height = '160px', showLabels = true }) {
  if (!legs || legs.length === 0) return null;
  
  // Calculate timeline bounds and assign country colors
  const timelineData = useMemo(() => {
    const dates = legs
      .filter(leg => leg.startDate && leg.endDate)
      .map(leg => ({
        start: new Date(leg.startDate).getTime(),
        end: new Date(leg.endDate).getTime(),
        leg
      }));
    
    if (dates.length === 0) return null;
    
    const minDate = Math.min(...dates.map(d => d.start));
    const maxDate = Math.max(...dates.map(d => d.end));
    const totalDuration = maxDate - minDate;
    
    // Assign colors to countries
    const countryColorMap = new Map();
    let colorIndex = 0;
    legs.forEach(leg => {
      if (!countryColorMap.has(leg.country)) {
        countryColorMap.set(leg.country, COUNTRY_COLORS[colorIndex % COUNTRY_COLORS.length]);
        colorIndex++;
      }
    });
    
    // Generate month markers
    const months = [];
    const startDate = new Date(minDate);
    const endDate = new Date(maxDate);
    
    // Start from the first of the start month
    let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    
    while (current <= endDate) {
      const monthTime = current.getTime();
      if (monthTime >= minDate && monthTime <= maxDate) {
        const percent = ((monthTime - minDate) / totalDuration) * 100;
        months.push({
          date: new Date(current),
          percent,
          label: current.toLocaleDateString('en-US', { month: 'short' })
        });
      }
      // Move to next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    return {
      dates,
      minDate,
      maxDate,
      totalDuration,
      countryColorMap,
      months
    };
  }, [legs]);
  
  if (!timelineData) return null;
  
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const getCountryColor = (country) => {
    return timelineData.countryColorMap.get(country) || COUNTRY_COLORS[0];
  };
  
  return (
    <div className="relative" style={{ height }}>
      {/* Month markers */}
      <div className="absolute top-0 left-0 right-0 h-6">
        {timelineData.months.map((month, idx) => (
          <div
            key={idx}
            className="absolute flex flex-col items-center"
            style={{ left: `${month.percent}%` }}
          >
            <span className="text-xs font-mono text-wherelse-cream/40 whitespace-nowrap">
              {month.label}
            </span>
            <div className="w-px h-3 bg-wherelse-cream/20 mt-1" />
          </div>
        ))}
      </div>
      
      {/* Timeline bar background */}
      <div className="absolute top-10 left-0 right-0 h-3 bg-wherelse-cream/10 rounded-full" />
      
      {/* Date segments with country colors */}
      {timelineData.dates.map((item, idx) => {
        const startPercent = ((item.start - timelineData.minDate) / timelineData.totalDuration) * 100;
        const endPercent = ((item.end - timelineData.minDate) / timelineData.totalDuration) * 100;
        const width = endPercent - startPercent;
        const color = getCountryColor(item.leg.country);
        
        return (
          <div
            key={item.leg.id || idx}
            className="absolute top-10 group"
            style={{
              left: `${startPercent}%`,
              width: `${Math.max(width, 0.5)}%`,
            }}
          >
            {/* Bar segment */}
            <div
              className="h-3 rounded-full transition-all hover:scale-y-150 cursor-pointer"
              style={{ 
                backgroundColor: item.leg.isValid === false 
                  ? 'rgba(229, 115, 115, 0.5)' 
                  : item.leg.isValidating 
                    ? `${color}50` 
                    : color,
                width: '100%'
              }}
            />
            
            {/* City and country labels below (only show if segment is wide enough) */}
            {showLabels && width > 5 && (
              <div className="absolute top-5 left-0 right-0 overflow-hidden text-center mt-1">
                <p 
                  className="text-xs font-body font-medium truncate"
                  style={{ color: `${color}` }}
                >
                  {item.leg.city}
                </p>
                <p 
                  className="text-[10px] font-body truncate opacity-60"
                  style={{ color: `${color}` }}
                >
                  {item.leg.country}
                </p>
              </div>
            )}
            
            {/* Tooltip on hover */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              <div className="bg-wherelse-charcoal border border-wherelse-cream/20 rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                <div className="flex items-center gap-2 mb-1">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <p className="text-sm font-body text-wherelse-cream font-medium">
                    {item.leg.city}
                  </p>
                </div>
                <p className="text-xs text-wherelse-cream/60 font-body">
                  {item.leg.country}
                </p>
                <p className="text-xs font-mono text-wherelse-cream/50 mt-1">
                  {formatDate(item.leg.startDate)} → {formatDate(item.leg.endDate)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Country legend */}
      {showLabels && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-wrap gap-3 justify-center">
          {Array.from(timelineData.countryColorMap.entries()).map(([country, color]) => (
            <div key={country} className="flex items-center gap-1.5">
              <div 
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-body text-wherelse-cream/60">
                {country}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
