import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { spawn } from 'child_process'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'vult-compiler-api',
      configureServer(server) {
        server.middlewares.use('/api/compile', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const { code, options } = JSON.parse(body);
                
                // Spawn node with 1GB stack size
                const child = spawn('node', [
                  '--stack-size=1000000', 
                  path.join(process.cwd(), 'vult-compiler-bridge.cjs')
                ]);

                let output = '';
                let error = '';

                child.stdout.on('data', data => { output += data; });
                child.stderr.on('data', data => { error += data; });

                child.on('close', (exitCode) => {
                  res.setHeader('Content-Type', 'application/json');
                  if (exitCode === 0) {
                    res.end(output);
                  } else {
                    res.statusCode = 500;
                    res.end(error || JSON.stringify({ error: 'Compilation process failed' }));
                  }
                });

                child.stdin.write(JSON.stringify({ code, options }));
                child.stdin.end();

              } catch (e) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid request body' }));
              }
            });
          } else {
            res.statusCode = 405;
            res.end();
          }
        });
      }
    }
  ],
})
