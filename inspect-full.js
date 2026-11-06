process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

async function inspectFull() {
    console.log("🔍 Bedah Struktur JSON Lengkap JustAnime API...\n");

    try {
        // 1. Check Master EP Endpoint
        console.log("--- [1] MASTER EPISODE ENDPOINT ---");
        const res1 = await fetch("https://core.justanime.to/api/watch/150672/episode/1", { headers });
        const json1 = await res1.json();
        console.log("📦 Keys yang tersedia:", Object.keys(json1));
        console.log("📦 Potongan JSON:\n", JSON.stringify(json1, null, 2).substring(0, 700));

        console.log("\n--------------------------------------------------\n");

        // 2. Check Direct Provider Endpoint
        console.log("--- [2] DIRECT HIANIME ENDPOINT ---");
        const res2 = await fetch("https://core.justanime.to/api/watch/150672/episode/1/hianime", { headers });
        const json2 = await res2.json();
        console.log("📦 Keys yang tersedia:", Object.keys(json2));
        console.log("📦 Potongan JSON:\n", JSON.stringify(json2, null, 2).substring(0, 700));

    } catch (err) {
        console.error("❌ Error Inspect:", err.message);
    }
}

inspectFull();
