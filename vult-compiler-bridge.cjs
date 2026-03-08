const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Global mocks for js_of_ocaml
global.window = global;
global.self = global;
global.navigator = { userAgent: 'node' };

const vultModule = require('./public/vultweb.cjs');
const compiler = vultModule.vult || vultModule;

if (!compiler || typeof compiler.generateJSCode !== 'function') {
    process.stderr.write(JSON.stringify({ error: "Vult compiler failed to initialize correctly in Node." }));
    process.exit(1);
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });
process.stdin.on('end', async () => {
    try {
        const { code, target } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        if (target === 'c' || target === 'cpp') {
            // Try to use the local vultc binary if available for better C++ generation
            const vultcPath = path.join(__dirname, 'node_modules', '.bin', 'vultc');
            if (fs.existsSync(vultcPath)) {
                const tmpFile = path.join(__dirname, 'tmp_' + Date.now() + '.vult');
                fs.writeFileSync(tmpFile, code);
                
                const vultc = spawn(vultcPath, [tmpFile, '-ccode', '-o', 'out']);
                let output = '';
                let error = '';
                
                vultc.stdout.on('data', data => { output += data; });
                vultc.stderr.on('data', data => { error += data; });
                
                vultc.on('close', (exitCode) => {
                    fs.unlinkSync(tmpFile);
                    if (exitCode === 0) {
                        // Vultc produces out.cpp and out.h
                        const cppFile = 'out.cpp';
                        const hFile = 'out.h';
                        let finalCode = '';
                        if (fs.existsSync(cppFile)) {
                            finalCode += `// File: ${cppFile}\n` + fs.readFileSync(cppFile, 'utf8');
                            fs.unlinkSync(cppFile);
                        }
                        if (fs.existsSync(hFile)) {
                            finalCode += `\n\n// File: ${hFile}\n` + fs.readFileSync(hFile, 'utf8');
                            fs.unlinkSync(hFile);
                        }
                        process.stdout.write(JSON.stringify({ code: finalCode, errors: [] }));
                    } else {
                        process.stdout.write(JSON.stringify({ errors: [{ msg: error || "vultc failed" }] }));
                    }
                });
                return;
            } else {
                // Fallback to internal compiler.generateC if vultc is not found
                const compilation = compiler.generateC(code, ["-template", "none"]);
                process.stdout.write(JSON.stringify({ 
                    code: Array.isArray(compilation) ? compilation.map(f => `// File: ${f.name}\n${f.code}`).join("\n\n") : (compilation.code || compilation),
                    errors: []
                }));
                return;
            }
        }

        // JS Compilation (Default)
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
