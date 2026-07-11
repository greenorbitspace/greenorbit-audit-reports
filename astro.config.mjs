import { defineConfig } from 'astro/config';

// Fully static build — no adapter needed. `wrangler pages deploy dist`
// (see .github/workflows/deploy.yml) serves the output directly.
export default defineConfig({
  site: 'https://audit.greenorbit.space',
  output: 'static',
  build: {
    format: 'directory',
  },
});
