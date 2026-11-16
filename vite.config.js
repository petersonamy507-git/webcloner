import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { submitCrmLead } from './server/crm-lead.mjs';
import { ensurePreviewThankYou } from './server/php-restructure.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const LEAD_SUCCESS = 'Thank you for your response. We will contact you as soon as possible!';

function readRequestBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

function leadPreviewPlugin() {
  return {
    name: 'lead-preview',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url || '').split('?')[0];
        if (pathOnly !== '/leads' && pathOnly !== '/leads/') return next();
        const referer = req.headers.referer || '';
        let message = LEAD_SUCCESS;
        if (req.method === 'POST') {
          const raw = await readRequestBody(req);
          const fields = Object.fromEntries(new URLSearchParams(raw));
          try {
            const result = await submitCrmLead({
              fields,
              pageUrl: referer,
              host: req.headers.host || '',
            });
            if (result.message) message = result.message;
          } catch {
            message = LEAD_SUCCESS;
          }
        }
        const clone = referer.match(/\/cloned\/([^/?#]+)\//);
        if (clone) {
          ensurePreviewThankYou(path.join(ROOT, 'cloned', clone[1]));
        }
        const query = `successMsg=${encodeURIComponent(message)}`;
        const target = clone
          ? `/cloned/${clone[1]}/thank-you/index.html?${query}`
          : `/thank-you.html?${query}`;
        res.statusCode = 303;
        res.setHeader('Location', target);
        res.end();
      });
    },
  };
}

const APP_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Stamps the version and build time into the page so a deploy can be confirmed at a glance. */
function versionStampPlugin() {
  const buildTime = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return {
    name: 'version-stamp',
    transformIndexHtml: (html) => html
      .replaceAll('%APP_VERSION%', APP_VERSION)
      .replaceAll('%BUILD_TIME%', buildTime),
  };
}

export default defineConfig({
  plugins: [leadPreviewPlugin(), versionStampPlugin()],
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
      '/cloned': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // src/auth.js uses top-level await to hold each page until the session is known.
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(
        ['index', 'editor', 'login', 'reset-password', 'admin'].map((page) => [page, path.join(ROOT, `${page}.html`)]),
      ),
    },
  },
});
