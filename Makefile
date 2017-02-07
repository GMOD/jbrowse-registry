.PHONY: build help lint all run deploy

NPM:=$(shell which npm)
YARN:=$(shell which yarn)

installer = $(NPM)

ifdef YARN
	installer = $(YARN)
endif

all: run

run: node_modules js/plugins.json ## Run the server
	@echo "********************************"
	@echo "* open http://localhost:8000/ *"
	@echo "********************************"
	./node_modules/.bin/webpack-dev-server --progress --colors --devtool cheap-module-inline-source-map --hot --debug --inline --host 127.0.0.1 --port 8000

run_prod: node_modules js/plugins.json ## Run the server
	@echo "********************************"
	@echo "* open http://localhost:8000/ *"
	@echo "********************************"
	./node_modules/.bin/webpack-dev-server --progress --colors --devtool source-map --optimize-minimize --optimize-dedupe --host 127.0.0.1 --port 8000

build: node_modules js/plugins.json ## Compile a project for deployment
	./node_modules/.bin/webpack  --progress --colors --devtool source-map --optimize-minimize --optimize-dedupe

deploy:
	# Prepare release area
	@rm -rf release
	@mkdir release
	# Load required data
	@cp -Rv index.html build partials img demos   release
	# Build
	@$(MAKE) build
	# Push
	./node_modules/.bin/gh-pages -d release/ --repo git@github.com:gmod/jbrowse-registry.git
	# Cleanup
	@rm -rf release

node_modules: package.json
	$(installer) install

js/plugins.json: node_modules
	node scripts/prepare_api.js > $@

lint:
	node scripts/lint.js

help:
	@egrep '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
