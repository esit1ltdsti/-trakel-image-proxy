// Minimal Backend - Sadece Trakel.org Resim Çekme
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "OK",
    message: "Trakel Image Proxy Service",
    endpoints: ["/api/extract-image-url", "/api/image-proxy"],
  });
});

// Trakel.org'dan asıl resim linkini çıkar
app.post("/api/extract-image-url", async (req, res) => {
  try {
    const { trakelUrl } = req.body;

    if (!trakelUrl || !trakelUrl.includes("trakel.org")) {
      return res.json({
        success: false,
        message: "Geçersiz Trakel.org URL'si",
        originalUrl: trakelUrl,
      });
    }

    console.log(`🔍 Trakel.org sayfasından resim çıkarılıyor: ${trakelUrl}`);

    // HTML'i fetch et
    const response = await axios.get(trakelUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    // Cheerio ile parse et
    const $ = cheerio.load(response.data);

    // img.tur class'ına sahip resmi bul
    const imgSrc = $("img.tur").attr("src");

    if (!imgSrc) {
      console.error(`❌ Resim bulunamadı: ${trakelUrl}`);
      return res.json({
        success: false,
        message: "Sayfada resim bulunamadı",
        originalUrl: trakelUrl,
      });
    }

    // Relative path'i absolute'e çevir
    const absoluteUrl = imgSrc.startsWith("http")
      ? imgSrc
      : `https://www.trakel.org${imgSrc.replace("..", "")}`;

    console.log(`✅ Resim bulundu: ${absoluteUrl}`);

    // Proxy URL oluştur - HER ZAMAN HTTPS kullan
    const proxyUrl = `https://${req.get(
      "host"
    )}/api/image-proxy?url=${encodeURIComponent(absoluteUrl)}`;

    res.json({
      success: true,
      imageUrl: proxyUrl,
      originalUrl: trakelUrl,
      directUrl: absoluteUrl,
    });
  } catch (error) {
    console.error(`❌ Resim çıkarma hatası:`, error.message);
    res.json({
      success: false,
      message: error.message,
      originalUrl: req.body.trakelUrl,
    });
  }
});

// Image Proxy - CORS sorununu çözmek için
app.get("/api/image-proxy", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "URL parametresi gerekli" });
    }

    console.log(`🖼️ Resim proxy ediliyor: ${url}`);

    // Resmi Trakel.org'dan çek
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });

    // Content-Type header'ını ayarla
    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Cache-Control", "public, max-age=86400"); // 1 gün cache

    // Resmi gönder
    res.send(response.data);
  } catch (error) {
    console.error(`❌ Image proxy hatası:`, error.message);
    res.status(500).json({ error: "Resim yüklenemedi" });
  }
});

// Server başlat
app.listen(PORT, () => {
  console.log(`🚀 Image Proxy Server çalışıyor: http://localhost:${PORT}`);
});

module.exports = app;
