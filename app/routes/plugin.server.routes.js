var plugin = require('../../app/controllers/plugin.server.controller');
var index = require('../controllers/notFound.server.controller');
var express = require('express');

module.exports = function(app) {
    app.get('/',plugin.render);

};

