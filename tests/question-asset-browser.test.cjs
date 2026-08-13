const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
  const requested = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return response.writeHead(404).end('Not found');
  response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const installedBrowser = [chromium.executablePath(), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    .find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(installedBrowser ? { executablePath: installedBrowser } : {}) });

  const cases = [
    { name: 'lower activity', path: '/lower-limb/index.html?activity=region#activities', selector: '#activities.active-view .activity-session-card .activity-media' },
    { name: 'lower drill', path: '/lower-limb/index.html?drill=sticker#drills', selector: '#drills.active-view #drillVisual' },
    { name: 'upper drill', path: '/upper-limb/index.html?drill=sticker#drills', selector: '#drills.active-view #drillVisual' },
    { name: 'axial drill', path: '/axial/index.html?drill=sticker#drills', selector: '#drills.active-view #drillVisual' }
  ];

  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    for (const testCase of cases) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${port}${testCase.path}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(`${testCase.selector} img`);
      const media = await page.locator(testCase.selector).evaluate((root) => ({
      text: root.innerText.trim(),
      images: Array.from(root.querySelectorAll('img')).map((image) => ({
        src: image.getAttribute('src') || '',
        currentSrc: image.currentSrc || '',
        alt: image.getAttribute('alt') || '',
        title: image.getAttribute('title') || '',
        parentHref: image.closest('a')?.getAttribute('href') || ''
      }))
    }));
      if (testCase.name === 'lower activity') {
        assert.equal(media.text, '', `${testCase.name} at ${viewport.width}px: pre-answer image area must not disclose a name`);
      }
      assert.ok(media.images.length, `${testCase.name} at ${viewport.width}px: expected a pre-answer image`);
      for (const image of media.images) {
        assert.match(path.posix.basename(new URL(image.currentSrc).pathname), /^q-[0-9a-f]{12}\.[a-z0-9]+$/i, `${testCase.name} at ${viewport.width}px: browser URL reveals an answer-bearing filename`);
        assert.match(path.posix.basename(image.src), /^q-[0-9a-f]{12}\.[a-z0-9]+$/i, `${testCase.name} at ${viewport.width}px: DOM src reveals an answer-bearing filename`);
        assert.equal(image.alt, '', `${testCase.name} at ${viewport.width}px: pre-answer alt text reveals a name`);
        assert.equal(image.title, '', `${testCase.name} at ${viewport.width}px: pre-answer title reveals a name`);
        if (image.parentHref) assert.match(path.posix.basename(image.parentHref), /^q-[0-9a-f]{12}\.[a-z0-9]+$/i, `${testCase.name} at ${viewport.width}px: pre-answer full-size link reveals a name`);
      }
      await page.close();
    }
  }

  await browser.close();
  server.close();
  console.log('Desktop and mobile browser privacy checks passed.');
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
