-- PostgreSQL initialization script for HAVE SDK testing
-- This script runs when the PostgreSQL container first starts

-- Ensure the testdb database exists (it should be created automatically via POSTGRES_DB)
-- But we'll add any additional setup here if needed

-- Create uuid-ossp extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a simple test table for verifying the connection
CREATE TABLE IF NOT EXISTS connection_test (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert a test record
INSERT INTO connection_test (message) VALUES ('PostgreSQL is ready for @have/sql testing!');

-- Log that initialization is complete
DO $$
BEGIN
    RAISE NOTICE 'HAVE SDK PostgreSQL test database initialized successfully';
END $$;