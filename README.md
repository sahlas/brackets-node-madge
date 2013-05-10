brackets-madge
================

this extension enables you to generate reports to show your module dependencies using MaDGe - Module Dependency Graph - https://github.com/pahen/node-madge/

## Installation
Use Brackets "File -> Install Extension" tool



UPDATE - the GraphVis functionality has been disabled while we research a bug involving caching images.  sahlas/brackets-node-madge issue #4

_NOTE about GraphVis: when you have GraphVis installed we'll also generate "png" graph images for a single view. I installed GraphVis from http://www.graphviz.org/
GraphVis attributes and properties are configurable from the config.json file
GraphVis functionality has been tested on Mac OS X at this time_

## Usage
* List Dependencies - in the project panel select a folder you want to analyze.  Choose List Dependencies for the folder and brackets-node-madge will analyze it for the formats "cjs" for Common JS and
"amd" for Async Module Definitions.
* Find Circular Dependencies - like List Dependencies but reports on any circular dependencies for both "cjs" and "amd" formats

## Implementation Notes
This extension includes "node-madge" a MaDGe - Module Dependency Graph tool provided by https://github.com/pahen/node-madge. The brackets extension combines many of the cli commands and presents results in an aggregate fashion in a panel with table views for both "cjs" and "amd".

I'm working on a better layout with tabs and tree controls to better navigate the results

## Change Log
* 5/2 - initial checkin
* 5/7 - fixed JSLint issues, fixed bugs in main.js and node/MadgeDomain.js
* 5/10 - fixed issue #1; disabled GraphVis for issue #4