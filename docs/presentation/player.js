const video = document.querySelector('#film');
const speed = document.querySelector('#speed');
const chapters = [...document.querySelectorAll('[data-time]')];
const status = document.querySelector('#status');

// Review exports use the same player. The normal URL always loads the final cut.
const cut = new URLSearchParams(location.search).get('cut');
if (cut && /^review-[1-9][0-9]*$/.test(cut)) {
  video.src = `output/${cut}.mp4`;
}

document.querySelector('#replay').addEventListener('click', async () => {
  video.currentTime = 0;
  try { await video.play(); } catch { status.hidden = false; status.textContent = 'Trykk på avspillingsknappen i videoen for å starte.'; }
});
speed.addEventListener('change', () => { video.playbackRate = Number(speed.value); });
for (const button of chapters) {
  button.addEventListener('click', () => {
    video.currentTime = Number(button.dataset.time);
    updateChapter();
  });
}
function updateChapter() {
  let current = chapters[0];
  for (const button of chapters) if (Number(button.dataset.time) <= video.currentTime + .02) current = button;
  for (const button of chapters) {
    if (button === current) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  }
}
video.addEventListener('timeupdate', updateChapter);
video.addEventListener('loadedmetadata', updateChapter);
video.addEventListener('error', () => {
  status.hidden = false;
  status.textContent = 'Filmen kunne ikke lastes. Kontroller at MP4-filen er ferdig eksportert.';
});
updateChapter();
