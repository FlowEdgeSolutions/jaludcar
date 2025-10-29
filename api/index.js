const app = require('../backend/server');

// Export as Vercel serverless function handler
module.exports = async (req, res) => {
  // Let Express handle the request
  return app(req, res);
};
