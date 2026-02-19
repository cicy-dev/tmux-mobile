import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

function addCorsHeaders(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function getVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 6901;

interface Bot {
  bot_name: string;
  ttyd_port: number;
  ttyd_token?: string;
}

interface GlobalConfig {
  api_token: string;
}

interface TmuxRequest {
  text: string;
  target: string;
}

interface CorrectEnglishRequest {
  text: string;
}

interface ApiResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

interface CorrectEnglishResponse extends ApiResponse {
  success: boolean;
  correctedText?: string;
}

interface TmuxListResponse extends ApiResponse {
  success: boolean;
  output?: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function loadOrGenerateToken(): string {
  const configPath = path.join(os.homedir(), 'personal', 'global.json');
  const configDir = path.dirname(configPath);

  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    if (fs.existsSync(configPath)) {
      const config: GlobalConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.api_token) {
        console.log(`✓ Loaded token from ${configPath}`);
        return config.api_token;
      }
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const config: GlobalConfig = { api_token: newToken };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`✓ Generated new token and saved to ${configPath}`);
    return newToken;
  } catch (e) {
    const error = e as Error;
    console.error('Error loading/generating token:', error.message);
    return '123456';
  }
}

const TOKEN = loadOrGenerateToken();

function checkToken(req: http.IncomingMessage): boolean {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.searchParams.get('token') === TOKEN) return true;
  const auth = req.headers['authorization'];
  if (auth === 'Bearer ' + TOKEN) return true;
  return false;
}

const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err: Error) => {
  console.error('Proxy error:', err.message);
});

proxy.on('proxyRes', (proxyRes: http.IncomingMessage) => {
  delete proxyRes.headers['www-authenticate'];
});

let botCache: Bot[] = [];
let botCacheTime = 0;

function loadBots(): Bot[] {
  if (botCache.length && Date.now() - botCacheTime < 30000) return botCache;
  try {
    const out = execSync('docker exec tts-bot python3 /tmp/load_bots.py', { timeout: 8000 }).toString().trim();
    botCache = JSON.parse(out) as Bot[];
    botCacheTime = Date.now();
    console.log('[bots] loaded', botCache.length);
  } catch (e) {
    const error = e as Error;
    console.error('[bots] error:', error.message);
  }
  return botCache;
}

function getBotByName(name: string): Bot | undefined {
  return loadBots().find((b) => b.bot_name === name);
}

function getTtydAuth(port: number): string | null {
  const bot = loadBots().find((b) => String(b.ttyd_port) === String(port));
  if (bot && bot.ttyd_token) {
    return 'Basic ' + Buffer.from('bot:' + bot.ttyd_token).toString('base64');
  }
  return null;
}

const distPath = path.join(__dirname, '..', 'dist');

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
  let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);
  if (!fs.existsSync(filePath)) filePath = path.join(distPath, 'index.html');
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function json<T>(res: http.ServerResponse, data: T): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer | string) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const urlPath = new URL(req.url || '/', 'http://localhost').pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    addCorsHeaders(res);
    res.writeHead(204);
    return res.end();
  }

  addCorsHeaders(res);

  if (urlPath === '/api/health' && req.method === 'GET') {
    return json(res, {
      success: true,
      version: getVersion(),
      message: 'Hot reload test!',
      timestamp: new Date().toISOString()
    });
  }

  if (!urlPath.startsWith('/api/') && !urlPath.startsWith('/ttyd/')) {
    return serveStatic(req, res);
  }

  if (urlPath.startsWith('/ttyd/')) {
    const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
    if (m) {
      const name = m[1];
      let port: string;
      let token: string;

      // Query fast-api for port and token by name
      try {
        const fastApiUrl = `http://127.0.0.1:14444/api/ttyd/by-name/${encodeURIComponent(name)}`;
        const response = await fetch(fastApiUrl, {
          headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
        });
        if (!response.ok) {
          res.writeHead(404);
          return res.end('pane not found');
        }
        const data = await response.json() as { port: number; token: string };
        port = String(data.port);
        token = data.token || '';
      } catch (e) {
        res.writeHead(502);
        return res.end('fast-api error');
      }

      req.url = m[2] || '/';
      delete req.headers['authorization'];

      // Check for token in query param first
      const url = new URL(req.url || '/', 'http://localhost');
      const queryToken = url.searchParams.get('token');
      const useToken = queryToken || token;
      
      if (useToken) {
        req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + useToken).toString('base64');
      }

      return proxy.web(req, res, { target: 'http://127.0.0.1:' + port });
    }
  }

  if (!checkToken(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized' }));
  }

  if (urlPath === '/api/bots' && req.method === 'GET') {
    return json(res, loadBots());
  }

  if (urlPath === '/api/tmux' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { text, target } = JSON.parse(body) as TmuxRequest;
      if (!text || !text.trim() || !target) {
        return json(res, { success: false, error: 'need text and target' });
      }
      execSync('tmux send-keys -t ' + JSON.stringify(target) + ' ' + JSON.stringify(text) + ' Enter', { timeout: 5000 });
      return json(res, { success: true });
    } catch (e) {
      const error = e as Error;
      return json(res, { success: false, error: error.message });
    }
  }

  if (urlPath === '/api/tmux-list' && req.method === 'GET') {
    try {
      const homeDir = os.homedir();
      const output = execSync(`${homeDir}/tools/tre`, { timeout: 5000, encoding: 'utf8' });
      return json<TmuxListResponse>(res, { success: true, output });
    } catch (e) {
      const error = e as Error;
      return json<TmuxListResponse>(res, { success: false, error: error.message });
    }
  }

  if (urlPath === '/api/correctEnglish' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const { text } = JSON.parse(body) as CorrectEnglishRequest;
      if (!text) return json(res, { success: false, error: 'no text' });

      const hfUrl = 'https://api-inference.huggingface.co/models/facebook/bart-large-cnn';
      const hfBody = JSON.stringify({
        inputs: `Correct this English text: ${text}`,
        parameters: { max_length: 200, min_length: 10 },
      });

      const url = new URL(hfUrl);
      const options: https.RequestOptions = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      };

      const hfReq = https.request(options, (hfRes) => {
        let data = '';
        hfRes.on('data', (chunk: Buffer | string) => (data += chunk));
        hfRes.on('end', () => {
          try {
            if (hfRes.statusCode !== 200) {
              const corrected = fallbackCorrect(text);
              return json<CorrectEnglishResponse>(res, { success: true, correctedText: corrected.trim() });
            }
            const result = JSON.parse(data) as Array<{ summary_text?: string; generated_text?: string }>;
            let correctedText = (result[0]?.summary_text || result[0]?.generated_text || text)
              .replace(/^Correct this English text:\s*/i, '')
              .replace(/^["']|["']$/g, '')
              .trim();
            json<CorrectEnglishResponse>(res, { success: true, correctedText });
          } catch (e) {
            const corrected = fallbackCorrect(text);
            json<CorrectEnglishResponse>(res, { success: true, correctedText: corrected.trim() });
          }
        });
      });

      hfReq.on('error', () => {
        const corrected = fallbackCorrect(text);
        json<CorrectEnglishResponse>(res, { success: true, correctedText: corrected.trim() });
      });

      hfReq.write(hfBody);
      hfReq.end();
      return;
    } catch (e) {
      const error = e as Error;
      return json(res, { success: false, error: error.message });
    }
  }

  serveStatic(req, res);
});

function fallbackCorrect(text: string): string {
  return text
    .replace(/\br\s+you\b/gi, 'are you')
    .replace(/\bhow old a you\b/gi, 'how old are you')
    .replace(/\bu\b/gi, 'you')
    .replace(/\br\b/gi, 'are')
    .replace(/^([a-z])/, (m) => m.toUpperCase());
}

server.on('upgrade', (req: http.IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
  const m = req.url?.match(/^\/ttyd\/([^/]+)(\/.*)?$/);
  if (m) {
    const name = m[1];
    let port: string;
    let token: string;

    // Query fast-api for port and token by name
    const fastApiUrl = `http://127.0.0.1:14444/api/ttyd/by-name/${encodeURIComponent(name)}`;
    fetch(fastApiUrl, {
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' }
    }).then((response) => {
        if (!response.ok) {
          socket.destroy();
          return;
        }
        response.json().then((data: { port: number; token: string }) => {
          const wsPort = String(data.port);
          const wsToken = data.token || '';

          req.url = m[2] || '/';
          delete req.headers['authorization'];

          const wsUrl = new URL(req.url || '/', 'http://localhost');
          const wsQueryToken = wsUrl.searchParams.get('token');
          const useToken = wsQueryToken || wsToken;

          if (useToken) {
            req.headers['authorization'] = 'Basic ' + Buffer.from('user:' + useToken).toString('base64');
          }

          proxy.ws(req, socket, head, { target: 'http://127.0.0.1:' + wsPort });
        }).catch(() => socket.destroy());
      });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ttyd-proxy on :' + PORT);
  loadBots();
});
