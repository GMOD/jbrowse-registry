# The GMOD Plugin Directory

https://gmod.github.io/jbrowse-registry/

[![Build Status](https://travis-ci.org/GMOD/jbrowse-registry.svg?branch=master)](https://travis-ci.org/GMOD/jbrowse-registry)

## Registering a Plugin

We would love for you to register your plugin! It's really easy to do:

1. Edit the [`plugins.yaml`](https://github.com/GMOD/jbrowse-registry/edit/master/plugins.yaml)
   file, and add your plugin to the end of the list
2. Submit the pull request to this repo

You're done.  Once the administrator accepts the PR, the plugin will be "published."


## Building the web app (not required for registering the plugin)

```
make
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

## Deploying

```
make deploy
npm run deploy
```

## Troubleshooting

 - make sure your GIT version is up to date.
 - if you have problems deploying, try an alternate remote URL format in the
   (Setup remote URL step) for *repo*, *origin* and *remoteURL* values:
   http://myusername@github.com/myusername/myproject.git
