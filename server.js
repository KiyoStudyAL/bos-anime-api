process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const { Readable, pipeline } = require('stream');
const app = express();
const PORT = process.env.PORT || 3000;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const JUSTANIME_HEADERS = {
    'User-Agent': UA,
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/',
    'Accept': 'application/json, text/plain, */*'
};

// ---------- Cache in-memory (maks. 500 entri, kedaluwarsa 5 menit) ----------
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(key) {
    const c = apiCache.get(key);
    if (!c) return null;
    if (Date.now() - c.t > CACHE_TTL) { apiCache.delete(key); return null; }
    return c.payload;
}

function cacheSet(key, payload) {
    if (apiCache.size >= CACHE_MAX) apiCache.delete(apiCache.keys().next().value);
    apiCache.set(key, { t: Date.now(), payload });
}

const LIST_TIMEOUT = 7000;
const SERVER_TIMEOUT = 6000;
const MAX_TRIES = 4;

// CORS Terbuka & Preflight OPTIONS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'JustAnime Streaming API Proxy Engine',
        endpoints: {
            stream: '/api/stream/:anilistId/:episode?mode=sub|dub&server=&refresh=1',
            proxy: '/api/proxy?url={ENCODED_URL}&referer={ENCODED_REFERER}'
        }
    });
});

async function fetchWithTimeout(url, options = {}, timeoutMs = LIST_TIMEOUT) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const proxify = (u, referer) => `/api/proxy?url=${encodeURIComponent(u)}&referer=${encodeURIComponent(referer)}`;

function isPrivateHost(h) {
    h = h.toLowerCase();
    return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
        /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) ||
        /^\[(::1?|f[cd][0-9a-f]{2}:|fe80:)/.test(h);
}

// ---------- 1. Proxy Universal ----------
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || targetUrl === 'undefined') return res.status(400).send('Invalid URL');

    try {
        const parsedUrl = new URL(targetUrl);
        if (!/^https?:$/.test(parsedUrl.protocol) || isPrivateHost(parsedUrl.hostname)) {
            return res.status(400).send('URL tidak diizinkan');
        }
        const targetOrigin = parsedUrl.origin;
        const finalReferer = req.query.referer || `${targetOrigin}/`;

        const requestHeaders = {
            'User-Agent': UA,
            'Referer': finalReferer,
            'Origin': targetOrigin,
            'Accept': '*/*'
        };
        if (req.headers.range) requestHeaders['Range'] = req.headers.range;

        const response = await fetchWithTimeout(targetUrl, { headers: requestHeaders, redirect: 'follow' }, 10000);
        if (!response.ok && response.status !== 206) {
            return res.status(response.status).send(`Proxy fetch failed: ${response.statusText}`);
        }

        // Subtitle
        if (targetUrl.includes('.vtt') || targetUrl.includes('subtitles')) {
            let text = await response.text();
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            if (!/^\uFEFF?\s*WEBVTT/.test(text) && /-->\s*\d+:\d+(:\d+)?\.\d+/.test(text)) {
                text = 'WEBVTT\n\n' + text;
            }
            return res.send(text);
        }

        // Playlist m3u8
        if (targetUrl.includes('.m3u8')) {
            const m3u8Text = await response.text();
            if (!m3u8Text) return res.status(404).send('Playlist empty');

            const finalFetchUrl = response.url || targetUrl;
            const toProxy = (u) => /^(data|skd):/i.test(u) ? u : proxify(new URL(u, finalFetchUrl).href, finalReferer);

            const out = m3u8Text.split('\n').map(line => {
                const t = line.trim();
                if (!t) return line;
                if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (m, u) => `URI="${toProxy(u)}"`);
                return toProxy(t);
            }).join('\n');

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(out);
        }

        // Segmen TS / MP4
        if (response.status === 206) {
            res.status(206);
            if (response.headers.get('content-range')) res.setHeader('Content-Range', response.headers.get('content-range'));
        }
        if (!response.headers.get('content-encoding') && response.headers.get('content-length')) {
            res.setHeader('Content-Length', response.headers.get('content-length'));
        }
        const isMp4 = targetUrl.includes('.mp4');
        res.setHeader('Content-Type', isMp4 ? 'video/mp4' : (response.headers.get('content-type') || 'video/mp2t'));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        pipeline(Readable.fromWeb(response.body), res, () => {});

    } catch (err) {
        if (!res.headersSent) res.status(500).send('Proxy error: ' + err.message);
    }
});

// ---------- 2. Stream API ----------
app.get('/api/stream/:id/:ep', async (req, res) => {
    const { id, ep } = req.params;
    if (!/^\d+$/.test(id) || !/^\d+(\.\d+)?$/.test(ep)) {
        return res.status(400).json({ success: false, message: 'ID atau episode tidak valid' });
    }

    const requestedServer = /^[\w-]{1,20}$/.test(req.query.server || '') ? req.query.server : '';
    const mode = (req.query.mode || 'sub').toLowerCase() === 'dub' ? 'dub' : 'sub';
    const cacheKey = `${id}-${ep}-${mode}-${requestedServer || 'default'}`;

    if (!req.query.refresh) {
        const hit = cacheGet(cacheKey);
        if (hit) return res.json(hit);
    }

    try {
        const BASE_URL = `https://core.justanime.to/api/watch/${id}/episode/${ep}`;

        const serverRes = await fetchWithTimeout(`${BASE_URL}/servers`, { headers: JUSTANIME_HEADERS });
        if (!serverRes.ok) return res.status(404).json({ success: false, message: 'Server list not found' });

        const serverData = await serverRes.json();
        const serversObj = serverData.servers || {};

        const availableSubServers = Object.keys(serversObj).filter(s => serversObj[s].sub);
        const availableDubServers = Object.keys(serversObj).filter(s => serversObj[s].dub);
        const targetServers = mode === 'dub' ? availableDubServers : availableSubServers;

        if (targetServers.length === 0) {
            return res.status(404).json({ success: false, message: `Tidak ada server ${mode.toUpperCase()} aktif` });
        }

        const serverQueue = [];
        if (requestedServer && targetServers.includes(requestedServer)) serverQueue.push(requestedServer);
        ['momo', 'calm', 'revo', 'gigi'].forEach(s => {
            if (targetServers.includes(s) && !serverQueue.includes(s)) serverQueue.push(s);
        });
        targetServers.forEach(s => { if (!serverQueue.includes(s)) serverQueue.push(s); });

        let selectedServer = '';
        let streamData = null;

        for (const srv of serverQueue.slice(0, MAX_TRIES)) {
            try {
                const sRes = await fetchWithTimeout(`${BASE_URL}/${srv}`, { headers: JUSTANIME_HEADERS }, SERVER_TIMEOUT);
                if (!sRes.ok) continue;
                const sData = await sRes.json();
                const current = mode === 'dub' ? sData.dub : sData.sub;
                if (current && current.sources && current.sources.length > 0) {
                    selectedServer = srv;
                    streamData = current;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!streamData) {
            return res.status(500).json({ success: false, message: 'Semua server stream gagal merespons' });
        }

        const sourceObj = streamData.sources[0];
        const rawVideoUrl = sourceObj.url || '';
        const isM3u8 = sourceObj.isM3U8 !== undefined ? sourceObj.isM3U8 : rawVideoUrl.includes('.m3u8');
        const targetReferer = streamData.headers?.Referer || sourceObj.headers?.Referer || 'https://justanime.to/';

        const rawSubtitles = (streamData.subtitles || streamData.tracks || [])
            .filter(s => s && (s.url || s.file) && !(s.url || s.file).includes('thumbnails'));
        const proxiedSubtitles = rawSubtitles.map(sub => ({
            file: proxify(sub.url || sub.file, targetReferer),
            label: sub.lang || sub.label || 'Subtitle'
        }));

        const payload = {
            success: true,
            anilistId: id,
            episode: Number(ep),
            modeUsed: mode,
            serverUsed: selectedServer,
            subServers: availableSubServers,
            dubServers: availableDubServers,
            stream: {
                url: proxify(rawVideoUrl, targetReferer),
                isM3u8,
                quality: sourceObj.quality
            },
            subtitles: proxiedSubtitles,
            timestamps: {
                intro: streamData.intro || { start: 0, end: 0 },
                outro: streamData.outro || { start: 0, end: 0 }
            }
        };

        cacheSet(cacheKey, payload);
        return res.json(payload);

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 JustAnime Engine (cache + fallback + proxy) aktif di: http://localhost:${PORT}`);
});
