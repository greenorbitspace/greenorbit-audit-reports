#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { Client } = require('@notionhq/client');

// --- Config ---
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;
const OUTPUT_DIR = path.resolve(__dirname, 'reports');
const TEMPLATE_FILE = path.resolve(__dirname, 'report_template.hbs');

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

Handlebars.registerHelper('ifEquals', function(a, b, opts) {
  return (a === b) ? opts.fn(this) : opts.inverse(this);
});

// Fetch and debug raw entries
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

    console.log('DEBUG: Org:', orgName, '| URL:', url);  // Debug log to check data

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

  // Filter entries that have both orgName and url
  return entries.filter(entry => {
    const valid = entry.url && entry.orgName;
    if (!valid) console.log('DEBUG: Filtered out entry:', entry);
    return valid;
  });
}

function numberWithCommas(x) {
  if (!x && x !== 0) return '';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function enrichEntry(entry) {
  const monthlyPageViews = 100000; // example static or make dynamic

  // Calculate monthly CO2 in kg
  entry.monthlyCO2kg = (entry.co2 * monthlyPageViews / 1000);
  
  // Km equivalent driving (0.12 kg CO2/km)
  const kmEquivalent = Math.round(entry.monthlyCO2kg / 0.12);

  // LED bulb hours (0.06 kWh per kg CO2, bulb 10W)
  const bulbHours = Math.round((entry.monthlyCO2kg * 0.06 * 1000) / 10);

  // Format numbers with commas & decimals
  entry.co2 = Number(entry.co2).toFixed(2);
  entry.totalBytesFormatted = numberWithCommas(entry.totalBytes);
  entry.requestsFormatted = numberWithCommas(entry.requests);
  entry.monthlyCO2kgFormatted = numberWithCommas(entry.monthlyCO2kg.toFixed(1));
  entry.kmEquivalent = kmEquivalent;
  entry.bulbHours = bulbHours;

  // Grade interpretation and icon mapping
  const gradeMap = {
    'A (🌳🌳🌳)': { 
      interpretation: 'Excellent digital sustainability performance.', 
      icon: '🌳🌳🌳',
      recommendations: [
        'Maintain current optimisation efforts.',
        'Monitor regularly for performance changes.'
      ],
      impact: `Your website generates approximately ${entry.monthlyCO2kgFormatted} kg CO₂ monthly — equivalent to driving about ${kmEquivalent} km in a petrol car or powering a 10W LED bulb for around ${bulbHours} hours.`,
      comments: 'Keep up the excellent sustainable practices!'
    },
    'B (🌳🌳)': {
      interpretation: 'Good with room for improvement.',
      icon: '🌳🌳',
      recommendations: [
        'Audit third-party scripts (e.g., analytics, ads).',
        'Use next-gen image formats like WebP or AVIF.',
        'Lazy-load non-critical assets.'
      ],
      impact: `Your website generates approximately ${entry.monthlyCO2kgFormatted} kg CO₂ monthly — equivalent to driving about ${kmEquivalent} km in a petrol car or powering a 10W LED bulb for around ${bulbHours} hours.`,
      comments: 'Consider addressing these areas to improve further.'
    },
    'C (🌳)': {
      interpretation: 'Moderate performance; optimisation recommended.',
      icon: '🌳',
      recommendations: [
        'Minimise HTTP requests.',
        'Optimise JavaScript and CSS delivery.'
      ],
      impact: `Your website generates approximately ${entry.monthlyCO2kgFormatted} kg CO₂ monthly — equivalent to driving about ${kmEquivalent} km in a petrol car or powering a 10W LED bulb for around ${bulbHours} hours.`,
      comments: 'Opportunities exist to improve sustainability.'
    },
    'D (🍂)': {
      interpretation: 'Below average; needs attention.',
      icon: '🍂',
      recommendations: [
        'Reduce page size significantly.',
        'Remove unused scripts and styles.'
      ],
      impact: `Your website generates approximately ${entry.monthlyCO2kgFormatted} kg CO₂ monthly — equivalent to driving about ${kmEquivalent} km in a petrol car or powering a 10W LED bulb for around ${bulbHours} hours.`,
      comments: 'Urgent attention recommended to reduce environmental impact.'
    },
    'E (🔥)': {
      interpretation: 'Poor performance; urgent improvements required.',
      icon: '🔥',
      recommendations: [
        'Conduct a full performance and carbon audit.',
        'Engage with sustainability experts.'
      ],
      impact: `Your website generates approximately ${entry.monthlyCO2kgFormatted} kg CO₂ monthly — equivalent to driving about ${kmEquivalent} km in a petrol car or powering a 10W LED bulb for around ${bulbHours} hours.`,
      comments: 'Immediate improvements are necessary.'
    },
    'Unknown': {
      interpretation: 'Sustainability grade data unavailable.',
      icon: '❓',
      recommendations: [],
      impact: 'No impact data available.',
      comments: ''
    }
  };

  const gradeInfo = gradeMap[entry.grade] || gradeMap['Unknown'];

  entry.gradeInterpretation = gradeInfo.interpretation;
  entry.gradeIcon = gradeInfo.icon;
  entry.recommendations = gradeInfo.recommendations;
  entry.impact = gradeInfo.impact;
  entry.comments = gradeInfo.comments;

  // Fallback for summary — you can customize or generate this separately
  entry.summary = `This audit evaluates key environmental metrics of your website to help reduce digital carbon footprint.`;

  // Root causes (example static list or dynamically fetched)
  entry.rootCauses = [
    "High number of third-party tracking and analytics scripts.",
    "Uncompressed large images, particularly hero banners.",
    "Lack of lazy loading on below-the-fold images.",
    "Multiple large JavaScript bundles increasing page weight."
  ];

  // Detailed recommendations with priorities
  entry.detailedRecommendations = [
    { priority: "High", text: "Compress and convert large images to WebP or AVIF formats." },
    { priority: "High", text: "Audit and remove unnecessary third-party scripts." },
    { priority: "Medium", text: "Implement lazy loading for offscreen images." },
    { priority: "Medium", text: "Minify and defer JavaScript where possible." },
    { priority: "Low", text: "Enable HTTP caching for static assets to reduce repeat load impact." }
  ];

  // Next steps & goals
  entry.nextSteps = [
    "Schedule a sustainability review meeting with Green Orbit Digital.",
    "Set measurable CO₂ reduction targets for the next quarter.",
    "Implement continuous monitoring with monthly reporting.",
    "Explore server and CDN optimisations for improved efficiency."
  ];

  // ... other fields ...
  return entry;
}

(async () => {
  try {
    console.log('🚀 Fetching audit data from Notion...');
    const auditEntriesRaw = await fetchAuditDataFromNotion();

    if (auditEntriesRaw.length === 0) {
      console.warn('⚠️ No valid entries found in Notion database');
      process.exit(0);
    }

    const auditEntries = auditEntriesRaw.map(enrichEntry);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const templateSource = fs.readFileSync(TEMPLATE_FILE, 'utf-8');
    const template = Handlebars.compile(templateSource);

    console.log(`📝 Generating ${auditEntries.length} reports in ${OUTPUT_DIR}...`);

    for (const entry of auditEntries) {
      const filename = slugify(entry.orgName) + '.html';
      const html = template(entry);
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), html);
      console.log(`✅ Created report for ${entry.orgName} → ${filename}`);
    }

    console.log('🎉 All reports generated successfully.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
})();