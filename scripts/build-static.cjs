const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');
const server = path.join(dist, 'server');
const entries = ['index.html', 'activity-links.html', '.nojekyll', 'model-image-banks.js', 'assets', 'lower-limb', 'upper-limb', 'axial'];

function copyEntry(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      copyEntry(path.join(source, child), path.join(destination, child));
    }
    return;
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(client, { recursive: true });

for (const entry of entries) {
  copyEntry(path.join(root, entry), path.join(client, entry));
}

const sitesConfig = path.join(root, '.openai');
if (fs.existsSync(sitesConfig)) {
  copyEntry(sitesConfig, path.join(dist, '.openai'));
}

fs.mkdirSync(server, { recursive: true });
fs.writeFileSync(path.join(server, 'index.js'), `export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response('Static asset binding is unavailable.', { status: 500 });
    }

    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const assetPath = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
    const assetUrl = new URL(request.url);
    assetUrl.pathname = assetPath;

    let response = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (response.status !== 404) return response;

    if (!assetPath.endsWith('/index.html')) {
      const directoryUrl = new URL(request.url);
      directoryUrl.pathname = assetPath.replace(/\\/?$/, '/') + 'index.html';
      response = await env.ASSETS.fetch(new Request(directoryUrl, request));
      if (response.status !== 404) return response;
    }

    return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  }
};
`);

console.log(`Built static site in ${path.relative(root, dist)}`);
