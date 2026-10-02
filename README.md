# 🤖 R-SERVER Create — Telegram Bot Cloud VPS Generator & Manager

Bot Telegram canggih untuk membuat, mengelola, dan mengonfigurasi server **Cloud VPS (Debian & Arch Linux)** di **Railway** secara instan menggunakan **Railway API / 1-Click Login**.

---

## 🌟 Fitur Utama

1. **🚀 1-Click Multi-Step VPS Generator:**
   - Login Railway via 1-Click Browser Login atau Railway API Token.
   - Pilihan OS terfokus: **Debian 12 (Bookworm)**, **Debian 11 (Bullseye)**, dan **Arch Linux (Rolling Release)**.
   - Kustomisasi versi Node.js (v22 / v20 / v18 LTS / Default).
   - Opsi instalasi AI Coding Agents (Claude Code & Google Antigravity CLI).
   - Opsi XRDP + XFCE4 Remote Desktop GUI (Port 3389).
   - Opsi Extra Tools (FFmpeg, Neofetch/Fastfetch, Python Dev, Redis, Nginx).
   - Otomatis provisioning container, TCP Proxy (SSH port), dan Web Monitor domain.
   - Progress bar real-time selama deployment di Railway (~20-30 detik).

2. **💿 Reinstall & Ganti OS Instan:**
   - Fitur ganti / reinstall OS langsung dari chat bot dengan 1 klik.
   - IP Address, Port SSH, dan Domain Web Dashboard tetap sama dan aman setelah rebuild.

3. **🔑 Manajemen & Monitoring VPS:**
   - `/list` - Melihat daftar seluruh VPS aktif, IP, port, OS, dan status.
   - `/balance` - Cek sisa credit / saldo trial Railway ($5.00).
   - `/reinstall` - Reinstall / ganti distro OS pada VPS aktif.
   - `/delete <project_id>` - Hapus VPS untuk menghemat resource.

---

## 🛠️ Instalasi & Menjalankan

### 1. Masuk ke Direktori Proyek
```bash
cd /root/telegram-vps-bot
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Konfigurasi Environment (`.env`)
Salin file `.env.example`:
```bash
cp .env.example .env
```
Isi konfigurasi pada file `.env`:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
GITHUB_REPO=myramm/r-server
```

### 4. Menjalankan Bot dengan PM2 (24/7 Background)
```bash
# Jalankan bot
pm2 start bot.js --name "vps-tele-bot"

# Simpan proses agar otomatis berjalan saat sistem restart
pm2 save
pm2 startup
```

---

## 📂 Struktur Proyek

```
r-server-create/
├── bot.js          # Controller utama bot Telegram & event handlers
├── database.js     # Manajemen database SQLite (Better-SQLite3)
├── railway.js      # Railway GraphQL API client & networking helpers
├── cliAuth.js      # Modul 1-Click Railway Device Login Session
├── osCatalog.js    # Katalog sistem operasi (Debian & Arch Linux)
├── .env.example    # Contoh file environment variables
├── package.json    # Metadata & dependencies Node.js
└── README.md       # Dokumentasi proyek
```

---

## 📜 Lisensi
MIT License - Created by [myramm](https://github.com/myramm)
