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
        const { code } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        // Try standard compilation
        let jsCode = compiler.generateJSCode(code);
        
        // If it fails due to missing stubs, add them and retry
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
