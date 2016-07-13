var plugin = require('../../app/controllers/plugin.server.controller');
var pending = require('../../app/controllers/pending.server.controller');
module.exports = function(app) {
    
    app.route('/api/plugins').get(plugin.list);
    app.route('/api/plugins/plugin:pluginId').get(plugin.read);

    app.param('pluginId', plugin.pluginByID);
    
    app.route('/api/pending').post(pending.create).get(pending.list);
    app.route('/api/pending:pendingId').get(pending.read);

    app.param('pendingId', pending.pluginByID);
};

