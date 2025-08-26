# Mini Drive

Kullanıcı kayıt/giriş ve dosya yükleme/önizleme özellikli basit bir "drive" sitesi.

## Özellikler
- Kayıt ol / Giriş yap (JWT + HttpOnly cookie)
- Dosya yükleme (JPG/JPEG/PNG, MP4, PDF, DOCX, XLSX — 200MB limit)
- Kişiye özel depolama klasörü
- Önizleme:
  - Resimler `<img>`
  - Videolar `<video>`
  - PDF `<iframe>`
  - DOCX `docx-preview` ile tarayıcıda render
  - XLSX `SheetJS` ile tabloya dönüştürme
- SQLite veritabanı (better-sqlite3)
- Basit güvenlik: Helmet, rate limit

## Kurulum
1. Node.js 18+ kurulu olmalı.
2. Kur:
   ```bash
   npm install
