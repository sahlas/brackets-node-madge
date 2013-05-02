/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
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

/*global define, brackets, $, window, PathUtils */

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
        madgeReportEntry        = new NativeFileSystem.FileEntry(moduleDir + '/generated/madgeReport.html'),
        configFile              = new NativeFileSystem.FileEntry(moduleDir + '/config.json'),
        config                  = { options: {}, globals: {} },
        report                  = "",
        commandsArray            = [],
        projectMenu             = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
        MADGE_CJS_CMD           = "madge_cjs",
        MADGE_AMD_CMD           = "madge_amd",
        MADGE_CJS_I_CMD         = "madge_cjs_i",
        MADGE_AMD_I_CMD         = "madge_amd_i",
        MADGE_CRC_CJS_CMD       = "madge_circular_dep_cjs",
        MADGE_CRC_AMD_CMD       = "madge_circular_dep_amd",
        MADGE_DFM_CJS_CMD       = "madge_dependencies_for_module_cjs",
        MADGE_DFM_AMD_CMD       = "madge_dependencies_for_module_amd",
        dirSelection            = "",
        TOGGLE_REPORT           = "quality.metrics.madge",
        enabled                 = false,
        modFormat               = "cjs",
        panel                   = require("text!templates/madge_panel.html"),
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
    
    function handleShowPanel() {
        //add the HTML UI
        $(panel).insertBefore("#status-bar");
        Resizer.makeResizable($('#panel').get(0), "vert", "top", 100);
        $('#panel .close').click(function () {
            $('#panel').hide();
            EditorManager.resizeEditor();
        });
        $('#panel').show();
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
    }

    function resultsProcessor(result) {
        var template, html, doc, key,
            prop, i, obj,
            moduleElem,
            dependencyElem,
            moduleName,
            dependencyName, newFileName, 
            makeCell, headerTable, itemTable, itemHeaders, noResltsMsg,
            count;

        makeCell = function (content, end, altColors, arrowPos) {
            var lBracket = "[", rBracket = "]", arrow = "--";
            content = "" + content ;
            
            if (altColors)  {// mark end
                if (!end) {
                    if (arrowPos === "begin") {
                        return $("<td/>").text(arrow + content).css({fontSize:20, color: 'green'});
                    } else {
                        return $("<td/>").text(content + arrow).css({fontSize:16, color: 'green'});   
                    }
                    
                } else {
                    return $("<td/>").text(content).css({fontSize:20, color: 'green'});
                }
            } else {
                if (!end)  {// mark end
                    if (arrowPos === "begin") {
                        return $("<td/>").text(arrow + content).css({fontSize:20, color: 'blue'});
                    } else {
                        return $("<td/>").text(content + arrow).css({fontSize:16, color: 'blue'});
                    }
                    
                } else {
                    return $("<td/>").text(content).css({fontSize:20, color: 'blue'});
                }
            }
        };
        togglePanel();
        headerTable = $("<table class='condensed-table' style='overflow:hidden;'/>").append("<tbody>");
        itemTable = $("<table class='zebra-striped ' />").empty().append("<tbody>");
        noResltsMsg = "No dependencies found!";
        var selectedRow;
        
        if (!Array.isArray(result)) {
            var doImg = false;
            try {
                if (result.match('png')) {
                    doImg = true;
                }

            } catch (err) {
                console.log("err: " + err);
            }
            if (doImg) {    //
                var pathToPNG = moduleDir + "/generated/gv.png";
                var imgTag = "<div style='height: 100%; width: 100%; border: 1px solid black;'><span><a href='" + pathToPNG + "'/>" + pathToPNG + "</a>";

                imgTag = imgTag + "<img src='" + pathToPNG + "'/></span></div>";
                itemHeaders = "<tr><th>Module Dependceny Graph</th></tr>";
                $(headerTable).append(itemHeaders);
                
                var row = $(imgTag)
                    .appendTo(itemTable);
            } else {
                // list module dependencies
                for (key in result) {
                    if (result.hasOwnProperty(key)) {
                        obj = result[key];
                        if (obj.length > 0) {// has dependencies
                            var row = $("<tr/>")
                                .append(makeCell(key, true, true))
                                .appendTo(itemTable);
                            
                            $(row).click(function () {
                                if (selectedRow) {
                                    selectedRow.removeClass("selected");
                                }
                                newFileName = dirSelection + this.innerText + ".js";
                                console.log("open file named " + newFileName);
                                $(this).addClass("selected");
                                selectedRow = $(this);
                                CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, {fullPath: newFileName});
                            });
    
                            for (prop in obj) {
                                if (obj.hasOwnProperty(prop)) {
                                    var outerRow = $("<tr/>")
                                            .append(makeCell(obj[prop], false, false, "begin"))
                                            .appendTo(itemTable);
                                    $(outerRow).click(function () {
                                        if (selectedRow) {
                                            selectedRow.removeClass("selected");
                                        }
                                        newFileName = dirSelection + this.innerText.replace('--', '') + ".js";
                                        console.log("open file named " + newFileName);
                                        $(this).addClass("selected");
                                        selectedRow = $(this);
                                        CommandManager.execute(Commands.FILE_ADD_TO_WORKING_SET, {fullPath: newFileName});
                                    });                        
                                    console.log(prop + " = " + obj[prop]);
                                }
                            }
                        }
                    }
                }
            }
            if (modFormat === "cjs") {
                itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                $(headerTable).append(itemHeaders);
                $(headerTable).append(itemTable);
                $("#cjs").empty().append(headerTable);
                modFormat = "amd";
            } else if (modFormat === "amd")
            {
                itemHeaders = "<tr><th>Module Dependceny List ( " + modFormat + " )</th></tr>";
                $(headerTable).append(itemHeaders);
                $(headerTable).append(itemTable);
                $("#amd").empty().append(headerTable);
                modFormat = "cjs";
            } else {
                //do nothing
            }
        } else {
            // list circular references
            noResltsMsg = "No circular dependencies found!";
            if (result.length > 0) {
                for (i = 0; i < result.length; i++) {
                    obj = result[i];
                    count   = result.length;
                    console.log(i % 2);

                    if (i % 2 === 1){//alternate row color
                        for (prop in result) {
                            if (obj.hasOwnProperty(prop)) {
                                var row = $("<tr/>");
                                if (count === 1) {// mark end
                                    row.append(makeCell(result[prop], true, true));
                                } else {
                                    row.append(makeCell(result[prop] , false, true, "end"));
                                }
                                count--;
                            }
                        }
                    } else {
                        for (prop in result) {
                            if (obj.hasOwnProperty(prop)) {
                                var row = $("<tr/>");
                                if (count === 1) {// mark end
                                    row.append(makeCell(result[prop], true, false));
                                } else {
                                    row.append(makeCell(result[prop] , false, false, "end"));
                                }
                                count--;
                            }
                        }
                    }
                    $(itemTable).append(row);
                    console.log("row: " + $(row));
                }
                if (modFormat === "cjs") {
                    itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (CJS)</th></tr>";
                    $(headerTable).append(itemHeaders);
                    $(headerTable).append(itemTable);
                    $("#cjs").empty().append(headerTable);
                }  else if (modFormat === "amd") {
                    itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (AMD)</th></tr>";
                    $(headerTable).append(itemHeaders);
                    $(headerTable).append(itemTable);
                    $("#amd").empty().append(headerTable);
                } else {
                    //do nothing
                }
            } else {
                // when nothing to report
                if (key === undefined && !doImg && !result.length > 0) {
                    row = $("<tr/>")
                            .append(makeCell(noResltsMsg, true))
                            .appendTo(itemTable);
                    if (modFormat === "cjs") {
                        itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (CJS)</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#cjs").empty().append(headerTable);
                     }  else if (modFormat === "amd") {
                        itemHeaders = "<tr style='font-size: small'><th>Circular Dependency Chain (AMD)</th></tr>";
                        $(headerTable).append(itemHeaders);
                        $(headerTable).append(itemTable);
                        $("#amd").empty().append(headerTable);
                    } else {
                        //do nothing
                    }
                }
            }
        }
    }
    
    AppInit.appReady(function () {
        nodeConnection = new NodeConnection();

        function connect() {
            var connectionPromise = nodeConnection.connect(true);
            connectionPromise.fail(function () {
                console.error("[brackets-madge] failed to connect to node");
            });
            return connectionPromise;
        }
        function loadDomain() {
            var path = ExtensionUtils.getModulePath(module, "node/MadgeDomain"),
                loadPromise = nodeConnection.loadDomains([path], true);
            loadPromise.fail(function () {
                console.log("[brackets-madge] failed to load MadgeDomain");
            });
            return loadPromise;
        }
        $(nodeConnection).on("madge.update", function (evt, nodeResults) {
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
    });

    function listDependencies() {
        
        nodeConnection.domains.madge.listDependencies(dirSelection, modFormat)
            .done(function () {
                modFormat = "amd";
                nodeConnection.domains.madge.listDependencies(dirSelection,  modFormat)
                    .fail(function (err) {
                        console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                        var dlg = Dialogs.showModalDialog(
                            Dialogs.DIALOG_ID_ERROR,
                            "Madge Error",
                            "This action triggered an error: " + err.toString()
                        );
                })
            }).fail(function (err) {
                console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                var dlg = Dialogs.showModalDialog(
                    Dialogs.DIALOG_ID_ERROR,
                    "Madge Error",
                    "This action triggered an error: " + err.toString()
                );
        });
    }
    
    function findCircularDependencies() {
        var reportPromise0 = nodeConnection.domains.madge.findCircularDependencies(dirSelection, "cjs");
        reportPromise0.done(function (results) {
            report = results.report;
            resultsProcessor(report);
            modFormat = "amd";
        });
        
        reportPromise0.fail(function (err) {
            console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
            var dlg = Dialogs.showModalDialog(
                Dialogs.DIALOG_ID_ERROR,
                "Madge Error",
                "This action triggered an error: " + err.toString()
            );
        });

        var reportPromise1 = nodeConnection.domains.madge.findCircularDependencies(dirSelection, "amd");
        reportPromise1.done(function (results) {
            report = results.report;
            resultsProcessor(report);
            modFormat = "cjs";
        });
        
        reportPromise1.fail(function (err) {
            console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
            var dlg = Dialogs.showModalDialog(
                Dialogs.DIALOG_ID_ERROR,
                "Madge Error",
                "This action triggered an error: " + err.toString()
            );
        });
    }

    
    function listDependenciesForModule() {
        nodeConnection.domains.madge.listDependenciesForModule(dirSelection, modFormat, 'main')
            .fail(function (err) {
                console.error("[brackets-madge] failed to run MadgeDomain.cmdGetReport", err.toString());
                var dlg = Dialogs.showModalDialog(
                    Dialogs.DIALOG_ID_ERROR,
                    "Madge Error",
                    "This action triggered an error: " + err.toString()
                );
            });
    }
    
    // on click check if it's a directory add context menuitem
    function handleMenu(menu, entry) {
        var i;
        for (i = 0; i < commandsArray.length; i++) {
            menu.removeMenuItem(commandsArray[i]);
        }
        if (entry.isFile) {
            menu.addMenuItem(MADGE_DFM_CJS_CMD, "", Menus.LAST);
        } else {
            menu.addMenuItem(MADGE_CJS_CMD, "", Menus.LAST);
            menu.addMenuItem(MADGE_CRC_CJS_CMD, "", Menus.LAST);
        }
    }
    
    // Register commands as right click menu items
    commandsArray = [MADGE_CJS_CMD, MADGE_CRC_CJS_CMD, MADGE_DFM_CJS_CMD];
    CommandManager.register("List Dependencies", MADGE_CJS_CMD, listDependencies);
    CommandManager.register("Find Circular Dependencies", MADGE_CRC_CJS_CMD, findCircularDependencies);
    CommandManager.register("List Dependencies For Module", MADGE_DFM_CJS_CMD, listDependenciesForModule);
    // Register panel results
    CommandManager.register("Madge Report", TOGGLE_REPORT, togglePanel);
    
    function showError(error) {
        Dialogs.showModalDialog(
            Dialogs.DIALOG_ID_ERROR,
            "Error",
            ": " + error
        );
    }
    
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
        if (!selectedEntry.isDirectory) {
            handleMenu(projectMenu, selectedEntry);
        } else {
            dirSelection = selectedEntry.fullPath;
            handleMenu(projectMenu, selectedEntry);
        }
    });
});