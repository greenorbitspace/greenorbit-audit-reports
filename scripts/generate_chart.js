const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const fs = require('fs');
const path = require('path');

const width = 600;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

async function generateChart(orgName, co2, totalBytes, requests, outPath) {
  const config = {
    type: 'bar',
    data: {
      labels: ['CO₂ (g)', 'Page Size (KB)', 'Requests'],
      datasets: [{
        label: `Metrics for ${orgName}`,
        data: [co2, totalBytes / 1024, requests],
        backgroundColor: ['#2E5F4D', '#4DAF7C', '#B8DFCA']
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `Sustainability Metrics: ${orgName}`,
          font: { size: 16 }
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(config);
  const filename = `${orgName.toLowerCase().replace(/\s+/g, '_')}_metrics_chart.png`;
  const outputFile = path.join(outPath, filename);
  fs.writeFileSync(outputFile, buffer);
  return filename;
}

module.exports = { generateChart };