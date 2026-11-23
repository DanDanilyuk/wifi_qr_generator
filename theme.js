// Loaded in <head> without defer so the saved (or system) theme is applied
// before the first paint. Storage can be blocked, hence the try/catch.
(function () {
  let saved = null;

  try {
    saved = localStorage.getItem('theme');
  } catch {
    saved = null;
  }

  const dark = saved
    ? saved === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;

  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
