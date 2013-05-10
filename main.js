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

/*global define, brackets, $, window, PathUtils, console, Mustache */

define(function (require, exports, module) {
    "use strict";
    // load modules
    var CommandManager          = brackets.getModule("command/CommandManager"),
        Commands                = brackets.getModule("command/Commands"),
        EditorManager           = brackets.getModule("editor/EditorManager"),
        DocumentManager         = brackets.getModule("document/DocumentManager"),
        DocumentCommandHandlers = brackets.getModule("document/DocumentCommandHandlers"),
        Menus                   = brackets.getModule("command/Menus"),
        NativeFileSystem        = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        FileUtils               = brackets.getModule("file/FileUtils"),
        Dialogs                 = brackets.getModule("widgets/Dialogs"),
        AppInit                 = brackets.getModule("utils/AppInit"),
        Resizer                 = brackets.getModule("utils/Resizer"),
        ProjectManager          = brackets.getModule("project/ProjectManager"),
        // node modules
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        NodeConnection          = brackets.getModule("utils/NodeConnection"),
        // local vars and config file
        moduleDir               = FileUtils.getNativeModuleDirectoryPath(module),
        configFile              = new NativeFileSystem.FileEntry(moduleDir + '/config.json'),
        config                  = { options: {}, globals: {} },
        report                  = "",
        commandsArray           = [],
        projectMenu             = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
        MADGE_LD_CMD            = "madge_ld",
        MADGE_CRC_CMD           = "madge_circular_dep",
        dirSelection            = "",
        TOGGLE_REPORT           = "quality.metrics.madge",
        enabled                 = false,
        moduleName              = "",
        modFormat               = "cjs",
        originModuleName        = "",
        originModFormat         = "",
        panel                   = require("text!templates/madge_panel.html"),
        displayTemplate         = require("text!templates/madge_DependsOnModuleId.html"),
        imageTemplate           = "",
        resolved                = false,
        doDependsOnId           = false,
        nodeConnection          = new NodeConnection();
        
    
    // Helper function that chains a series of promise-returning functions together via their done callbacks.
    function chain() {
        var functions = Array.prototype.slice.call(arguments, 0),
            firstFunction,
            firstPromise;
        if (functions.length > 0) {
            firstFunction = functions.shift();
            firstPromise = firstFunction.call();
            firstPromise.done(function () {
                chain.apply(null, functions);
            });
        }
    }
    
    function getEnabled() {
        return enabled;
    }
    
    function fileExists(file) {
        NativeFileSystem.resolveNativeFileSystemPath(file, function (entry) {
            console.log("Path for " + entry.name + " resolved");
            resolved = true;
        }, function (err) {
            console.log("Error resolving path: " + err.name);
            resolved = false;
        });
        return resolved;
    }

    function handleShowPanel() {
        //add the HTML UI
        $(panel).insertBefore("#status-bar");
        $(displayTemplate).insertBefore("#status-bar");
        Resizer.makeResizable($('#panel').get(0), "vert", "top", 100);
        Resizer.makeResizable($('#panelForDepend').get(0), "vert", "top", 100);
        $('#panel .close').click(function () {
            $('#panel').hide();
            $('#panelForDepend').hide();
            EditorManager.resizeEditor();
        });
        $('#panel').show();
        $('#panelForDepend .close').click(function () {
            $('#panelForDepend').hide();
            EditorManager.resizeEditor();
        });
        EditorManager.resizeEditor();
    }
    
    function setEnabled(flag) {
        enabled = flag;
        CommandManager.get(TOGGLE_REPORT).setChecked(enabled);
        handleShowPanel();
    }
    
    // Command to toggle enablement 
    function togglePanel() {
        if (getEnabled()) {
            enabled = false;
        } else {
            enabled = true;
        }
        setEnabled(enabled);
        $("#ulistForDepend").empty();
    }

    //process results for module_id
    function searchForModuleDependencies(result) {
        var i,
            row,
            html,
            report,
            headerTable,
            itemHeaders,
            itemTable;
        
        headerTable = $("<table class='zebra-striped ' style='overflow:hidden;'/>").append("<tbody>");
        itemHeaders = "<tr><th>modules that depend on: " + originModuleName + "  ( " + originModFormat + " )</th></tr>";
        $(headerTable).append(itemHeaders);
        itemTable = $("<table/>").empty().append("<tbody>");
        $("#tabularForDepend").empty();
        if (result.length > 0) {
            for (i in result) {
                if (result.hasOwnProperty(i)) {
                    console.log(result[i]);
                    row = $("<tr id='parentrow'/>")
                        .append('<td>' + result[i] + '</td>')
                        .appendTo(itemTable);
                }
            }
        } else {
            row = $("<tr id='parentrow'/>")
                .append('<td> no other modules depend on this module</td>')
                .appendTo(itemTable);
        }
        $(headerTable).append(itemTable);
        $("#tabularForDepend").empty().append(headerTable);
        doDependsOnId = false;
    }
    
    function resultsProcessor(result) {
        var template, doc, key, prop, i, obj, moduleElem, dependencyElem, row, outerRow, pathToGraph,
            dependencyName, newFileName, makeCell, headerTable, itemTableForGraph, headerTableForGraph, itemTable, itemHeaders, noResltsMsg, minResults, count, selectedRow, isImage;

        minResults = false;
        makeCell = function (content, end, altColors, arrowPos, parseObj) {
            var arrow = "-> ", element = null, newContent, i, contentArray;
            content  =  content + "";
            if (parseObj) {
                contentArray = content.split(',');
                newContent = "";
                for (i = 0; i < contentArray.length; i = i + 1) {
                    element = contentArray[i];
                    //console.log(element);
                    newContent += element + arrow;
                }
                content = content.replace(new RegExp(',', 'g'), '  ->  ');
            }
            if (altColors) {// mark end - no need for further punctuation format
                if (!end) {
                    if (arrowPos === "begin") {
                        return $("<td/>").text(arrow + content);
                    } else {
                        return $("<td/>").text(content);
                    }
                    
                } else {
                    return $("<td/>").text(content);
                }
            } else {
                if (!end) {// mark end - no need for further punctuation format
                    if (arrowPos === "begin") {
                        return $("<td/>").text(arrow + content);
                    } else {
                        return $("<td/>").text(content);
                    }
                    
                } else {
                    return $("<td/>").text(content);
                }
            }
        };
        togglePanel();
        noResltsMsg = "No dependencies found!";
        try {
            if (result.match('png')) {
                isImage = true;
            }
        } catch (err) {
            isImage = false;
        }
        if (!Array.isArray(result)) {
            // list module dependencies
            itemTable = $("<table class='zebra-striped ' />").empty().append("<tbody>");
            $(itemTable).empty();
            for (key in result) {
                if (result.hasOwnProperty(key) && !doDependsOnId) {
                    obj = result[key];
                    if (obj.length > 0) {// modules here have dependencies so include in report only mods with dependencies
                        minResults = true;
                        row = $("<tr id='parentrow'/>")
                            .append(makeCell(key, true, true, null)) // adding key (module name) 
                            .appendTo(itemTable);
                        $(row).dblclick(function () {
                            if (selectedRow) {
                                selectedRow.removeClass("selected");
                            }
                            newFileName = dirSelection + this.innerText + ".js";
                            $(this).addClass("selected");
                            selectedRow = $(this);

                            if (fileExists(newFileName) === true) {
                                doDependsOnId = true;
                                console.log("exists");
                                CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, {fullPath: newFileName});
                            } else {
                                console.log("File: " + newFileName + " doesn't exist. " + fileExists(newFileName));
                            }
                        });
                        $(row).click(function () {
                            if (selectedRow) {
                                selectedRow.removeClass("selected");
                            }
                            moduleName = this.innerText;
                            $(this).addClass("selected");
                            selectedRow = $(this);
                            doDependsOnId = true;
                            if ($(selectedRow).parent().parent().parent().parent()[0].id === "amd") {
                                nodeConnectionManager("listDependenciesForModule", "amd");
                                originModFormat = "amd";
                            } else {
                                nodeConnectionManager("listDependenciesForModule", "cjs");
                                originModFormat = "cjs";
                            }
                        });
    
                        for (prop in obj) {
                            if (obj.hasOwnProperty(prop)) {
                                outerRow = $("<tr id='childrow'/>")
                                    .append(makeCell(obj[prop], false, false, "begin")) // adding dependencies for key 
                                    .appendTo(itemTable);
                                $(outerRow).dblclick(function () {
                                    if (selectedRow) {
                                        selectedRow.removeClass("selected");
                                    }
                                    newFileName = dirSelection + this.innerText.replace('-> ', '') + ".js";
                                    $(this).addClass("selected");
                                    selectedRow = $(this);
                                    if (fileExists(newFileName) === true) {
                                        console.log("exists");
                                        CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, {fullPath: newFileName});
                                    } else {
                                        console.log("File: " + newFileName + " doesn't exist. " + fileExists(newFileName));
                                    }
                                });
                                $(outerRow).click(function () {
                                    if (selectedRow) {
                                        selectedRow.removeClass("selected");
                                    }
                                    moduleName = this.innerText.replace('-> ', '');
                                    $(this).addClass("selected");
                                    selectedRow = $(this);
                                   
                                    if ($(selectedRow).parent().parent().parent().parent()[0].id === "amd") {
                                        nodeConnectionManager("listDependenciesForModule", "amd");
                                        originModFormat = "amd";
                                    } else {
                                        nodeConnectionManager("listDependenciesForModule", "cjs");
                                        originModFormat = "cjs";
                                    }
                                });
                            }
                        }
                    }
                }
            }//for
            if (modFormat === "cjs" && minResults && !isImage) {
                headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
                itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                $(headerTable).append(itemHeaders);
                $(headerTable).append(itemTable);
                $("#cjs").empty().append(headerTable);
                modFormat = "amd";
            } else if (modFormat === "amd"  && minResults  && !isImage) {
                headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
                itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                $(headerTable).append(itemHeaders);
                $(headerTable).append(itemTable);
                $("#amd").empty().append(headerTable);
                modFormat = "cjs";
            } else {
                 // when nothing to report print one row saying so
                if (!minResults && !isImage) {
                    row = $("<tr/>")
                            .append(makeCell(noResltsMsg, true, false, null))
                            .appendTo(itemTable);
                    if (modFormat === "cjs") {
                        headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
                        itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#cjs").empty().append(headerTable);
                        modFormat = "amd";
                    } else if (modFormat === "amd") {
                        headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
                        itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#amd").empty().append(headerTable);
                        modFormat = "cjs";
                    }
                }
            }// end block 

            /* When GraphVis is installed you can generate image graphs. This setting GraphVis (boolean) is 
            *  configurable in config.json as GraphVis=true/false that lets you override this generation. If/when
            *  GraphVis is not installed all GraphVis references are ignored.
            */
//            pathToGraph = moduleDir + "/generated/gv-" + modFormat +  ".png";
//            row = $("<tr/>")
//                    .append("<td/>").text(pathToGraph).css({color: 'green'});
//            $(row).click(function () {
//                clickevent = true;
//                if (selectedRow) {
//                    selectedRow.removeClass("selected");
//                }
//                if (this.innerText.match('cjs')) {
//                    modFormat = "cjs";
//                } else {
//                    modFormat = "amd";
//                }
//                $(this).addClass("selected");
//                selectedRow = $(this);
//                
//                nodeConnectionManager('generateGVImage', modFormat, pathToGraph);
//                return;
//            });
//            if (!clickevent) { // add row only first time through
//                if (modFormat === "cjs") {
//                    itemTableForGraph = $("<table class='zebra-striped ' />").append("<tbody>");
//                    $(row).appendTo(itemTableForGraph);
//                    headerTableForGraph = $("<table class='condensed-table' style='overflow:hidden;'/>").empty().append("<tbody>");
//                    itemHeaders = "<tr><th>Module Dependceny Graph ( " + modFormat + " )</th></tr>";
//                    $(headerTableForGraph).append(itemHeaders);
//                    $(headerTableForGraph).append(itemTableForGraph);
//                    $("#cjs").append(headerTableForGraph);
//                    modFormat = "amd";
//                } else if (modFormat === "amd") {
//                    itemTableForGraph = $("<table class='zebra-striped ' />").append("<tbody>");
//                    $(row).appendTo(itemTableForGraph);
//                    headerTableForGraph = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
//                    itemHeaders = "<tr><th>Module Dependceny Graph ( " + modFormat + " )</th></tr>";
//                    $(headerTableForGraph).append(itemHeaders);
//                    $(headerTableForGraph).append(itemTableForGraph);
//                    $("#amd").append(headerTableForGraph);
//                    modFormat = "cjs";
//                }
//            }
        } else { // list circular references
            noResltsMsg = "No circular dependencies found!";
            headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
            itemTable = $("<table class='zebra-striped ' />").empty().append("<tbody>");
            if (result.length > 0) {
                for (i = 0; i < result.length; i = i + 1) {
                    obj = result[i];
                    count   = result.length;

                    if (i % 2 === 1) {//alternate row color
                        for (prop in result) {
                            if (result.hasOwnProperty(prop)) {
                                row = $("<tr/>");
                                if (count === 1) {// mark end
                                    row.append(makeCell(result[i], true, true, null, true));
                                } else {
                                    row.append(makeCell(result[i], false, true, "end", true));
                                }
                                count = count - 1;
                            }
                        }
                    } else {
                        for (prop in result) {
                            if (result.hasOwnProperty(prop)) {
                                row = $("<tr/>");
                                if (count === 1) {// mark end
                                    row.append(makeCell(result[i], true, false, null, true));
                                } else {
                                    row.append(makeCell(result[i], false, false, "end", true));
                                }
                                count = count - 1;
                            }
                        }
                    }
                    $(itemTable).append(row);
                }
                if (modFormat === "cjs") {
                    itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (" + modFormat + ")</th></tr>";
                    $(headerTable).append(itemHeaders);
                    $(headerTable).append(itemTable);
                    $("#cjs").empty().append(headerTable);
                    modFormat = "amd";
                } else if (modFormat === "amd") {
                    itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (" + modFormat + ")</th></tr>";
                    $(headerTable).append(itemHeaders);
                    $(headerTable).append(itemTable);
                    $("#amd").empty().append(headerTable);
                    modFormat = "cjs";
                }
            } else {
                // when nothing to report print one row saying so
                if (key === undefined && result.length === 0) {
                    row = $("<tr/>")
                            .append(makeCell(noResltsMsg, true, false, null))
                            .appendTo(itemTable);
                    if (modFormat === "cjs") {
                        itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (" + modFormat + ")</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#cjs").empty().append(headerTable);
                        modFormat = "amd";
                    } else if (modFormat === "amd") {
                        itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (" + modFormat + ")</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#amd").empty().append(headerTable);
                        modFormat = "cjs";
                    }
                }
            }
        }//circular refs
    }

    function nodeConnectionManager(method, modFormat, pathToGraph) {
        nodeConnection = new NodeConnection();

        function connect() {
            var connectionPromise = nodeConnection.connect(true);
            connectionPromise
                .done(function () {
                    console.log("connection sucess");
                })
                .fail(function () {
                    console.error("[brackets-madge] failed to connect to node");
                });
            return connectionPromise;
        }
        function loadDomain() {
            var path = ExtensionUtils.getModulePath(module, "node/MadgeDomain"),
                loadDomainPromise = nodeConnection.loadDomains([path], true);
            loadDomainPromise
                .done(function () {
                    switch (method) {
                    case 'listDependencies':
                        $('#panelForDepend').hide();//hide when new call execs    
                        nodeConnection.domains.madge.listDependencies(dirSelection, "cjs")
                            .done(function (val) {
                                resultsProcessor(val.results);
                                modFormat = "amd";
                                nodeConnection.domains.madge.listDependencies(dirSelection,  "amd")
                                    .done(function (val) {
                                        resultsProcessor(val.results);
                                        modFormat = "cjs";
                                    })
                                    .fail(function (err) {
                                        console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                                        var dlg = Dialogs.showModalDialog(
                                                Dialogs.DIALOG_ID_ERROR,
                                                "Madge Error",
                                                "This action triggered an error: " + err.toString()
                                            );
                                    });
                            });
                        break;
//                    case 'generateGVImage':
//                        nodeConnection.domains.madge.generateGVImage(dirSelection,  modFormat)
//                            .done(function () {
//                                var graphVisImageHolder = new NativeFileSystem.FileEntry(moduleDir + "/generated/graphVisImage-" + modFormat + ".html"),
//                                    html,
//                                    report,
//                                    data = {
//                                        filename : pathToGraph
//                                    };
//                                imageTemplate = require("text!templates/madge.html");
//                                html = Mustache.render(imageTemplate, data);
//                                FileUtils.writeText(graphVisImageHolder, html).done(function () {
//                                    report = window.open(graphVisImageHolder.fullPath);
//                                    report.focus();
//                                });
//                            });
//                        break;
                    case 'findCircularDependencies':
                        $('#panelForDepend').hide();//hide when new call execs    
                        nodeConnection.domains.madge.findCircularDependencies(dirSelection, "cjs")
                            .done(function (results) {
                                report = results.report;
                                resultsProcessor(report);
                                modFormat = "amd";
                                nodeConnection.domains.madge.findCircularDependencies(dirSelection, "amd")
                                    .done(function (results) {
                                        report = results.report;
                                        resultsProcessor(report);
                                        modFormat = "cjs";
                                    })
                                    .fail(function (err) {
                                        console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                                        var dlg = Dialogs.showModalDialog(
                                            Dialogs.DIALOG_ID_ERROR,
                                            "Madge Error",
                                            "This action triggered an error: " + err.toString()
                                        );
                                    });
                            })
                            .fail(function (err) {
                                console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                                var dlg = Dialogs.showModalDialog(
                                    Dialogs.DIALOG_ID_ERROR,
                                    "Madge Error",
                                    "This action triggered an error: " + err.toString()
                                );
                            });
                        break;
                    case 'listDependenciesForModule':
                        $('#panelForDepend').show();
                        EditorManager.resizeEditor();
                        originModuleName = moduleName;
                        nodeConnection.domains.madge.listDependenciesForModule(dirSelection, modFormat, moduleName)
                            .done(function (val) {
                                searchForModuleDependencies(val.results);
                            })
                            .fail(function (err) {
                                console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                                var dlg = Dialogs.showModalDialog(
                                    Dialogs.DIALOG_ID_ERROR,
                                    "Madge Error",
                                    "This action triggered an error: " + err.toString()
                                );
                            });
                        break;
                    default:
                            // ?
                    }
                })
                .fail(function () {
                    console.log("[brackets-madge] failed to load MadgeDomain");
                });
            return loadDomainPromise;
        }
        
        $(nodeConnection).on("madge.update", function (evt, nodeResults) {
            console.log("evt 'listDependencies' " + evt);
            if (!nodeResults) {
                var dlg = Dialogs.showModalDialog(
                    Dialogs.DIALOG_ID_ERROR,
                    "Madge Node Error",
                    nodeResults
                );
            } else {
                resultsProcessor(nodeResults);
                
            }
        });
        // Call all the helper functions in order
        chain(connect, loadDomain);
    }

    function listDependencies() {
        nodeConnectionManager('listDependencies');
    }
    
    function findCircularDependencies() {
        nodeConnectionManager('findCircularDependencies');
    }
        
    // on click check if it's a directory add context menuitem
    function handleMenu(menu, entry) {
        var i;
        for (i = 0; i < commandsArray.length; i = i + 1) {
            menu.removeMenuItem(commandsArray[i]);
        }
        menu.addMenuItem(MADGE_LD_CMD, "", Menus.LAST);
        menu.addMenuItem(MADGE_CRC_CMD, "", Menus.LAST);
    }
    
    // Register commands as right click menu items
    commandsArray = [MADGE_LD_CMD, MADGE_CRC_CMD];
    CommandManager.register("List Dependencies", MADGE_LD_CMD, listDependencies);
    CommandManager.register("Find Circular Dependencies", MADGE_CRC_CMD, findCircularDependencies);
    // Register panel results
    CommandManager.register("Madge Report", TOGGLE_REPORT, togglePanel);
    
    function showError(error) {
        Dialogs.showModalDialog(
            Dialogs.DIALOG_ID_ERROR,
            "Error",
            ": " + error
        );
    }
    
    AppInit.appReady(function () {
        
    });
    
    FileUtils.readAsText(configFile)
        .done(function (text, readTimestamp) {
            //try to parse the config file
            try {
                config = JSON.parse(text);
                
            } catch (e) {
                console.log("Can't parse config file " + e);
                showError();
            }
        })
        .fail(function (error) {
            showError();
        });

    // Determine type of test for selected item in project
    $(projectMenu).on("beforeContextMenuOpen", function (evt) {
        var selectedEntry = ProjectManager.getSelectedItem();
        try {
            if (!selectedEntry.isDirectory) {
                moduleName = selectedEntry.name;
                dirSelection = selectedEntry.fullPath;
                dirSelection = dirSelection.replace("/" + moduleName, "");
                moduleName = moduleName.replace(".js", "");
                handleMenu(projectMenu, selectedEntry);
            } else {
                dirSelection = selectedEntry.fullPath;
                handleMenu(projectMenu, selectedEntry);
            }
        } catch (err) {
            console.log(err);
        }
    });
});