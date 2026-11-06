process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

async function deepScan() {
    console.log("🔍 Pemindaian Struktur Endpoint JustAnime...\n");

    const targets = [
        "https://core.justanime.to/api/watch/150672",
        "https://core.justanime.to/api/watch/150672/episode/1",
        "https://core.justanime.to/api/watch/150672/1",
        "https://core.justanime.to/api/anime/150672",
        "https://core.justanime.to/api/servers/150672/1"
    ];

    for (const url of targets) {
        try {
            console.log(`----------------------------------------`);
            console.log(`🌐 Testing: ${url}`);
            const res = await fetch(url, { headers });
            console.log(`📡 Status: ${res.status} ${res.statusText}`);
            
            if (res.ok) {
                const data = await res.json();
                console.log(`🔑 Root Keys:`, Object.keys(data));
                if (data.anime) {
                    console.log(`🔑 Anime Object Keys:`, Object.keys(data.anime));
                }
                console.log(`📦 Snippet Data:\n`, JSON.stringify(data, null, 2).substring(0, 350));
            }
        } catch (err) {
            console.log(`❌ Fail: ${err.message}`);
        }
        console.log(`\n`);
    }
}

deepScan();
