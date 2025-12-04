import React, { useState, useRef } from 'react';
import { Share2, Loader2, Plus, X, Edit2 } from 'lucide-react';
import { saveItineraryToCloud, createSharedTrip } from './lib/supabase';
import TripMap from './components/TripMap';
import TripTimeline from './components/TripTimeline';
import UploadOptions from './components/UploadOptions';
import AddDestinationForm from './components/AddDestinationForm';
import DestinationCard from './components/DestinationCard';
import ShareModal from './components/ShareModal';
import ImageUploadPreview from './components/ImageUploadPreview';
import ShareCTA from './components/ShareCTA';
import LocationAutocomplete from './components/LocationAutocomplete';
import DateRangePicker from './components/DateRangePicker';
import { parseItineraryImage, isValidImageFile, getImagePreviewUrl } from './utils/imageParser';

const WherelseAtlas = () => {
  // Core state
  const [travelerName, setTravelerName] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [legs, setLegs] = useState([]);
  const [isAddingLeg, setIsAddingLeg] = useState(false);
  const [editingLegId, setEditingLegId] = useState(null);
  
  // Form state for adding legs
  const [newLegLocation, setNewLegLocation] = useState(null);
  const [newLegDates, setNewLegDates] = useState({ startDate: null, endDate: null });
  
  // Upload state
  const [imagePreview, setImagePreview] = useState(null);
  const [parsingImage, setParsingImage] = useState(false);
  const [imageError, setImageError] = useState(null);
  
  // Share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  
  // Refs
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ============================================
  // Date Helpers
  // ============================================
  
  const parseDate = (dateStr) => {
    if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const [year, month, day] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(dateStr);
  };

  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = parseDate(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const day = getOrdinal(date.getDate());
    return `${month} ${day}`;
  };

  const formatDateShort = (dateStr) => {
    if (!dateStr) return '';
    const date = parseDate(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  };

  // ============================================
  // Upload Handlers
  // ============================================

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!isValidImageFile(file)) {
      setImageError('Please upload a valid image (JPEG, PNG, WebP, or GIF)');
      return;
    }

    setImagePreview(getImagePreviewUrl(file));
    setImageError(null);
    setParsingImage(true);

    try {
      const result = await parseItineraryImage(file);
      
      if (result.legs && result.legs.length > 0) {
        setLegs(result.legs.map((leg, idx) => ({
          ...leg,
          id: Date.now() + idx,
        })));
        if (result.travelerName) {
          setTravelerName(result.travelerName);
          setNameConfirmed(true);
        }
        setImagePreview(null);
        // Prompt to share after successful upload
        setTimeout(() => setShowShareModal(true), 500);
      } else {
        setImageError('Could not find travel plans in this image. Try a clearer screenshot.');
      }
    } catch (error) {
      console.error('Error parsing image:', error);
      setImageError(error.message || 'Failed to parse image. Please try again.');
    }

    setParsingImage(false);
    event.target.value = '';
  };

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
          const lines = content.split('\n').filter(line => line.trim());
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
          
          const parsedLegs = lines.slice(1).map((line, idx) => {
            const values = line.split(',').map(v => v.trim());
            const leg = { id: Date.now() + idx };
            headers.forEach((header, i) => {
              if (header === 'city') leg.city = values[i];
              else if (header === 'country') leg.country = values[i];
              else if (header.includes('start')) leg.startDate = values[i];
              else if (header.includes('end')) leg.endDate = values[i];
            });
            return leg;
          }).filter(leg => leg.city);
          
          parsedData = { legs: parsedLegs };
        }

        if (parsedData?.legs?.length > 0) {
          setLegs(parsedData.legs.map((leg, idx) => ({
            ...leg,
            id: leg.id || Date.now() + idx,
          })));
          if (parsedData.travelerName) {
            setTravelerName(parsedData.travelerName);
            setNameConfirmed(true);
          }
          // Prompt to share after successful upload
          setTimeout(() => setShowShareModal(true), 500);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please check the format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ============================================
  // Leg Management
  // ============================================

  const addLeg = () => {
    if (!newLegLocation || !newLegDates.startDate || !newLegDates.endDate) return;

    const newLeg = {
      id: Date.now(),
      city: newLegLocation.city,
      country: newLegLocation.country,
      lat: newLegLocation.lat,
      lng: newLegLocation.lng,
      startDate: newLegDates.startDate,
      endDate: newLegDates.endDate,
    };

    setLegs(prev => [...prev, newLeg]);
    resetAddForm();
  };

  const removeLeg = (legId) => {
    setLegs(prev => prev.filter(leg => leg.id !== legId));
  };

  const updateLeg = (legId, updates) => {
    setLegs(prev => prev.map(leg => 
      leg.id === legId ? { ...leg, ...updates } : leg
    ));
    setEditingLegId(null);
  };

  const resetAddForm = () => {
    setNewLegLocation(null);
    setNewLegDates({ startDate: null, endDate: null });
    setIsAddingLeg(false);
  };

  const getSuggestedStartDate = () => {
    if (legs.length > 0) {
      return legs[legs.length - 1].endDate;
    }
    return null;
  };

  // ============================================
  // Sharing
  // ============================================

  const shareTrip = async () => {
    if (!travelerName.trim() || legs.length === 0) {
      alert('Please add your name and at least one destination');
      return;
    }

    setIsSharing(true);

    try {
      const { itineraryId } = await saveItineraryToCloud({
        travelerName,
        legs,
      });

      const { sessionCode } = await createSharedTrip(itineraryId);
      const link = `${window.location.origin}/trip/${sessionCode}`;
      setShareLink(link);
      setShowShareModal(true);
    } catch (error) {
      console.error('Error sharing trip:', error);
      alert('Failed to create share link. Please try again.');
    }

    setIsSharing(false);
  };

  // ============================================
  // Derived State
  // ============================================

  const hasTrip = legs.length > 0;

  // ============================================
  // Leg Edit Form Component
  // ============================================
  
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
                .map(l => ({ startDate: l.startDate, endDate: l.endDate }))}
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={!editLocation.city || !editDates.startDate || !editDates.endDate}
              className="flex-1 px-4 py-2 bg-wherelse-yellow text-wherelse-charcoal rounded-lg hover:bg-wherelse-yellow/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Save
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-wherelse-charcoal text-wherelse-cream rounded-lg hover:bg-wherelse-charcoal-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="min-h-screen bg-wherelse-charcoal">
      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-wherelse-charcoal/95 backdrop-blur-sm border-b border-wherelse-charcoal-dark">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="font-condensed font-bold text-xl tracking-wider text-wherelse-cream">
              WHERELSE
            </h1>
            {hasTrip && (
              <button
                onClick={shareTrip}
                disabled={isSharing || !travelerName.trim()}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {isSharing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Share2 className="w-4 h-4" />
                )}
                Share with Friend
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {!hasTrip ? (
          /* ============================================
             Empty State - Upload/Create
             ============================================ */
          <div className="animate-fade-in">
            {/* Hero */}
            <div className="text-center mb-12">
              <h2 className="headline-xl text-4xl md:text-5xl text-wherelse-cream mb-4">
                WHERE ARE YOU<br />
                <span className="text-wherelse-yellow">GOING?</span>
              </h2>
              <p className="text-wherelse-cream/60 font-body text-lg max-w-md mx-auto">
                Add your travel plans, then share with a friend to find where your paths cross
              </p>
            </div>

            {/* Upload Options */}
            <UploadOptions
              onImageClick={() => imageInputRef.current?.click()}
              onManualClick={() => setIsAddingLeg(true)}
              onFileClick={() => fileInputRef.current?.click()}
            />

            {/* Image Preview */}
            <ImageUploadPreview
              imagePreview={imagePreview}
              isLoading={parsingImage}
              error={imageError}
              onRetry={() => {
                setImagePreview(null);
                setImageError(null);
              }}
            />

            {/* Manual Add Form (Empty State) */}
            {isAddingLeg && (
              <div className="mt-8 max-w-md mx-auto">
                <AddDestinationForm
                  location={newLegLocation}
                  dates={newLegDates}
                  onLocationChange={setNewLegLocation}
                  onDatesChange={setNewLegDates}
                  onSubmit={() => {
                    addLeg();
                    if (travelerName.trim()) setNameConfirmed(true);
                  }}
                  onCancel={resetAddForm}
                  suggestedStartDate={getSuggestedStartDate()}
                  showNameInput={!nameConfirmed}
                  travelerName={travelerName}
                  onNameChange={setTravelerName}
                />
              </div>
            )}
          </div>
        ) : (
          /* ============================================
             Trip View
             ============================================ */
          <div className="animate-fade-in space-y-8">
            {/* Trip Header */}
            <div className="text-center">
              {!nameConfirmed ? (
                <div className="max-w-xs mx-auto mb-6">
                  <input
                    type="text"
                    value={travelerName}
                    onChange={(e) => setTravelerName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && travelerName.trim()) {
                        setNameConfirmed(true);
                      }
                    }}
                    onBlur={() => {
                      if (travelerName.trim()) {
                        setNameConfirmed(true);
                      }
                    }}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-wherelse-charcoal-dark text-wherelse-cream placeholder:text-wherelse-gray rounded-lg text-center text-lg"
                    autoFocus
                  />
                  <p className="text-wherelse-cream/40 text-xs mt-2">Press Enter or click away to confirm</p>
                </div>
              ) : (
                <h2 
                  className="headline-xl text-3xl md:text-4xl text-wherelse-cream mb-2 cursor-pointer hover:opacity-80"
                  onClick={() => setNameConfirmed(false)}
                  title="Click to edit name"
                >
                  {travelerName.toUpperCase()}'S
                  <span className="text-wherelse-yellow"> ADVENTURE</span>
                </h2>
              )}
              <p className="text-wherelse-cream/60 font-body">
                {legs.length} destination{legs.length !== 1 ? 's' : ''} • {formatDateShort(legs[0]?.startDate)} → {formatDateShort(legs[legs.length - 1]?.endDate)}
              </p>
            </div>

            {/* Map */}
            <div className="rounded-xl overflow-hidden border border-wherelse-cream/10">
              <TripMap
                itineraries={[{ travelerName, legs }]}
                overlaps={[]}
                height="300px"
              />
            </div>

            {/* Timeline */}
            <TripTimeline legs={legs} height="100px" showLabels={true} />

            {/* Destinations List */}
            <div className="space-y-3">
              {legs.map((leg, idx) => (
                editingLegId === leg.id ? (
                  // Edit Form
                  <LegEditForm
                    key={leg.id}
                    leg={leg}
                    allLegs={legs}
                    onSave={(updated) => updateLeg(leg.id, updated)}
                    onCancel={() => setEditingLegId(null)}
                    suggestedStartDate={idx > 0 ? legs[idx - 1].endDate : null}
                  />
                ) : (
                  // Display Card
                  <div 
                    key={leg.id} 
                    className="card-cream p-4 flex items-center gap-4 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-wherelse-charcoal/10 flex items-center justify-center font-mono text-sm font-bold text-wherelse-charcoal">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-body font-semibold text-wherelse-charcoal">{leg.city}</h4>
                      <p className="text-sm text-wherelse-charcoal/60">{leg.country}</p>
                      <p className="text-xs font-mono text-wherelse-charcoal/50 mt-1">
                        {formatDate(leg.startDate)} — {formatDate(leg.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingLegId(leg.id)}
                        className="p-2 text-wherelse-charcoal/30 hover:text-wherelse-yellow transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeLeg(leg.id)}
                        className="p-2 text-wherelse-charcoal/30 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              ))}
            </div>

            {/* Add More */}
            {!isAddingLeg ? (
              <button
                onClick={() => setIsAddingLeg(true)}
                className="w-full py-4 border-2 border-dashed border-wherelse-cream/20 rounded-xl text-wherelse-cream/60 hover:border-wherelse-yellow hover:text-wherelse-yellow transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Another Destination
              </button>
            ) : (
              <AddDestinationForm
                location={newLegLocation}
                dates={newLegDates}
                onLocationChange={setNewLegLocation}
                onDatesChange={setNewLegDates}
                onSubmit={addLeg}
                onCancel={resetAddForm}
                suggestedStartDate={getSuggestedStartDate()}
                blockedRanges={legs.map(leg => ({
                  startDate: leg.startDate,
                  endDate: leg.endDate,
                }))}
              />
            )}

            {/* Share CTA */}
            <ShareCTA
              onShare={shareTrip}
              isSharing={isSharing}
              disabled={!travelerName.trim()}
            />
          </div>
        )}
      </main>

      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareLink={shareLink}
        travelerName={travelerName}
      />
    </div>
  );
};

export default WherelseAtlas;
