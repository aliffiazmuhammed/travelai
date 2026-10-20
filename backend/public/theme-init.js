/**
 * Applies the saved (or system) theme before first paint.
 *
 * Kept as a separate classic script so the Content-Security-Policy can forbid
 * inline scripts (`script-src 'self'`) without reintroducing a theme flash.
 */
(function () {
  try {
    var theme = localStorage.getItem('travelai_theme');
    var isDark =
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
