'use strict';

var q = require('q');
var _ = require('lodash');
var gift = require('gift');

var ENV_CRUMBS = 'CRUMBS';
var CRUMBS_FILE_NAME = 'deps.crumbs';

// returns q promise that resolves with HEAD of current git repo
var getRepoHead = function () {
    var repo = gift(__dirname);
    return q.nbind(repo.current_commit_id, repo)();
};

module.exports = function (grunt) {

    //get the repo's head and write it to (CRUMBS_FILE_NAME) file
    grunt.registerTask('crumbs:record', function () {
        var done = this.async();
        var pkg = grunt.file.readJSON('package.json');
        var crumbs = process.env[ENV_CRUMBS] || {};

        q.resolve()
            .then(function () {
                var repo = gift(__dirname);
                return q.nbind(repo.current_commit_id, repo)();
            })
            .then(function (head) {
                crumbs[pkg.name] = head;
                grunt.file.write(CRUMBS_FILE_NAME, ENV_CRUMBS + '=' + JSON.stringify(crumbs)) + '\n';
            })
            .then(function () {
                done();
            }, function (err) {
                throw err;
                done(false);
            })
            .done();
    });
};
