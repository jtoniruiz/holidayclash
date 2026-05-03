# HolidayClash

> Find clean weeks across global teams. Compare public holidays from 100+ countries side-by-side.

**Live site:** [holidayclash.com](https://holidayclash.com/)

## What it is

HolidayClash is a free, single-page web tool that helps distributed teams plan around public holidays across multiple countries. It detects:

- **Clash days** — when two or more selected countries are simultaneously off
- **Long-weekend triggers** — holidays adjacent to weekends that create extended breaks
- **Clean weeks** — ISO weeks of the year with no holiday in any selected country (best for launches, sprints, training)

## How it works

- **Frontend:** Plain HTML, CSS and JavaScript — no build step, no framework dependencies.
- **Data source:** [Nager.Date](https://date.nager.at/), an open-source public holiday API for 100+ countries.
- **Hosting:** Cloudflare Pages (free tier).

## Local development

This site has zero build steps. To preview locally, just open `index.html` in a browser, or use any simple static server:

```bash
# Python 3
python3 -m http.server 8000

# Node
npx serve .
```

Then open `http://localhost:8000`.

## File structure

```
.
├── index.html       — landing page + tool
├── style.css        — all styles
├── script.js        — tool logic (API calls + render)
├── about.html       — about page
├── privacy.html     — privacy policy
└── README.md        — this file
```

## License

The code in this repository is the property of the project owner. Holiday data is provided by Nager.Date under their respective license — please refer to their site.
