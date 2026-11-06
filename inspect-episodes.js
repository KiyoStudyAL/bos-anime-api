process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://justanime.to',
    'Referer': 'https://justanime.to/'
};

async function inspectEpisodes() {
    console.log("🔍 Membongkar Key 'episodes' dari JustAnime API...\n");

    try {
        const res = await fetch("https://core.justanime.to/api/watch/150672/episode/1", { headers });
        const data = await res.json();

        if (data.anime && data.anime.episodes) {
            console.log(`✅ Total Episode Ditemukan: ${data.anime.episodes.length}`);
            console.log("📦 Struktur Episode 1 (Sample Data):\n");
            console.log(JSON.stringify(data.anime.episodes[0], null, 2));
        } else {
            console.log("❌ Field 'episodes' tidak ditemukan atau kosong.");
            console.log("📦 Keys Lengkap Root Object:", Object.keys(data));
        }
    } catch (err) {
        console.error("❌ Error Inspect Episodes:", err.message);
    }
}

inspectEpisodes();
