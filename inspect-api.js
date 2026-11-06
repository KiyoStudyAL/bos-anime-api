process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function inspect() {
    const url = "https://core.justanime.to/api/watch/150672/episode/1";
    console.log("🔍 Inspecting URL:", url);

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Origin': 'https://hianime.to',
                'Referer': 'https://hianime.to/'
            }
        });
        
        console.log("📡 HTTP Status Code:", res.status, res.statusText);
        const text = await res.text();
        console.log("\n📦 Raw Response Body (500 Karakter Pertama):\n");
        console.log(text.substring(0, 500));
    } catch (err) {
        console.error("❌ Error Fetching:", err.message);
    }
}

inspect();
