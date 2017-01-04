var app = angular.module('plugD', [
    'angularUtils.directives.dirPagination'
]);

app.controller("PluginController",function(){
});

app.directive("pluginList", ['$http',function($http){
    return {
        restrict:"E",
        templateUrl:"partials/plugin-list.html",
        controller: function($http){
            var self = this;
            self.filter = {gmod:"", term:"", perPage:5};
            self.sortKey = "name";
            self.order ='+';

            $http.get('api/plugins.json')
                .then(function(data){
                    self.plugins = data:data;
                }, function(data){
                    // todo: error
                });
        },
        controllerAs:"plug"
    }
}]);
