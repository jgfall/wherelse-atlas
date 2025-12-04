# Wherelse Atlas

A beautiful travel planning and meetup finder app for digital nomads. Plan your travels, upload your itinerary, and discover when and where you can meet up with friends who are also traveling.

## Features

- **Personal Travel Planning**: Build and manage your travel itinerary with an intuitive interface
- **Meetup Discovery**: Automatically find natural overlaps (same city, same time) and potential meetup spots
- **Smart Geocoding**: Uses real geocoding to find optimal "meet in the middle" locations without hardcoded cities
- **Share & Export**: Share your itinerary with friends or export it as JSON
- **Local Storage**: Your itineraries are automatically saved in your browser
- **File Import**: Import itineraries from JSON or CSV files

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn

### Installation

1. Navigate to the project directory:
```bash
cd wherelse-atlas
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:5173` (or the port shown in the terminal)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Building an Itinerary

1. Click "Build Itinerary" in the navigation
2. Enter your name (or traveler name)
3. Click "Add Trip Leg" to add destinations
4. Fill in:
   - City name
   - Country name
   - Start date
   - End date
5. Click "Save Itinerary" when done

### Finding Meetups

1. Add at least 2 itineraries (yours and a friend's)
2. Click "Find Overlaps"
3. The app will:
   - Find natural overlaps (same city, same time)
   - Calculate potential meetup spots using geocoding
   - Show distances and fairness scores for each option

### Sharing Itineraries

1. Go to "All Routes" view
2. Click the share icon on any itinerary
3. Copy the link and send it to friends
4. When they open the link, the itinerary will load automatically

### Importing/Exporting

- **Import**: Click the upload zone and select a JSON or CSV file
- **Export**: Click the download icon on any itinerary
- **Export All**: Click "Export All" in the All Routes view

### File Format

JSON format:
```json
{
  "travelerName": "Your Name",
  "legs": [
    {
      "city": "Tokyo",
      "country": "Japan",
      "startDate": "2025-01-15",
      "endDate": "2025-02-14"
    }
  ]
}
```

CSV format:
```
traveler,city,country,startDate,endDate
Your Name,Tokyo,Japan,2025-01-15,2025-02-14
```

## How It Works

### Geocoding

The app uses OpenStreetMap's Nominatim API (free, no API key required) to:
- Convert city names to coordinates
- Calculate distances between locations
- Find actual cities near the midpoint between two travelers
- Score meetup options based on fairness and total distance

### Meetup Algorithm

1. **Natural Overlaps**: Finds when travelers are in the same city at the same time
2. **Potential Meetups**: 
   - Calculates the geographic midpoint between two locations
   - Searches for real cities near that midpoint
   - Scores options based on:
     - Total travel distance (lower is better)
     - Fairness (how equal the distances are for each traveler)
     - Accessibility (prefers major cities)

## Technical Details

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom animations
- **Icons**: Lucide React
- **Geocoding**: OpenStreetMap Nominatim API
- **Storage**: Browser localStorage

## Rate Limits

The app uses OpenStreetMap's Nominatim API which has rate limits:
- 1 request per second (enforced in the code)
- Please be respectful of the service

For production use with higher volume, consider:
- Using a paid geocoding service (Google Maps, Mapbox)
- Implementing server-side caching
- Using your own Nominatim instance

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

