/**
 * Applies the saved (or system) theme and the route's realm before first paint.
 *
 * Kept as a separate classic script so the Content-Security-Policy can forbid
 * inline scripts (`script-src 'self'`) without reintroducing a theme flash.
 * The React ThemeProvider applies the same route rule and owns later changes,
 * so the first paint and the first render agree.
 */
(function () {
  try {
    var theme = localStorage.getItem('travelai_theme');
    var path = window.location.pathname;
    var realm =
      path === '/agency' || path.indexOf('/agency/') === 0
        ? 'agency'
        : path === '/admin' || path.indexOf('/admin/') === 0
          ? 'admin'
          : 'traveller';

    // The platform console is always dark; entering it must not overwrite the
    // traveller or agency preference.
    var isDark =
      realm === 'admin' ||
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);

    var root = document.documentElement;
    root.dataset.theme = realm;
    root.style.colorScheme = isDark ? 'dark' : 'light';
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  } catch (e) {}
})();
