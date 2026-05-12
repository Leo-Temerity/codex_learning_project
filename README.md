# Pomodoro Dashboard

A static Pomodoro dashboard with configurable focus rounds, persistent timer settings, completion sound, optional browser notifications, and a priority board for adding, finishing, restoring, and permanently archiving tasks.

## Dependencies

This project has no build step and no external package dependencies. It uses plain HTML, CSS, and JavaScript.

Required:

- A modern browser such as Chrome, Safari, Firefox, or Edge

Optional:

- Python 3, only if you want to serve the project from `localhost`

Browser APIs used:

- `localStorage` for saving timer settings and tasks
- Web Audio API for the completion sound
- Notifications API for optional browser alerts

## Run Locally

You can open the app directly:

1. Open `index.html` in a browser.

For browser notifications, serve the folder from localhost instead:

```sh
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000/
```

## Project Files

- `index.html` - app markup
- `styles.css` - dashboard layout and visual styling
- `app.js` - timer, priority board, persistence, audio, and notification behavior
