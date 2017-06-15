var angular = require('angular');
var angularui = require('angular-ui-bootstrap');
var plugin_data = require('./plugins.json');
var app_data = require('../package.json');
var spdxLicenses = require('spdx-licenses');

angular
    .module('gmodPlugins', ['ui.bootstrap'])
    .config(['$locationProvider', function($locationProvider) {
        $locationProvider.html5Mode(true);
    }])
    .controller("PluginController",['$scope', '$location', function($scope, $location) {

        $scope.page = $location.search().page || 1;
        $scope.searchTerm = $location.search().search || '';
        $scope.plugins = plugin_data; 
        $scope.sortKey = 'name';
        $scope.numPerPage = 10;
        $scope.version = app_data.version;
        $scope.url = app_data.repository.url
        $scope.pageChanged = function() {
            $location.search('page='+$scope.page);
        };
        $scope.termChanged = function() {
            $location.search('search='+$scope.searchTerm);
        }
        $scope.plugins = plugin_data.map(function(elem){
            elem.id = elem.name.replace(/ /g, '-').replace(/[^A-Za-z0-9_-]/g, '');
            if(elem.location.indexOf("https://github.com/")>=0){
                elem.abbrev = elem.location.substring("https://github.com/".length) ;
                elem.type = "github";
            }
            if(elem.location.indexOf("https://bitbucket.org/")>=0){
                elem.abbrev = elem.location.substring("https://bitbucket.org/".length) ;
                elem.type = "bitbucket";
            }
            return elem;
        });
    }]).filter("spdx_formatter", ["$sce", function($sce){
        return function(input) {
            if (input) {
                var license = spdxLicenses.spdx(input);
                return $sce.trustAs('html', license.name.replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"'));
            }
            return;
        };
    }]);
