-- ==========================================================
-- CLIENT HUNTER: PHASE 1 SUPABASE POSTGRESQL SCHEMA
-- ==========================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. LEADS TABLE
CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    place_id TEXT UNIQUE,
    title TEXT NOT NULL,
    category TEXT,
    address TEXT,
    city TEXT,
    phone TEXT,
    website TEXT,
    review_count INTEGER DEFAULT 0,
    review_rating NUMERIC(3,2) DEFAULT 0.0,
    gmb_owner_name TEXT,
    gmb_link TEXT,
    pain_points JSONB DEFAULT '[]'::jsonb, -- e.g. ["no_website", "low_rating", "reputation_risk"]
    status TEXT DEFAULT 'new',             -- 'new', 'enriched', 'pitched', 'emailed', 'replied', 'dead'
    raw_data JSONB DEFAULT '{}'::jsonb,    -- stores original scraped payload (reviews, timings, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_pain_points ON leads USING GIN(pain_points);

-- 2. DECISION MAKERS TABLE (Owner / Doctors / Key Contacts)
CREATE TABLE IF NOT EXISTS decision_makers (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    title_role TEXT DEFAULT 'Owner',       -- Owner, Founder, Principal Dentist, CEO
    email TEXT,
    email_source TEXT,                     -- website_crawl, google_dork, pattern_match
    linkedin_url TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    phone TEXT,
    confidence_score INTEGER DEFAULT 50,   -- 0 to 100
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_makers_lead_id ON decision_makers(lead_id);
CREATE INDEX IF NOT EXISTS idx_decision_makers_email ON decision_makers(email);

-- 3. OUTREACH LOGS TABLE (Email & DM Dispatch Records)
CREATE TABLE IF NOT EXISTS outreach_logs (
    id BIGSERIAL PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    decision_maker_id BIGINT REFERENCES decision_makers(id) ON DELETE SET NULL,
    channel TEXT DEFAULT 'email',          -- email, whatsapp, linkedin
    recipient_email TEXT,
    subject TEXT,
    body_content TEXT,
    status TEXT DEFAULT 'queued',          -- queued, sent, failed, opened, replied
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_lead_id ON outreach_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_logs(status);

-- 4. SCRAPING JOBS TABLE (Session Tracking)
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id TEXT UNIQUE NOT NULL,
    query TEXT NOT NULL,
    city TEXT NOT NULL,
    total_found INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',         -- pending, running, completed, failed
    log_output TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
