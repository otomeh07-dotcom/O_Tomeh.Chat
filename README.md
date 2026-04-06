# O_Tomeh.Chat

O_Tomeh.Chat is a static conversation website for GitHub Pages. The home screen is only an email gate. After entering an email, the app generates a fresh conversation link on the same page that you can open or share.

## What is included

- Minimal home screen with only an email form
- A fresh conversation link generated after each new login
- Shared conversation links in the `abc-defg-hij` format
- Browser video conversations with mute/camera controls
- Realtime participant list and conversation messages
- GitHub Actions workflow for GitHub Pages deployment

## Files

- `index.html`: the full app shell
- `styles.css`: landing page and room styling
- `app.js`: email gate, routing, WebRTC, realtime, and UI logic
- `config.js`: Supabase project settings
- `.github/workflows/deploy.yml`: GitHub Pages deployment workflow

## Supabase setup

1. Create a Supabase project.
2. Copy your project URL and anon key from `Settings -> API`.
3. Replace the placeholder values in `config.js`.
4. Set `publicBaseUrl` to your GitHub Pages URL so shared links work for other people.

Example:

```js
export const appConfig = {
  appName: "O_Tomeh.Chat",
  publicBaseUrl: "https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY_NAME/",
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY",
};
```

## GitHub publish flow

1. Create a new GitHub repository.
2. Upload these files to the repository root.
3. Push to the `main` branch.
4. In GitHub, open `Settings -> Pages`.
5. Set the source to `GitHub Actions`.
6. The included workflow will publish the site automatically after each push.

## Local testing

Run the site from a local HTTP server instead of opening the file directly.

Example with Node:

```bash
npm run dev
```

Or with Python:

```bash
python -m http.server 5500
```

## Important note

The current email gate does not prove that the person owns the email address. It only validates the email format locally in the browser and does not send anything. If you want real email ownership verification, you need magic links, one-time codes, or a separate verification API.

If you share links while running on `http://localhost:5500/`, other people cannot open them because `localhost` only points to your own computer. Use a public deployed URL in `publicBaseUrl` or publish the app first.
