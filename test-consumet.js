process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { META, ANIME } = require('@consumet/extensions');

async function testConsumet() {
    console.log("🚀 Testing Consumet API (Auto-Fallback Provider)...\n");

    // Daftar provider yang akan dites secara berurutan
    const providers = [
        { name: 'AnimeKai', class: ANIME.AnimeKai },
        { name: 'KickAssAnime', class: ANIME.KickAssAnime },
        { name: 'Hianime', class: ANIME.Hianime },
        { name: 'AnimePahe', class: ANIME.AnimePahe }
    ];

    for (const p of providers) {
        if (!p.class) continue;
        console.log(`\n----------------------------------------`);
        console.log(`🔄 Mencoba Provider: ${p.name}...`);
        console.log(`----------------------------------------`);

        try {
            const providerInstance = new p.class();
            const anilist = new META.Anilist(providerInstance);

            console.log(`🔍 Searching Anime ('Oshi no Ko')...`);
            const searchRes = await anilist.search("Oshi no Ko");
            if (!searchRes.results || searchRes.results.length === 0) {
                console.log(`⚠️ Search tidak mengembalikan hasil di ${p.name}`);
                continue;
            }

            const anime = searchRes.results[0];
            console.log(`✅ Found: ${anime.title.userPreferred} (AniList ID: ${anime.id})`);

            console.log(`📺 Fetching Episode List...`);
            const animeInfo = await anilist.fetchAnimeInfo(anime.id);

            if (!animeInfo.episodes || animeInfo.episodes.length === 0) {
                console.log(`⚠️ Episode list kosong di ${p.name}`);
                continue;
            }

            const ep1 = animeInfo.episodes[0];
            console.log(`✅ Ep 1 ID: ${ep1.id} (Number: ${ep1.number})`);

            console.log(`🎬 Fetching Stream Link (M3U8)...`);
            const sources = await anilist.fetchEpisodeSources(ep1.id);

            console.log("\n=================== HASIL STREAMING ===================");
            console.log("▶️  M3U8 Stream URL :", sources.sources?.[0]?.url || "Kosong");
            console.log("⚙️  Pilihan Resolusi:", sources.sources ? sources.sources.map(s => s.quality).join(', ') : 'Tidak ada');
            console.log("=======================================================");
            
            console.log(`\n🎉 SUKSES! Provider ${p.name} BERHASIL DIPAKAI!`);
            break; // Berhenti jika sudah dapet stream yang berhasil

        } catch (err) {
            console.error(`❌ Gagal di ${p.name}:`, err.message);
        }
    }
}

testConsumet();
