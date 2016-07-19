var app = angular.module('plugD', [
    'angularUtils.directives.dirPagination'
]);

app.controller("PluginController",function(){
});

app.directive("pluginList", ['$http',function($http){
    return {
        restrict:"E",
        templateUrl:"/app/plugin-list.html",
        controller: function($http){
            var self = this;
            self.filter = {gmod:"", term:"", perPage:10};
            self.sortKey = "name";
            self.order ='+';

            $http.get('/api/plugins')
                .success(function(data){
                    self.plugins = data;
                })
                .error(function(data){
                    // todo: error
                });
        },
        controllerAs:"plug"
    }
}]);
