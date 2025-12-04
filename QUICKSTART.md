# Quick Start Guide

## Installation

```bash
cd wherelse-atlas
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## First Steps

1. **Build Your Itinerary**
   - Click "Build Itinerary"
   - Enter your name
   - Click "Add Trip Leg" and fill in:
     - City (e.g., "Tokyo")
     - Country (e.g., "Japan")
     - Start and end dates
   - Click "Save Itinerary"

2. **Add a Friend's Itinerary**
   - Repeat step 1 with a different name
   - Or import a JSON/CSV file

3. **Find Meetups**
   - Click "Find Overlaps"
   - Wait for geocoding to complete (may take a few seconds)
   - View natural overlaps and potential meetup spots

## Tips

- **Geocoding takes time**: The app uses free OpenStreetMap API which has rate limits. Be patient when finding meetups.
- **Export your data**: Use the download button to save your itineraries as JSON
- **Share with friends**: Click the share icon to get a link you can send
- **Import from spreadsheets**: Export your spreadsheet as CSV and import it

## Example Itinerary JSON

```json
{
  "travelerName": "Alex",
  "legs": [
    {
      "city": "Tokyo",
      "country": "Japan",
      "startDate": "2025-03-01",
      "endDate": "2025-03-15"
    },
    {
      "city": "Seoul",
      "country": "South Korea",
      "startDate": "2025-03-16",
      "endDate": "2025-03-30"
    }
  ]
}
```

Save this as a `.json` file and import it!

