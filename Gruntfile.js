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
            html: 'app/index.html'
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

    });

    grunt.loadNpmTasks ('grunt-contrib-clean');
    grunt.loadNpmTasks ('grunt-contrib-copy');
    grunt.loadNpmTasks ('grunt-contrib-concat');

    grunt.loadNpmTasks('grunt-contrib-cssmin');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-usemin');

    grunt.registerTask('default', [
        'copy', 'useminPrepare', 'concat', 'uglify', 'cssmin', 'usemin'
    ]);
};
