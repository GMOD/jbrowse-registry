# The GMOD Plugin Directory [![Build Status](https://travis-ci.org/GMOD/jbrowse-registry.svg?branch=master)](https://travis-ci.org/GMOD/jbrowse-registry)

[https://gmod.github.io/jbrowse-registry/](https://gmod.github.io/jbrowse-registry/)

## Registering a Plugin

We would love for you to register your plugin! It's really easy to do:

1. Edit the [`plugins.yaml`](https://github.com/GMOD/jbrowse-registry/edit/master/plugins.yaml)
   file, and add your plugin to the end of the list
2. (Optional) If you have a small screenshot (approx. 200x100), please
   feel free to include it in the `img/` folder of the repository. When
   adding your plugin add an `image: my-plugin.png` to your plugin's
   block.
3. Submit the pull request to this repo

You're done! Once the administrator accepts the PR, the plugin will be published on the site.

## Building the Site

This step is for developers, and is not required for registering a plugin with the site.

```
make
```

## Changelog

- 0.3.0
	- Support including images in plugin view
- 0.2.1
	- Version now visible in plugin directory
- 0.2.0
	- Switched to webpack
	- Removed grunt, bower dependencies
- 0.1.0
	- Initial Release
