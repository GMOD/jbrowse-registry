var angular = require('angular');
require('angular-utils-pagination');
var plugin_data = require('./plugins.json');
var app_data = require('../package.json');
var spdxLicenses = require('spdx-licenses');

var app = angular.module('plugD', [
    'angularUtils.directives.dirPagination'
]);

var ghString = "https://github.com/";
var bbString = "https://bitbucket.org/";

app.controller("PluginController",['$scope', '$location', function($scope,$location){
    $scope.currentPage = 1;
    $scope.filter = {perPage: 5};

    $scope.getCurrentFilter = function(){
        var search = $location.search();
        return {
            gmod: search.gmod || "",
            term: search.term || "",
            page: $scope.currentPage || 1,
            perPage: search.perPage || 5,
            sortKey: search.sortKey || "name",
            order: search.order || "+",
        }
    }

    $scope.updateLocation = function(filter){
        $location.search({
            gmod: filter.gmod,
            page: $scope.currentPage,
            perPage: filter.perPage || 5,
            term: filter.term,
            sortKey: filter.sortKey,
            order: filter.order,
        });
    }

    $scope.filter = $scope.getCurrentFilter();

    $scope.plugins = plugin_data.map(function(elem){
        elem.id = elem.name.replace(/ /g, '-').replace(/[^A-Za-z0-9_-]/g, '');
        if(elem.location.indexOf(ghString)>=0){
            elem.abbrev = elem.location.substring(ghString.length) ;
            elem.type = "github";
        }
        if(elem.location.indexOf(bbString)>=0){
            elem.abbrev = elem.location.substring(bbString.length) ;
            elem.type = "bitbucket";
        }
        return elem;
    });

    //// pagination function on page change
    $scope.pageChangeHandler = function(newPage){
        $scope.currentPage = newPage;
        $scope.updateLocation($scope.filter);
    };

    // Watch query string for sync to $scope.filter
    $scope.$watch(function(){
        return $location.search();
    }, function(value){
        // No need to updateLocation because that was the source of the
        // event.
        $scope.filter = value;
    });

    // Watch the $scope.filter for changes and sync to query string
    $scope.$watch(function(scope){
        return scope.filter;
    }, function(newValue, oldValue){
        $scope.updateLocation(newValue);
    }, true);


}]);


app.directive("pluginList", function(){
    return {
        restrict:"E",
        templateUrl:"partials/plugin-list.html",
        controller: "PluginController"
    }
});

app.directive("versionInfo", function(){
    return {
        restrict:"E",
        template: '<a style="color:white" href="{{ url }}">Version {{ version }}</a>',
        link: function(scope, el){
            scope.version = app_data.version;
            scope.url = app_data.repository.url;
        }
    }
});

app.filter("spdx_formatter", ["$sce", function($sce){
    return function(input) {
        if (input) {
            var license = spdxLicenses.spdx(input);
            return $sce.trustAs('html', license.name.replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"'));
        }
        return;
    };
}]);
