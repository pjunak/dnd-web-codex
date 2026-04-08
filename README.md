# Tiamat — D&D Campaign Codex

A collaborative wiki for the "O Barvách Draků" D&D campaign. Players and DM can browse character profiles, locations, events, factions, and interactive mind maps. Anyone with the edit password can add or modify content through the web interface — changes appear for all players within ~30 seconds.

See [CLAUDE.md](CLAUDE.md) for the full architecture reference.

---

## Deployment (VPS with Docker)

Data is stored in `./data/` as JSON files — no external database.

1. Make sure `docker` and `docker-compose` are installed on the server.
2. Open `docker-compose.yml` and **change the password** on the `EDIT_PASSWORD` line.
3. In the project directory, run:
   ```bash
   docker-compose up -d --build
   ```

The app runs on port `3000`. For public access, put Nginx or Traefik in front of it.

---

## Editing Content

Click the pencil icon (✏) in the sidebar. Enter the admin password you set in `docker-compose.yml`. This unlocks the full CRUD interface for characters, locations, events, mysteries, factions, and portrait uploads. Do not edit source files directly — everything is managed through the web UI.
