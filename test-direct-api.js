process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://hianime.to',
    'Referer': 'https://hianime.to/'
};

async function debugJustAnime() {
    console.log("🛠️ Ngetes Direct JustAnime API dengan ID AniList yang Valid...\n");

    // 150672 = Oshi no Ko S1, 21 = One Piece, 113415 = Jujutsu Kaisen
    const testList = [
        { name: "Oshi no Ko S1", id: "150672", ep: 1 },
        { name: "Jujutsu Kaisen S1", id: "113415", ep: 1 },
        { name: "One Piece", id: "21", ep: 1 }
    ];

    for (const item of testList) {
        console.log(`----------------------------------------`);
        console.log(`🔍 Checking: ${item.name} (AniList ID: ${item.id}) Ep ${item.ep}`);
        console.log(`----------------------------------------`);
        
        try {
            // 1. Tembak Master API
            const masterRes = await fetch(`https://core.justanime.to/api/watch/${item.id}/episode/${item.ep}`, { headers });
            const masterData = await masterRes.json();
            console.log(`📡 Server Tersedia:`, masterData.sub || masterData.dub || "Kosong");

            // 2. Tembak Direct Provider HiAnime
            const streamRes = await fetch(`https://core.justanime.to/api/watch/${item.id}/episode/${item.ep}/hianime`, { headers });
            const streamData = await streamRes.json();

            const m3u8 = streamData.sub?.sources?.sources?.[0]?.file;
            if (m3u8) {
                console.log(`🎉 BERHASIL!`);
                console.log(`▶️ M3U8 Stream : ${m3u8.substring(0, 70)}...`);
                console.log(`⏭️ Skip Intro : ${streamData.intro ? streamData.intro.end + 's' : 'Tidak Ada'}`);
                console.log(`💬 Subtitles  : ${streamData.sub?.sources?.tracks?.length || 0} tracks`);
            } else {
                console.log(`❌ M3U8 tidak ditemukan di HiAnime`);
            }
        } catch (err) {
            console.error(`❌ Error pada ${item.name}:`, err.message);
        }
        console.log(`\n`);
    }
}

debugJustAnime();
