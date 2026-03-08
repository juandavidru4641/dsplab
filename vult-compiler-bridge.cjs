const fs = require('fs');
const path = require('path');

// Global mocks for js_of_ocaml
global.window = global;
global.self = global;
global.navigator = { userAgent: 'node' };

const vultModule = require('./public/vultweb.cjs');
const compiler = vultModule.vult || vultModule;

if (!compiler || typeof compiler.generateJSCode !== 'function') {
    process.stderr.write(JSON.stringify({ error: "Vult compiler failed to initialize." }));
    process.exit(1);
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });
process.stdin.on('end', () => {
    try {
        const { code, target } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        if (target === 'c' || target === 'cpp') {
            // Use generateC for C++ export
            // Vult generateC usually returns a list of files or an object with multiple strings
            // We'll try to get the main .cpp content
            const compilation = compiler.generateC(code, ["-template", "none"]);
            
            if (compilation.errors && Array.isArray(compilation.errors) && compilation.errors.length > 0) {
                process.stdout.write(JSON.stringify({ errors: compilation.errors }));
            } else {
                // compilation is usually an array of { name: string, code: string }
                // or similar structure depending on the vult version
                process.stdout.write(JSON.stringify({ 
                    code: Array.isArray(compilation) ? compilation.map(f => `// File: ${f.name}\n${f.code}`).join("\n\n") : (compilation.code || compilation),
                    errors: []
                }));
            }
            return;
        }

        // Default to JS for live execution
        let jsCode = compiler.generateJSCode(code);
        
        if (jsCode.includes("Required functions are not defined")) {
            const stubs = `
            and noteOn(n:int,v:int,c:int) {}
            and noteOff(n:int,c:int) {}
            and controlChange(c:int,v:int,ch:int) {}
            and default() {}
            `;
            const retryCode = code + "\n" + stubs;
            jsCode = compiler.generateJSCode(retryCode);
        }

        if (jsCode.includes("Errors in the program") || jsCode.includes("Error:")) {
            process.stdout.write(JSON.stringify({ 
                errors: [{ msg: jsCode }] 
            }));
        } else {
            process.stdout.write(JSON.stringify({ 
                code: jsCode,
                errors: []
            }));
        }
    } catch (e) {
        process.stdout.write(JSON.stringify({ 
            errors: [{ msg: e.toString() }] 
        }));
    }
});
