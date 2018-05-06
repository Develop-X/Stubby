var Path = require('path');
var _ = require('lodash');
var fs = require('fs');
var Stubby = require('stubby').Stubby;


if (typeof process.argv[5] !== "undefined") {
    console.log("Additional unrecognised arguments were passed through stubby");
    console.log("Please ensure you have only passthrough admin port stubsport in order");
    console.log("");
    process.exit();
} else if (!isNaN(Number(process.argv[2])) && !isNaN((Number(process.argv[3]))) && !isNaN(Number(process.argv[4]))) {
    var singleThreadedMode = true;

    var adminPort = Number(process.argv[2]);
    var stubsPort = Number(process.argv[3]);
    var tlsPort = Number(process.argv[4]);
    
    console.log("Parameters for single threaded mode passed through correctly,port configuration will be:");
    console.log("adminPort" + adminPort + ",stubsPort" + stubsPort + ", tlsPort" + tlsPort);
} else if (typeof  process.argv[2] !== "undefined" || typeof process.argv[3] !== "undefined" || typeof process.argv[4] !== "undefined") {
    console.log("Parameters passed through for single threaded configuration are invalid, process will terminate");
    console.log("Please ensure you only through adminPort stubsPort tlsPort (in order)");
    process.exit();
}

if (singleThreadedMode) {
    var singleThreadedExecuted = false;
    var singleThreadedQueue = [];
}

//=======================================================================================//

process.on('uncaughtException', function (err) {
    console.log(err.stack); //catch all
});

var prod = (process.env.ENV === 'prod');

var startStubbyServiceWithOptionFromPath = function (path) {

    //if not single threaded or first execution of single thread create a new stubby instance
    if (!singleThreadedMode || !singleThreadedExecuted) {
        service = new Stubby();
        singleThreadedExecuted = true;
    }

    //setup default options
    service.options = require('./../' + path + 'service') || {}; //grab options if we were given some

    service.options.location = '0.0.0.0';
    service.options.quiet = false;

    var dataFiles = !!service.options.dataFiles &&
    _.isArray(service.options.dataFiles) &&
    service.options.dataFiles.length > 0 ? service.options.dataFiles : [];
    var mocksPath = Path.resolve(path, 'mocks');

    for (var key in dataFiles) {
        var filePath = Path.resolve(mocksPath, dataFiles[key]);

        try {
            var dataobj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (_.isArray(service.options.data)) {
                //Create handler for single threaded mode and push each dataObj to queue
                if (singleThreadedMode) {
                    for (var i = 0; i < dataobj.length; i++) {
                        singleThreadedQueue.push(_.union(service.options.data, dataobj[i]));
                    }
                }
                //Otherwise use multithreaded mode
                else {
                    service.options.data = service.options.data.push(service.options.data);
                }
            }
            else {
                //Create handler for single threaded mode and push each dataObj to queue
                if (singleThreadedMode) {
                    for (var stage in dataobj) {
                        singleThreadedQueue.push(dataobj[stage]);
                    }
                }
                //otherwise use multithreaded mode
                else {
                    service.options.data = dataobj;
                }
            }
            if (!prod) console.log('Loaded mocks from: ' + filePath);
        } catch (err) {
            console.log('Error loading mocks from: ' + filePath + '\n', err);
            return;
        }
    }
    //If not singleThreaded mode then start this as a new instance per provider
    if (!singleThreadedMode) {
        service.start(service.options, function (err) {
            if (!!err) {
                console.log('Error in servicestart');
                console.error(err);
            }
        });
    }

};
//START UP stubby
eval(fs.readFileSync('./services/master_switch') + '');

//If this was a single threaded execution then start a new stubs instance after queue is stacked
if (singleThreadedMode) {
    service.options.data = singleThreadedQueue;
    delete singleThreadedQueue;
    service.options.admin = adminPort;
    service.options.tls = tlsPort;
    service.options.stubs = stubsPort;
    service.start(service.options, function (err) {
        if (!!err) {
            console.log(err);
        }
    });
}

