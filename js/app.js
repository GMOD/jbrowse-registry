var angular = require('angular');
require('angular-utils-pagination');
var plugin_data = require('json!./plugins.json');

var app = angular.module('plugD', [
    'angularUtils.directives.dirPagination'
]);

app.controller("PluginController",function(){
});

app.directive("pluginList", function(){
    return {
        restrict:"E",
        templateUrl:"partials/plugin-list.html",
        controller: function(){
            this.filter = {gmod:"", term:"", perPage:5};
            this.sortKey = "name";
            this.order ='+';
            this.plugins = plugin_data;
        },
        controllerAs:"plug"
    }
});
