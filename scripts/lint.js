#!/usr/bin/env node
yaml = require('js-yaml');
fs   = require('fs');
exit_code = 0;

const required_fields = [
	'name', 'author', 'description', 'location', 'gmodProject',
];
const recommended_fields = [
	'image', 'license',
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
});

process.exit(exit_code);
