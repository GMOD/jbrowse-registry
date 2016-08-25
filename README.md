# The GMOD Plugin Directory

[![Build Status](https://travis-ci.org/GMOD/jbrowse-registry.svg?branch=master)](https://travis-ci.org/GMOD/jbrowse-registry)

Second revision of JBrowse plugin directory

## Registering a Plugin

We would love for you to register your plugin! It's really easy to do:

1. Edit the [`plugins.yaml`](https://github.com/GMOD/jbrowse-registry/edit/master/plugins.yaml)
   file, and add your plugin to the end of the list
2. Submit the pull request to this repo

## Building

```
npm install .
npm run build_api
npm run build
```

## Setup remote URL of your project (do this once before deploy step)

```
nano Gruntfile.js
```
Edit the *repo*, *origin* and *remoteUrl* to reflect your project. 

```
        'gh-pages': {
            options: {
                base: 'dist',
                repo: 'git@github.com:myusername/myproject.git',
                origin: 'git@github.com:myusername/myproject.git',
                remoteUrl: 'git@github.com:myusername/myproject.git'
            },
            src: ['**']
        },
```

Commit changes.

```
git commit -a -m "set remote url"
git push
```


## Deploying

```
npm run deploy
```

## App Structure

Directories:

app - The frontend code, including the HTML page, angular JS code, and the templates.
app/api - the data that's used by the app

## Troubleshooting

 - make sure your GIT version is up to date.
 - if you have problems deploying, try an alternate remote URL format in the (Setup remote URL step) for *repo*, *origin* and *remoteURL* values: http://myusername@github.com/myusername/myproject.git


