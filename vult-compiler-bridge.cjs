const fs = require('fs');
const path = require('path');

// Global mocks for js_of_ocaml
global.window = global;
global.self = global;
global.navigator = { userAgent: 'node' };

// We use .cjs to ensure Node treats it as CommonJS regardless of package.json type: module
const vultModule = require('./public/vultweb.cjs');
const compiler = vultModule.vult || vultModule;

if (!compiler || typeof compiler.generateJSCode !== 'function') {
    process.stderr.write(JSON.stringify({ error: "Vult compiler failed to initialize correctly in Node." }));
    process.exit(1);
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });
process.stdin.on('end', () => {
    try {
        const { code, target } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        if (target === 'c' || target === 'cpp') {
            const compilation = compiler.generateC(code, ["-template", "none"]);
            if (compilation.errors && Array.isArray(compilation.errors) && compilation.errors.length > 0) {
                process.stdout.write(JSON.stringify({ errors: compilation.errors }));
            } else {
                process.stdout.write(JSON.stringify({ 
                    code: Array.isArray(compilation) ? compilation.map(f => `// File: ${f.name}\n${f.code}`).join("\n\n") : (compilation.code || compilation),
                    errors: []
                }));
            }
            return;
        }

        let jsCode = compiler.generateJSCode(code);
        
        if (jsCode.includes("Required functions are not defined")) {
            const stubs = `
            and noteOn(n:int,v:int,c:int) {}
            and noteOff(n:int,c:int) {}
            and controlChange(c:int,v:int,ch:int) {}
            and default() {}
            `;
            jsCode = compiler.generateJSCode(code + "\n" + stubs);
        }

        if (jsCode.includes("Errors in the program") || jsCode.includes("Error:")) {
            process.stdout.write(JSON.stringify({ errors: [{ msg: jsCode }] }));
        } else {
            process.stdout.write(JSON.stringify({ code: jsCode, errors: [] }));
        }
    } catch (e) {
        process.stdout.write(JSON.stringify({ errors: [{ msg: e.toString() }] }));
    }
});
