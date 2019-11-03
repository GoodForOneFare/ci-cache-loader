"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spread = (this && this.__spread) || function () {
    for (var ar = [], i = 0; i < arguments.length; i++) ar = ar.concat(__read(arguments[i]));
    return ar;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var loader_utils_1 = require("loader-utils");
var mkdirp_1 = __importDefault(require("mkdirp"));
// Switch to an import once https://github.com/nodejs/node/commit/0f63d84f807edb17466f9357a630467cf608f954 is released.
var crypto = require('crypto');
var async = require('neo-async');
var _a = require('node-gzip'), gzip = _a.gzip, ungzip = _a.ungzip;
var validateOptions = require('schema-utils');
var pkg = require('../../package.json');
var schema = require('../options.json');
var env = process.env.NODE_ENV || 'development';
// eslint-disable-next-line no-warning-comments
// todo: digest as stream?  It means reading twice on misses.
var read = function (key, callback) {
    // console.log('@@ci-cache-loader - read', key);
    fs.readFile(key, function (err, zippedContent) {
        // console.log('@@ci-cache-loader - read done', err, key, content ? content.toString() : null);
        if (err) {
            callback(err);
            return;
        }
        // eslint-disable-next-line no-warning-comments
        // TODO: is this really a string?
        ungzip(zippedContent)
            .then(function (jsonString) {
            try {
                var data = JSON.parse(jsonString);
                callback(null, data);
                return;
            }
            catch (parseErr) {
                // eslint-disable-next-line callback-return
                callback(parseErr);
            }
        })
            .catch(callback);
    });
};
var cacheKey = function (options, request, contentDigest) {
    var cacheIdentifier = options.cacheIdentifier, cacheDirectory = options.cacheDirectory;
    var hash = "ci5-" + digest(cacheIdentifier + "\n" + request) + "-" + contentDigest;
    return path.join(cacheDirectory, hash + ".json");
};
var directories = new Set();
var write = function (key, data, callback) {
    var dirname = path.dirname(key);
    var content = JSON.stringify(data);
    // console.log('@@write to fs', '\n  key:', key, '\n  data:', data.data, '\n  contextDependencies:', data.contextDependencies);
    if (directories.has(dirname)) {
        // for performance skip creating directory
        gzip(content)
            .then(function (zippedContent) {
            fs.writeFile(key, zippedContent, callback);
        })
            .catch(callback);
    }
    else {
        mkdirp_1.default(dirname, function (mkdirErr) {
            if (mkdirErr) {
                callback(mkdirErr);
                return;
            }
            directories.add(dirname);
            gzip(content)
                .then(function (zippedContent) {
                fs.writeFile(key, zippedContent, callback);
            })
                .catch(callback);
        });
    }
};
// eslint-disable-next-line no-warning-comments
// TODO: strip context root from all cache paths.
var npmLookups = new Map();
function nodeModuleVersion(dependencyPath) {
    if (npmLookups.has(dependencyPath)) {
        return npmLookups.get(dependencyPath);
    }
    var lastNodeModulesIndex = dependencyPath.lastIndexOf('/node_modules/');
    if (lastNodeModulesIndex === -1) {
        npmLookups.set(dependencyPath, false);
        return false;
    }
    var moduleStart = lastNodeModulesIndex + '/node_modules/'.length;
    var basePath;
    if (dependencyPath[moduleStart] === '@') {
        var orgEndIndex = dependencyPath.indexOf('/', moduleStart + 1);
        var packageNameEndIndex = dependencyPath.indexOf('/', orgEndIndex + 1);
        basePath = dependencyPath.slice(0, packageNameEndIndex === -1 ? dependencyPath.length : packageNameEndIndex);
    }
    else {
        var packageNameEndIndex = dependencyPath.indexOf('/', moduleStart + 1);
        basePath = dependencyPath.slice(0, packageNameEndIndex === -1 ? dependencyPath.length : packageNameEndIndex);
    }
    // return JSON.parse(fs.readFileSync(path.join(basePath, 'package.json'), 'utf8')).version;
    // eslint-disable-next-line import/no-dynamic-require, global-require
    var version = require(path.join(basePath, 'package.json')).version;
    npmLookups.set(dependencyPath, version);
    return version;
}
function createDefaults() {
    return {
        cacheDirectory: path.resolve('.ci-cache-loader'),
        cacheIdentifier: "cache-loader:" + pkg.version + " " + env,
        cacheKey: cacheKey,
        cacheMetadata: new Map(),
        read: read,
        write: write,
    };
}
function loader() {
    var args = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
    }
    var options = __assign({}, createDefaults(), loader_utils_1.getOptions(this));
    validateOptions(schema, options, 'CI Cache Loader');
    var cacheMetadata = options.cacheMetadata;
    if (!cacheMetadata) {
        throw new Error('ci-cache-loader requires a cacheMetadata property');
    }
    var writeFn = options.write;
    var callback = this.async();
    var data = this.data;
    var dependencies = this.getDependencies().concat(this.loaders.map(function (dependency) { return dependency.path; }));
    var contextDependencies = this.getContextDependencies();
    // Should the file get cached?
    var cache = true;
    // this.fs can be undefined
    // e.g when using the thread-loader
    // fallback to the fs module
    var loaderFS = this.fs || fs;
    var toDepDetails = function (dep, mapCallback) {
        var moduleVersion = nodeModuleVersion(dep);
        if (moduleVersion) {
            // console.log('  loader - toDepDetails - ', dep, '@', moduleVersion);
            mapCallback(null, {
                path: dep,
                npmVersion: moduleVersion,
            });
            return;
        }
        if (cacheMetadata.has(dep)) {
            mapCallback(null, {
                path: dep,
                hash: cacheMetadata.get(dep),
            });
            return;
        }
        loaderFS.readFile(dep, function (err, content) {
            if (err) {
                // eslint-disable-next-line no-console
                console.log('        @@ci-cache-loader - toDepDetails - error', dep, err);
                mapCallback(err);
                cache = false;
                return;
            }
            if (!cacheMetadata.has(dep)) {
                cacheMetadata.set(dep, digest(content));
            }
            mapCallback(null, {
                path: dep,
                hash: cacheMetadata.get(dep),
            });
        });
    };
    var res = this.resource || this.resourcePath;
    // eslint-disable-next-line no-console
    console.log('      @@ci-cache-loader for ', res);
    // console.log('loader - deps', dependencies, contextDependencies);
    async.parallel([
        function (dependencyCallback) {
            return async.mapLimit(dependencies, 20, toDepDetails, dependencyCallback);
        },
        function (dependencyCallback) {
            return async.mapLimit(contextDependencies, 20, toDepDetails, dependencyCallback);
        },
    ], function (err, taskResults) {
        // console.log('loader - finishing - checking dep ', res)
        if (err) {
            // eslint-disable-next-line no-console
            console.log('      @@ci-cache-loader - error for', res);
            callback.apply(void 0, __spread([null], args));
            return;
        }
        if (!cache) {
            // eslint-disable-next-line no-console
            console.log('      @@ci-cache-loader - marked as uncacheable', res);
            callback.apply(void 0, __spread([null], args));
            return;
        }
        var _a = __read(taskResults, 2), deps = _a[0], contextDeps = _a[1];
        // eslint-disable-next-line no-console
        console.log('      @@ci-cache-loader - writing file:', res, '\n        cacheKey:', data.cacheKey, '\n        dependencies:', deps.length, '\n        contextDeps:', contextDependencies.length);
        writeFn(data.cacheKey, {
            remainingRequest: data.remainingRequest,
            dependencies: deps,
            contextDependencies: contextDeps,
            result: args,
        }, function () {
            // ignore errors here
            callback.apply(void 0, __spread([null], args));
        });
    });
}
function pitch(remainingRequest, _, dataInput) {
    var _this = this;
    var options = __assign({}, createDefaults(), loader_utils_1.getOptions(this));
    var cacheMetadata = options.cacheMetadata;
    // eslint-disable-next-line no-warning-comments
    // TODO: validate cacheMetadata in validateOptions.
    validateOptions(schema, options, 'Cache Loader (Pitch)');
    if (!cacheMetadata) {
        throw new Error('ci-cache-loader requires a cacheMetadata property');
    }
    var readFn = options.read, cacheKeyFn = options.cacheKey;
    var callback = this.async();
    var data = dataInput;
    var res = this.resource || this.resourcePath;
    data.remainingRequest = remainingRequest;
    // eslint-disable-next-line no-warning-comments
    // TODO: can I check for the cached value here?  Another file may have pulled it in, right?
    fs.readFile(res, function (readContentErr, currentContent) {
        if (readContentErr) {
            // eslint-disable-next-line no-console
            console.log('@@pitch - could not read', res);
            callback();
            return;
        }
        // Should sourcemaps be factored in to the key?
        var contentHash = cacheMetadata.get(res) || digest(currentContent);
        if (!cacheMetadata.has(res)) {
            cacheMetadata.set(res, contentHash);
        }
        data.cacheKey = cacheKeyFn(options, remainingRequest, contentHash);
        readFn(data.cacheKey, function (readErr, cacheData) {
            if (readErr) {
                // eslint-disable-next-line no-console
                console.log('  pitch @@readFn - cache file not found\n    res:', res, '\n    cacheKey:', data.cacheKey);
                callback();
                return;
            }
            if (!cacheData) {
                throw new Error('readFn succeeded, but received no cachedData');
            }
            if (cacheData.remainingRequest !== remainingRequest) {
                // in case of a hash conflict
                // eslint-disable-next-line no-console
                console.log('  pitch @@requestMismatch\n    res:', res, '\n    cacheRemainingRequest:', cacheData.remainingRequest, '\n    currentRemainingRequest:', remainingRequest);
                callback();
                return;
            }
            async.each(cacheData.dependencies.concat(cacheData.contextDependencies), function (dep, eachCallback) {
                var npmVersion = nodeModuleVersion(dep.path);
                if (npmVersion) {
                    if (npmVersion !== dep.npmVersion) {
                        // eslint-disable-next-line no-console
                        console.log('  pitch dependency @@@readFn - npmVersion mismatch', '\n    current pitch:', dep.path, '\n    currentNpmVersion:', npmVersion, '\n    cachedNpmVersion:', dep.npmVersion);
                        eachCallback(true);
                        return;
                    }
                    eachCallback();
                    return;
                }
                if (cacheMetadata.has(dep.path)) {
                    var currentHash = cacheMetadata.get(dep.path);
                    if (currentHash !== dep.hash) {
                        // eslint-disable-next-line no-console
                        console.log('  pitch dependency @@@readFn - hash mismatch (cached)', '\n    currentPitch:', '\n    dep:', dep.path, '\n    cacheHash:', dep.hash, '\n    currentHash:', currentHash);
                        eachCallback(true);
                        return;
                    }
                    eachCallback();
                    return;
                }
                // console.log('  pitch - checking dep', dep.path)
                fs.readFile(dep.path, function (statErr, content) {
                    if (statErr) {
                        // eslint-disable-next-line no-console
                        console.log('  pitch dependency @@readFile error\n    current pitch:', res, '\n    dep:', dep.path);
                        eachCallback(statErr);
                        return;
                    }
                    var currentHash = cacheMetadata.get(dep.path) || digest(content);
                    if (!cacheMetadata.has(dep.path)) {
                        cacheMetadata.set(dep.path, currentHash);
                    }
                    if (currentHash !== dep.hash) {
                        // eslint-disable-next-line no-console
                        console.log('  pitch dependency @@@readFile - hash mismatch', '\n    currentPitch:', '\n    dep:', dep.path, '\n    cacheHash:', dep.hash, '\n    currentHash:', currentHash);
                        eachCallback(true);
                        return;
                    }
                    eachCallback();
                });
            }, function (err) {
                if (err) {
                    // eslint-disable-next-line no-console
                    console.log('  pitch dependency @@readFile err\n    currentPitch:', res);
                    callback();
                    return;
                }
                cacheData.dependencies.forEach(function (dep) { return _this.addDependency(dep.path); });
                cacheData.contextDependencies.forEach(function (dep) {
                    return _this.addContextDependency(dep.path);
                });
                callback.apply(void 0, __spread([null], cacheData.result));
            });
        });
    });
}
exports.pitch = pitch;
function digest(str) {
    return crypto
        .createHash('md5')
        .update(str)
        .digest('hex');
}
exports.default = loader;
