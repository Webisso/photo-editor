# Photo Editor

[![Live Demo](https://img.shields.io/badge/demo-GitHub%20Pages-22c55e?style=flat-square)](https://webisso.github.io/photo-editor/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

Browser-based photo tools for sticker sheets and WhatsApp packs. No upload to server — everything runs locally in your browser.

**Live:** [https://webisso.github.io/photo-editor/](https://webisso.github.io/photo-editor/)

---

## English

### Features

| Tool | Description |
|------|-------------|
| **Photo Splitter** | Upload a sticker sheet, place horizontal/vertical (and curved) cut lines, preview pieces, download as ZIP |
| **WhatsApp Sticker Maker** | Build a `.wastickers` pack (Sticker Maker format), reorder stickers, export for WhatsApp |

### Tech stack

- HTML, CSS, JavaScript (vanilla)
- [Tailwind CSS](https://tailwindcss.com/) (CDN)
- [JSZip](https://github.com/Stuk/jszip) for archives
- GitHub Pages for hosting

### Local development

```bash
git clone git@github.com:Webisso/photo-editor.git
cd photo-editor

# Any static server works, e.g.:
python3 -m http.server 8080
# Open http://localhost:8080
```

> `.htaccess` files are for Apache hosting. They are ignored on GitHub Pages.

### Deploy (GitHub Pages)

Pushes to `main` trigger the workflow in `.github/workflows/gh-pages.yml` and publish to:

**https://webisso.github.io/photo-editor/**

**Repository settings:** Settings → Pages → Source: **GitHub Actions**

#### Custom domain (optional)

1. Add a `CNAME` file at the repo root (see `CNAME.example`).
2. In GitHub: Settings → Pages → Custom domain.
3. Add a DNS record at your provider (e.g. `CNAME photo-editor → webisso.github.io`).

Test subdomain example: `photo-editor.test.webisso.com` → point CNAME to `webisso.github.io`.

### Project structure

```
photo-editor/
├── index.html              # Main menu (router)
├── css/home.css
├── js/router.js
├── tools/
│   ├── parcalayici/        # Photo splitter
│   └── whatsapp-sticker/   # WhatsApp sticker maker
└── .github/workflows/      # gh-pages deploy
```

### Photo Splitter — quick guide

1. Upload an image (PNG, JPG, WEBP).
2. Add vertical/horizontal guide lines and drag to align with sticker edges.
3. Double-click a line to add a bend point; drag the yellow handle for a slight curve.
4. Click **Complete** → preview → **Confirm and download** (ZIP).

### WhatsApp Sticker Maker — quick guide

1. Fill in pack name and publisher.
2. Upload 3–30 sticker images.
3. Drag cards to reorder.
4. Click **Save (.wastickers)** → download the file.
5. Transfer to your phone → open with **Sticker Maker** → **Add to WhatsApp**.

Requirements: 512×512 WebP stickers (≤100 KB each), 96×96 PNG tray icon (≤50 KB).

---

## Türkçe

### Özellikler

| Araç | Açıklama |
|------|----------|
| **Foto Parçalayıcı** | Sticker sayfası yükle, dikey/yatay (ve eğimli) çizgilerle böl, önizle, ZIP indir |
| **WhatsApp Sticker Maker** | `.wastickers` paketi oluştur, sırala, WhatsApp’a aktar |

### Canlı adres

**https://webisso.github.io/photo-editor/**

### Yerel çalıştırma

```bash
git clone git@github.com:Webisso/photo-editor.git
cd photo-editor
python3 -m http.server 8080
```

Tarayıcıda `http://localhost:8080` adresini açın.

### Yayınlama (GitHub Pages)

`main` branch’e push yapıldığında site otomatik yayınlanır.

GitHub repo ayarları: **Settings → Pages → Source: GitHub Actions**

#### Özel domain (isteğe bağlı)

1. Kök dizine `CNAME` dosyası ekleyin (`CNAME.example` örneğine bakın).
2. GitHub **Settings → Pages → Custom domain** alanını doldurun.
3. DNS sağlayıcınızda kayıt oluşturun (ör. `CNAME photo-editor → webisso.github.io`).

Test için örnek: `photo-editor.test.webisso.com`

### Foto Parçalayıcı — kısa kullanım

1. Görsel yükleyin.
2. Dikey/yatay çizgiler ekleyip sticker sınırlarına hizalayın.
3. Eğim için çizgiye çift tıklayın, sarı noktayı sürükleyin.
4. **Tamamla** → önizleme → **Onayla ve İndir**.

### WhatsApp Sticker Maker — kısa kullanım

1. Paket adı ve yayıncı girin.
2. 3–30 sticker yükleyin, sırayı sürükleyerek ayarlayın.
3. **Kaydet (.wastickers)** ile indirin.
4. Telefona aktarın → **Sticker Maker** ile açın → **WhatsApp’a Ekle**.

---

## Repository

```bash
git remote add origin git@github.com:Webisso/photo-editor.git
```

## License

MIT — see [LICENSE](LICENSE).
