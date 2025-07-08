const fs = require('fs');
const path = require('path');
const QuickChart = require('quickchart-js');

function slugify(text) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
}

async function generateChart(orgName, co2, totalBytes, requests, outputDir) {
  const chart = new QuickChart();
  chart.setConfig({
    type: 'bar',
    data: {
      labels: ['CO₂ (g)', 'Page Size (KB)', 'Requests'],
      datasets: [{
        label: orgName,
        data: [co2, totalBytes / 1024, requests],
        backgroundColor: ['#276749', '#38A169', '#63B3ED']
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    }
  });
  chart.setWidth(600).setHeight(400).setBackgroundColor('white');

  const imageBuffer = await chart.toBinary();
  const filename = `${slugify(orgName)}_chart.png`;
  fs.writeFileSync(path.join(outputDir, filename), imageBuffer);
  return filename;
}

module.exports = { generateChart };