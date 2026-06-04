// @ts-check
import { defineConfig } from 'astro/config';

// Static marketing site. Zero JS shipped except the one hero-shader island
// (a vanilla <script> + IntersectionObserver, not a framework hydration).
export default defineConfig({
  site: 'https://zenith.dev',
  build: { inlineStylesheets: 'auto' },
});
