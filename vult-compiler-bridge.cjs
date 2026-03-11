const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const SANDBOX_WORKDIR = process.env.VULT_SANDBOX_DIR || null;
const USE_SANDBOX = process.env.VULT_SANDBOX === 'true';

function isPathInDirectory(filepath, directory) {
    const absFile = path.resolve(filepath);
    const absDir = path.resolve(directory);
    return absFile.startsWith(absDir + path.sep) || absFile === absDir;
}

function validateDir(baseDir) {
    if (!baseDir || !fs.existsSync(baseDir)) return false;
    return fs.statSync(baseDir).isDirectory();
}

// Map API target names to vultc flags and output extensions
// template is optional and maps to vultc -template flag (ccode only)
const TARGET_MAP = {
    'c':       { flag: '-ccode',    exts: ['.cpp', '.h', '.tables.h'] },
    'cpp':     { flag: '-ccode',    exts: ['.cpp', '.h', '.tables.h'] },
    'c-pd':    { flag: '-ccode',    exts: ['.cpp', '.h', '.tables.h'], template: 'pd' },
    'c-teensy':{ flag: '-ccode',    exts: ['.cpp', '.h', '.tables.h'], template: 'teensy' },
    'c-juce':  { flag: '-ccode',    exts: ['.cpp', '.h', '.tables.h'] },
    'js':      { flag: '-jscode',   exts: ['.js'] },
    'lua':     { flag: '-luacode',  exts: ['.lua'] },
    'java':    { flag: null,        exts: ['.java'], needsPrefix: true },
};

// Global mocks for js_of_ocaml
global.window = global;
global.self = global;
global.navigator = { userAgent: 'node' };

const vultModule = require('./public/vultweb.cjs');
const compilerV0 = vultModule.vult || vultModule;

let compilerV1 = null;
try {
    const vultModuleV1 = require('./public/v1-vultweb.cjs');
    compilerV1 = vultModuleV1.vult || vultModuleV1;
} catch (e) {
    // V1 not loaded yet
}

if (!compilerV0 || typeof compilerV0.generateJSCode !== 'function') {
    process.stderr.write(JSON.stringify({ error: "Vult compiler failed to initialize correctly in Node." }));
    process.exit(1);
}

// Run vultc in sandbox workdir, return promise resolving to { files, errors }
function runVultc(code, target, javaPrefix, template) {
    return new Promise((resolve) => {
        let workDir = SANDBOX_WORKDIR;
        if (!workDir || !validateDir(workDir)) workDir = os.tmpdir();

        const vultcPath = path.join(__dirname, 'node_modules', '.bin', 'vultc');
        if (!fs.existsSync(vultcPath)) {
            resolve({ errors: [{ msg: 'vultc binary not found' }] });
            return;
        }

        const targetCfg = TARGET_MAP[target] || TARGET_MAP['c'];
        const baseName = 'dsplab';
        const tmpFile = path.join(workDir, baseName + '.vult');
        const outBase = path.join(workDir, baseName);

        if (!isPathInDirectory(tmpFile, workDir) || !isPathInDirectory(outBase, workDir)) {
            resolve({ errors: [{ msg: 'Security error: paths outside sandbox' }] });
            return;
        }

        fs.writeFileSync(tmpFile, code);

        const args = [tmpFile, targetCfg.flag, '-o', outBase];
        // Use template from parameter if provided, otherwise fall back to target-specific default
        const effectiveTemplate = template || targetCfg.template;
        if (effectiveTemplate) {
            args.push('-template', effectiveTemplate);
        }
        if (targetCfg.needsPrefix && javaPrefix) {
            // java needs: vultc file.vult -javacode com.company -o out
            args[1] = '-javacode';
            args.splice(2, 0, javaPrefix);
        }

        const vultc = spawn(vultcPath, args);
        let stdout = '';
        let stderr = '';

        vultc.stdout.on('data', d => { stdout += d; });
        vultc.stderr.on('data', d => { stderr += d; });

        vultc.on('close', (exitCode) => {
            try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch(e) {}

            // vultc exits 0 but emits a "Required functions" warning to stdout
            const combinedOut = stdout + stderr;
            if (exitCode !== 0 || combinedOut.includes('Required functions are not defined')) {
                // Retry with boilerplate stubs injected
                if (!code.includes('fun noteOn') && !code.includes('and noteOn')) {
                    const stubs = `\nand noteOn(note:int, velocity:int, channel:int){ }\nand noteOff(note:int, channel:int){ }\nand controlChange(control:int, value:int, channel:int){ }\nand default(){ }`;
                    resolve(runVultc(code + stubs, target, javaPrefix, template));
                } else {
                    resolve({ errors: [{ msg: stderr || stdout || 'vultc failed' }] });
                }
                return;
            }

            // Collect output files as a map
            const files = {};
            for (const ext of targetCfg.exts) {
                const outFile = outBase + ext;
                if (!fs.existsSync(outFile)) continue;
                if (!isPathInDirectory(outFile, workDir)) {
                    resolve({ errors: [{ msg: 'Security error: output path outside sandbox' }] });
                    return;
                }
                const content = fs.readFileSync(outFile, 'utf8');
                files[path.basename(outFile)] = content;
                try { fs.unlinkSync(outFile); } catch(e) {}
            }

            // Include runtime files for C/C++ targets
            if (target === 'c' || target === 'cpp' || target === 'c-pd' || target === 'c-teensy' || target === 'c-juce') {
                const runtimeDir = path.join(__dirname, 'vult-runtime');
                if (fs.existsSync(path.join(runtimeDir, 'vultin.h'))) {
                    files['vultin.h'] = fs.readFileSync(path.join(runtimeDir, 'vultin.h'), 'utf8');
                }
                if (fs.existsSync(path.join(runtimeDir, 'vultin.cpp'))) {
                    files['vultin.cpp'] = fs.readFileSync(path.join(runtimeDir, 'vultin.cpp'), 'utf8');
                }
            }

            resolve({ files, errors: [] });
        });
    });
}

let inputData = '';
process.stdin.on('data', chunk => { inputData += chunk; });
process.stdin.on('end', async () => {
    try {
        const { code, target, javaPrefix, version, template } = JSON.parse(inputData);
        if (!code) throw new Error("No code provided");

        const compiler = version === 'v1' && compilerV1 ? compilerV1 : compilerV0;
        const effectiveTarget = target || 'js';

        // JS target: use internal compiler (faster, no disk I/O)
        if (effectiveTarget === 'js') {
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
                let structured = [];
                try {
                    structured = compiler.checkCode(code);
                } catch(e) {}
                
                if (structured && structured.length > 0) {
                    process.stdout.write(JSON.stringify({
                        errors: structured.map(err => ({
                            msg: err.raw || err.text,
                            row: err.row !== undefined ? parseInt(err.row) : null,
                            column: err.column !== undefined ? parseInt(err.column) : null,
                            type: err.type || 'error'
                        }))
                    }));
                } else {
                    process.stdout.write(JSON.stringify({ errors: [{ msg: jsCode }] }));
                }
            } else {
                process.stdout.write(JSON.stringify({ code: jsCode, errors: [] }));
            }
            return;
        }

        // All other targets: run vultc in sandbox
        if (!TARGET_MAP[effectiveTarget]) {
            process.stdout.write(JSON.stringify({ errors: [{ msg: `Unknown target: ${effectiveTarget}` }] }));
            return;
        }

        const result = await runVultc(code, effectiveTarget, javaPrefix, template);
        process.stdout.write(JSON.stringify(result));

    } catch (e) {
        process.stdout.write(JSON.stringify({ errors: [{ msg: e.toString() }] }));
    }
});
