const { registerSiteRoutes } = require('./public/site');
const { registerAuthRoutes } = require('./public/auth');
const { registerProfileRoutes } = require('./user/profile');
const { registerServicesRoutes } = require('./user/services');
const { registerOrdersRoutes } = require('./user/orders');
const { registerChargesRoutes } = require('./user/charges');
const { registerAdminRoutes } = require('./admin/index');
const { registerTelegramRoutes: registerTelegramWebhookRoutes } = require('./webhook/telegram');
const { registerToolsRoutes: registerAdminToolsRoutes } = require('./admin/tools');
const { registerSuperRoutes } = require('./super/index');

function registerApiRoutes(app) {
  registerSiteRoutes(app);
  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerServicesRoutes(app);
  registerOrdersRoutes(app);
  registerChargesRoutes(app);
  registerAdminRoutes(app);
  registerTelegramWebhookRoutes(app);
  registerAdminToolsRoutes(app);
  registerSuperRoutes(app);
}

module.exports = { registerApiRoutes };
