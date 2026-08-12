const SITE_PREFIX = '/DrB-practicals';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      url.pathname = `${SITE_PREFIX}/`;
      return Response.redirect(url.toString(), 302);
    }

    if (url.pathname === SITE_PREFIX) {
      url.pathname = `${SITE_PREFIX}/`;
      return Response.redirect(url.toString(), 301);
    }

    if (!url.pathname.startsWith(`${SITE_PREFIX}/`)) {
      return new Response('Not found', { status: 404 });
    }

    const assetUrl = new URL(request.url);
    const assetPath = url.pathname.slice(SITE_PREFIX.length) || '/';
    assetUrl.pathname = assetPath.endsWith('/') ? `${assetPath}index.html` : assetPath;
    return env.ASSETS.fetch(new Request(assetUrl, request));
  },
};
