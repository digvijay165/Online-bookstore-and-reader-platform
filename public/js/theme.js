// Apply the saved (or system) colour theme before first paint to avoid a flash of the wrong theme
(function () {
  var t = null;
  try { t = localStorage.getItem('siteTheme'); } catch (e) { /* storage unavailable */ }
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
