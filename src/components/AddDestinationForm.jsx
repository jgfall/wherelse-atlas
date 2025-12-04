import React from 'react';
import { X, Calendar } from 'lucide-react';
import LocationAutocomplete from './LocationAutocomplete';
import DateRangePicker from './DateRangePicker';

const AddDestinationForm = ({
  location,
  dates,
  onLocationChange,
  onDatesChange,
  onSubmit,
  onCancel,
  suggestedStartDate,
  showNameInput = false,
  travelerName = '',
  onNameChange,
  blockedRanges = [],
}) => {
  const canSubmit = location && dates.startDate && dates.endDate;

  return (
    <div className="dark-glass p-6 rounded-xl border border-wherelse-cream/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="brand-text text-wherelse-cream">ADD DESTINATION</h3>
        <button
          onClick={onCancel}
          className="text-wherelse-cream/50 hover:text-wherelse-cream"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Name Input */}
        {showNameInput && (
          <div>
            <label className="block text-wherelse-cream/70 text-sm font-body mb-2">
              Your name
            </label>
            <input
              type="text"
              value={travelerName}
              onChange={(e) => onNameChange?.(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-wherelse-charcoal-dark text-wherelse-cream placeholder:text-wherelse-gray rounded-lg"
            />
          </div>
        )}

        {/* Location */}
        <div>
          <label className="block text-wherelse-cream/70 text-sm font-body mb-2">
            Where are you going?
          </label>
          <LocationAutocomplete
            onSelect={onLocationChange}
            initialValue={location}
            placeholder="Search for a city..."
          />
        </div>

        {/* Selected Location */}
        {location && (
          <div className="p-3 bg-wherelse-yellow/10 rounded-lg border border-wherelse-yellow/20">
            <p className="text-wherelse-cream font-body font-medium">{location.city}</p>
            <p className="text-wherelse-cream/60 text-sm">{location.country}</p>
          </div>
        )}

        {/* Dates */}
        {location && (
          <div>
            <label className="block text-wherelse-cream/70 text-sm font-body mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              When will you be there?
            </label>
            <DateRangePicker
              startDate={dates.startDate}
              endDate={dates.endDate}
              onRangeSelect={onDatesChange}
              suggestedStartDate={suggestedStartDate}
              blockedRanges={blockedRanges}
            />
          </div>
        )}

        {/* Add Button */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className="w-full py-3 bg-wherelse-yellow text-wherelse-charcoal font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-wherelse-yellow/90 transition-colors"
        >
          Add Destination
        </button>
      </div>
    </div>
  );
};

export default AddDestinationForm;

