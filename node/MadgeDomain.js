
/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
maxerr: 50, node: true */
/*global  */

(function () {
    
    "use strict";
    var domainManager = null;
    var Madge = require('./node_modules/node-madge/lib/madge.js');
    var exec = require('child_process').exec, child, isGVInstalled;
    var fs = require('fs');
    var configData = "";
    var doGV = false;
    var modFormat = "cjs";
    var layout = "";
    var pathToImage = "";
    //imageColor options
    var fontColor, fontFace, dependencies, edge, bgcolor;

    
    /**
     * @private
     * Handler function generateGraph
     * 
     * depicting the dependency graph for the given source and options.
     */

    function generateGraph(targetPath, options, image) {
        var tree,
            id,
            circular,
            results;
        if (options.circular) {
            tree = new Madge(targetPath, options).tree;
            circular = require('./node_modules/node-madge/lib/analysis/circular')(tree);
            results = circular.getArray(tree);
            // domainManager.emitEvent("madge", "update", results);
            return results;
        } else if (options.depends) {
            tree = new Madge(targetPath, options).tree;
            id = options.id;
            results = require('./node_modules/node-madge/lib/analysis/depends')(tree, id);
            domainManager.emitEvent("madge", "update", results);
            return;
        } else {
            tree = new Madge(targetPath, options).tree;
            domainManager.emitEvent("madge", "update", tree);
            return;
        }
        tree = null;
        targetPath = "";
        options = null;
        return;
    }
    
    /*  
        List all module dependencies (format can be cjs || amd)
        $ madge -f format /path/src
        @return 
    */
    function listDependencies(src, format) {
        var options = {"format": format};
        generateGraph(src, options, false);
    }
    
    /*    
        show circular dependencies (format can be cjs || amd)
        $madge -c /path/src
        @return 
    */
    function findCircularDependencies(src, format) {
        var options = {"format": format, "circular": "true"};
        var report = generateGraph(src, options, false);
        return {report: report};
    }
    
    /*    
        show modules that depends on the given id (format can be cjs || amd)
        $madge -d /path/src
        @return 
    */
    function listDependenciesForModule(src, format, id) {
        var options = {"format": format, "depends": "true", "id": id};
        generateGraph(src, options, false);
    }
    
    /*    
        generate image based on all dependencies (format can be cjs || amd)
        $madge -c /path/src
        @return 
    */
    function generateGVImage(src, format) {
        if (isGVInstalled && doGV) {
            var options = {"format": format, "layout": layout, "type": "png", "colors": {"fontColor" : fontColor,
                            "dependencies" : dependencies,
                            "fontFace" : fontFace,
                            "edge" : edge,
                            "bgcolor": bgcolor}};
            pathToImage = __dirname + "/../generated/gv-" + format + ".png";

            var madgeImage = new Madge(src, options).image(options, function (image) {
                fs.unlink(pathToImage, function (err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("successfully deleted : " + pathToImage);
                    }
                });
                fs.writeFile(pathToImage, image, function (err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("The file was saved! " + pathToImage);
                        domainManager.emitEvent("madge", "update", pathToImage);
                    }
                });
                return;
            });
        } else {
            //TODO throw an error
            return isGVInstalled;
        }
    }

    /*
        @private
        check to see if GraphVis is installed
    */
    function isGraphVisInstalled() {
        isGVInstalled = false;
        child = exec('gvpr -V', function (error, stdout, stderr) {
            if (stderr !== "") { //gvpr -V reports version on stderr not sure why.  you get something like gvpr version 2.30.1 (20130214.1453)
                isGVInstalled = true;
                console.log("isGVInstalled: " + isGVInstalled);
            }
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (error !== null) {
                throw new Error('Graphviz could not be found. Ensure that "gvpr" is in your $PATH.\n' + error);
            }
        });
        
        // read config to see if img gen is required
        var configFile = __dirname + "/../config.json";
        console.log('configFile ' + configFile);
        fs.readFile(configFile, 'utf8', function (err, configData) {
            if (err) {
                throw err;
            }
            var jsonObj = JSON.parse(configData);
            console.log("jsonObj: " + jsonObj.GraphVis);
            doGV = jsonObj.GraphVis;
            layout = jsonObj.layout;
            fontColor = jsonObj.fontColor;
            dependencies = jsonObj.dependencies;
            fontFace = jsonObj.fontFace;
            edge = jsonObj.edge;
            bgcolor = jsonObj.bgcolor;
            console.log("doGV: " + doGV + "  layout: " + layout + " bgcolor : " + bgcolor);
        });
    }
    
    /**
     * Initializes the domain 
     * @param {DomainManager} The DomainManager for the server
     */
    function init(DomainManager) {
        domainManager = DomainManager;
        if (!domainManager.hasDomain("madge")) {
            domainManager.registerDomain("madge", {major: 0, minor: 1});
        }
        isGVInstalled = isGraphVisInstalled();
        
        domainManager.registerCommand(
            "madge",
            "generateGVImage",
            generateGVImage,
            false,
            "generate and save image",
            [],
            [{name: "pathToImage",
                type: "{pathToImage: string}"}]
        );

        domainManager.registerCommand(
            "madge",
            "listDependencies",
            listDependencies,
            false,
            "List Module Dependencies",
            [{name: "source", type: "string"}, {name: "format", type: "string"}],
            [{name: "report",
                type: "{report: string}"}]
        );

        domainManager.registerCommand(
            "madge",
            "findCircularDependencies",
            findCircularDependencies,
            false,
            "Find all Module Circular Referecnes",
            [{name: "source", type: "string"}, {name: "format", type: "string"}],
            [{name: "report", type: "{report: array}"}]
        );

        domainManager.registerCommand(
            "madge",
            "listDependenciesForModule",
            listDependenciesForModule,
            false,
            "generate report",
            [{name: "source", type: "string"}, {name: "format", type: "string"}, {name: "id", type: "string"}],
            [{name: "report",
                type: "{report: string}"}]
        );
        
        domainManager.registerEvent(
            "madge",
            "update",
            ["data"]
        );
    }
    // used in unit tests
    exports.listDependencies = listDependencies;
    exports.findCircularDependencies = findCircularDependencies;
    exports.listDependenciesForModule = listDependenciesForModule;
    exports.generateGVImage = generateGVImage;
    exports.generateGraph = generateGraph;
    
    //used to load domain
    exports.init = init;
    
}());
