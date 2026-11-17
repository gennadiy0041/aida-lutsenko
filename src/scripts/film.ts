/**
 * Scroll behaviour of the film.
 * Without motion (prefers-reduced-motion) nothing here animates and the heavy libraries
 * are never downloaded: the page is simply there.
 */
const root = document.documentElement;
const motion = root.classList.contains('motion');

/* ---------- the fixed line: shown after the opening titles, names the current chapter ---------- */
const hero = document.querySelector<HTMLElement>('[data-titles]');
const hudChapter = document.querySelector<HTMLElement>('[data-hud-chapter]');

if (hero && 'IntersectionObserver' in window) {
  new IntersectionObserver(([e]) => root.classList.toggle('past-titles', !e.isIntersecting), {
    rootMargin: '-35% 0px 0px 0px',
  }).observe(hero);
}

// the running head comes back when the reader scrolls up, and leaves when the film plays on
let anchorY = window.scrollY;
let ticking = false;
const progressBar = document.querySelector<HTMLElement>('.progress__bar');
const paintProgress = (y: number) => {
  if (!progressBar) return;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, y / max)).toFixed(4) : 0})`;
};
window.addEventListener(
  'scroll',
  () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      paintProgress(y);
      const shown = root.classList.contains('hud-on');
      // the anchor follows the scroll while it keeps its direction; a turn is measured from it
      if (shown ? y < anchorY : y > anchorY) anchorY = y;
      else if (!shown && anchorY - y > 24) {
        root.classList.add('hud-on');
        anchorY = y;
      } else if (shown && y - anchorY > 12) {
        root.classList.remove('hud-on');
        anchorY = y;
      }
    });
  },
  { passive: true },
);

const chapterLabel = (el: Element) => {
  const numeral = el.getAttribute('data-chapter') ?? '';
  const lang = root.lang === 'ru' ? 'ru' : 'en';
  const title = el.querySelector(`.ch__title > [data-l="${lang}"]`)?.textContent ?? '';
  return `${numeral} — ${title}`;
};
let current: Element | null = null;
const paintChapter = () => {
  if (hudChapter) hudChapter.textContent = current ? chapterLabel(current) : '';
};
if (hudChapter && 'IntersectionObserver' in window) {
  const all = Array.from(document.querySelectorAll('.ch'));
  const live = new Set<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) live.add(e.target);
        else live.delete(e.target);
      }
      current = all.find((c) => live.has(c)) ?? null;
      paintChapter();
    },
    { rootMargin: '-45% 0px -45% 0px' },
  );
  all.forEach((ch) => io.observe(ch));
  document.addEventListener('langchange', paintChapter);
}

/* ---------- the projector: frames held in the letterbox, subtitles change with the scroll ---------- */
const reels = Array.from(document.querySelectorAll<HTMLElement>('[data-reel]')).map((el) => ({
  el,
  beats: Number(el.style.getPropertyValue('--beats')) || 1,
  subs: Array.from(el.querySelectorAll<HTMLElement>('[data-beat]')),
  scenes: Array.from(el.querySelectorAll<HTMLElement>('[data-scene]')),
  count: el.querySelector<HTMLElement>('[data-count]'),
  beat: 0,
}));

const roomy = window.matchMedia('(min-height: 420px)');

if (motion && reels.length && roomy.matches && CSS.supports('height', '100svh')) {
  root.classList.add('reel');

  const update = () => {
    const vh = window.innerHeight;
    for (const r of reels) {
      const rect = r.el.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > 2 * vh) continue;
      const range = rect.height - vh;
      const p = range > 0 ? Math.min(0.9999, Math.max(0, -rect.top / range)) : 0;
      const beat = Math.floor(p * r.beats);
      if (beat === r.beat) continue;
      r.beat = beat;
      const active = r.subs.find((s) => Number(s.dataset.beat) === beat);
      r.subs.forEach((s) => s.classList.toggle('is-on', s === active));
      r.scenes.forEach((sc) => sc.classList.toggle('is-on', !!active && sc.contains(active)));
      if (r.count) r.count.textContent = String(beat + 1).padStart(2, '0');
    }
  };

  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // every height here is in viewport units, so a resize or a rotation would throw the reader
  // into another chapter: remember the part under the top edge and how far through it we are
  const parts = Array.from(
    document.querySelectorAll<HTMLElement>('[data-titles], .ch__card, .ch__reel, .ch__end, .cr'),
  );
  let place: { el: HTMLElement; f: number } | null = null;
  const remember = () => {
    for (const el of parts) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 1) {
        place = { el, f: r.height > 0 ? Math.min(1, Math.max(0, -r.top / r.height)) : 0 };
        return;
      }
    }
  };
  window.addEventListener('scroll', remember, { passive: true });
  let lastW = window.innerWidth;
  window.addEventListener('resize', () => {
    // the mobile address bar changes the height only: that is not a new shape
    if (window.innerWidth === lastW) return onScroll();
    lastW = window.innerWidth;
    const p = place;
    if (p) {
      const r = p.el.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.top + p.f * r.height, behavior: 'instant' as ScrollBehavior });
    }
    onScroll();
  });

  // the page just got taller: a link straight to a chapter has to land again
  if (location.hash.length > 1) {
    let target: HTMLElement | null = null;
    try {
      target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    } catch {
      /* a malformed hash is not a reason to stop */
    }
    target?.scrollIntoView();
  }

  // classes are written above; geometry is read once, after the browser has laid the page out
  requestAnimationFrame(() => {
    update();
    remember();
    paintProgress(window.scrollY);
  });
}

/* ---------- reveals ---------- */
if (motion && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
  root.classList.add('io');
}

/* ---------- smooth scroll and scroll-driven camera: Lenis + GSAP ---------- */
async function startMotion() {
  const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
    import('lenis'),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    const lenis = new Lenis({ anchors: true, lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    const onLightbox = (e: Event) => ((e as CustomEvent<boolean>).detail ? lenis.stop() : lenis.start());
    document.addEventListener('lightbox', onLightbox);

    // the opening title drifts and dims as the first chapter arrives
    const title = document.querySelector('[data-titles-name]');
    if (title && hero) {
      gsap.to(title, {
        yPercent: -14,
        opacity: 0.25,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom 30%', scrub: true },
      });
    }

    return () => {
      document.removeEventListener('lightbox', onLightbox);
      gsap.ticker.remove(raf);
      lenis.destroy();
    };
  });

  // wide screens: the camera answers the scroll. In the projector every frame pushes in
  // slowly for as long as its reel is on screen; elsewhere the frame drifts like a crane move.
  mm.add('(prefers-reduced-motion: no-preference) and (min-width: 768px)', () => {
    const projector = root.classList.contains('reel') && !!document.querySelector('.film--v1');
    gsap.utils.toArray<HTMLElement>('.ch__frame .gate__pic, .cr__frame .gate__pic').forEach((pic) => {
      const reel = projector ? pic.closest<HTMLElement>('[data-reel]') : null;
      if (reel) {
        gsap.fromTo(
          pic,
          { scale: 1 },
          {
            scale: 1.07,
            ease: 'none',
            scrollTrigger: { trigger: reel, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
          },
        );
      } else {
        gsap.fromTo(
          pic,
          { yPercent: -2.6, scale: 1.06 },
          {
            yPercent: 2.6,
            scale: 1.06,
            ease: 'none',
            scrollTrigger: { trigger: pic.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
          },
        );
      }
    });
  });

  document.fonts.ready.then(() => ScrollTrigger.refresh());
}

// Smooth scrolling and the scroll-driven camera are for screens with a mouse or trackpad.
// A phone scrolls natively and smoothly already, and keeps its processor for the pictures.
const desk = window.matchMedia('(hover: hover) and (pointer: fine)');

if (motion && desk.matches) {
  // let the first screen paint before the libraries arrive
  const kick = () => void startMotion();
  if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 1500 });
  else setTimeout(kick, 300);
}
