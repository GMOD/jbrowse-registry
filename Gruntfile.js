module.exports = function (grunt)
{
    grunt.initConfig ({
        pkg: grunt.file.readJSON('package.json'),

        // Before generating any new files, remove any previously-created files.
        clean:  {
            app: ['dist', '.tmp']
        },

        copy: {
            main: {
                expand: true,
                cwd: 'app/',
                src: ['**', '!js/**', '!bower_components/**'],
                dest: 'dist/'
            }
        },

        useminPrepare: {
            html: 'app/index.html',
        },

        usemin: {
            html: ['dist/index.html']
        },

        uglify: {
            options: {
                report: 'min',
                mangle: false
            }
        },

        'gh-pages': {
            options: {
                base: 'dist',
                repo: 'git@github.com:erasche/pluginapp.git',
                origin: 'git@github.com:erasche/pluginapp.git',
                remoteUrl: 'git@github.com:erasche/pluginapp.git'
            },
            src: ['**']
        },


    });

    grunt.loadNpmTasks ('grunt-contrib-clean');
    grunt.loadNpmTasks ('grunt-contrib-copy');
    grunt.loadNpmTasks ('grunt-contrib-concat');

    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-usemin');
    grunt.loadNpmTasks('grunt-gh-pages');

    grunt.registerTask('default', [
        'copy', 'useminPrepare', 'concat', 'uglify', 'cssmin', 'usemin', 'uglify'
    ]);
};
