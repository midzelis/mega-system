var loaders = [];

const linkfs = require('linkfs');
const unionfs = require('unionfs');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

var requestId = 0;
var pendingCbs = {};

var shouldExit = true;

global.invoke = async function(method, ...args) {

    var request = {
        request: requestId++,
        method: method,
        args: args,
    };

    const promise = new Promise((resolve,reject)=> {
        pendingCbs[ request.request ] = {
                resolve: resolve,
                reject: reject
            }
        });

    // send it
    console.log(JSON.stringify(request));

    return await promise;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

process.on('unhandledRejection', error => {
    // Will print "unhandledRejection err is not defined"
    console.log('@@@@@@@@@@@@@@@@@ unhandledRejection <<<< ');
    console.log(error);
    if (shouldExit) {
		process.exit(1);
    }
});

rl.on('line', function(line){
    const request = parse(line);
    if (!request)
        return;
    if (!request.method) {
        // this is a response from a node-initiated request
        let err = request.response[0];
        let result = request.response[1];
        if (err) {
            pendingCbs[request.request].reject(err);
        } else {
            pendingCbs[request.request].resolve(result);
        }
    } else if (request.method === "registerCallback") {
        if (!global.J2V8) {
            global.J2V8 = {};
        }
        global.J2V8[request.name] = async function() {
            var args = Array.prototype.slice.call(arguments);
            return await global.invoke(request.name, ...args);
        }
        ok(request);
    } else if (request.method === 'linkfs') {
        var rewrites = request.rewrites;
        unionfs
            .use(linkfs(fs,rewrites))
            .replace(fs);
        ok(request);
    } else if (request.method === 'version') {
        response(request, process.version);
    } else if (request.method === 'load') {
        const p = path.normalize(__dirname + "/node_modules/"+request.module + "loader.js");

        try {
            fs.accessSync(p)
            try {
                loaders.push( require(p) );
            } catch(e) {
                console.error( p+" could not be loaded");
                console.error( e );
            }
        } catch(e) {
            // no loader is expected
        }
        ok(request);
    } else if (request.method === 'config') {
        global.config = request.config;
        ok(request);
    } else if (request.method === 'logRejectOnly') {
        shouldExit = false;
        ok(request);
    } else {
        const cb = function() {
            // callback/response handling
            var args = Array.prototype.slice.call(arguments);
            console.log(JSON.stringify( {
                request: request.request,
                response: args
            }, replaceErrors));
        }
        
        var args = request.args;
        args.push(cb);

        const loader = loaders.find( l => l[request.method]);
        if (loader) {
            try {
                loader[request.method].apply(loader, request.args);
            } catch (e) {
                cb(e);
            }
        } else {
            console.log(JSON.stringify( {
                request: request.request,
                response: ["Could not find method: "+request.method]
            }, replaceErrors));
        }
    }
});
function ok(request) {
   response(request, "OK");
}
function response(request, value) {
    console.log(JSON.stringify({
        request: request.request,
        response: value
    }));
}
function parse(string) {
    try {
        return JSON.parse(string);
    } catch(e) {
        // we can't gaurantee that we'll even invoke their callback, so we must terminate
        // process watchers will restart this process
        process.exit(1);
    }
}
function replaceErrors(key, value) {
    if (value instanceof Error) {
        var error = {};

        Object.getOwnPropertyNames(value).forEach(function (key) {
            error[key] = value[key];
        });

        return error;
    }

    return value;
}