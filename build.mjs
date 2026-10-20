import fs from 'node:fs';
let core=fs.readFileSync('src/core.js','utf8');
let main=fs.readFileSync('src/main.js','utf8');
// Single-file output: bundle only our own module, leave Obsidian & CodeMirror to the host.
main=main.replace("const Core=require('./core');",()=>"const Core=(function(){const module={exports:{}};\n"+core+"\nreturn module.exports;})();");
fs.writeFileSync('main.js',main);
