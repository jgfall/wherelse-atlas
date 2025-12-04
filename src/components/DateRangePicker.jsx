import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DateRangePicker = ({
  startDate,
  endDate,
  onRangeSelect,
  minDate = null,
  suggestedStartDate = null,
  blockedRanges = [], // Array of { startDate, endDate } objects for dates that are already booked
  className = ""
}) => {
  // Parse YYYY-MM-DD string as local date to avoid timezone issues
  const parseLocalDate = (dateStr) => {
    if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(dateStr);
  };

  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (startDate) return parseLocalDate(startDate);
    if (suggestedStartDate) return parseLocalDate(suggestedStartDate);
    return new Date();
  });
  const [selecting, setSelecting] = useState('start'); // 'start' or 'end'
  const [tempStart, setTempStart] = useState(startDate);
  const [tempEnd, setTempEnd] = useState(endDate);
  const [hoverDate, setHoverDate] = useState(null);
  const containerRef = useRef(null);

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

  // Reset temp values when opening
  useEffect(() => {
    if (isOpen) {
      // If no start date but we have a suggested one, use it
      const initialStart = startDate || suggestedStartDate;
      setTempStart(startDate || suggestedStartDate);
      setTempEnd(endDate);
      setSelecting('start');
      // Set view to startDate, suggestedStartDate, or current date
      if (startDate) {
        setViewDate(parseLocalDate(startDate));
      } else if (suggestedStartDate) {
        setViewDate(parseLocalDate(suggestedStartDate));
      }
    }
  }, [isOpen, startDate, endDate, suggestedStartDate]);

  const formatDateDisplay = (date) => {
    if (!date) return '—';
    // Parse the date string as local time to avoid timezone shift
    // Input can be a Date object or a string like "2024-12-08"
    let d;
    if (typeof date === 'string' && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Parse YYYY-MM-DD as local date, not UTC
      const [year, month, day] = date.split('-').map(Number);
      d = new Date(year, month - 1, day);
    } else {
      d = new Date(date);
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateISO = (date) => {
    const d = new Date(date);
    // Use local date parts to avoid timezone shift (toISOString converts to UTC which can change the day)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const isDateInRange = (date) => {
    if (!tempStart) return false;
    const end = tempEnd || hoverDate;
    if (!end) return false;
    
    const d = parseLocalDate(date);
    const s = parseLocalDate(tempStart);
    const e = parseLocalDate(end);
    
    return d >= s && d <= e;
  };

  const isDateSelected = (date) => {
    if (!date) return false;
    const d = formatDateISO(date);
    return d === tempStart || d === tempEnd;
  };

  const isDateDisabled = (date) => {
    const dateStr = formatDateISO(date);
    const dateObj = parseLocalDate(dateStr);
    
    // Check if date is before minDate (if provided)
    if (minDate && dateObj < parseLocalDate(minDate)) {
      return true;
    }
    
    // Check if date falls within any blocked range (existing leg)
    for (const range of blockedRanges) {
      if (!range.startDate || !range.endDate) continue;
      
      const rangeStart = parseLocalDate(range.startDate);
      const rangeEnd = parseLocalDate(range.endDate);
      
      // Disable dates that overlap with existing legs
      if (dateObj >= rangeStart && dateObj <= rangeEnd) {
        return true;
      }
    }
    
    return false;
  };

  const handleDateClick = (date) => {
    const dateStr = formatDateISO(date);
    
    if (selecting === 'start') {
      setTempStart(dateStr);
      setTempEnd(null);
      setSelecting('end');
    } else {
      // If clicked date is before start, swap them
      if (parseLocalDate(dateStr) < parseLocalDate(tempStart)) {
        setTempEnd(tempStart);
        setTempStart(dateStr);
      } else {
        setTempEnd(dateStr);
      }
      // Auto-confirm after selecting end
      setTimeout(() => {
        onRangeSelect({
          startDate: parseLocalDate(dateStr) < parseLocalDate(tempStart) ? dateStr : tempStart,
          endDate: parseLocalDate(dateStr) < parseLocalDate(tempStart) ? tempStart : dateStr
        });
        setIsOpen(false);
      }, 150);
    }
  };

  const navigateMonth = (direction) => {
    setViewDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const renderCalendar = (monthOffset = 0) => {
    const displayDate = new Date(viewDate);
    displayDate.setMonth(viewDate.getMonth() + monthOffset);
    
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // Empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-9 h-9" />);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDateISO(date);
      const isDisabled = isDateDisabled(date);
      const isSelected = isDateSelected(dateStr);
      const isInRange = isDateInRange(dateStr);
      const isToday = formatDateISO(new Date()) === dateStr;
      const isStart = dateStr === tempStart;
      const isEnd = dateStr === tempEnd || dateStr === hoverDate;
      
      days.push(
        <button
          key={day}
          type="button"
          disabled={isDisabled}
          onClick={() => handleDateClick(date)}
          onMouseEnter={() => selecting === 'end' && tempStart && setHoverDate(dateStr)}
          onMouseLeave={() => setHoverDate(null)}
          className={`
            w-9 h-9 text-sm font-medium transition-all relative
            ${isDisabled 
              ? 'text-wherelse-gray/40 cursor-not-allowed' 
              : isSelected
                ? 'bg-wherelse-yellow text-wherelse-charcoal font-bold'
                : isInRange
                  ? 'bg-wherelse-olive/60 text-wherelse-cream'
                  : 'text-wherelse-cream hover:bg-wherelse-yellow hover:text-wherelse-charcoal cursor-pointer'
            }
            ${isToday && !isSelected 
              ? 'ring-1 ring-wherelse-yellow ring-inset' 
              : ''
            }
            ${isStart ? 'rounded-l' : ''}
            ${isEnd ? 'rounded-r' : ''}
          `}
        >
          {day}
        </button>
      );
    }
    
    return (
      <div className="w-full">
        <div className="text-center mb-3">
          <span className="font-condensed font-semibold text-wherelse-cream">
            {MONTHS[month]} {year}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-2">
          {DAYS.map(day => (
            <div key={day} className="w-9 h-8 flex items-center justify-center text-xs text-wherelse-gray font-medium">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-wherelse-charcoal-dark text-left flex items-center gap-3 hover:bg-wherelse-charcoal transition-colors"
      >
        <Calendar className="w-4 h-4 text-wherelse-gray flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className={startDate ? 'text-wherelse-cream' : 'text-wherelse-gray'}>
              {formatDateDisplay(startDate)}
            </span>
            <span className="text-wherelse-gray">→</span>
            <span className={endDate ? 'text-wherelse-cream' : 'text-wherelse-gray'}>
              {formatDateDisplay(endDate)}
            </span>
          </div>
        </div>
      </button>

      {/* Calendar Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 left-0 bg-wherelse-charcoal border border-wherelse-charcoal-dark shadow-2xl p-4 animate-scale-in">
          {/* Selection indicator */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-wherelse-charcoal-dark">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSelecting('start')}
                className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                  selecting === 'start' 
                    ? 'bg-wherelse-yellow text-wherelse-charcoal' 
                    : 'text-wherelse-gray hover:text-wherelse-cream'
                }`}
              >
                {tempStart ? formatDateDisplay(tempStart) : 'Start Date'}
              </button>
              <span className="text-wherelse-gray">→</span>
              <button
                type="button"
                onClick={() => tempStart && setSelecting('end')}
                disabled={!tempStart}
                className={`text-xs font-medium px-3 py-1.5 transition-colors ${
                  selecting === 'end' 
                    ? 'bg-wherelse-yellow text-wherelse-charcoal' 
                    : tempStart 
                      ? 'text-wherelse-gray hover:text-wherelse-cream'
                      : 'text-wherelse-gray/30 cursor-not-allowed'
                }`}
              >
                {tempEnd ? formatDateDisplay(tempEnd) : 'End Date'}
              </button>
            </div>
            <p className="text-xs text-wherelse-gray">
              {selecting === 'start' ? 'Select start date' : 'Select end date'}
            </p>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className="p-2 text-wherelse-gray hover:text-wherelse-cream hover:bg-wherelse-charcoal-dark transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              className="p-2 text-wherelse-gray hover:text-wherelse-cream hover:bg-wherelse-charcoal-dark transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Two Month View */}
          <div className="flex gap-6">
            {renderCalendar(0)}
            {renderCalendar(1)}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-wherelse-charcoal-dark">
            <div className="flex gap-2">
              {[7, 14, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    const start = new Date();
                    const end = new Date();
                    end.setDate(end.getDate() + days);
                    setTempStart(formatDateISO(start));
                    setTempEnd(formatDateISO(end));
                    onRangeSelect({
                      startDate: formatDateISO(start),
                      endDate: formatDateISO(end)
                    });
                    setIsOpen(false);
                  }}
                  className="text-xs text-wherelse-gray hover:text-wherelse-cream px-2 py-1 hover:bg-wherelse-charcoal-dark transition-colors"
                >
                  {days}d
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-wherelse-gray hover:text-wherelse-cream"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;

