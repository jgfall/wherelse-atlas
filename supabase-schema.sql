-- ============================================================
-- WHERELSE ATLAS DATABASE SCHEMA
-- Run this in your Supabase SQL Editor to set up the database
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ITINERARIES TABLE
-- Stores individual travel itineraries
-- ============================================================
CREATE TABLE itineraries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  share_code VARCHAR(8) UNIQUE NOT NULL,
  traveler_name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast share code lookups
CREATE INDEX idx_itineraries_share_code ON itineraries(share_code);

-- ============================================================
-- LEGS TABLE
-- Stores individual trip legs (destinations) for each itinerary
-- ============================================================
CREATE TABLE legs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  itinerary_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  city VARCHAR(255) NOT NULL,
  country VARCHAR(255) NOT NULL,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  canonical_city VARCHAR(255),
  canonical_country VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  leg_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast itinerary lookups
CREATE INDEX idx_legs_itinerary_id ON legs(itinerary_id);
CREATE INDEX idx_legs_dates ON legs(start_date, end_date);

-- ============================================================
-- SHARED TRIPS TABLE
-- Links two itineraries for collaborative comparison
-- ============================================================
CREATE TABLE shared_trips (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_code VARCHAR(8) UNIQUE NOT NULL,
  itinerary_1_id UUID NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  itinerary_2_id UUID REFERENCES itineraries(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

-- Index for fast session lookups
CREATE INDEX idx_shared_trips_session_code ON shared_trips(session_code);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Allow public read/write for now (no auth required)
-- ============================================================

-- Enable RLS
ALTER TABLE itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_trips ENABLE ROW LEVEL SECURITY;

-- Public policies (anyone can read and create)
CREATE POLICY "Allow public read on itineraries" ON itineraries
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on itineraries" ON itineraries
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on legs" ON legs
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on legs" ON legs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read on shared_trips" ON shared_trips
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert on shared_trips" ON shared_trips
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on shared_trips" ON shared_trips
  FOR UPDATE USING (true);

-- ============================================================
-- REALTIME
-- Enable realtime for shared trips (for live collaboration)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE shared_trips;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to clean up expired shared trips
CREATE OR REPLACE FUNCTION cleanup_expired_shared_trips()
RETURNS void AS $$
BEGIN
  DELETE FROM shared_trips WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

