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
| **Photo Splitter** | Split by guide lines (straight/curved) or by draggable shapes (circle/rectangle); preview pieces, download as ZIP |
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

**https://webisso.github.io/photo-editor/**

**Repository settings:** Settings → Pages → Source: **Deploy from a branch** → Branch: `gh-pages` / `/ (root)` (or `main` / `/ (root)`)

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
└── tools/
    ├── parcalayici/        # Photo splitter
    └── whatsapp-sticker/   # WhatsApp sticker maker
```

### Photo Splitter — quick guide

**Lines mode**

1. Upload an image (PNG, JPG, WEBP).
2. Add vertical/horizontal guide lines and drag to align with sticker edges.
3. Double-click a line to add a bend point; drag the yellow handle for a slight curve.
4. Click **Complete** → preview → **Confirm and download** (ZIP).

**Shapes mode** (toggle **Shapes** in the toolbar)

1. Add **Circle** or **Rectangle** shapes and place them over the areas you want to cut.
2. Drag to move; use corner handles to resize (opposite corner stays fixed); use the top handle to rotate.
3. Delete a shape via the trash icon in the center, or select it and press **Delete** / **Backspace**.
4. Click **Complete** → same preview and ZIP download (transparent PNG per shape).

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
| **Foto Parçalayıcı** | Çizgilerle (düz/eğimli) veya daire/kare şekillerle böl; önizle, ZIP indir |
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

GitHub repo ayarları: **Settings → Pages → Deploy from a branch** → `gh-pages` veya `main` / `/ (root)`

#### Özel domain (isteğe bağlı)

1. Kök dizine `CNAME` dosyası ekleyin (`CNAME.example` örneğine bakın).
2. GitHub **Settings → Pages → Custom domain** alanını doldurun.
3. DNS sağlayıcınızda kayıt oluşturun (ör. `CNAME photo-editor → webisso.github.io`).

Test için örnek: `photo-editor.test.webisso.com`

### Foto Parçalayıcı — kısa kullanım

**Çizgiler modu**

1. Görsel yükleyin.
2. Dikey/yatay çizgiler ekleyip sticker sınırlarına hizalayın.
3. Eğim için çizgiye çift tıklayın, sarı noktayı sürükleyin.
4. **Tamamla** → önizleme → **Onayla ve İndir**.

**Şekiller modu** (üst menüden **Şekiller**’e geçin)

1. **Daire** veya **Kare** ekleyip kesmek istediğiniz alanların üzerine yerleştirin.
2. Sürükleyerek taşıyın; köşe tutamaçlarıyla boyutlandırın (karşı köşe sabit kalır); üst tutamaçla döndürün.
3. Silmek için ortadaki çöp kutusuna tıklayın veya şekli seçip **Delete** / **Backspace** kullanın.
4. **Tamamla** → aynı önizleme ve ZIP indirme (her şekil şeffaf PNG).

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
