# Deployment notes (RemoEdPH)

## Nginx gzip (Hostinger / reverse proxy)

Place inside the `server { ... }` block that proxies to your Node process (adjust `proxy_pass` port to match `PORT`, often `8080`).

```nginx
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/javascript application/xml image/svg+xml;
gzip_disable "msie6";
```

**Notes**

- **`gzip_min_length 1024`** aligns with the Express `compression` threshold (1 KB) so tiny responses are not compressed twice at both layers unnecessarily.
- **`application/javascript`** covers both classic and modern script MIME types served by your stack.
- **Brotli** is not enabled by the snippet above. The npm `compression` middleware supports **gzip/deflate** only. On Hostinger, if your plan/nginx build includes the `ngx_brotli` module, you can add a separate `brotli on;` / `brotli_types ...` block per Hostinger docs; otherwise rely on gzip at Nginx + Node.
- **Socket.IO**: WebSocket upgrades are not gzip-compressed as bodies; keep `proxy_http_version 1.1` and `Upgrade` / `Connection` headers for `/socket.io/` as in a standard Socket.IO reverse-proxy config. Express skips compressing paths under `/socket.io` in code as well.
- **File uploads**: Gzip compresses **responses** (and optionally proxied upstream responses), not the client upload stream. Large `multipart/form-data` uploads are unaffected by `gzip on` for the request body.

## Express compression (application code)

See `server/index.js`: `compression` is registered early with `threshold: 1024` and a filter that skips `/socket.io`.

### Debug route (gzip verification)

- **URL:** `GET /api/debug/compression-check`
- **Availability:** On unless `DISABLE_COMPRESSION_DEBUG=1` is set (so it still works when `NODE_ENV=production` during local or hosted checks).
- **Check:** In Chrome DevTools → Network → select the request → Response headers should include `Content-Encoding: gzip` when `Accept-Encoding: gzip` is sent (default for the browser). If you use the teacher portal service worker, bump `CACHE_NAME` in `public/sw.js` after SW changes so clients pick up the “always network for `/api/`” behavior.
