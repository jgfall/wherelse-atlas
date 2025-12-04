# 🗺️ Wherelse Atlas - Supabase Setup Guide

## Quick Setup (5 minutes)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click **New Project**
3. Choose a name (e.g., "wherelse-atlas")
4. Set a database password (save this!)
5. Select a region close to you
6. Click **Create new project**

### 2. Run the Database Schema

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Copy the contents of `supabase-schema.sql` from this project
4. Paste it into the SQL editor
5. Click **Run** (or Cmd/Ctrl + Enter)

You should see "Success" - the tables are now created!

### 3. Get Your API Keys

1. Go to **Project Settings** → **API** (left sidebar)
2. Copy these values:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (the longer one, starts with `eyJ...`)

### 4. Configure Your App

Create a `.env` file in your project root:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Restart the Dev Server

```bash
npm run dev
```

---

## 🎉 That's it!

Your app now has:

- **Cloud storage** for itineraries
- **Shareable links** that work across devices
- **Real-time collaboration** (friend can add their trip to your shared link)
- **Map visualization** with Leaflet

---

## Features

### For Individual Users
1. Build your travel itinerary with autocomplete locations
2. See your route visualized on a map
3. Click **Share** to get a unique link

### For Friends
1. Open the shared link
2. See your friend's trip on the map
3. Add your own itinerary
4. Instantly see overlap opportunities!

---

## Database Schema

The app uses 3 tables:

| Table | Purpose |
|-------|---------|
| `itineraries` | Stores traveler info + share code |
| `legs` | Individual destinations with dates |
| `shared_trips` | Links two itineraries for comparison |

---

## Troubleshooting

### "Trip Not Found" error
- Make sure the SQL schema was run successfully
- Check that your `.env` file has the correct keys
- Restart the dev server after changing `.env`

### Map not showing
- Leaflet CSS should load automatically
- Check browser console for errors

### Share links don't work locally
- The share URLs use your current domain
- For local dev, they'll be `http://localhost:5173/trip/abc123`
- For production, deploy to Vercel/Netlify and they'll use your real domain

---

## Deploying to Production

### Vercel (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy!

Your share links will now use your Vercel domain.

### Netlify

Same process - just add the env vars in your site settings.

