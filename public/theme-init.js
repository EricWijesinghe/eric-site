// Runs before first paint (classic, blocking, tiny) so the stored theme never flashes.
// Dark is the default; a stored choice from the toggle wins.
(function () {
  var theme = 'dark';
  try {
    if (localStorage.getItem('theme') === 'light') theme = 'light';
  } catch (e) {
    /* storage blocked: keep the default */
  }
  document.documentElement.dataset.theme = theme;
  // Lets CSS lay out JS-only controls (the phone menu) from the first paint, with no jump.
  document.documentElement.classList.add('js');
})();
