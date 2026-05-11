const { createProxyMiddleware } = require('http-proxy-middleware');

function getBackendTarget() {
  if (process.env.REACT_APP_API_BASE_URL) return process.env.REACT_APP_API_BASE_URL;
  if (process.env.BACKEND_TARGET) return process.env.BACKEND_TARGET;

  const backendPort = process.env.REACT_APP_BACKEND_PORT || process.env.BACKEND_PORT || '8000';
  return `http://localhost:${backendPort}`;
}

module.exports = function (app) {
  const backendTarget = getBackendTarget();

  app.use(
    '/api',
    createProxyMiddleware({
      target: backendTarget,
      changeOrigin: true,
    })
  );

  app.use(
    '/ws',
    createProxyMiddleware({
      target: backendTarget,
      ws: true,
      changeOrigin: true,
    })
  );
};
