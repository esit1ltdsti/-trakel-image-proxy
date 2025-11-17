// Basit Express.js Server - Dosya İşlemleri İçin
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const sharp = require("sharp");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = 3001;

// Fotoğraf standartları - Dikey A4 kağıdının alt kısmına 3x3 (9 fotoğraf) sığacak boyut
const PHOTO_STANDARDS = {
  width: 240, // 3 sütun için optimize (kenarlıklarla birlikte ~750px/sütun)
  height: 320, // 3 satır için optimize (kenarlıklarla birlikte ~450px/satır)
  quality: 90,
  format: "jpeg",
  allowedFormats: ["jpg", "jpeg", "png"],
  maxFileSize: 10 * 1024 * 1024, // 10MB
};

// Fotoğraf yükleme klasörü
const UPLOADS_DIR = path.join(
  __dirname,
  "..",
  "public",
  "uploads",
  "fotograflar"
);
const TEMP_DIR = path.join(__dirname, "..", "public", "temp");

// Multer yapılandırması - Geçici klasöre kaydet, sonra işleyeceğiz
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(TEMP_DIR, { recursive: true });
      cb(null, TEMP_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `temp_${uniqueSuffix}_${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: PHOTO_STANDARDS.maxFileSize },
  fileFilter: (req, file, cb) => {
    // Format kontrolü - Sadece JPG, JPEG, PNG
    const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
    const mimeType = file.mimetype.toLowerCase();

    const validExtensions = PHOTO_STANDARDS.allowedFormats;
    const validMimeTypes = ["image/jpeg", "image/jpg", "image/png"];

    if (validExtensions.includes(ext) && validMimeTypes.includes(mimeType)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Sadece ${PHOTO_STANDARDS.allowedFormats
            .join(", ")
            .toUpperCase()} formatları kabul edilir!`
        )
      );
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" })); // JSON payload limit artırıldı
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Uploads klasörünü statik olarak servis et
app.use(
  "/uploads",
  express.static(path.join(__dirname, "..", "public", "uploads"))
);

// Dosya yolları
const DATA_DIR = path.join(__dirname, "..", "public", "data");
const PHOTOGRAPHERS_FILE = path.join(DATA_DIR, "photographers.json");
const PHOTO_RECORDS_FILE = path.join(DATA_DIR, "photo-records.json");
const PRINT_HISTORY_FILE = path.join(DATA_DIR, "print-history.json");

// Dosya var mı kontrol et, yoksa oluştur
async function ensureDataFile() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  try {
    await fs.access(PHOTOGRAPHERS_FILE);
  } catch {
    // Boş array ile başlat
    await fs.writeFile(PHOTOGRAPHERS_FILE, JSON.stringify([], null, 2));
  }

  try {
    await fs.access(PHOTO_RECORDS_FILE);
  } catch {
    // Boş array ile başlat
    await fs.writeFile(PHOTO_RECORDS_FILE, JSON.stringify([], null, 2));
  }

  try {
    await fs.access(PRINT_HISTORY_FILE);
  } catch {
    // Boş array ile başlat
    await fs.writeFile(PRINT_HISTORY_FILE, JSON.stringify([], null, 2));
  }
}

// Fotoğrafçıları kaydet (CSV'den gelen veri)
app.post("/api/save-photographers", async (req, res) => {
  try {
    const { data, action = "replace" } = req.body; // Varsayılan olarak replace

    await ensureDataFile();

    let updatedData;
    if (action === "append") {
      // Mevcut verilere ekle (eski davranış)
      let existingData = [];
      try {
        const fileContent = await fs.readFile(PHOTOGRAPHERS_FILE, "utf8");
        existingData = JSON.parse(fileContent);
      } catch (error) {
        console.log("Dosya okunamadı, yeni dosya oluşturuluyor...");
      }
      updatedData = [...existingData, ...data];
    } else {
      // Dosyayı tamamen değiştir (varsayılan)
      updatedData = data;
    }

    // JSON dosyasını güncelle
    await fs.writeFile(
      PHOTOGRAPHERS_FILE,
      JSON.stringify(updatedData, null, 2)
    );

    console.log(
      `✅ ${data.length} kayıt ${PHOTOGRAPHERS_FILE} dosyasına ${
        action === "append" ? "eklendi" : "kaydedildi (önceki veriler silindi)"
      }`
    );

    res.json({
      success: true,
      message: `${data.length} kayıt başarıyla kaydedildi`,
      totalRecords: updatedData.length,
      filePath: PHOTOGRAPHERS_FILE,
    });
  } catch (error) {
    console.error("Dosya kaydetme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Dosya kaydetme hatası",
      error: error.message,
    });
  }
});

// Fotoğrafçıları getir
app.get("/api/photographers", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTOGRAPHERS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    res.json({
      success: true,
      data: data,
      totalRecords: data.length,
    });
  } catch (error) {
    console.error("Dosya okuma hatası:", error);
    res.status(500).json({
      success: false,
      message: "Dosya okuma hatası",
      error: error.message,
    });
  }
});

// Dosya durumunu kontrol et
app.get("/api/status", async (req, res) => {
  try {
    const stats = await fs.stat(PHOTOGRAPHERS_FILE);
    const fileContent = await fs.readFile(PHOTOGRAPHERS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    res.json({
      success: true,
      file: {
        path: PHOTOGRAPHERS_FILE,
        exists: true,
        size: stats.size,
        lastModified: stats.mtime,
        recordCount: data.length,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      file: {
        path: PHOTOGRAPHERS_FILE,
        exists: false,
        error: error.message,
      },
    });
  }
});

// CSV indirme endpoint'i
app.get("/api/download-csv", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTOGRAPHERS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    // CSV formatına çevir
    const headers = [
      "Fotografci Ad soyad",
      "TC Kimlik",
      "Adres",
      "Eklenme Tarihi",
    ];
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        [
          `"${row.name || ""}"`,
          `"${row.tcNo || ""}"`,
          `"${row.address || ""}"`,
          `"${row.addedDate || ""}"`,
        ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fotografcilar_${
        new Date().toISOString().split("T")[0]
      }.csv`
    );
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CSV oluşturma hatası",
      error: error.message,
    });
  }
});

// Fotoğraf kayıtlarını kaydet
app.post("/api/save-photo-records", async (req, res) => {
  try {
    const { data, action = "replace" } = req.body; // Varsayılan olarak replace

    await ensureDataFile();

    let updatedData;
    if (action === "append") {
      // Mevcut verilere ekle (eski davranış)
      let existingData = [];
      try {
        const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
        existingData = JSON.parse(fileContent);
      } catch (error) {
        console.log(
          "Fotoğraf kayıtları dosyası okunamadı, yeni dosya oluşturuluyor..."
        );
      }
      updatedData = [...existingData, ...data];
    } else {
      // Dosyayı tamamen değiştir (varsayılan)
      updatedData = data;
    }

    await fs.writeFile(
      PHOTO_RECORDS_FILE,
      JSON.stringify(updatedData, null, 2)
    );

    console.log(
      `✅ ${data.length} fotoğraf kaydı ${
        action === "append" ? "eklendi" : "kaydedildi (önceki veriler silindi)"
      }`
    );

    res.json({
      success: true,
      message: `${data.length} fotoğraf kaydı başarıyla kaydedildi`,
      data: updatedData,
      sources: {
        total: updatedData.length,
        static: updatedData.length,
        local: 0,
      },
    });
  } catch (error) {
    console.error("Fotoğraf kayıtları kaydetme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Fotoğraf kayıtları kaydedilirken hata oluştu",
      error: error.message,
    });
  }
});

// Fotoğraf kayıtlarını getir
app.get("/api/photo-records", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    res.json({
      success: true,
      records: data,
      sources: {
        total: data.length,
        static: data.length,
        local: 0,
      },
    });
  } catch (error) {
    console.error("Fotoğraf kayıtları okuma hatası:", error);
    res.json({
      success: true,
      records: [],
      sources: { total: 0, static: 0, local: 0 },
    });
  }
});

// Fotoğrafçı verilerini CSV olarak indir
app.get("/api/photographers/download-csv", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTOGRAPHERS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    // CSV formatında hazırla
    const headers = ["Fotografci Ad soyad", "TC Kimlik", "Adres"];
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        [
          `"${row.name || ""}"`,
          `"${row.tcNo || ""}"`,
          `"${row.address || ""}"`,
        ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fotografci_bilgileri_${
        new Date().toISOString().split("T")[0]
      }.csv`
    );
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CSV oluşturma hatası",
      error: error.message,
    });
  }
});

// Fotoğraf kayıtlarını CSV olarak indir
app.get("/api/photo-records/download-csv", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
    const data = JSON.parse(fileContent);

    // CSV formatında hazırla
    const headers = ["Sahibi", "Kelebek Türü", "Görsel Link"];
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        [
          `"${row.photographerName || ""}"`,
          `"${row.butterflyType || ""}"`,
          `"${row.imageUrl || ""}"`,
        ].join(",")
      ),
    ];

    const csvContent = csvRows.join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=fotograf_kayitlari_${
        new Date().toISOString().split("T")[0]
      }.csv`
    );
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "CSV oluşturma hatası",
      error: error.message,
    });
  }
});

// Fotoğraf yükleme endpoint'i - Resize ve Database Kaydı ile
app.post("/api/upload-photos", upload.array("photos", 50), async (req, res) => {
  const tempFiles = [];

  try {
    const { photographerName, photographerId } = req.body;

    if (!photographerName) {
      return res.status(400).json({
        success: false,
        message: "Fotoğrafçı adı gerekli!",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Fotoğraf seçilmedi!",
      });
    }

    // Fotoğrafçı klasörü oluştur
    const photographerDir = path.join(UPLOADS_DIR, photographerName);
    await fs.mkdir(photographerDir, { recursive: true });

    // Her fotoğrafı işle: resize + optimize
    const uploadedPhotos = [];

    for (const file of req.files) {
      tempFiles.push(file.path); // Geçici dosyaları takip et

      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const outputFileName = `foto_${uniqueSuffix}.${PHOTO_STANDARDS.format}`;
      const outputPath = path.join(photographerDir, outputFileName);

      // Sharp ile fotoğrafı standart boyuta getir ve optimize et
      const metadata = await sharp(file.path)
        .resize(PHOTO_STANDARDS.width, PHOTO_STANDARDS.height, {
          fit: "cover", // Kırparak tam oturtur
          position: "center",
        })
        .jpeg({ quality: PHOTO_STANDARDS.quality })
        .toFile(outputPath);

      // Fotoğraf bilgilerini kaydet
      const photoRecord = {
        id: `photo_${uniqueSuffix}`,
        originalName: file.originalname,
        fileName: outputFileName,
        photographerName: photographerName,
        photographerId: photographerId || null,
        path: `/uploads/fotograflar/${photographerName}/${outputFileName}`,
        fullPath: outputPath,
        size: metadata.size,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        uploadedAt: new Date().toISOString(),
        standard: `${PHOTO_STANDARDS.width}x${PHOTO_STANDARDS.height}`,
      };

      uploadedPhotos.push(photoRecord);
    }

    // Geçici dosyaları temizle
    for (const tempFile of tempFiles) {
      try {
        await fs.unlink(tempFile);
      } catch (err) {
        console.warn(`⚠️ Geçici dosya silinemedi: ${tempFile}`);
      }
    }

    // Database'e kaydet (photo-records.json)
    await ensureDataFile();
    let photoRecords = [];
    try {
      const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
      photoRecords = JSON.parse(fileContent);
    } catch (error) {
      console.log("📝 Yeni photo-records.json oluşturuluyor...");
    }

    // Yeni fotoğrafları ekle
    photoRecords.push(...uploadedPhotos);
    await fs.writeFile(
      PHOTO_RECORDS_FILE,
      JSON.stringify(photoRecords, null, 2)
    );

    console.log(
      `📸 ${uploadedPhotos.length} fotoğraf ${photographerName} için işlendi ve kaydedildi`
    );
    console.log(
      `📏 Standart boyut: ${PHOTO_STANDARDS.width}x${PHOTO_STANDARDS.height}`
    );

    res.json({
      success: true,
      message: `${uploadedPhotos.length} fotoğraf başarıyla yüklendi ve standart boyuta getirildi`,
      photos: uploadedPhotos,
      standard: `${PHOTO_STANDARDS.width}x${PHOTO_STANDARDS.height}`,
    });
  } catch (error) {
    // Hata durumunda geçici dosyaları temizle
    for (const tempFile of tempFiles) {
      try {
        await fs.unlink(tempFile);
      } catch (err) {
        // Sessizce devam et
      }
    }

    console.error("❌ Fotoğraf yükleme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Fotoğraf yükleme hatası",
      error: error.message,
    });
  }
});

// Fotoğrafçının fotoğraflarını getir (Database'den)
app.get("/api/photos/:photographerName", async (req, res) => {
  try {
    const { photographerName } = req.params;

    await ensureDataFile();

    // Database'den fotoğraf kayıtlarını oku
    let photoRecords = [];
    try {
      const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
      photoRecords = JSON.parse(fileContent);
    } catch (error) {
      console.log("📝 Photo records dosyası okunamadı");
    }

    // Sadece bu fotoğrafçıya ait fotoğrafları filtrele
    const photographerPhotos = photoRecords.filter(
      (photo) => photo.photographerName === photographerName
    );

    res.json({
      success: true,
      photographerName,
      count: photographerPhotos.length,
      photos: photographerPhotos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fotoğraflar getirilemedi",
      error: error.message,
    });
  }
});

// Tüm fotoğraf kayıtlarını getir
app.get("/api/photo-records", async (req, res) => {
  try {
    await ensureDataFile();

    const fileContent = await fs.readFile(PHOTO_RECORDS_FILE, "utf8");
    const photoRecords = JSON.parse(fileContent);

    res.json({
      success: true,
      count: photoRecords.length,
      records: photoRecords,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fotoğraf kayıtları getirilemedi",
      error: error.message,
    });
  }
});

// Tüm verileri temizle endpoint'i
app.post("/api/clear-all-data", async (req, res) => {
  try {
    await ensureDataFile();

    // Her iki dosyayı da boş array ile sıfırla
    await fs.writeFile(PHOTOGRAPHERS_FILE, JSON.stringify([], null, 2));
    await fs.writeFile(PHOTO_RECORDS_FILE, JSON.stringify([], null, 2));

    console.log("🗑️ Tüm veriler temizlendi!");

    res.json({
      success: true,
      message: "Tüm veriler başarıyla temizlendi",
    });
  } catch (error) {
    console.error("Veri temizleme hatası:", error);
    res.status(500).json({
      success: false,
      message: "Veri temizleme hatası",
      error: error.message,
    });
  }
});

// Sertifika yazdırma endpoint'i - yazdırma geçmişini kaydet
app.post("/api/print-certificate", async (req, res) => {
  try {
    await ensureDataFile();

    const { photographerId, photographerName } = req.body;

    if (!photographerId || !photographerName) {
      return res.status(400).json({
        success: false,
        message: "Fotoğrafçı ID ve isim gerekli",
      });
    }

    // Yazdırma geçmişini oku
    const printHistoryContent = await fs.readFile(PRINT_HISTORY_FILE, "utf8");
    const printHistory = JSON.parse(printHistoryContent);

    // Yeni yazdırma kaydı oluştur
    const printRecord = {
      id: Date.now().toString(),
      photographerId,
      photographerName,
      printedAt: new Date().toISOString(),
    };

    // Kayıt ekle ve dosyaya kaydet
    printHistory.push(printRecord);
    await fs.writeFile(
      PRINT_HISTORY_FILE,
      JSON.stringify(printHistory, null, 2)
    );

    console.log(`📄 Sertifika yazdırıldı: ${photographerName}`);

    res.json({
      success: true,
      message: "Yazdırma kaydı başarıyla oluşturuldu",
      record: printRecord,
    });
  } catch (error) {
    console.error("Yazdırma kaydı hatası:", error);
    res.status(500).json({
      success: false,
      message: "Yazdırma kaydı oluşturulamadı",
      error: error.message,
    });
  }
});

// Fotoğrafçının yazdırma geçmişini getir
app.get("/api/print-history/:photographerId", async (req, res) => {
  try {
    await ensureDataFile();

    const { photographerId } = req.params;

    const printHistoryContent = await fs.readFile(PRINT_HISTORY_FILE, "utf8");
    const printHistory = JSON.parse(printHistoryContent);

    // Belirli fotoğrafçıya ait kayıtları filtrele
    const photographerHistory = printHistory.filter(
      (record) => record.photographerId === photographerId
    );

    res.json({
      success: true,
      count: photographerHistory.length,
      history: photographerHistory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Yazdırma geçmişi getirilemedi",
      error: error.message,
    });
  }
});

// Tüm yazdırma geçmişini getir
app.get("/api/print-history", async (req, res) => {
  try {
    await ensureDataFile();

    const printHistoryContent = await fs.readFile(PRINT_HISTORY_FILE, "utf8");
    const printHistory = JSON.parse(printHistoryContent);

    res.json({
      success: true,
      count: printHistory.length,
      history: printHistory,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Yazdırma geçmişi getirilemedi",
      error: error.message,
    });
  }
});

// Fotoğrafçının yüklenen fotoğraflarını getir
app.get("/api/uploaded-photos/:photographerName", async (req, res) => {
  try {
    const photographerName = req.params.photographerName;
    const photographerDir = path.join(UPLOADS_DIR, photographerName);

    // Klasör var mı kontrol et
    try {
      await fs.access(photographerDir);
    } catch {
      return res.json({
        success: true,
        count: 0,
        photos: [],
        message: "Fotoğrafçı için yüklenmiş fotoğraf bulunamadı",
      });
    }

    // Klasördeki tüm dosyaları oku
    const files = await fs.readdir(photographerDir);
    const photoFiles = files.filter((file) => /\.(jpg|jpeg|png)$/i.test(file));

    const photos = photoFiles.map((file) => ({
      fileName: file,
      url: `http://localhost:3001/uploads/fotograflar/${encodeURIComponent(
        photographerName
      )}/${file}`,
      path: `/uploads/fotograflar/${photographerName}/${file}`,
    }));

    res.json({
      success: true,
      count: photos.length,
      photos: photos,
      photographerName: photographerName,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Fotoğraflar getirilemedi",
      error: error.message,
    });
  }
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
    // ../resim/kus/orji//39739.jpg → https://www.trakel.org/resim/kus/orji//39739.jpg
    const absoluteUrl = imgSrc.startsWith("http")
      ? imgSrc
      : `https://www.trakel.org${imgSrc.replace("..", "")}`;

    console.log(`✅ Resim bulundu: ${absoluteUrl}`);

    // Proxy URL oluştur (CORS sorununu çözmek için)
    const proxyUrl = `http://localhost:${PORT}/api/image-proxy?url=${encodeURIComponent(
      absoluteUrl
    )}`;

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
  console.log(`🚀 File Server çalışıyor: http://localhost:${PORT}`);
  console.log(`📁 Veri klasörü: ${DATA_DIR}`);
  console.log(`📊 Fotoğrafçı dosyası: ${PHOTOGRAPHERS_FILE}`);
  console.log(`📷 Fotoğraf kayıtları dosyası: ${PHOTO_RECORDS_FILE}`);
  console.log(`📄 Yazdırma geçmişi dosyası: ${PRINT_HISTORY_FILE}`);
});

module.exports = app;
