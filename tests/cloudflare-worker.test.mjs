import assert from 'node:assert/strict';
import worker from '../cloudflare-worker.mjs';

const assetRequests = [];
const env = {
  ASSETS: {
    async fetch(request) {
      assetRequests.push(request);
      return new Response('asset', { status: 200 });
    },
  },
};

let response = await worker.fetch(new Request('https://beckermann.net/'), env);
assert.equal(response.status, 302);
assert.equal(response.headers.get('location'), 'https://beckermann.net/DrB-practicals/');

response = await worker.fetch(new Request('https://beckermann.net/DrB-practicals'), env);
assert.equal(response.status, 301);
assert.equal(response.headers.get('location'), 'https://beckermann.net/DrB-practicals/');

response = await worker.fetch(
  new Request('https://beckermann.net/DrB-practicals/lower-limb/index.html?mode=study'),
  env,
);
assert.equal(response.status, 200);
assert.equal(new URL(assetRequests.at(-1).url).pathname, '/lower-limb/index.html');
assert.equal(new URL(assetRequests.at(-1).url).search, '?mode=study');

response = await worker.fetch(new Request('https://beckermann.net/DrB-practicals/upper-limb/'), env);
assert.equal(response.status, 200);
assert.equal(new URL(assetRequests.at(-1).url).pathname, '/upper-limb/index.html');

response = await worker.fetch(new Request('https://beckermann.net/unrelated'), env);
assert.equal(response.status, 404);

console.log('Cloudflare Worker routing tests passed.');
