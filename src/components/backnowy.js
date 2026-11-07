const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Mounts the Backnowy scroll-progress control.
 * @param {{ onBack?: () => void, label?: string, color?: string }} options
 * @returns {() => void} cleanup function
 */
export function mountBacknowy({ onBack, label = 'Back!', color = '#ff5a1f' } = {}) {
  const button = document.createElement('button');
  button.className = 'backnowy';
  button.type = 'button';
  button.setAttribute('aria-label', 'Volver arriba');
  button.setAttribute('aria-describedby', 'backnowy-progress');
  button.style.setProperty('--backnowy-color', color);
  button.innerHTML = '<svg class="backnowy__ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="backnowy__track" cx="24" cy="24" r="21"/><circle class="backnowy__progress" cx="24" cy="24" r="21"/></svg><svg class="backnowy__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg><span class="backnowy__tooltip" aria-hidden="true"></span><span id="backnowy-progress" class="backnowy__sr-only" aria-live="polite">Progreso de lectura: 0%</span>';
  button.querySelector('.backnowy__tooltip').textContent = label;
  document.body.append(button);

  const circle = button.querySelector('.backnowy__progress');
  const liveText = button.querySelector('.backnowy__sr-only');
  const circumference = 2 * Math.PI * 21;
  circle.style.strokeDasharray = `${circumference}`;

  let frame = 0;
  let lastAnnouncement = -1;
  let removeTooltipTimer;
  const reducedMotion = window.matchMedia(REDUCED_MOTION);

  function updateProgress() {
    frame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0
      ? Math.min(1, Math.max(0, window.scrollY / scrollable))
      : 0;
    circle.style.strokeDashoffset = `${circumference * (1 - progress)}`;
    button.classList.toggle('backnowy--scrolled', window.scrollY > 24);

    const percent = Math.round(progress * 100);
    const progressStep = percent === 100 ? 100 : Math.floor(percent / 10) * 10;
    if (progressStep !== lastAnnouncement) {
      liveText.textContent = `Progreso de lectura: ${percent}%`;
      lastAnnouncement = progressStep;
    }
  }

  function scheduleUpdate() {
    if (!frame) frame = window.requestAnimationFrame(updateProgress);
  }

  function backToTop() {
    clearTimeout(removeTooltipTimer);
    button.classList.add('backnowy--activated');
    if (onBack) onBack();
    else {
      liveText.textContent = label;
      liveText.setAttribute('role', 'status');
    }
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    removeTooltipTimer = window.setTimeout(() => button.classList.remove('backnowy--activated'), 1400);
  }

  button.addEventListener('click', backToTop);
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  updateProgress();

  return () => {
    clearTimeout(removeTooltipTimer);
    if (frame) window.cancelAnimationFrame(frame);
    button.removeEventListener('click', backToTop);
    window.removeEventListener('scroll', scheduleUpdate);
    window.removeEventListener('resize', scheduleUpdate);
    button.remove();
  };
}

