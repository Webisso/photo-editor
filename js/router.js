(function () {
  'use strict';

  const tools = [
    {
      id: 'parcalayici',
      title: 'Foto Parçalayıcı',
      description: 'Sticker sayfalarını çizgilerle böl, parçaları indir',
      path: 'tools/parcalayici/',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M4 6h16M4 12h16M4 18h16M10 6v12M16 6v12"/></svg>`,
      enabled: true,
    },
    {
      id: 'whatsapp-sticker',
      title: 'WhatsApp Sticker Maker',
      description: 'Sticker paketi oluştur, sırala ve WhatsApp formatında indir',
      path: 'tools/whatsapp-sticker/',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>`,
      enabled: true,
    },
    {
      id: 'metadata-stripper',
      title: 'Metadata Temizleyici',
      description: 'EXIF, GPS ve tüm gizli verileri görsellerden sil',
      path: 'tools/metadata-stripper/',
      icon: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>`,
      enabled: true,
    },
  ];

  const menu = document.getElementById('tool-menu');

  function navigate(path) {
    window.location.href = path;
  }

  function renderMenu() {
    menu.innerHTML = tools.map(tool => `
      <button
        type="button"
        class="tool-card${tool.enabled ? '' : ' tool-card-disabled'}"
        data-path="${tool.path}"
        ${tool.enabled ? '' : 'disabled'}
      >
        <div class="tool-card-icon">${tool.icon}</div>
        <div class="tool-card-body">
          <div class="tool-card-title">${tool.title}</div>
          <div class="tool-card-desc">${tool.description}</div>
        </div>
        <svg class="tool-card-arrow w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </button>
    `).join('');

    menu.querySelectorAll('.tool-card:not(.tool-card-disabled)').forEach(card => {
      card.addEventListener('click', () => navigate(card.dataset.path));
    });
  }

  renderMenu();
})();
