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
    $scope.filter = {gmod:"", term:"", perPage:5};
    $scope.currentPage = 1;

    // URI control query string
    var search = $location.search();
    var page = search.page || $scope.currentPage;
    var per = search.perPage || $scope.filter.perPage;
    $location.search({page:page, perPage:per});


    $scope.sortKey = "name";
    $scope.order ='+';
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

    // pagination function on page change
    $scope.pageChangeHandler = function(newPage){
        $scope.currentPage = newPage;
        $location.search({page:newPage,perPage:$scope.filter.perPage});
    };

    // Watch querry string for changes and update
    $scope.$watch(function(){
        return $location.search();
    }, function(value){
       $scope.filter.perPage = value.perPage;
       $scope.currentPage = value.page;
    });


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
