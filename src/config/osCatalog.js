/**
 * RAILWAY LINUX / CONTAINER OS CATALOG
 * Debian, Arch Linux, Ubuntu, and Kali Linux (All Versions)
 */

let distroIndex = 1;
const CODE_MAP = new Map();

function addDistro(id, name, pkg, extra = {}) {
  const code = `os_${distroIndex++}`;
  const item = { code, id, name, pkg, ...extra };
  CODE_MAP.set(code, item);
  return item;
}

const OS_CATALOG = {
  debian: {
    name: 'Debian GNU/Linux',
    icon: '🍥',
    description: 'Distro universal rock-solid paling stabil, ringan & aman.',
    distros: [
      addDistro('debian:12', 'Debian 12 (Bookworm)', 'apt', { recommended: true }),
      addDistro('debian:11', 'Debian 11 (Bullseye)', 'apt'),
      addDistro('debian:10', 'Debian 10 (Buster)', 'apt'),
      addDistro('debian:13', 'Debian 13 (Trixie Testing)', 'apt'),
      addDistro('debian:sid', 'Debian Sid (Unstable Rolling)', 'apt'),
    ]
  },
  arch: {
    name: 'Arch Linux',
    icon: '🏹',
    description: 'Distro bleeding-edge rolling-release dengan paket software terbaru.',
    distros: [
      addDistro('archlinux:latest', 'Arch Linux (Rolling Release)', 'pacman', { recommended: true }),
    ]
  },
  ubuntu: {
    name: 'Ubuntu Linux',
    icon: '🟠',
    description: 'Distro Linux populer untuk cloud server, AI & developer.',
    distros: [
      addDistro('ubuntu:24.04', 'Ubuntu 24.04 LTS (Noble Numbat)', 'apt', { recommended: true }),
      addDistro('ubuntu:22.04', 'Ubuntu 22.04 LTS (Jammy Jellyfish)', 'apt', { recommended: true }),
      addDistro('ubuntu:20.04', 'Ubuntu 20.04 LTS (Focal Fossa)', 'apt'),
      addDistro('ubuntu:25.04', 'Ubuntu 25.04 (Plucky Puffin)', 'apt'),
      addDistro('ubuntu:18.04', 'Ubuntu 18.04 LTS (Bionic Beaver)', 'apt'),
      addDistro('ubuntu:devel', 'Ubuntu 26.04 LTS (Rolling/Devel)', 'apt'),
    ]
  },
  kali: {
    name: 'Kali Linux (All Versions)',
    icon: '🐉',
    description: 'Distro nomor 1 untuk ethical hacking, pentest & cybersecurity.',
    distros: [
      addDistro('kalilinux/kali-rolling', 'Kali Linux Rolling (Official)', 'apt', { recommended: true }),
      addDistro('kalilinux/kali-last-release', 'Kali Linux Last Release', 'apt', { recommended: true }),
      addDistro('kalilinux/kali-bleeding-edge', 'Kali Linux Bleeding Edge', 'apt'),
      addDistro('kalilinux/kali-experimental', 'Kali Linux Experimental', 'apt'),
    ]
  }
};

/**
 * Find distro details by short code (e.g. 'os_1')
 */
function getDistroByCode(code) {
  return CODE_MAP.get(code) || null;
}

/**
 * Find distro details by Docker image id
 */
function findDistro(imageId) {
  for (const cat of Object.values(OS_CATALOG)) {
    const found = cat.distros.find(d => d.id === imageId);
    if (found) return { ...found, category: cat.name };
  }
  if (imageId === 'archlinux:latest' || (imageId && imageId.toLowerCase().includes('arch'))) {
    return { id: 'archlinux:latest', name: 'Arch Linux (Rolling Release)', pkg: 'pacman' };
  }
  if (imageId && imageId.toLowerCase().includes('kali')) {
    return { id: imageId, name: 'Kali Linux Rolling (Official)', pkg: 'apt' };
  }
  if (imageId && imageId.toLowerCase().includes('ubuntu')) {
    return { id: imageId, name: 'Ubuntu Linux', pkg: 'apt' };
  }
  return { id: 'debian:12', name: 'Debian 12 (Bookworm)', pkg: 'apt' };
}

module.exports = {
  OS_CATALOG,
  getDistroByCode,
  findDistro,
};
