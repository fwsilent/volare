module.exports = function(grunt) {
    var fs = require('fs');
    var _ = require('underscore');

    var mainJavascriptFiles = fs.readdirSync('static/js');
    var mainModules = _.map(mainJavascriptFiles, function(file) {
        var name = file.replace(/\..*$/, '');
        return {
            'name': 'js/' + name
        }
    });

    grunt.initConfig({
        bowerTargetDir: 'static/lib',
        requirejsTargetDir: 'static_build',
        requirejsModules: mainModules,

        bower: {
            install: {
                options: {
                    targetDir: '<%= bowerTargetDir %>',
                    layout: 'byType',
                    install: true,
                    verbose: false,
                    cleanTargetDir: true,
                    cleanBowerDir: false
                }
            }
        },

        requirejs: {
            build: {
                options: {
                    baseUrl: 'static',
                    mainConfigFile: 'static/config.js',
                    dir: '<%= requirejsTargetDir %>',
                    findNestedDependencies: true,
                    removeCombined: true,
                    optimizeCss: 'standard',
                    preserveLicenseComments: false,
                    fileExclusionRegExp: /\.git/,
                    wrapShim: true,
                    stubModules: [
                        'text'
                    ],
                    paths: {
                        'angular': 'empty:',
                        'bootstrap': 'empty:',
                        'jquery': 'empty:',
                        'jquery-ui': 'empty:'
                    },
                    modules: '<%= requirejsModules %>'
                }
            }
        },

        clean: {
            bower: [
                'bower_components',
                '<%= bowerTargetDir %>'
            ],
            requirejs: [
                '<%= requirejsTargetDir %>'
            ],
            build: [
                '<%= requirejsTargetDir %>/build.txt',
                '<%= requirejsTargetDir %>/lib/{angular,requirejs-plugins}',
                '<%= requirejsTargetDir %>/volare/*.{css,html}'
            ]
        }
    });

    require('load-grunt-tasks')(grunt);

    grunt.registerTask('build', ['requirejs:build', 'clean:build']);
};
