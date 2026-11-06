process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const { Readable } = require('stream');
const app = express();
const PORT = process.env.PORT || 3000;

// Simple In-Memory Cache
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 Menit

const JUSTANIME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/',
    'Accept': 'application/json, text/plain, */*'
};

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

function safeTrim(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim();
}

// Fetch dengan Timeout (Anti-Hung)
async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

// 1. Universal Proxy Endpoint
app.get('/api/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    let customReferer = req.query.referer;

    if (!targetUrl || targetUrl === 'undefined') {
        return res.status(400).send('Invalid URL');
    }

    try {
        targetUrl = decodeURIComponent(targetUrl);
    } catch (e) {}

    try {
        const parsedUrl = new URL(targetUrl);
        const targetOrigin = parsedUrl.origin;
        const finalReferer = customReferer ? decodeURIComponent(customReferer) : `${targetOrigin}/`;

        const requestHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Referer': finalReferer,
            'Origin': targetOrigin,
            'Accept': '*/*'
        };

        if (req.headers.range) {
            requestHeaders['Range'] = req.headers.range;
        }

        const response = await fetchWithTimeout(targetUrl, { 
            headers: requestHeaders,
            redirect: 'follow'
        }, 10000);

        if (!response.ok && response.status !== 206) {
            return res.status(response.status).send(`Proxy fetch failed: ${response.statusText}`);
        }

        // Subtitle VTT Handler
        if (targetUrl.includes('.vtt') || targetUrl.includes('subtitles')) {
            res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
            let vttText = await response.text();
            const trimmed = safeTrim(vttText);
            if (!trimmed.startsWith('WEBVTT')) {
                vttText = 'WEBVTT\n\n' + (vttText || '');
            }
            return res.send(vttText);
        }

        // M3U8 Playlist Handler
        if (targetUrl.includes('.m3u8')) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            let m3u8Text = await response.text();
            
            if (!m3u8Text || typeof m3u8Text !== 'string') {
                return res.status(404).send('Playlist empty');
            }

            const finalFetchUrl = response.url || targetUrl;
            const baseUrl = finalFetchUrl.substring(0, finalFetchUrl.lastIndexOf('/') + 1);

            const lines = m3u8Text.split('\n');
            const rewrittenLines = lines.map(line => {
                const trimmed = safeTrim(line);
                if (!trimmed || trimmed.startsWith('#')) return line;
                const absoluteUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).href;
                return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}&referer=${encodeURIComponent(finalReferer)}`;
            });

            return res.send(rewrittenLines.join('\n'));
        }

        // MP4 Direct / TS Stream Pipe
        if (response.status === 206) {
            res.status(206);
            if (response.headers.get('content-range')) {
                res.setHeader('Content-Range', response.headers.get('content-range'));
            }
        }

        if (response.headers.get('content-length')) {
            res.setHeader('Content-Length', response.headers.get('content-length'));
        }

        const isMp4 = targetUrl.includes('.mp4');
        res.setHeader('Content-Type', isMp4 ? 'video/mp4' : (response.headers.get('content-type') || 'video/mp2t'));
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        const nodeStream = Readable.fromWeb(response.body);
        nodeStream.pipe(res);

    } catch (err) {
        if (!res.headersSent) {
            res.status(500).send('Proxy error: ' + err.message);
        }
    }
});

// 2. Stream API Endpoint (dengan Cache Memory & Auto Fallback)
app.get('/api/stream/:id/:ep', async (req, res) => {
    const { id, ep } = req.params;
    const requestedServer = req.query.server;
    const mode = (req.query.mode || 'sub').toLowerCase();

    const cacheKey = `${id}-${ep}-${mode}-${requestedServer || 'default'}`;
    const cachedData = apiCache.get(cacheKey);

    if (cachedData && (Date.now() - cachedData.timestamp < CACHE_TTL)) {
        return res.json(cachedData.payload);
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

        let serverQueue = [];
        if (requestedServer && targetServers.includes(requestedServer)) {
            serverQueue.push(requestedServer);
        }
        ['momo', 'calm', 'revo', 'gigi'].forEach(s => {
            if (targetServers.includes(s) && !serverQueue.includes(s)) {
                serverQueue.push(s);
            }
        });
        targetServers.forEach(s => {
            if (!serverQueue.includes(s)) serverQueue.push(s);
        });

        let selectedServer = '';
        let streamData = null;

        for (const srv of serverQueue) {
            try {
                const sRes = await fetchWithTimeout(`${BASE_URL}/${srv}`, { headers: JUSTANIME_HEADERS }, 4000);
                if (!sRes.ok) continue;
                
                const sData = await sRes.json();
                const currentData = mode === 'dub' ? sData.dub : sData.sub;

                if (currentData && currentData.sources && currentData.sources.length > 0) {
                    selectedServer = srv;
                    streamData = currentData;
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!streamData || !selectedServer) {
            return res.status(500).json({ success: false, message: 'Semua server stream gagal direspon' });
        }

        const sourceObj = streamData.sources[0];
        const rawVideoUrl = sourceObj.url || '';
        const isM3u8 = sourceObj.isM3U8 !== undefined ? sourceObj.isM3U8 : rawVideoUrl.includes('.m3u8');
        
        const targetReferer = streamData.headers?.Referer || sourceObj.headers?.Referer || "https://justanime.to/";
        const proxiedStreamUrl = `/api/proxy?url=${encodeURIComponent(rawVideoUrl)}&referer=${encodeURIComponent(targetReferer)}`;

        const rawSubtitles = (streamData.subtitles || streamData.tracks || []).filter(s => s && (s.url || s.file) && !(s.url || s.file).includes('thumbnails'));
        const proxiedSubtitles = rawSubtitles.map(sub => ({
            file: `/api/proxy?url=${encodeURIComponent(sub.url || sub.file)}&referer=${encodeURIComponent(targetReferer)}`,
            label: sub.lang || sub.label || 'Subtitle'
        }));

        const resultPayload = {
            success: true,
            anilistId: id,
            episode: Number(ep),
            modeUsed: mode,
            serverUsed: selectedServer,
            subServers: availableSubServers,
            dubServers: availableDubServers,
            stream: {
                url: proxiedStreamUrl,
                isM3u8: isM3u8,
                quality: sourceObj.quality
            },
            subtitles: proxiedSubtitles
        };

        // Simpan ke Cache Memory
        apiCache.set(cacheKey, { timestamp: Date.now(), payload: resultPayload });

        return res.json(resultPayload);

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 JustAnime Production Engine (Cache + Timeout) Aktif di: http://localhost:${PORT}`);
});
