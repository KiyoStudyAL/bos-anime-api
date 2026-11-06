process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const JUSTANIME_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

// Proxy Stream Video (.m3u8 & .ts segments)
app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    const referer = req.query.referer || 'https://megaplay.buzz/';

    if (!targetUrl) return res.status(400).send('No URL provided');

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': referer
            }
        });

        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/vnd.apple.mpegurl');
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (targetUrl.includes('.m3u8')) {
            let m3u8Text = buffer.toString('utf-8');
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            // Perbaikan Flag Regex (menggunakan /gm)
            m3u8Text = m3u8Text.replace(/^(?!#)(.+)$/gm, (match) => {
                const line = match.trim();
                if (!line) return line;
                const fullUrl = line.startsWith('http') ? line : baseUrl + line;
                return `/api/proxy?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(referer)}`;
            });

            return res.send(m3u8Text);
        }

        return res.send(buffer);
    } catch (err) {
        res.status(500).send('Proxy error: ' + err.message);
    }
});

app.get('/api/stream/:id/:ep', async (req, res) => {
    const { id, ep } = req.params;
    const serverType = req.query.server;

    try {
        const BASE_URL = `https://core.justanime.to/api/watch/${id}/episode/${ep}`;

        const serverRes = await fetch(`${BASE_URL}/servers`, { headers: JUSTANIME_HEADERS });
        if (!serverRes.ok) {
            return res.status(404).json({ success: false, message: 'Episode / Server tidak ditemukan' });
        }
        const serverData = await serverRes.json();

        const subServers = Object.keys(serverData.servers || {}).filter(s => serverData.servers[s].sub);
        if (subServers.length === 0) {
            return res.status(404).json({ success: false, message: 'Tidak ada server Subtitle aktif' });
        }

        const selectedServer = serverType || (subServers.includes('momo') ? 'momo' : subServers[0]);

        const streamRes = await fetch(`${BASE_URL}/${selectedServer}`, { headers: JUSTANIME_HEADERS });
        const data = await streamRes.json();

        if (!data.sub || !data.sub.sources || data.sub.sources.length === 0) {
            return res.status(500).json({ success: false, message: 'Gagal mengambil sumber video' });
        }

        const rawM3u8 = data.sub.sources[0].url;
        const targetReferer = data.sub.headers?.Referer || "https://megaplay.buzz/";

        const proxiedM3u8 = `/api/proxy?url=${encodeURIComponent(rawM3u8)}&referer=${encodeURIComponent(targetReferer)}`;

        return res.json({
            success: true,
            anilistId: id,
            episode: Number(ep),
            serverUsed: selectedServer,
            availableServers: subServers,
            stream: {
                m3u8: proxiedM3u8,
                quality: data.sub.sources[0].quality
            },
            subtitles: data.sub.subtitles || [],
            timestamps: {
                intro: data.sub.intro || { start: 0, end: 0 },
                outro: data.sub.outro || { start: 0, end: 0 }
            }
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server & Stream Proxy aktif di: http://localhost:${PORT}`);
});
