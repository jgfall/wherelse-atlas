// Image parsing utility using OpenAI Vision API
// Extracts itinerary data from photos of travel plans, screenshots, etc.

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

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
 * Parse an itinerary image using OpenAI Vision
 * @param {File} imageFile - The image file to parse
 * @returns {Promise<{travelerName: string, legs: Array}>}
 */
export async function parseItineraryImage(imageFile) {
  const apiKey = import.meta.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
  }
  
  // Convert image to base64
  const base64Image = await fileToBase64(imageFile);
  
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12
  const currentDay = today.getDate();
  const todayStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
  
  const prompt = `You are extracting travel itinerary information from an image. Today is ${todayStr}.

CRITICAL DATE RULES - READ CAREFULLY:
- Travel itineraries are ALWAYS for FUTURE trips, not past trips
- Today is ${todayStr} (${currentYear})
- If a date has no year specified, you MUST determine the correct year:
  
  RULE: Compare the month/day to today (${todayStr}):
  - If the month is AFTER the current month (${currentMonth}), use ${currentYear}
  - If the month is BEFORE the current month (${currentMonth}), use ${currentYear + 1} (next year)
  - If the month equals the current month (${currentMonth}) but day is after today's day (${currentDay}), use ${currentYear}
  - If the month equals the current month (${currentMonth}) but day is before/equal today's day (${currentDay}), use ${currentYear + 1}

EXAMPLES (today is ${todayStr}):
- "February 21" → ${currentMonth <= 2 ? (currentMonth < 2 || (currentMonth === 2 && currentDay < 21) ? currentYear : currentYear + 1) : currentYear + 1}-02-21 (February is ${currentMonth <= 2 ? 'this year or next' : 'next year'})
- "March 15" → ${currentMonth <= 3 ? (currentMonth < 3 || (currentMonth === 3 && currentDay < 15) ? currentYear : currentYear + 1) : currentYear + 1}-03-15
- "December 1" → ${currentMonth <= 12 ? (currentMonth < 12 || (currentMonth === 12 && currentDay < 1) ? currentYear : currentYear + 1) : currentYear}-12-01

NEVER return a date that is more than 30 days in the past from ${todayStr}.

OTHER RULES:
1. Extract ALL destinations (cities + countries)
2. Convert dates to YYYY-MM-DD format
3. If only one date shown, use it for both start and end
4. Recognize date formats: "Jan 5-10", "5-10 Jan", "1/15", "15/1", etc.
5. City names in English, full country names
6. Extract traveler name if visible

Return ONLY this JSON (no markdown, no explanation):
{
  "travelerName": "Name or null",
  "legs": [
    {"city": "City", "country": "Country", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"}
  ]
}

If no itinerary found: {"travelerName": null, "legs": []}`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You extract travel itineraries from images. Today is ${todayStr}. All travel dates should be in the FUTURE. If a date appears to be in the past, assume it refers to the next occurrence of that date (next year). Return only valid JSON.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: base64Image,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for more consistent date handling
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenAI API error:', error);
      throw new Error(error.error?.message || 'Failed to process image');
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from AI');
    }

    // Parse the JSON response
    // Handle potential markdown code blocks
    let jsonStr = content;
    if (content.includes('```json')) {
      jsonStr = content.split('```json')[1].split('```')[0];
    } else if (content.includes('```')) {
      jsonStr = content.split('```')[1].split('```')[0];
    }
    
    const parsed = JSON.parse(jsonStr.trim());
    
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
