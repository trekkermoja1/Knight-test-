const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function facebookCommand(sock, chatId, message) {
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || "";
        let url = text.split(' ').slice(1).join(' ').trim();
        
        if (!url) {
            return await sock.sendMessage(chatId, { text: "📝 *Usage:* .fb <link>" }, { quoted: message });
        }

        // 1. Initial Reaction
        await sock.sendMessage(chatId, { react: { text: '🔄', key: message.key } });

        // 2. Fetching from the most stable 2026 API
        // This specific API handles the 403 bypass on its own server
        const apiUrl = `https://api.vreden.my.id/api/facebook?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl, { timeout: 15000 });
        
        if (!response.data || !response.data.status) {
            throw new Error("API could not resolve this link. The video might be private.");
        }

        // Extract HD if available, otherwise SD
        const videoUrl = response.data.result.video || response.data.result.url;
        const title = response.data.result.title || "Facebook Video";

        if (!videoUrl) throw new Error("No video stream found.");

        // 3. Prepare Temp File
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tempPath = path.join(tmpDir, `fb_${Date.now()}.mp4`);

        // 4. Download with "Human-Like" Headers
        const writer = fs.createWriteStream(tempPath);
        const videoFetch = await axios({
            method: 'get',
            url: videoUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                'Referer': 'https://www.facebook.com/',
                'Connection': 'keep-alive'
            }
        });

        videoFetch.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // 5. Final Send Check
        const stats = fs.statSync(tempPath);
        if (stats.size > 2000) { 
            await sock.sendMessage(chatId, {
                video: fs.readFileSync(tempPath),
                mimetype: "video/mp4",
                caption: `✅ *Download Successful*\n\n📝 *Title:* ${title}\n⚖️ *Size:* ${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
        } else {
            throw new Error("403 Forbidden: Server IP is blocked by Facebook.");
        }

        // Cleanup
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    } catch (error) {
        console.error('FINAL ATTEMPT ERROR:', error.message);
        
        let errorMsg = "❌ *Download Failed*";
        if (error.message.includes('403')) {
            errorMsg = "❌ *IP BLOCKED:* Facebook is blocking your bot server's IP address. Please restart your VPS or use a Proxy.";
        } else if (error.message.includes('timeout')) {
            errorMsg = "❌ *Timeout:* The API server is slow. Try again.";
        }

        await sock.sendMessage(chatId, { text: errorMsg }, { quoted: message });
        await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
    }
}

module.exports = facebookCommand;
