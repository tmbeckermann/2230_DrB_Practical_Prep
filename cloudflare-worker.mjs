const SITE_PREFIX = '/DrB-practicals';

function unauthorizedResponse() {
  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="DrB Practical Prep"' },
  });
}

function isAuthorized(request, env) {
  const password = env.SITE_PASSWORD;
  if (!password) return true;

  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Basic ')) return false;

  let decoded;
  try {
    decoded = atob(authHeader.slice('Basic '.length));
  } catch {
    return false;
  }

  const suppliedPassword = decoded.slice(decoded.indexOf(':') + 1);
  return suppliedPassword === password;
}

export default {
  async fetch(request, env) {
    if (!isAuthorized(request, env)) {
      return unauthorizedResponse();
    }

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
