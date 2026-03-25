/**
 * Cache headers for authenticated / sensitive UI and API responses.
 * Reduces stale dashboard pages when using the browser Back button after logout.
 */
function noStoreProtectedResponse(req, res, next) {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

module.exports = { noStoreProtectedResponse };
