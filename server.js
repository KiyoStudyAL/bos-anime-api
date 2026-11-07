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

const SERVER_NAMES = {
    momo: 'Server Alpha',
    calm: 'Server Beta',
    revo: 'Server Gamma',
    gigi: 'Server Delta',
    susi: 'Server Epsilon',
    nami: 'Server Zeta'
};

const apiCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/', (req, res) => res.json({ status: 'online', engine: 'Ultra-Fast Instant API' }));

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const proxify = (u, referer) => `/api/proxy?url=${encodeURIComponent(u)}&referer=${encodeURIComponent(referer)}`;

app.get('/api/stream/:id/:ep', async (req, res) => {
    const { id, ep } = req.params;
    const requestedServer = req.query.server || '';
    const mode = (req.query.mode || 'sub').toLowerCase() === 'dub' ? 'dub' : 'sub';
    const cacheKey = `${id}-${ep}-${mode}-${requestedServer || 'default'}`;

    if (!req.query.refresh) {
        const hit = apiCache.get(cacheKey);
        if (hit && (Date.now() - hit.t < CACHE_TTL)) return res.json(hit.payload);
    }

    try {
        const BASE_URL = `https://core.justanime.to/api/watch/${id}/episode/${ep}`;

        const serverRes = await fetchWithTimeout(`${BASE_URL}/servers`, { headers: JUSTANIME_HEADERS }, 3500);
        if (!serverRes.ok) return res.status(404).json({ success: false, message: 'Daftar server tidak ditemukan' });

        const serverData = await serverRes.json();
        const serversObj = serverData.servers || {};

        const subList = Object.keys(serversObj).filter(s => serversObj[s].sub);
        const dubList = Object.keys(serversObj).filter(s => serversObj[s].dub);
        const targetServers = mode === 'dub' ? dubList : subList;

        if (targetServers.length === 0) {
            return res.status(404).json({ success: false, message: `Tidak ada server ${mode.toUpperCase()} aktif` });
        }

        let targetSrv = requestedServer && targetServers.includes(requestedServer) ? requestedServer : '';
        if (!targetSrv) {
            targetSrv = targetServers.includes('momo') ? 'momo' : targetServers[0];
        }

        let sRes = await fetchWithTimeout(`${BASE_URL}/${targetSrv}`, { headers: JUSTANIME_HEADERS }, 3500);
        
        if (!sRes.ok && targetServers.length > 1) {
            targetSrv = targetServers.find(s => s !== targetSrv) || targetServers[0];
            sRes = await fetchWithTimeout(`${BASE_URL}/${targetSrv}`, { headers: JUSTANIME_HEADERS }, 3500);
        }

        if (!sRes.ok) return res.status(500).json({ success: false, message: 'Gagal mengambil stream video' });

        const sData = await sRes.json();
        const currentData = mode === 'dub' ? sData.dub : sData.sub;

        if (!currentData || !currentData.sources || currentData.sources.length === 0) {
            return res.status(404).json({ success: false, message: 'Sumber stream kosong' });
        }

        const sourceObj = currentData.sources[0];
        const rawVideoUrl = sourceObj.url || '';
        const targetReferer = currentData.headers?.Referer || sourceObj.headers?.Referer || 'https://justanime.to/';

        const formatList = (list) => list.map(srv => ({
            id: srv,
            name: SERVER_NAMES[srv] || `Server ${srv.toUpperCase()}`
        }));

        const payload = {
            success: true,
            anilistId: id,
            episode: Number(ep),
            modeUsed: mode,
            serverUsed: targetSrv,
            serverUsedName: SERVER_NAMES[targetSrv] || `Server ${targetSrv.toUpperCase()}`,
            subServers: formatList(subList),
            dubServers: formatList(dubList),
            stream: {
                url: proxify(rawVideoUrl, targetReferer),
                isM3u8: sourceObj.isM3U8 !== undefined ? sourceObj.isM3U8 : rawVideoUrl.includes('.m3u8'),
                quality: sourceObj.quality
            },
            subtitles: (currentData.subtitles || []).map(s => ({
                file: proxify(s.url || s.file, targetReferer),
                label: s.lang || s.label || 'Subtitle'
            })),
            timestamps: { intro: currentData.intro || { start: 0, end: 0 } }
        };

        apiCache.set(cacheKey, { t: Date.now(), payload });
        return res.json(payload);

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal memuat episode: ' + err.message });
    }
});

app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || targetUrl === 'undefined') return res.status(400).send('Bad Request');

    try {
        const parsed = new URL(targetUrl);
        const finalReferer = req.query.referer || `${parsed.origin}/`;
        const headers = { 'User-Agent': UA, 'Referer': finalReferer, 'Origin': parsed.origin };
        if (req.headers.range) headers['Range'] = req.headers.range;

        const response = await fetchWithTimeout(targetUrl, { headers }, 8000);

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

        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp2t');
        pipeline(Readable.fromWeb(response.body), res, () => {});
    } catch (e) {
        if (!res.headersSent) res.status(500).send(e.message);
    }
});

app.listen(PORT, () => console.log(`⚡ Instant API Engine running on port ${PORT}`));
