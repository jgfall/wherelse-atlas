// Local storage utilities for persisting itineraries

const STORAGE_KEY = 'wherelse_atlas_itineraries';

export function saveItineraries(itineraries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itineraries));
    return true;
  } catch (error) {
    console.error('Error saving itineraries:', error);
    return false;
  }
}

export function loadItineraries() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error loading itineraries:', error);
    return [];
  }
}

export function exportItinerary(itinerary) {
  const dataStr = JSON.stringify(itinerary, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${itinerary.travelerName.replace(/\s+/g, '-')}-itinerary.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportAllItineraries(itineraries) {
  const dataStr = JSON.stringify(itineraries, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wherelse-atlas-itineraries-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function generateShareLink(itinerary) {
  // For now, we'll use a data URL approach
  // In production, you'd want to upload to a server and get a shareable link
  const encoded = btoa(JSON.stringify(itinerary));
  return `${window.location.origin}${window.location.pathname}?share=${encoded}`;
}

export function parseShareLink() {
  const params = new URLSearchParams(window.location.search);
  const shareData = params.get('share');
  if (shareData) {
    try {
      return JSON.parse(atob(shareData));
    } catch (error) {
      console.error('Error parsing share link:', error);
      return null;
    }
  }
  return null;
}

