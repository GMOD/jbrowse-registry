var app = angular.module('plugD', ['angularUtils.directives.dirPagination']);

var plugin = {name:"fark this"}

app.controller("PluginController",function(){
    this.test = 'boom';
});

app.directive("pluginList", ['$http',function($http){
    return {
        restrict:"E",
	templateUrl:"/public/pluginapp/plugin-list.html",
        controller: function($http){
            var self = this;
	    self.filter ={gmod:"", term:"", perPage:5};
            self.sortKey = "name";
	    self.order ='+';




            $http.get('/api/plugins')
                .success(function(data){
                    self.plugins = data;
		    console.log(data);
		    console.log(self.plugins);
	        })
                .error(function(data){
	            console.log('Error: '+  data);
	        });
	},

        controllerAs:"plug"
    }
}]);

app.directive("pendingList", ['$http',function($http){
    return {
        restrict:"E",
	templateUrl:"/public/pluginapp/pending-list.html",
        controller: function($http){
            var self = this;

	    self.filter ={gmod:"", term:"", perPage:5};
            self.sortKey = "name";
	    self.order = '+';

	    self.get = function(){
            $http.get('/api/pending')
                .success(function(data){
                    self.plugins = data;
		    console.log(data);
		    console.log(self.plugins);
	        })
                .error(function(data){
	            console.log('Error: '+  data);
	        });
	    }
	},

        controllerAs:"pend"
    }
}]);

app.directive("pluginTabs", ['$http',function($http){
    return {
        restrict:"E",
	templateUrl:"/public/pluginapp/plugin-tabs.html",
        controller: function($http){
            var self = this;

	    self.tab = 1;

	    self.isSet = function(setTab){
              return self.tab === setTab;
	    };

            self.setTab = function(newTab){
              self.tab = newTab;
	    };
	},

        controllerAs:"tab"
    }
}]);

app.directive("pluginSubmit", ['$http',function($http){
    return {
        restrict:"E",
	templateUrl:"/public/pluginapp/plugin-submit.html",
        controller: function($http){
            var self = this;
	    self.formData={};
	    self.status=0;


	    self.testStatus = function(setStatus){
                return self.status === setStatus;
	    };

	    self.setStatus = function(newStatus){
                self.status = newStatus;
	    };

	    self.submitPlugin = function(){
	        console.log(JSON.stringify(self.formData));
                $http.post('/api/pending',JSON.stringify(self.formData))
                .success(function(data){
		    self.name=self.formData.name;
		    self.status = 1;
		    self.formData={};
		    self.addForm.$setPristine();
	        })
                .error(function(data){
		    self.status=-1;
	            console.log('Error: '+  data);
	        });
	    };

	},

        controllerAs:"pform"
    }
}]);

