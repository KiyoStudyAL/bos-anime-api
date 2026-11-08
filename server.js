process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 1. Mencegah Delay DNS IPv6 di Cloud Server / Android
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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

// CORS Middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

async function fetchFast(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const proxify = (u, referer) => `/api/proxy?url=${encodeURIComponent(u)}&referer=${encodeURIComponent(referer)}`;

// ---------- Stream Endpoint (Server Alpha / Momo) ----------
app.get('/api/stream/:id/:ep', async (req, res) => {
    const { id, ep } = req.params;
    const mode = (req.query.mode || 'sub').toLowerCase() === 'dub' ? 'dub' : 'sub';

    try {
        // Tembak LANGSUNG ke server momo (Server Alpha) untuk kecepatan instan
        const targetUrl = `https://core.justanime.to/api/watch/${id}/episode/${ep}/momo`;
        const sRes = await fetchFast(targetUrl, { headers: JUSTANIME_HEADERS }, 4000);

        if (!sRes.ok) {
            return res.status(sRes.status).json({ success: false, message: `Server Alpha HTTP ${sRes.status}` });
        }

        const sData = await sRes.json();
        const currentData = mode === 'dub' ? sData.dub : sData.sub;

        if (!currentData || !currentData.sources || currentData.sources.length === 0) {
            return res.status(404).json({ success: false, message: `Stream ${mode.toUpperCase()} tidak tersedia di Server Alpha` });
        }

        const sourceObj = currentData.sources[0];
        const rawVideoUrl = sourceObj.url || '';
        const targetReferer = currentData.headers?.Referer || sourceObj.headers?.Referer || 'https://justanime.to/';

        const payload = {
            success: true,
            anilistId: id,
            episode: Number(ep),
            modeUsed: mode,
            serverUsed: 'momo',
            serverUsedName: 'Server Alpha',
            subServers: [{ id: 'momo', name: 'Server Alpha' }],
            dubServers: [{ id: 'momo', name: 'Server Alpha' }],
            stream: {
                url: proxify(rawVideoUrl, targetReferer),
                isM3u8: sourceObj.isM3U8 !== undefined ? sourceObj.isM3U8 : rawVideoUrl.includes('.m3u8'),
                quality: sourceObj.quality || 'auto'
            },
            subtitles: (currentData.subtitles || []).map(s => ({
                file: proxify(s.url || s.file, targetReferer),
                label: s.lang || s.label || 'Subtitle'
            })),
            timestamps: { intro: currentData.intro || { start: 0, end: 0 } }
        };

        return res.json(payload);

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Error Server Alpha: ' + err.message });
    }
});

// ---------- Proxy Endpoint (HLS Video & Multi-Language WebVTT) ----------
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || targetUrl === 'undefined') return res.status(400).send('Bad Request');

    try {
        const parsed = new URL(targetUrl);
        const finalReferer = req.query.referer || `${parsed.origin}/`;
        const headers = { 'User-Agent': UA, 'Referer': finalReferer, 'Origin': parsed.origin };
        if (req.headers.range) headers['Range'] = req.headers.range;

        const response = await fetchFast(targetUrl, { headers }, 8000);

        // Subtitle WebVTT Formatter
        if (targetUrl.includes('.vtt') || targetUrl.includes('subtitles')) {
            let text = await response.text();
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            if (!/^\uFEFF?\s*WEBVTT/.test(text) && /-->\s*\d+:\d+(:\d+)?\.\d+/.test(text)) {
                text = 'WEBVTT\n\n' + text;
            }
            return res.send(text);
        }

        // HLS Playlist M3U8 Rewrite
        if (targetUrl.includes('.m3u8')) {
            const text = await response.text();
            const out = text.split('\n').map(line => {
                const t = line.trim();
                if (!t || t.startsWith('#')) return line;
                return proxify(new URL(t, response.url || targetUrl).href, finalReferer);
            }).join('\n');
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.send(out);
        }

        // Video TS Segments Stream
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp2t');
        pipeline(Readable.fromWeb(response.body), res, () => {});
    } catch (e) {
        if (!res.headersSent) res.status(500).send(e.message);
    }
});

app.listen(PORT, () => console.log(`🚀 Server Alpha (Momo Engine) running on port ${PORT}`));
