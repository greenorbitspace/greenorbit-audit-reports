#!/usr/bin/env node
/**
 * Green Orbit Audit — automated pipeline
 *
 * Reads urls.txt, measures real transferred page weight (HTML + linked
 * CSS/JS/image assets), estimates CO2 per visit with the Sustainable Web
 * Design model (CO2.js), checks green hosting via the Green Web Foundation,
 * and writes one JSON file per site into src/content/reports/.
 *
 * No API keys, no CMS, no manual data entry — designed to run unattended
 * on a schedule via GitHub Actions.
 */
import { co2, hosting } from '@tgwf/co2';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const URLS_FILE = path.join(ROOT, 'urls.txt');
const OUT_DIR = path.join(ROOT, 'src', 'content', 'reports');

const MAX_ASSET_REQUESTS = 40; // safety cap per site
const FETCH_TIMEOUT_MS = 15000;
const co2Emitter = new co2({ model: 'swd' });

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function fetchBytes(url) {
  const res = await withTimeout(fetch(url, { redirect: 'follow' }), FETCH_TIMEOUT_MS);
  const buf = await res.arrayBuffer();
  return { bytes: buf.byteLength, res, text: null };
}

function extractAssetUrls(html, baseUrl) {
  const patterns = [
    /<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"'>]+)["']/gi,
    /<script[^>]+src=["']([^"'>]+)["']/gi,
    /<img[^>]+src=["']([^"'>]+)["']/gi,
  ];
  const found = new Set();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      try {
        const resolved = new URL(match[1], baseUrl).toString();
        found.add(resolved);
      } catch {
        // ignore malformed URLs (data:, mailto:, etc.)
      }
    }
  }
  return [...found].slice(0, MAX_ASSET_REQUESTS);
}

async function measurePageWeight(url) {
  const main = await fetchBytes(url);
  const html = await main.res.clone().text().catch(() => '');
  const assetUrls = extractAssetUrls(html, url);

  let assetBytes = 0;
  let assetsCounted = 0;
  await Promise.all(
    assetUrls.map(async (assetUrl) => {
      try {
        const { bytes } = await fetchBytes(assetUrl);
        assetBytes += bytes;
        assetsCounted += 1;
      } catch {
        // skip unreachable / blocked assets rather than failing the whole audit
      }
    })
  );

  return {
    totalBytes: main.bytes + assetBytes,
    assetsCounted,
    assetsFound: assetUrls.length,
  };
}

function gradeFor(cleanerThanPercent) {
  if (cleanerThanPercent >= 90) return 'A+';
  if (cleanerThanPercent >= 75) return 'A';
  if (cleanerThanPercent >= 60) return 'B';
  if (cleanerThanPercent >= 40) return 'C';
  if (cleanerThanPercent >= 25) return 'D';
  if (cleanerThanPercent >= 10) return 'E';
  return 'F';
}

// Rough percentile mapping vs. an ~2.2g/visit global average page.
// Kept simple and transparent rather than a black-box score.
function cleanerThanPercentFor(gramsPerVisit) {
  const GLOBAL_AVERAGE_G = 2.2;
  const ratio = gramsPerVisit / GLOBAL_AVERAGE_G;
  const percent = Math.round(100 * (1 - Math.min(ratio, 1.4) / 1.4));
  return Math.max(1, Math.min(99, percent));
}

async function checkGreenHosting(domain) {
  try {
    const result = await withTimeout(hosting(domain), FETCH_TIMEOUT_MS);
    if (typeof result === 'boolean') return { green: result, hostedBy: null };
    return { green: !!result?.green, hostedBy: result?.hosted_by ?? result?.hostedby ?? null };
  } catch {
    return { green: false, hostedBy: null };
  }
}

async function parseUrlsFile() {
  const raw = await readFile(URLS_FILE, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [url, label] = line.split(',').map((s) => s.trim());
      return { url, label: label || new URL(url).hostname };
    });
}

async function auditSite({ url, label }) {
  const domain = new URL(url).hostname;
  console.log(`Auditing ${domain}...`);

  const { totalBytes, assetsCounted, assetsFound } = await measurePageWeight(url);
  const { green, hostedBy } = await checkGreenHosting(domain);

  const gramsPerVisit = co2Emitter.perVisit(totalBytes, green);
  const monthlyVisits = 10000;
  const co2PerYearKg = (gramsPerVisit * monthlyVisits * 12) / 1000;
  const cleanerThanPercent = cleanerThanPercentFor(gramsPerVisit);
  const grade = gradeFor(cleanerThanPercent);

  const report = {
    url,
    domain,
    label,
    auditedAt: new Date().toISOString(),
    grade,
    pageWeightBytes: totalBytes,
    co2PerVisitGrams: Number(gramsPerVisit.toFixed(3)),
    co2PerYearKg: Number(co2PerYearKg.toFixed(2)),
    cleanerThanPercent,
    greenHosting: green,
    hostedBy,
    monthlyVisits,
    notes: `Weight measured from ${assetsCounted}/${assetsFound} linked assets plus the base document.`,
  };

  const slug = domain.replace(/[^a-z0-9.-]/gi, '-');
  await writeFile(
    path.join(OUT_DIR, `${slug}.json`),
    JSON.stringify(report, null, 2) + '\n'
  );
  console.log(`  -> grade ${grade}, ${gramsPerVisit.toFixed(2)}g CO2/visit, green hosting: ${green}`);
  return report;
}

async function main() {
  if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
  const sites = await parseUrlsFile();

  if (sites.length === 0) {
    console.log('No URLs found in urls.txt — nothing to audit.');
    return;
  }

  const results = await Promise.allSettled(sites.map(auditSite));
  const failed = results.filter((r) => r.status === 'rejected');
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`Failed to audit ${sites[i].url}:`, r.reason.message);
    }
  });

  console.log(`\nDone. ${results.length - failed.length}/${results.length} audits succeeded.`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
