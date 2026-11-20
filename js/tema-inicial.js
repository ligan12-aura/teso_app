// Modo claro/oscuro antes de pintar: el elegido con el botón o, si no, el del sistema
(function () {
  var t = null; try { t = localStorage.getItem('teso_tema'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  if (t === 'dark') document.querySelector('meta[name=theme-color]').setAttribute('content', '#0c111b');
})();
