# data/ — Server Data Directory

This folder shows the expected structure of the `data/` directory on the server.
The real `data/` is gitignored — it lives as a Docker volume and is never committed.

```
data/
├── maps/
│   └── swordcoast/
│       └── sword_coast.jpg        served at /maps/swordcoast/sword_coast.jpg
│
├── portraits/
│   └── {charId}/
│       └── portrait.jpg           served at /portraits/{charId}/portrait.jpg
│
├── characters.json
├── relationships.json
├── locations.json
├── events.json
├── mysteries.json
├── mapPins.json
├── factions.json
└── deletedDefaults.json
```

## Deploying data to a new server

```bash
scp -r ./data/ root@YOUR_VPS:/opt/tiamat/
```
