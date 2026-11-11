'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const ROOT = __dirname;
const DOWNLOADS = path.join(ROOT, 'downloads');
const PORT = Math.max(1, Math.min(65535, Number(process.env.PORT) || 8000));
const MAX_BYTES = 3 * 1024 * 1024 * 1024;
const TTL_MS = 20 * 60 * 1000;
const uploads = new Map();
fs.mkdirSync(DOWNLOADS, { recursive: true });

function json(res, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}
function clientIp(req) {
  let ip = req.socket.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip.replace(/[^0-9a-fA-F._-]/g, '_').slice(0, 64) || 'unknown';
}
function privateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n, i) => !/^\d{1,3}$/.test(ip.split('.')[i]) || n > 255)) return false;
  return p[0] === 10 || p[0] === 192 && p[1] === 168 || p[0] === 172 && p[1] >= 16 && p[1] <= 31 || p[0] === 169 && p[1] === 254;
}
function safeName(name) {
  const base = path.basename(String(name || 'package.pkg')).replace(/[^\w .()\-]/g, '_').slice(0, 180);
  return base && /\.pkg$/i.test(base) ? base : null;
}
function validId(id) { return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
function removeRecord(record) {
  const relative = path.relative(DOWNLOADS, record.filePath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) fs.rmSync(record.filePath, { force: true });
  try { fs.rmdirSync(record.directory); } catch {}
  uploads.delete(record.id);
}
function scanUploads() {
  for (const ip of fs.readdirSync(DOWNLOADS, { withFileTypes: true })) {
    if (!ip.isDirectory()) continue;
    const ipPath = path.join(DOWNLOADS, ip.name);
    const allEntries = fs.readdirSync(ipPath, { withFileTypes: true }).filter(x => x.isFile());
    for (const entry of allEntries) if (entry.name.endsWith('.uploading')) fs.rmSync(path.join(ipPath, entry.name), { force: true });
    const files = allEntries.filter(x => /^[0-9a-f-]{36}__.+\.pkg$/i.test(x.name));
    for (const ent of files) {
      const match = /^([0-9a-f-]{36})__(.+)$/i.exec(ent.name);
      if (!match || !validId(match[1])) continue;
      const filePath = path.join(ipPath, ent.name);
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs >= TTL_MS) fs.rmSync(filePath, { force: true });
      else uploads.set(match[1], { id: match[1], ip: ip.name, directory: ipPath, filePath, fileName: match[2], size: stat.size, expiresAt: stat.mtimeMs + TTL_MS });
    }
  }
}
scanUploads();
setInterval(() => {
  const now = Date.now();
  for (const rec of uploads.values()) if (now >= rec.expiresAt) removeRecord(rec);
}, 30_000).unref();

function serveFile(req, res, rec) {
  if (Date.now() >= rec.expiresAt) { removeRecord(rec); return json(res, 410, { error: 'Upload expired' }); }
  let start = 0, end = rec.size - 1, status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2])) return json(res, 416, { error: 'Invalid byte range' });
    if (!m[1]) { const suffix = Number(m[2]); start = Math.max(0, rec.size - suffix); }
    else start = Number(m[1]);
    if (m[2] && m[1]) end = Math.min(end, Number(m[2]));
    if (start > end || start >= rec.size) { res.writeHead(416, { 'Content-Range': `bytes */${rec.size}` }); return res.end(); }
    status = 206;
  }
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${rec.fileName.replace(/"/g, '')}"` };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${rec.size}`;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  pipeline(fs.createReadStream(rec.filePath, { start, end }), res).catch(() => {});
}
function readJSON(req, max = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let data = ''; let size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > max) { reject(new Error('Request body too large')); req.destroy(); } else data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function sendRpi(ip, value) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(value));
    const request = http.request({ host: ip, port: 12800, path: '/api/install', method: 'POST', timeout: 15_000, headers: { 'Content-Type': 'application/json', 'Content-Length': body.length } }, response => {
      let text = '', remaining = 4000; response.setEncoding('utf8'); response.on('data', c => {
        if (remaining <= 0) return;
        const part = c.slice(0, remaining);
        text += part;
        remaining -= part.length;
      });
      response.on('end', () => resolve({ status: response.statusCode, body: text.slice(0, 4000) }));
    });
    request.on('timeout', () => request.destroy(new Error('Timed out connecting to PS4 RPI on port 12800')));
    request.on('error', reject); request.end(body);
  });
}
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.appcache':'text/cache-manifest; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, maxBytes: MAX_BYTES, ttlSeconds: TTL_MS / 1000 });
    if (req.method === 'PUT' && url.pathname === '/api/upload') {
      const fileName = safeName(url.searchParams.get('name'));
      if (!fileName) return json(res, 400, { error: 'Choose a .pkg file' });
      const length = Number(req.headers['content-length'] || 0);
      if (length > MAX_BYTES) return json(res, 413, { error: 'File exceeds the 3 GB limit' });
      const ip = clientIp(req), id = crypto.randomUUID();
      const directory = path.join(DOWNLOADS, ip);
      fs.mkdirSync(directory, { recursive: true });
      const filePath = path.join(directory, id + '__' + fileName);
      const tempPath = filePath + '.uploading';
      let bytes = 0;
      const limit = new Transform({ transform(chunk, enc, cb) { bytes += chunk.length; cb(bytes > MAX_BYTES ? new Error('File exceeds the 3 GB limit') : null, chunk); } });
      try { await pipeline(req, limit, fs.createWriteStream(tempPath, { flags: 'wx' })); fs.renameSync(tempPath, filePath); }
      catch (e) { fs.rmSync(tempPath, { force: true }); return json(res, e.message.includes('3 GB') ? 413 : 400, { error: e.message }); }
      const now = Date.now(); fs.utimesSync(filePath, now / 1000, now / 1000);
      const rec = { id, ip, directory, filePath, fileName, size: bytes, expiresAt: now + TTL_MS };
      uploads.set(id, rec);
      return json(res, 201, { id, fileName, size: bytes, uploaderIp: ip, expiresAt: rec.expiresAt, deleteAfterSeconds: TTL_MS / 1000 });
    }
    const fileMatch = /^\/api\/files\/([0-9a-f-]+)$/.exec(url.pathname);
    if ((req.method === 'GET' || req.method === 'HEAD') && fileMatch) {
      const rec = uploads.get(fileMatch[1]); if (!rec) return json(res, 404, { error: 'File not found or expired' });
      return serveFile(req, res, rec);
    }
    if (req.method === 'POST' && url.pathname === '/api/transfer') {
      const data = await readJSON(req);
      const rec = uploads.get(data.id);
      if (!rec || Date.now() >= rec.expiresAt) return json(res, 410, { error: 'Upload not found or expired' });
      const ip = String(data.ps4Ip || '');
      if (!privateIPv4(ip)) return json(res, 400, { error: 'Enter a private IPv4 address for your PS4' });
      const host = String(data.serverIp || '');
      if (!privateIPv4(host)) return json(res, 400, { error: 'Open this site using your PC’s LAN IPv4 address, not localhost' });
      const port = Number(data.serverPort) || PORT;
      if (port < 1 || port > 65535) return json(res, 400, { error: 'Invalid server port' });
      const pkgUrl = `http://${host}:${port}/api/files/${rec.id}`;
      const result = await sendRpi(ip, { type: 'direct', packages: [pkgUrl] });
      if (result.status < 200 || result.status >= 300) return json(res, 502, { error: `RPI returned HTTP ${result.status}`, detail: result.body });
      return json(res, 200, { ok: true, fileName: rec.fileName, pkgUrl, rpi: result.body });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 404, { error: 'Not found' });
    let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Bad path' }); }
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(ROOT, '.' + pathname);
    const relative = path.relative(ROOT, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('downloads')) return json(res, 404, { error: 'Not found' });
    let stat; try { stat = fs.statSync(filePath); } catch { return json(res, 404, { error: 'Not found' }); }
    if (!stat.isFile()) return json(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Content-Length': stat.size, 'Cache-Control': path.basename(filePath) === 'cache.appcache' ? 'no-cache' : 'no-store' });
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(filePath), res).catch(() => {});
  } catch (error) {
    if (!res.headersSent) json(res, 500, { error: error.message || 'Server error' }); else res.destroy();
  }
});
server.requestTimeout = 0;
server.headersTimeout = 60_000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Karbon transfer server: http://localhost:${PORT}/`);
  for (const addresses of Object.values(os.networkInterfaces())) for (const a of addresses || []) if (a.family === 'IPv4' && !a.internal) console.log(`PS4 access: http://${a.address}:${PORT}/`);
  console.log(`Temporary package storage: ${DOWNLOADS} (3 GB/file, auto-delete after 20 minutes)`);
});


