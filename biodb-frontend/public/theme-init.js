// Apply the stored theme before first paint (loaded synchronously from <head>).
try {
  var t = localStorage.getItem('helix-theme')
  var dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  if (dark) document.documentElement.classList.add('dark')
} catch (e) {}
