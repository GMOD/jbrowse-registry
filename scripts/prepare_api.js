#!/usr/bin/env node
yaml = require('js-yaml');
fs   = require('fs');

var doc = yaml.safeLoad(fs.readFileSync('plugins.yaml', 'utf8'));
console.log(JSON.stringify(doc));
