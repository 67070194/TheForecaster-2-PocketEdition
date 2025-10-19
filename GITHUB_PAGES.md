GitHub Pages Setup (Frontend)

- Live URL pattern: `https://<user>.github.io/TheForecaster-2-PocketEdition/`
- All routes work under `/TheForecaster-2-PocketEdition/` (e.g., `/dashboard`, `/docs`).

How it works
- React Router uses `basename` from `import.meta.env.BASE_URL`.
- Vite sets `base` to `/TheForecaster-2-PocketEdition/` on GitHub Actions builds.
- The workflow copies `index.html` to `404.html` so client‑side routes work on refresh.

Enable Pages
- Settings → Pages: Source = “Deploy from a branch”, Branch = `gh-pages`, Folder = `/`.
- If an old Pages setup is broken, disable then re‑enable, and re‑run the workflow.

Backend URLs (production)
- Set repo Variables (Settings → Secrets and variables → Variables):
  - `VITE_API_BASE` = `https://your-backend.example.com`
  - `VITE_FW_BASE` (optional) for firmware file base, otherwise uses `VITE_API_BASE`

Local development
- Run the full stack with Docker Desktop:
- `docker-start.cmd` (or `docker compose up -d`) → web at `http://localhost:8080`, API at `http://localhost:3001`.
- `start-all.cmd` → start Docker, then open Quick Tunnel and auto-open dashboard with `?api`/`?fw`.
- Or run separately:
  - `cd server && npm install && npm run dev`
  - `cd website && npm install && npm run dev`
