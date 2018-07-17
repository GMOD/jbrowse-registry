#!/usr/bin/env node
var yaml = require('js-yaml'),
	fs   = require('fs'),
	exit_code = 0,
  spdxValidate = require('spdx-expression-validate');

const required_fields = [
	'name', 'author', 'description', 'location', 'gmodProject', 'license',
];
const recommended_fields = [
	'image',
];

var doc = yaml.safeLoad(fs.readFileSync('plugins.yaml', 'utf8'));
doc.map(function(el){
	required_fields.forEach(function(e){
		if(el[e] === undefined){
			console.log("ERROR: " + el['name'] + " missing required field " + e);
			exit_code = 1;
		}
	})

	recommended_fields.forEach(function(e){
		if(el[e] === undefined){
			console.log("WARNING: " + el['name'] + " missing recommended field " + e);
		}
	})

	if(el.license !== undefined){
		if(el.license !== 'NONE'){
			var license = spdxValidate(el.license);
			if(!license){
				console.log("ERROR: " + el.name + " has a non-SPDX license identifier. Please see the list here https://spdx.org/licenses/");
				exit_code = 2;
			}
		}
	}

	if(el.image !== undefined){
		if(!fs.existsSync("img/" + el.image)){
			console.log("ERROR: " + el.name + " declared an image but no associated file was included. Please add the missing image img/" + el.image);
			exit_code = 2;
		}
	}
});

process.exit(exit_code);
