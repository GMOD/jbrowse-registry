module.exports = function(app) {
    var express = require('express');
    var index = require('../controllers/index.server.controller');
    var notFound = require('../controllers/notFound.server.controller');
//    app.use('/static',express.static('./public')); 
    app.use('/',index.render);
    app.get('/*', notFound.render);
}
