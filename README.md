# Green Orbit Audit Reports

Automated sustainability audit dashboard for the Green Orbit web ecosystem, live at
[audit.greenorbit.space](https://audit.greenorbit.space).

This is a full rebuild of the original Notion-backed generator. There is no CMS and no
manual data entry: every report is produced by measuring a site's real transferred page
weight and running it through the Sustainable Web Design carbon model.

## How it works

```
urls.txt  →  scripts/run-audits.mjs  →  src/content/reports/*.json  →  Astro build  →  Cloudflare Pages
```

1. **`urls.txt`** lists the sites to audit, one per line (`url, label`).
2. **`scripts/run-audits.mjs`** fetches each site, measures the HTML document plus its
   linked CSS/JS/image assets, estimates grams of CO₂ per visit using
   [CO2.js](https://www.thegreenwebfoundation.org/co2-js/) (Sustainable Web Design v4
   model), and checks whether the host is on the
   [Green Web Foundation](https://www.thegreenwebfoundation.org/) registry of verified
   renewable providers. Results are written as JSON into `src/content/reports/`.
3. **Astro** reads that content collection and builds:
   - `/` — a dashboard with aggregate stats and a card grid of every audited site, sorted
     by grade.
   - `/reports/[slug]/` — a detail page per site with the full breakdown.
4. **GitHub Actions** runs the pipeline weekly (Mondays, 06:00 UTC), on manual dispatch,
   or whenever `urls.txt` changes — commits the updated JSON, then triggers a build and
   deploy to Cloudflare Pages.

## Local development

```bash
npm install
npm run audit   # populate src/content/reports from urls.txt
npm run dev     # http://localhost:4321
```

## Adding a site to audit

Add a line to `urls.txt`:

```
https://example.com, Example Site
```

Pushing that change runs the audit workflow automatically. Or run it yourself:

```bash
npm run audit
git add src/content/reports urls.txt
git commit -m "Add example.com to audits"
git push
```

## Deployment

Deploys to Cloudflare Pages via `wrangler-action` in `.github/workflows/deploy.yml`.
Requires two repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Grading

Grades (A+ to F) are based on a site's CO₂-per-visit relative to an estimated ~2.2g
global average page. This is a transparent, simple heuristic rather than a black-box
score — see `gradeFor()` and `cleanerThanPercentFor()` in `scripts/run-audits.mjs` if
you want to tune the thresholds.

## Migrating from the old Notion-based version

This repo previously pulled report content from a Notion database via the Notion API.
That dependency has been removed entirely — there's no Notion token, no `.env` needed
for this pipeline, and one less place for secrets to leak. If you're migrating an
existing deployment:

- Remove any `NOTION_API_KEY` / `NOTION_DATABASE_ID` secrets from the repo and Cloudflare
  project settings — they're no longer used by anything here.
- **If a `.env` file was ever committed to this repo's history, treat that Notion key as
  compromised and rotate it in Notion's integration settings, then scrub it from git
  history** (e.g. with `git filter-repo` or BFG Repo-Cleaner) before making the repo
  public again, regardless of whether you continue using Notion elsewhere.
