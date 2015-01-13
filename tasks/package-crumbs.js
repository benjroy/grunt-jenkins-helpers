'use strict';

var q = require('q');
var _ = require('lodash');
var gift = require('gift');
var request = require('request-json');

var ENV_CRUMBS = 'CRUMBS';
var CRUMBS_FILE_NAME = 'deps.crumbs';

var PKG_DEPS_LIST_KEYS = ['dependencies', 'devDependencies', 'optionalDependencies'];

var isGitUrl = function (url) {
    return url.indexOf('://') > 0;
};

var getGitUrlRevision = function (url) {
    return url.split('#')[1];
};

var replaceGitUrlRevision = function (url, revision) {
    return url.split('#').slice(0, 1).concat(revision).join('#');
};

module.exports = function (grunt) {

    //get the repo's head and write it to (CRUMBS_FILE_NAME) file
    grunt.registerTask('crumbs:record', function () {
        var done = this.async();
        var pkg = grunt.file.readJSON('package.json');
        var crumbs;
        try {
            crumbs = JSON.parse(process.env[ENV_CRUMBS]);
        } catch (err) {
            crumbs = {};
        }

        q.resolve()
            .then(function () {
                //read package.json deps and look for any specific revisions in git-url dependencies
                _.each(PKG_DEPS_LIST_KEYS, function (depsKey) {
                    _.each(pkg[depsKey], function (val, key, obj) {
                        if (!isGitUrl(val)) { return; }
                        var revision = getGitUrlRevision(val);
                        if (revision && !crumbs[key]) {
                            crumbs[key] = revision;
                        }
                    });
                });
            })
            .then(function () {
                var repo = gift(__dirname);
                return q.nbind(repo.current_commit_id, repo)();
            })
            .then(function (head) {
                crumbs[pkg.name] = head;
            })
            .then(function () {
                var crumbsFileBody = ENV_CRUMBS + '=' + JSON.stringify(crumbs) + '\n';
                grunt.file.write(CRUMBS_FILE_NAME, crumbsFileBody);
                grunt.log.ok('wrote file: %s\n%s', CRUMBS_FILE_NAME, crumbsFileBody);
            })
            .then(function () {
                done();
            }, function (err) {
                throw err;
                done(false);
            })
            .done();
    });

    // read CRUMBS from the environment and overwrite any package.json dependency REFS
    // with specific commits
    grunt.registerTask('crumbs:overwrite', function () {
        var done = this.async();
        var pkg = grunt.file.readJSON('package.json');
        var crumbs = process.env[ENV_CRUMBS];

        // ENV_CRUMBS must exist in environment
        if (!crumbs) {
            grunt.fail.warn('"' + ENV_CRUMBS + '" is not an environment variable.');
            return;
        }
        // parse the crumbs from the environment
        crumbs = JSON.parse(crumbs);
        // check if there are any modules to overwrite
        var crumbKeys = _.keys(crumbs);

        if (!crumbKeys.length) {
            grunt.log.warn('no crumb modules to overwrite in package.json');
            return;
        }

        _.each(PKG_DEPS_LIST_KEYS, function (depsKey) {
            _.each(pkg[depsKey], function (val, key, obj) {
                if (isGitUrl(val) && _.contains(crumbKeys, key)) {
                    // overwrite the commit-ish on the dependencies git url
                    var url = replaceGitUrlRevision(val, crumbs[key]);
                    grunt.log.warn('Overwriting dependency url for %s in %s to %s', key, depsKey, url);
                    obj[key] = url;
                }
            });
        });

        // write changes back to package.json file
        grunt.file.write('package.json', JSON.stringify(pkg, null, 2));
    });

    // USED IN JENKINS SIGNING TJOB TO POLL NOTARY SERVER UNTIL COMPLETE
    grunt.registerTask('crumbs:sign', function () {
        var done = this.async();
        // assert env variables
        var params = {
            input_file_path: process.env.input_file_path,
            output_sig_types: process.env.output_sig_types,
            track: process.env.track,
            app_name: process.env.app_name,
            platform: process.env.platform,
            job_name_input: process.env.job_name_input,
            build_num: process.env.build_num,
            app_url: process.env.app_url
        };

        var missingParams = _.reduce(_.keys(params), function (memo, key) {
            if (!params[key]) {
                memo.push(key);
            }
            return memo;
        }, []);

        if (missingParams.length) {
            grunt.log.error('Missing environment variables: %s', missingParams.join(', '));
            return done(false);
        } else {
            params.job_name = params.job_name_input;
        }

        console.log(params);

        // post to notary server
        var NOTARY_HOST = 'https://notary.bittorrent.com';
        var NOTARY_API_PATH = 'api/v1/jobs'
        // var NOTARY_URL = 'https://notary.bittorrent.com/api/v1/jobs';
        //var NOTARY_URL = 'https://notary-01.prod.falcon.utorrent.com/api/v1/jobs'
        var client = request.newClient(NOTARY_HOST);

        client.post({
            url: NOTARY_API_PATH,
            formData: params
        }, function (err, res, body) {
            if (err) {
                grunt.log.error(err);
                return done(false);
            }
            console.log('response status: %s', res.statusCode);
            console.log('response body:', body);

            done();
        });

        // poll unitl finished

        // check on output

        // download output
    });
};
