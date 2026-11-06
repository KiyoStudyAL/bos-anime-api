process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ANILIST_ID = "150672";
const EPISODE = "1";
const BASE_URL = "https://core.justanime.to/api/watch";

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

async function getStreamLink() {
    console.log(`🚀 [1/2] Ambil daftar server aktif untuk ID ${ANILIST_ID} Ep ${EPISODE}...`);
    
    try {
        // 1. Ambil list server
        const serverRes = await fetch(`${BASE_URL}/${ANILIST_ID}/episode/${EPISODE}/servers`, { headers });
        const serverData = await serverRes.json();

        // Filter server yang mendukung subtitle
        const subServers = Object.keys(serverData.servers).filter(srv => serverData.servers[srv].sub === true);
        console.log(`✅ Server SUB Aktif Ditemukan:`, subServers);

        if (subServers.length === 0) {
            console.log("❌ Tidak ada server SUB yang aktif.");
            return;
        }

        // Tes server SUB pertama (misal: 'momo' atau 'gigi')
        const targetServer = subServers[0];
        console.log(`\n🔍 [2/2] Narik data stream dari server: ${targetServer.toUpperCase()}...`);

        const streamRes = await fetch(`${BASE_URL}/${ANILIST_ID}/episode/${EPISODE}/${targetServer}`, { headers });
        const streamData = await streamRes.json();

        console.log("\n=================== HASIL STREAMING AKHIR ===================");
        console.log(JSON.stringify(streamData, null, 2));
        console.log("=============================================================");

    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

getStreamLink();
