#!/usr/bin/env node
/**
 * Seed Neon markets table from public/data/properties.json
 * Run: node server/seed.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function seed() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'properties.json'), 'utf-8')
  );

  console.log(`Loaded ${raw.length} properties from properties.json`);

  // Clear old data
  await sql`DELETE FROM trades`;
  await sql`DELETE FROM market_state`;
  await sql`DELETE FROM markets`;
  console.log('Cleared old markets, market_state, and trades');

  let inserted = 0;
  for (const item of raw) {
    const propertyId = String(item.zpid);
    const addr = item.address || {};
    const address = item.streetAddress || addr.streetAddress || '';
    const city = item.city || addr.city || 'San Francisco';
    const state = item.state || addr.state || 'CA';
    const zip = item.zipcode || addr.zipcode || '94110';
    const beds = item.bedrooms ?? null;
    const baths = item.bathrooms ?? null;
    const sqft = item.livingArea ?? null;
    const price = item.price || 0;

    if (!price) continue; // skip properties with no price

    const rows = await sql`
      INSERT INTO markets (id, address, city, state, zip_code, beds, baths, sqft, asking_price, status, property_id)
      VALUES (gen_random_uuid(), ${address}, ${city}, ${state}, ${zip}, ${beds}, ${baths}, ${sqft}, ${price}, 'open', ${propertyId})
      RETURNING id
    `;
    const marketId = rows[0].id;

    await sql`
      INSERT INTO market_state (market_id, q_over, q_under, b, total_trades, total_wagered)
      VALUES (${marketId}, 0, 0, 100, 0, 0)
    `;

    inserted++;
  }

  console.log(`Seeded ${inserted} markets with market_state`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
