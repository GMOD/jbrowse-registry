var port = 1337;
var user = "mongousername";
var pwd = "password";
var db = "pending";

module.exports = {
    port: port,
    db: 'mongodb://'+user+':'+pwd+'@domain/'+db
};
