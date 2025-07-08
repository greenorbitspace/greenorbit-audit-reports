<<<<<<< HEAD
# greenorbit-audit-reports
=======
# Green Orbit Sustainability Audit Reports

This repo publishes **static HTML sustainability reports** for audited websites via GitHub Pages.

---

## ✅ Project Structure

```bash
📁 greenorbit-audit-reports/
├── .github/
│   └── workflows/
│       └── deploy.yml           # GitHub Actions workflow
├── reports/                     # Auto-generated reports go here (HTML files)
│   └── example-audit.html
├── templates/
│   └── report_template.hbs      # Handlebars HTML template
├── scripts/
│   └── generate_static_reports.js  # Notion → HTML generator
├── .env                         # Notion API keys (not committed)
├── urls.txt                     # List of audited URLs
├── README.md                    # This file
└── package.json                 # Node.js dependencies
```

---

## 🚀 Setup Instructions

### 1. Clone the Repo
```bash
git clone git@github.com:greenorbitdigital/greenorbit-audit-reports.git
cd greenorbit-audit-reports
```

### 2. Create `.env` with Notion Keys
```env
NOTION_API_KEY=secret_xyz
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Generate Reports
```bash
node scripts/generate_static_reports.js
```

### 5. Commit and Push
```bash
git add reports/
git commit -m "✨ New audit reports"
git push origin main
```

---

## 🧠 Deploy via GitHub Actions

The repo uses **GitHub Actions** to deploy `reports/` to GitHub Pages automatically on push.

Make sure Pages is enabled:
- Go to `Settings > Pages`
- Source: **GitHub Actions**
- Custom domain: `audit.greenorbit.space`

---

## 🔐 Make the Repo Private

You can make this repo private if you have **GitHub Pro** or **Team**:
- `Settings > General > Danger Zone > Make private`

Reports will still be public at `https://audit.greenorbit.space`

---

## 📩 Contact

Questions? Email audit@greenorbit.space

---

## ✨ Example Report Output
See `reports/example-audit.html` for a preview.
>>>>>>> a71578f (✨ New audit reports)
