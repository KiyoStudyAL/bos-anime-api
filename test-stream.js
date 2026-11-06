process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ANILIST_ID = "150672"; // Oshi no Ko S1
const EPISODE = "1";
const BASE_URL = "https://core.justanime.to/api/watch";

// Header Sakti yang udah lolos tes
const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

async function getStreamData() {
    console.log(`🚀 Membongkar Data Stream untuk AniList ID: ${ANILIST_ID} Ep: ${EPISODE}...\n`);

    try {
        // 1. Ambil daftar server
        const masterRes = await fetch(`${BASE_URL}/${ANILIST_ID}/episode/${EPISODE}`, { headers });
        const masterData = await masterRes.json();
        
        console.log("📡 Server Subtitle Tersedia:", masterData.sub || []);
        console.log("📡 Server Dubtitle Tersedia:", masterData.dub || []);

        const provider = (masterData.sub && masterData.sub.length > 0) ? masterData.sub[0] : 'hianime';

        // 2. Ambil detail video M3U8
        console.log(`\n🔍 Narik data video dari Server: ${provider.toUpperCase()}...`);
        const streamRes = await fetch(`${BASE_URL}/${ANILIST_ID}/episode/${EPISODE}/${provider}`, { headers });
        const data = await streamRes.json();

        console.log("\n=================== HASIL BONGKAR API ===================");
        console.log("▶️  M3U8 Stream URL :", data.sub?.sources?.sources[0]?.file || "Kosong");
        console.log("⏭️  Skip Intro      :", data.intro ? `${data.intro.start}s s/d ${data.intro.end}s` : "Tidak Ada Data Intro");
        console.log("💬 Total Subtitle   :", data.sub?.sources?.tracks?.length || 0, "tracks");
        if (data.sub?.sources?.tracks?.length > 0) {
            console.log("   Sample Subtitle  :", data.sub.sources.tracks[0].file, `(${data.sub.sources.tracks[0].label})`);
        }
        console.log("=========================================================");

    } catch (err) {
        console.error("❌ Error Stream:", err.message);
    }
}

getStreamData();
