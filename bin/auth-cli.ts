#!/usr/bin/env node

/**
 * Figma Comment Pilot — OAuth CLI
 *
 * Usage: npx tsx bin/auth-cli.ts
 *
 * Starts a temporary local HTTP server, opens the browser
 * for Figma OAuth authorization, exchanges the code for tokens,
 * and stores them in the SQLite database.
 */

import { startAuthServer } from '../src/figma/auth.js';
import { closeDatabaseConnection } from '../src/db/client.js';

async function main(): Promise<void> {
  console.error('');
  console.error('╔══════════════════════════════════════════════╗');
  console.error('║  Figma Comment Pilot — OAuth Setup           ║');
  console.error('╚══════════════════════════════════════════════╝');
  console.error('');

  try {
    const tokenData = await startAuthServer();

    console.error('');
    console.error('✅ Authorization successful!');
    console.error('');
    console.error('   Access token stored in database.');

    if (tokenData.user_id_string) {
      console.error(`   Bot User ID: ${tokenData.user_id_string}`);
    }

    console.error('');
    console.error('   You can now restart your AI agent.');
    console.error('');
  } catch (err) {
    console.error('');
    console.error('❌ Authorization failed:', err instanceof Error ? err.message : err);
    console.error('');
    process.exit(1);
  } finally {
    closeDatabaseConnection();
  }
}

main();
