var config = require('./config'),
    express = require('express'),
    bodyParser = require('body-parser');
    
module.exports = function() {
    var app = express();
    
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.use(bodyParser.json());
    
    app.set('views', './app/views');
    app.set('view engine', 'ejs');

    
//    app.use(express.static('public'));
    
    require('../app/routes/api.server.routes.js')(app);
    require('../app/routes/plugin.server.routes.js')(app);
//    require('../app/routes/index.server.routes.js')(app);
    
    
    return app;
};
