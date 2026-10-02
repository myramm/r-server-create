/**
 * RAILWAY LINUX / CONTAINER OS CATALOG
 * Hanya Debian & Arch Linux
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
    ]
  },
  arch: {
    name: 'Arch Linux',
    icon: '🏹',
    description: 'Distro bleeding-edge rolling-release dengan paket software terbaru.',
    distros: [
      addDistro('archlinux:latest', 'Arch Linux (Rolling Release)', 'pacman', { recommended: true }),
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
  return { id: 'debian:12', name: 'Debian 12 (Bookworm)', pkg: 'apt' };
}

module.exports = {
  OS_CATALOG,
  getDistroByCode,
  findDistro,
};
