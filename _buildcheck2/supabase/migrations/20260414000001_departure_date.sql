-- Add departure_date column to cases table
ALTER TABLE cases ADD COLUMN IF NOT EXISTS departure_date date DEFAULT NULL;
