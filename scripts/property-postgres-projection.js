#!/usr/bin/env node
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PROPERTY_SNAPSHOT_PATH } = require('../server/propertySnapshot');
const {
  PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
  buildPropertyPostgresRows,
  createPropertyPostgresProjection,
} = require('../server/propertyPostgresProjection');

function parseArgs(argv) {
  const args = {
    write: false,
    sourcePath: process.env.FAIRVALUE_PROPERTY_SNAPSHOT_PATH || DEFAULT_PROPERTY_SNAPSHOT_PATH,
    manifestPath: null,
    help: false,
  };

  for (const arg of argv) {
    if (arg === '--write') {
      args.write = true;
    } else if (arg === '--dry-run') {
      args.write = false;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--source=')) {
      args.sourcePath = arg.slice('--source='.length);
    } else if (arg.startsWith('--manifest=')) {
      args.manifestPath = arg.slice('--manifest='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.manifestPath) {
    args.manifestPath = path.join(path.dirname(args.sourcePath), 'property-data-manifest.json');
  }

  return args;
}

function usage() {
  return [
    'Usage: npm run data:postgres:properties -- [--dry-run|--write] [--source=path] [--manifest=path]',
    '',
    'Default mode is --dry-run. It builds the public-safe PostGIS projection summary without touching the database.',
    '--write requires DATABASE_URL and replaces only the fairvalue_property_manifests/fairvalue_properties projection tables.',
  ].join('\n');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function relative(filePath) {
  return path.relative(process.cwd(), filePath) || '.';
}

function summaryFor({ projection, sourcePath, manifestPath, mode }) {
  return {
    ok: true,
    mode,
    projection_schema_version: PROPERTY_POSTGRES_PROJECTION_SCHEMA_VERSION,
    table_name: projection.table_name,
    manifest_table_name: projection.manifest_table_name,
    source: relative(sourcePath),
    manifest: fs.existsSync(manifestPath) ? relative(manifestPath) : null,
    dataset_id: projection.provenance.dataset_id,
    source_sha256: projection.provenance.source_sha256,
    property_count: projection.count,
    sample_property_ids: projection.rows.slice(0, 5).map((row) => row.property_id),
    database_configured: Boolean(process.env.DATABASE_URL),
    limitations: projection.limitations,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const sourcePath = path.resolve(args.sourcePath);
  const manifestPath = path.resolve(args.manifestPath);
  const properties = readJson(sourcePath);
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : {};
  const projection = buildPropertyPostgresRows({ properties, manifest });
  const summary = summaryFor({
    projection,
    sourcePath,
    manifestPath,
    mode: args.write ? 'write' : 'dry-run',
  });

  if (!args.write) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const sql = require('../server/db');
  const store = createPropertyPostgresProjection({ sql });
  if (!store.enabled) {
    throw new Error(`Cannot write property PostGIS projection: ${store.reason}`);
  }

  const written = await store.replaceSnapshot({ properties, manifest });
  console.log(JSON.stringify({
    ...summary,
    wrote: {
      count: written.count,
      table_name: written.table_name,
      manifest_table_name: written.manifest_table_name,
    },
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  summaryFor,
};
