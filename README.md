# Aida Lutsenko — a true story in four chapters

Personal site of Aida Lutsenko, built as a short film: opening titles, four chapters, end credits.

Live: https://aida-lutsenko.up.railway.app · moodboard: https://aida-lutsenko.up.railway.app/moodboard

## How it is made

- **Astro** (static output), **Tailwind CSS 4**, **GSAP** + ScrollTrigger and **Lenis** (loaded after the first paint, and only when motion is welcome).
- Every picture is a 2.39:1 frame: graded masters in `src/assets/frames`, delivered as AVIF / WebP by `astro:assets`.
- **The projector.** With motion on, each chapter's frame is held in the letterbox (`position: sticky`) while the subtitles change with the scroll. With `prefers-reduced-motion` nothing moves: the same markup reads top to bottom as plain content.
- English by default, Russian by a switch. Both languages are in the HTML; CSS shows the one that matches `<html lang>`.
- Served on Railway by Caddy (`Caddyfile`): immutable caching for hashed assets, real 404s, precompressed Brotli.

## Where things live

| What | Where |
| --- | --- |
| The script of the film (chapters, subtitles, credits, awards) | `src/data/film.ts` |
| Names, titles, meta | `src/data/copy.ts` |
| Typographic pass (non-breaking spaces) | `src/data/typo.ts` |
| Frames: which picture, crop focus, camera move, alt text | `src/data/frames.ts`, files in `src/assets/frames/` |
| Moodboard plates and captions | `src/data/moodboard.ts`, files in `src/assets/stills/` |
| Opening titles | `src/components/film/Titles.astro`, `src/styles/titles.css` |
| Chapters, credits, the projector | `src/components/film/*`, `src/styles/film.css`, `src/scripts/film.ts` |
| Award scans | `src/assets/awards/` |

A frame or plate without a file renders as a film-leader slate, so the site builds at any stage.

## Develop

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/ (+ .br / .gz sidecars)
npm test         # checks the built site in dist/
```

Requires Node.js 22.23.4 or newer.

## Tests

`npm test` inspects `dist/` and fails the build if the site ever contains private data (phone numbers, ID numbers, dates of birth, street addresses), a gradient, an emoji, a page without its Russian counterpart, a broken internal link or a missing link-preview picture.

## Privacy

Original photographs, the CV and other source documents are not part of this repository. Only graded, metadata-free pictures and the award scans meant for publication are committed.
