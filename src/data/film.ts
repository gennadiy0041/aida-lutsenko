/**
 * The film: four chapters and the end credits.
 * Every statement comes from Aida's CV, her award certificates or the 7152.kz profile
 * (8 March 2024). No number appears here that is not in those sources.
 */
import type { ImageMetadata } from 'astro';
import type { L, ChapterId } from './copy';
import type { CameraMove } from './frames';

import minister from '../assets/awards/minister-2026.jpg';
import akimSko2025 from '../assets/awards/akim-sko-2025.jpg';
import akimEsil2024 from '../assets/awards/akim-esil-2024.jpg';
import akimSko2021 from '../assets/awards/akim-sko-2021.jpg';
import university from '../assets/awards/university-2026.jpg';
import enactus from '../assets/awards/enactus-top5-2026.jpg';

export interface Scene {
  /** Frame id (src/assets/frames/<id>.jpg) and the slate label shown until it exists. */
  frame: string;
  slate: string;
  move: CameraMove;
  /** Subtitles, one at a time. */
  lines: L[];
}

export interface Fact {
  label: L;
  value: L;
}

export interface Chapter {
  id: ChapterId;
  numeral: string;
  title: L;
  /** Screenplay scene heading. */
  slug: L;
  years: string;
  scenes: Scene[];
  facts: Fact[];
  link?: { href: string; label: L; hreflang?: string };
}

export const chapters: Chapter[] = [
  {
    id: 'quarry',
    numeral: 'I',
    title: { en: 'Quarry', ru: 'Карьер' },
    slug: { en: 'Ext. Stone quarry — North Kazakhstan', ru: 'Нат. Каменный карьер — Северный Казахстан' },
    years: '2018 — 2024',
    scenes: [
      {
        frame: 'f02',
        slate: '02',
        move: 'pan-right',
        lines: [
          { en: 'A stone quarry. A crew of 45. Almost all men.', ru: 'Каменный карьер. 45 человек. Почти одни мужчины.' },
          { en: 'The general director is not.', ru: 'Генеральный директор — она.' },
        ],
      },
      {
        frame: 'f03',
        slate: '03',
        move: 'push',
        lines: [
          { en: 'Stone in. Crushed stone out. Six years.', ru: 'На входе — камень. На выходе — щебень. Шесть лет.' },
          { en: 'The director, meanwhile, is writing a dissertation.', ru: 'А директор тем временем пишет диссертацию.' },
        ],
      },
    ],
    facts: [
      { label: { en: 'Role', ru: 'Роль' }, value: { en: 'General Director', ru: 'Генеральный директор' } },
      { label: { en: 'Company', ru: 'Компания' }, value: { en: 'Kazrosresurs LLP', ru: 'ТОО «Казросресурс»' } },
      { label: { en: 'Output', ru: 'Продукция' }, value: { en: 'Building stone, crushed stone', ru: 'Строительный камень, щебень' } },
      { label: { en: 'Years', ru: 'Годы' }, value: { en: '2018 — 2024', ru: '2018 — 2024' } },
    ],
    link: {
      href: 'https://www.7152.kz/news/3744549/v-sko-devuska-rukovodit-prakticeski-polnostu-muzskim-kollektivom',
      label: { en: 'Press: 7152.kz (in Russian)', ru: 'Пресса: 7152.kz' },
      hreflang: 'ru',
    },
  },
  {
    id: 'science',
    numeral: 'II',
    title: { en: 'Science', ru: 'Наука' },
    slug: { en: 'Int. Satbayev University — Almaty', ru: 'Инт. Satbayev University — Алматы' },
    years: '2019 —',
    scenes: [
      {
        frame: 'f04',
        slate: '04',
        move: 'tilt-up',
        lines: [
          { en: 'PhD, 2022. Day job at the time: a quarry.', ru: 'PhD, 2022. Диссертацию писала, не уходя из карьера.' },
          { en: '15+ publications, some in Scopus. Associate professor, 2023–2025.', ru: '15+ публикаций, часть — в Scopus. Доцент, 2023–2025.' },
        ],
      },
      {
        frame: 'f05',
        slate: '05',
        move: 'pan-left',
        lines: [
          { en: 'Now: nano-modified bitumen binders, for construction.', ru: 'Сейчас — наномодифицированные битумные вяжущие.' },
          { en: 'But a paper on a shelf builds nothing.', ru: 'Но статья на полке ничего не строит.' },
        ],
      },
    ],
    facts: [
      { label: { en: 'Degree', ru: 'Степень' }, value: { en: 'PhD, chemical technology of organic substances', ru: 'PhD, химическая технология органических веществ' } },
      { label: { en: 'University', ru: 'Университет' }, value: { en: 'Satbayev University, 2022', ru: 'Satbayev University, 2022' } },
      { label: { en: 'Post', ru: 'Должность' }, value: { en: 'Associate Professor, M. Kozybayev North Kazakhstan University, 2023 — 2025', ru: 'Доцент, СКУ им. М. Козыбаева, 2023 — 2025' } },
      { label: { en: 'Research', ru: 'Исследования' }, value: { en: 'Nano-modified bitumen binders for construction', ru: 'Наномодифицированные битумные вяжущие для строительства' } },
    ],
  },
  {
    id: 'commercialization',
    numeral: 'III',
    title: { en: 'Commercialization', ru: 'Коммерциализация' },
    slug: { en: 'Int. Kokshetau University — September 2025', ru: 'Инт. Кокшетауский университет — сентябрь 2025' },
    years: '2025 —',
    scenes: [
      {
        frame: 'f06',
        slate: '06',
        move: 'pull',
        lines: [
          { en: 'Science does not leave a university on its own.', ru: 'Наука сама из университета не выйдет.' },
          { en: 'The Commercialization Office. Hers since September 2025.', ru: 'Офис коммерциализации. С сентября 2025 года — её.' },
          { en: 'Science in. Partnerships out.', ru: 'На входе — наука. На выходе — партнёрства.' },
        ],
      },
      {
        frame: 'f07',
        slate: '07',
        move: 'pan-right',
        lines: [
          { en: 'Enactus Kazakhstan 2026: Top 5 Best Advisors.', ru: 'Enactus Kazakhstan 2026 — Top 5 Best Advisors.' },
          { en: 'Stone. Bitumen. Next material: code.', ru: 'Камень. Битум. Следующий материал — код.' },
        ],
      },
    ],
    facts: [
      { label: { en: 'Role', ru: 'Роль' }, value: { en: 'Director, Commercialization Office', ru: 'Директор Офиса коммерциализации' } },
      { label: { en: 'University', ru: 'Университет' }, value: { en: 'A. Myrzakhmetov Kokshetau University', ru: 'Кокшетауский университет им. А. Мырзахметова' } },
      { label: { en: 'Brief', ru: 'Задача' }, value: { en: 'Research into industry. Partnerships with companies', ru: 'Наука — в реальный сектор. Партнёрства с предприятиями' } },
      { label: { en: 'Recognition', ru: 'Признание' }, value: { en: 'Enactus Kazakhstan 2026, Top 5 Best Advisors', ru: 'Enactus Kazakhstan 2026, Top 5 Best Advisors' } },
    ],
  },
  {
    id: 'code',
    numeral: 'IV',
    title: { en: 'Code', ru: 'Код' },
    slug: { en: 'Int. Business Cup 2.0 — 24 hours on the clock', ru: 'Инт. Business Cup 2.0 — на таймере 24 часа' },
    years: '2026',
    scenes: [
      {
        frame: 'f08',
        slate: '08',
        move: 'push',
        lines: [
          { en: 'The clock starts. An MVP is due before it stops.', ru: 'Время пошло. MVP нужен раньше, чем оно выйдет.' },
          { en: 'She builds it with Gennadii Kozlov. Its name: Overrule.', ru: 'Вместе с Геннадием Козловым она успевает. Это Overrule.' },
          { en: 'It trains people to catch AI’s mistakes in work documents.', ru: 'Тренажёр: учит ловить ошибки ИИ в рабочих документах.' },
        ],
      },
      {
        frame: 'f09',
        slate: '09',
        move: 'pan-left',
        lines: [
          { en: 'Top 10 in the final. Next: IVL Cup 2026, application submitted.', ru: 'Топ-10 финала. Дальше — IVL Cup 2026: заявка подана.' },
          { en: 'She vibe-codes. This crew is almost all AI tools.', ru: 'Она вайб-кодит. В команде — почти одни ИИ-инструменты.' },
        ],
      },
    ],
    facts: [
      { label: { en: 'Role', ru: 'Роль' }, value: { en: 'Leads the project and its commercialization', ru: 'Ведёт проект и его коммерциализацию' } },
      { label: { en: 'Built at', ru: 'Где собран' }, value: { en: 'Business Cup 2.0 (Zimran × AIESEC)', ru: 'Business Cup 2.0 (Zimran × AIESEC)' } },
      { label: { en: 'Result', ru: 'Результат' }, value: { en: 'MVP in 24 hours. Top 10 in the final', ru: 'MVP за 24 часа. Топ-10 финала' } },
      { label: { en: 'Overrule’s headline', ru: 'Заголовок Overrule' }, value: { en: 'AI does the work. You get paid for the judgment.', ru: 'AI does the work. You get paid for the judgment.' } },
    ],
    link: {
      href: 'https://overrule-production.up.railway.app',
      label: { en: 'Now showing: Overrule', ru: 'Сейчас в прокате: Overrule' },
    },
  },
];

/** Order: portrait and landscape scans alternate, so the contact sheet keeps an even rhythm. */
export interface Award {
  id: string;
  image: ImageMetadata;
  title: L;
  from: L;
  year: string;
}

export const awards: Award[] = [
  {
    id: 'minister-2026',
    image: minister,
    title: { en: 'Certificate of Honour', ru: 'Почётная грамота (Құрмет грамотасы)' },
    from: {
      en: 'Minister of Science and Higher Education of Kazakhstan, Sayasat Nurbek',
      ru: 'Министр науки и высшего образования РК Саясат Нурбек',
    },
    year: '2026',
  },
  {
    id: 'akim-sko-2025',
    image: akimSko2025,
    title: { en: 'Letter of Gratitude', ru: 'Благодарность' },
    from: { en: 'Akim of North Kazakhstan Region', ru: 'Аким Северо-Казахстанской области' },
    year: '2025',
  },
  {
    id: 'enactus-top5-2026',
    image: enactus,
    title: { en: 'Top 5 Best Advisors', ru: 'Top 5 Best Advisors' },
    from: { en: 'Enactus Kazakhstan National Expo', ru: 'Enactus Kazakhstan National Expo' },
    year: '2026',
  },
  {
    id: 'akim-esil-2024',
    image: akimEsil2024,
    title: { en: 'Letter of Gratitude', ru: 'Благодарность' },
    from: { en: 'Akim of Esil District', ru: 'Аким Есильского района' },
    year: '2024',
  },
  {
    id: 'university-2026',
    image: university,
    title: { en: 'Certificate of Honour', ru: 'Почётная грамота' },
    from: { en: 'A. Myrzakhmetov Kokshetau University', ru: 'Кокшетауский университет им. А. Мырзахметова' },
    year: '2026',
  },
  {
    id: 'akim-sko-2021',
    image: akimSko2021,
    title: { en: 'Certificate of Honour', ru: 'Почётная грамота' },
    from: { en: 'Akim of North Kazakhstan Region', ru: 'Аким Северо-Казахстанской области' },
    year: '2021',
  },
];

export const credits = {
  heading: { en: 'Credits', ru: 'Титры' } as L,
  roles: [
    { role: { en: 'Starring', ru: 'В главной роли' }, detail: { en: 'Aida Lutsenko, as herself', ru: 'Аида Луценко — играет саму себя' } },
    { role: { en: 'General Director', ru: 'Генеральный директор' }, detail: { en: 'Kazrosresurs LLP, 2018 — 2024', ru: 'ТОО «Казросресурс», 2018 — 2024' } },
    { role: { en: 'PhD', ru: 'PhD' }, detail: { en: 'Chemical technology of organic substances, Satbayev University, 2022', ru: 'Химическая технология органических веществ, Satbayev University, 2022' } },
    { role: { en: 'Associate Professor', ru: 'Доцент' }, detail: { en: 'M. Kozybayev North Kazakhstan University, 2023 — 2025', ru: 'СКУ им. М. Козыбаева, 2023 — 2025' } },
    { role: { en: 'Director, Commercialization Office', ru: 'Директор Офиса коммерциализации' }, detail: { en: 'A. Myrzakhmetov Kokshetau University, since September 2025', ru: 'Кокшетауский университет им. А. Мырзахметова, с сентября 2025 года' } },
    { role: { en: 'Project Lead', ru: 'Руководитель проекта' }, detail: { en: 'Overrule', ru: 'Overrule' } },
    {
      role: { en: 'Education', ru: 'Образование' },
      detail: [
        { en: 'BSc, Novosibirsk State Technical University, 2017', ru: 'Бакалавр, НГТУ (Новосибирск), 2017' },
        { en: 'MSc, M. Kozybayev North Kazakhstan University, 2019', ru: 'Магистр, СКУ им. М. Козыбаева, 2019' },
        { en: 'PhD, Satbayev University, 2022', ru: 'PhD, Satbayev University, 2022' },
      ],
    },
    { role: { en: 'Languages', ru: 'Языки' }, detail: { en: 'Kazakh, Russian, English', ru: 'Казахский, русский, английский' } },
  ] as { role: L; detail: L | L[] }[],
  awardsHeading: { en: 'Awards', ru: 'Награды' } as L,
  awardsHint: { en: 'Select a scan to open it', ru: 'Нажмите на скан, чтобы открыть' } as L,
  pressHeading: { en: 'Press', ru: 'Пресса' } as L,
  press: {
    href: 'https://www.7152.kz/news/3744549/v-sko-devuska-rukovodit-prakticeski-polnostu-muzskim-kollektivom',
    outlet: '7152.kz',
    date: { en: '8 March 2024', ru: '8 марта 2024' } as L,
    title: {
      en: 'In North Kazakhstan, a young woman leads an almost entirely male team',
      ru: 'В СКО девушка руководит практически полностью мужским коллективом',
    } as L,
  },
  contactHeading: { en: 'Contact', ru: 'Контакты' } as L,
  closing: { en: 'End of prologue.', ru: 'Конец пролога.' } as L,
  closingSub: { en: 'Still in production', ru: 'Съёмки продолжаются' } as L,
  moodboard: { en: 'Moodboard', ru: 'Мудборд' } as L,
  again: { en: 'Play again', ru: 'Сначала' } as L,
  newTab: { en: ' (opens in a new tab)', ru: ' (откроется в новой вкладке)' } as L,
  close: { en: 'Close', ru: 'Закрыть' } as L,
};
