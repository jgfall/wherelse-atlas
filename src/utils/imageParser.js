// Image parsing utility using OpenAI Vision API
// Extracts itinerary data from photos of travel plans, screenshots, etc.
// Uses serverless API endpoint to keep API key secure

/**
 * Convert image file to base64
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

/**
 * Ensure a date is in the future - if it's in the past, bump to next year
 */
function ensureFutureDate(dateStr) {
  if (!dateStr) return dateStr;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const date = new Date(dateStr);
  
  // If date is more than 30 days in the past, bump to next year
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  if (date < thirtyDaysAgo) {
    // Bump to next year
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0];
  }
  
  return dateStr;
}

/**
 * Parse an itinerary image using OpenAI Vision via serverless API
 * @param {File} imageFile - The image file to parse
 * @returns {Promise<{travelerName: string, legs: Array}>}
 */
export async function parseItineraryImage(imageFile) {
  // Convert image to base64
  const base64Image = await fileToBase64(imageFile);
  
  try {
    // Call our serverless API endpoint (keeps API key secure)
    const response = await fetch('/api/parse-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base64Image,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Image parsing API error:', error);
      throw new Error(error.error || 'Failed to process image');
    }

    const parsed = await response.json();
    
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    
    // Post-process: ensure all dates are in the future
    const legs = (parsed.legs || []).map((leg, idx) => {
      const startDate = ensureFutureDate(leg.startDate);
      const endDate = ensureFutureDate(leg.endDate);
      
      // Log if we corrected any dates
      if (startDate !== leg.startDate || endDate !== leg.endDate) {
        console.log(`[ImageParser] Corrected dates for ${leg.city}: ${leg.startDate}→${startDate}, ${leg.endDate}→${endDate}`);
      }
      
      return {
        ...leg,
        startDate,
        endDate,
        id: Date.now() + idx,
        canonicalCity: leg.city,
        canonicalCountry: leg.country,
      };
    });
    
    return {
      travelerName: parsed.travelerName,
      legs,
    };
  } catch (error) {
    console.error('Error parsing image:', error);
    throw error;
  }
}

/**
 * Check if a file is a valid image
 */
export function isValidImageFile(file) {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  return validTypes.includes(file.type);
}

/**
 * Get a preview URL for an image file
 */
export function getImagePreviewUrl(file) {
  return URL.createObjectURL(file);
}
