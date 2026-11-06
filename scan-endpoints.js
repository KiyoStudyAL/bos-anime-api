process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

const routes = [
    // Endpoint Variasi ID & Episode
    "https://core.justanime.to/api/anime/150672/episodes",
    "https://core.justanime.to/api/episodes/150672",
    "https://core.justanime.to/api/sources/150672/1",
    "https://core.justanime.to/api/sources/150672/episode/1",
    "https://core.justanime.to/api/watch/150672/episode/1/servers",
    "https://core.justanime.to/api/watch/150672/episode/1/sources",
    "https://core.justanime.to/api/watch/150672/episode/1/stream",
    "https://core.justanime.to/api/watch/150672/episode/1/hd-1",
    "https://core.justanime.to/api/watch/150672/episode/1/megacloud",
    // Query Parameter Variasi
    "https://core.justanime.to/api/watch?anilistId=150672&episode=1",
    "https://core.justanime.to/api/servers?anilistId=150672&episode=1",
    "https://core.justanime.to/api/sources?anilistId=150672&episode=1"
];

async function scanAllRoutes() {
    console.log("🚀 Scanning Endpoint Video & Servers di core.justanime.to...\n");

    for (const url of routes) {
        try {
            const res = await fetch(url, { headers });
            if (res.status === 200) {
                const data = await res.json();
                console.log(`✅ [200 OK] -> ${url}`);
                console.log(`📦 Root Keys:`, Object.keys(data));
                console.log(`📦 Content Snippet:\n`, JSON.stringify(data, null, 2).substring(0, 300));
                console.log("--------------------------------------------------\n");
            } else {
                console.log(`❌ [${res.status}] -> ${url}`);
            }
        } catch (err) {
            console.log(`⚠️ Error -> ${url}: ${err.message}`);
        }
    }
}

scanAllRoutes();
