#!/usr/bin/env python
import sys, json, yaml

data = yaml.load(sys.stdin)
json.dump(data, sys.stdout, indent=2)
