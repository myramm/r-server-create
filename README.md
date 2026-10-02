# 🤖 R-SERVER Create — Telegram Bot Cloud VPS Generator & Manager

Bot Telegram canggih untuk membuat, mengelola, dan mengonfigurasi server **Cloud VPS (Debian, Arch, Ubuntu, Kali Linux)** di **Railway** secara instan menggunakan **Railway API / 1-Click Login**.

---

## 🌟 Fitur Utama

1. **🚀 1-Click Multi-Step VPS Generator:**
   - Login Railway via 1-Click Browser Login atau Railway API Token.
   - Pilihan OS terfokus: **Debian 12/11**, **Arch Linux (Rolling)**, **Ubuntu (24.04/22.04/20.04/25.04)**, dan **Kali Linux (All Versions)**.
   - Kustomisasi versi Node.js (v22 / v20 / v18 LTS / Default).
   - Opsi instalasi AI Coding Agents (Claude Code & Google Antigravity CLI).
   - Opsi XRDP + XFCE4 Remote Desktop GUI (Port 3389).
   - Opsi Extra Tools (FFmpeg, Neofetch/Fastfetch, Python Dev, Redis, Nginx).
   - Otomatis provisioning container, TCP Proxy (SSH port), dan Web Monitor domain.
   - Progress bar real-time selama deployment di Railway.

2. **💿 Reinstall & Ganti OS Instan:**
   - Fitur ganti / reinstall OS langsung dari chat bot dengan 1 klik.
   - IP Address, Port SSH, dan Domain Web Dashboard tetap sama dan aman setelah rebuild.
   - Dilengkapi peringatan eksplisit penghapusan data lama sebelum eksekusi.

3. **🔑 Manajemen & Monitoring VPS:**
   - `/list` - Melihat daftar seluruh VPS aktif, IP, port, OS, dan status.
   - `/balance` - Cek sisa credit / saldo trial Railway ($5.00) yang me-refresh setiap 24 jam.
   - `/reinstall` - Reinstall / ganti distro OS pada VPS aktif.
   - `/delete <project_id>` - Hapus VPS untuk menghemat resource.

---

## 🛠️ Struktur Direktori Proyek

```
r-server-create/
├── src/
│   ├── config/
│   │   └── osCatalog.js          # Katalog & rilis sistem operasi Linux
│   ├── services/
│   │   ├── database.js           # Database SQLite (Better-SQLite3)
│   │   ├── railway.js            # Railway GraphQL API Client & Networking
│   │   └── cliAuth.js            # Modul 1-Click Device Code Login Session
│   ├── handlers/
│   │   ├── menuHandler.js        # Main menu, profile, catalog & token tutorial
│   │   ├── createHandler.js      # VPS Creation wizard (OS, Node, AI, Tools, Deploy)
│   │   ├── reinstallHandler.js   # Reinstall & ganti distro OS handler
│   │   └── vpsHandler.js         # List VPS, reboot, balance & delete handlers
│   ├── utils/
│   │   └── telegram.js           # Helper functions & safe message senders
│   └── bot.js                    # Controller utama bot Telegram & event router
├── data/
│   └── bot.sqlite                # Database SQLite lokal (di-ignore oleh git)
├── .env.example                  # Contoh file environment variables
├── .gitignore                    # Git ignore rules
├── package.json                  # Metadata & dependencies Node.js
├── README.md                     # Dokumentasi proyek
└── index.js                      # Application entry point
```

---

## 🚀 Cara Menjalankan

### 1. Install Dependencies
```bash
npm install
```

### 2. Konfigurasi Environment (`.env`)
Salin file `.env.example`:
```bash
cp .env.example .env
```
Isi variabel:
```env
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
GITHUB_REPO=myramm/r-server
```

### 3. Menjalankan Bot dengan PM2 (24/7 Background)
```bash
pm2 start index.js --name "vps-tele-bot"
pm2 save
pm2 startup
```

---

## 📜 Lisensi
MIT License - Created by [myramm](https://github.com/myramm)
