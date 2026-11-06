process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const testOrigins = [
    "https://justanime.to",
    "https://core.justanime.to",
    "https://hianime.mn",
    "https://hianime.sx",
    null // Tanpa Origin Header
];

async function testHeaderOrigins() {
    console.log("🔍 Testing variasi Header Origin ke JustAnime API...\n");

    for (const origin of testOrigins) {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        };

        if (origin) {
            headers['Origin'] = origin;
            headers['Referer'] = origin + '/';
        }

        try {
            const res = await fetch("https://core.justanime.to/api/watch/150672/episode/1", { headers });
            const text = await res.text();
            
            console.log(`Origin: [${origin || 'TANPA ORIGIN'}]`);
            console.log(`📡 Status: ${res.status} ${res.statusText}`);
            console.log(`📦 Response: ${text.substring(0, 150)}\n`);
        } catch (err) {
            console.log(`❌ Error [${origin}]: ${err.message}\n`);
        }
    }
}

testHeaderOrigins();
