#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { Client } = require('@notionhq/client');
const { generateChart } = require('./generate_chart');

// --- Config ---
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const OUTPUT_DIR = path.resolve(__dirname, '../reports');
const ASSETS_DIR = path.resolve(OUTPUT_DIR, 'assets');
const TEMPLATE_FILE = path.resolve(__dirname, '../templates/report_template.hbs');

if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
  console.error('❌ Missing NOTION_API_KEY or NOTION_DATABASE_ID in .env');
  process.exit(1);
}

const notion = new Client({ auth: NOTION_API_KEY });

// --- Helpers ---
function slugify(text) {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

Handlebars.registerHelper('ifEquals', function (a, b, opts) {
  return a === b ? opts.fn(this) : opts.inverse(this);
});

function numberWithCommas(x) {
  if (!x && x !== 0) return '';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// --- Fetch Notion entries ---
async function fetchAuditDataFromNotion() {
  const pages = [];
  let cursor = undefined;

  do {
    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  const entries = pages.map(page => {
    const props = page.properties;
    const orgName = props.Organisation?.title?.[0]?.plain_text
      || props.Organisation?.rich_text?.[0]?.plain_text
      || null;
    const url = props.URL?.url || null;

    console.log('DEBUG: Org:', orgName, '| URL:', url);

    return {
      orgName,
      url,
      co2: props['Estimated CO2 (g)']?.number || 0,
      totalBytes: props['Total Bytes']?.number || 0,
      requests: props.Requests?.number || 0,
      grade: props.Grade?.select?.name || 'Unknown',
      utmSource: props['UTM Source']?.rich_text?.[0]?.plain_text || 'notion',
      utmMedium: props['UTM Medium']?.rich_text?.[0]?.plain_text || 'email',
      utmCampaign: props['UTM Campaign']?.rich_text?.[0]?.plain_text || 'eco-report',
      generatedDate: new Date().toISOString().slice(0, 10),
    };
  });

  return entries.filter(entry => {
    const valid = entry.url && entry.orgName;
    if (!valid) console.log('DEBUG: Filtered out entry:', entry);
    return valid;
  });
}

// --- Entry enrichment ---
function enrichEntry(entry) {
  const monthlyPageViews = 100000;

  entry.monthlyCO2kg = (entry.co2 * monthlyPageViews / 1000);
  const kmEquivalent = Math.round(entry.monthlyCO2kg / 0.12);
  const bulbHours = Math.round((entry.monthlyCO2kg * 0.06 * 1000) / 10);

  entry.co2 = Number(entry.co2).toFixed(2);
  entry.totalBytesFormatted = numberWithCommas(entry.totalBytes);
  entry.requestsFormatted = numberWithCommas(entry.requests);
  entry.monthlyCO2kgFormatted = numberWithCommas(entry.monthlyCO2kg.toFixed(1));
  entry.kmEquivalent = kmEquivalent;
  entry.bulbHours = bulbHours;

  const gradeMap = {
    'A (🌳🌳🌳)': {
      interpretation: 'Excellent digital sustainability performance.',
      icon: '🌳🌳🌳',
      recommendations: [
        'Maintain current optimisation efforts.',
        'Monitor regularly for performance changes.'
      ]
    },
    'B (🌳🌳)': {
      interpretation: 'Good with room for improvement.',
      icon: '🌳🌳',
      recommendations: [
        'Audit third-party scripts (e.g., analytics, ads).',
        'Use next-gen image formats like WebP or AVIF.',
        'Lazy-load non-critical assets.'
      ]
    },
    'C (🌳)': {
      interpretation: 'Moderate performance; optimisation recommended.',
      icon: '🌳',
      recommendations: [
        'Minimise HTTP requests.',
        'Optimise JavaScript and CSS delivery.'
      ]
    },
    'D (🍂)': {
      interpretation: 'Below average; needs attention.',
      icon: '🍂',
      recommendations: [
        'Reduce page size significantly.',
        'Remove unused scripts and styles.'
      ]
    },
    'E (🔥)': {
      interpretation: 'Poor performance; urgent improvements required.',
      icon: '🔥',
      recommendations: [
        'Conduct a full performance and carbon audit.',
        'Engage with sustainability experts.'
      ]
    },
    'Unknown': {
      interpretation: 'Sustainability grade data unavailable.',
      icon: '❓',
      recommendations: []
    }
  };

  const gradeInfo = gradeMap[entry.grade] || gradeMap['Unknown'];
  entry.gradeInterpretation = gradeInfo.interpretation;
  entry.gradeIcon = gradeInfo.icon;
  entry.recommendations = gradeInfo.recommendations;
  entry.comments = 'This section contains tailored insights based on your sustainability performance.';
  entry.summary = 'This audit evaluates key environmental metrics of your website to help reduce digital carbon footprint.';

  entry.rootCauses = [
    "High number of third-party scripts.",
    "Uncompressed images increase page load time.",
    "Lack of caching or lazy loading on large resources."
  ];

  entry.detailedRecommendations = [
    { priority: "High", text: "Compress images and convert to WebP or AVIF." },
    { priority: "High", text: "Remove unnecessary scripts (e.g., unused tracking)." },
    { priority: "Medium", text: "Implement lazy loading for offscreen content." },
    { priority: "Medium", text: "Minify JavaScript and defer non-essential scripts." },
    { priority: "Low", text: "Enable asset caching and CDN delivery." }
  ];

  entry.nextSteps = [
    "Discuss roadmap with Green Orbit Digital.",
    "Review full site audit quarterly.",
    "Set CO₂ reduction goals and KPIs.",
    "Track changes with monthly reports."
  ];

  return entry;
}

// --- Main ---
(async () => {
  try {
    console.log('🚀 Fetching audit data from Notion...');
    const rawEntries = await fetchAuditDataFromNotion();
    if (rawEntries.length === 0) {
      console.warn('⚠️ No valid entries found');
      process.exit(0);
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.mkdirSync(ASSETS_DIR, { recursive: true });

    const templateSource = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    const template = Handlebars.compile(templateSource);

    for (const entryRaw of rawEntries) {
      const entry = enrichEntry(entryRaw);
      const slug = slugify(entry.orgName);

      // Generate chart and add to entry
      const chartFilename = await generateChart(entry.orgName, entry.co2, entry.totalBytes, entry.requests, ASSETS_DIR);
      entry.chartFilename = `assets/${chartFilename}`;

      // Generate HTML
      const html = template(entry);
      const outFile = path.join(OUTPUT_DIR, `${slug}.html`);
      fs.writeFileSync(outFile, html);
      console.log(`✅ Report written → ${outFile}`);
    }

    console.log('🎉 All sustainability reports generated successfully!');
  } catch (err) {
    console.error('❌ Generation error:', err);
    process.exit(1);
  }
})();