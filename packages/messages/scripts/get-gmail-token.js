#!/usr/bin/env node
/**
 * Script to obtain Gmail OAuth2 refresh token
 *
 * Usage:
 *   1. Create OAuth2 credentials in Google Cloud Console (Desktop app)
 *   2. Run: node scripts/get-gmail-token.js <client-id> <client-secret>
 *   3. Open the URL in your browser and authorize
 *   4. Paste the authorization code when prompted
 *   5. Copy the refresh token to your environment variables
 */

import { google } from 'googleapis';
import readline from 'readline';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node scripts/get-gmail-token.js <client-id> <client-secret>');
  process.exit(1);
}

const CLIENT_ID = args[0];
const CLIENT_SECRET = args[1];
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'; // Out-of-band flow

// Gmail scopes needed for tests
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
];

async function getRefreshToken() {
  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent screen to get refresh token
  });

  console.log('\n📧 Gmail OAuth2 Token Generator\n');
  console.log('1. Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\n2. Authorize the application');
  console.log('3. Copy the authorization code\n');

  // Get authorization code from user
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter the authorization code: ', async (code) => {
    rl.close();

    try {
      // Exchange authorization code for tokens
      const { tokens } = await oauth2Client.getToken(code);

      console.log('\n✅ Success! Here are your credentials:\n');
      console.log('export GMAIL_CLIENT_ID="' + CLIENT_ID + '"');
      console.log('export GMAIL_CLIENT_SECRET="' + CLIENT_SECRET + '"');
      console.log('export GMAIL_REFRESH_TOKEN="' + tokens.refresh_token + '"');
      console.log('\n📋 Copy these lines to your terminal or add to .env file\n');

      if (tokens.access_token) {
        console.log('Access token (expires soon): ' + tokens.access_token);
        console.log('Expiry: ' + new Date(tokens.expiry_date).toISOString());
      }
    } catch (error) {
      console.error('\n❌ Error getting tokens:', error.message);
      process.exit(1);
    }
  });
}

getRefreshToken();
