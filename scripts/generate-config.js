#!/usr/bin/env node
/**
 * Generate config.js from environment variables
 * Usage: node scripts/generate-config.js
 * 
 * Reads SUPABASE_URL and SUPABASE_ANON_KEY from environment variables
 * and generates js/config.js
 */

const fs = require('fs');
const path = require('path');

// Try to load .env file if dotenv is available
try {
    require('dotenv').config();
} catch (e) {
    // dotenv not installed, continue without it
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    console.error('   Set them in your .env file or export them before running this script');
    process.exit(1);
}

const configContent = `// Supabase Configuration
// This file is auto-generated from environment variables
// DO NOT commit this file manually - it's generated from .env or CI/CD

const SUPABASECONFIG = {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}'
};
`;

const configPath = path.join(__dirname, '..', 'js', 'config.js');

try {
    fs.writeFileSync(configPath, configContent, 'utf8');
    console.log('✅ Generated js/config.js from environment variables');
    console.log(`   URL: ${SUPABASE_URL.substring(0, 30)}...`);
    console.log(`   Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);
} catch (error) {
    console.error('❌ Failed to write config.js:', error.message);
    process.exit(1);
}

