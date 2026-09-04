# OneDrive Vercel Index

OneDrive Vercel Index is a Next.js application that turns a directory in one Microsoft OneDrive account into a
read-only file browser. This repository contains the web interface, Microsoft Graph API integration, OAuth setup
wizard, Redis-backed token storage, file previews, downloads, search, localization, and optional password protection.

The current site defaults are defined in [`config/site.config.js`](config/site.config.js):

- Site title: `Spencer's OneDrive`
- Published OneDrive directory: `/public`
- Items per page: `100`
- Default language: English
- Supported languages: German, English, Spanish, Simplified Chinese, Hindi, Indonesian, Turkish, and Traditional Chinese

Change those values before deploying your own instance.

## What this project provides

- List and grid views for OneDrive folders
- Breadcrumb navigation, pagination, sorting, and search
- File and folder downloads
- Browser-generated ZIP archives for multiple files or complete folder trees
- Previews for images, Markdown, text, source code, PDF, Office, audio, video, EPUB, and `.url` files
- Raw file links and filename-friendly raw-link aliases
- Optional password protection for selected directory trees
- Redis-backed OAuth tokens, protected sessions, and request-rate counters
- Dark mode and eight interface languages
- Security headers configured through Next.js
- Vercel Analytics

When a OneDrive folder contains a file named `README.md`, the application renders that file beneath the folder listing.
The repository's own `README.md` documents the application and is unrelated to the files displayed from OneDrive.

## How it works

```text
Browser
  |
  | Next.js pages and /api requests
  v
Next.js server
  |-- Redis: OAuth tokens, password sessions, rate limits
  `-- Microsoft Graph: OneDrive metadata, search, thumbnails, downloads
```

Microsoft access and refresh tokens remain on the server. The browser talks to the API routes in this project, which
then call Microsoft Graph. Most downloads redirect to a short-lived Microsoft download URL. Small files requested with
`proxy=true` may be streamed through the application.

## Technology used in this repository

| Area                   | Implementation                               |
| ---------------------- | -------------------------------------------- |
| Framework              | Next.js 16 Pages Router and React 19         |
| Language               | TypeScript and JavaScript                    |
| Styling                | Tailwind CSS 4 and PostCSS                   |
| OneDrive API           | Microsoft Graph through Axios                |
| Persistent state       | Redis through `ioredis`                      |
| Data fetching          | SWR                                          |
| Authentication         | Microsoft OAuth 2.0 authorization-code flow  |
| Localization           | `next-i18next` and `i18next-cli`             |
| ZIP downloads          | JSZip in the browser                         |
| Deployment integration | Vercel Analytics and Vercel system variables |

## Repository layout

```text
.
|-- config/
|   |-- api.config.js          # Microsoft Graph, OAuth, and cache settings
|   `-- site.config.js         # Published folder and user-interface settings
|-- public/
|   |-- icons/                 # Site icons
|   |-- images/                # OAuth and error-page artwork
|   |-- locales/               # Translation JSON files
|   `-- players/               # External-player icons
|-- src/
|   |-- components/            # Browser, navigation, downloads, and previews
|   |-- pages/                 # Pages Router pages and API routes
|   |-- styles/                # Global and Markdown styles
|   |-- types/                 # OneDrive and i18n types
|   `-- utils/                 # OAuth, Redis, paths, previews, and data fetching
|-- .env.example               # Environment-variable template
|-- next.config.js             # Next.js, i18n, and response headers
|-- next-i18next.config.js     # Runtime locale configuration
|-- i18next.config.ts          # Translation extraction configuration
`-- package.json               # Dependencies and development commands
```

## Prerequisites

Before starting, prepare:

- Node.js 22 or newer
- npm; the lockfile was generated for npm 12
- A Microsoft account with OneDrive
- A Microsoft Entra application registration
- A writable Redis database
- A OneDrive directory to publish

Vercel is supported but not required. Any Node.js host that can reach Microsoft Graph and Redis can run the app.

## Setup

### 1. Choose the published OneDrive directory

The checked-in configuration exposes `/public`:

```js
// config/site.config.js
baseDirectory: '/public',
```

Create that folder in OneDrive or change `baseDirectory` to another absolute OneDrive path. All paths shown in the web
interface and in `protectedRoutes` are relative to this directory.

For example, with `baseDirectory: '/public'`:

| OneDrive location        | Site path         |
| ------------------------ | ----------------- |
| `/public`                | `/`               |
| `/public/Photos`         | `/Photos`         |
| `/public/Photos/Private` | `/Photos/Private` |

Using `baseDirectory: '/'` exposes the OneDrive root through the application. Do this only if every item intended to be
public is appropriately separated or protected.

### 2. Register an application with Microsoft

Create an app registration in the [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Open **Identity > Applications > App registrations**.
2. Create a registration for the Microsoft account types you intend to use.
3. Copy the **Application (client) ID**.
4. Under **Authentication**, add a **Web** redirect URI of exactly `http://localhost`.
5. Under **API permissions**, add delegated Microsoft Graph permissions for `User.Read` and `Files.Read.All`.
6. Under **Certificates & secrets**, create a client secret and copy its **Value**.

The project requests this scope in [`config/api.config.js`](config/api.config.js):

```text
user.read files.read.all offline_access
```

`offline_access` lets the application obtain a refresh token. Some work or school tenants require administrator
consent for `Files.Read.All`.

The default OAuth endpoint uses the `common` tenant. For a single-tenant application, replace `common` in `authApi` with
the tenant ID or tenant domain.

### 3. Configure Microsoft Graph

Edit [`config/api.config.js`](config/api.config.js) and set `clientId`:

```js
module.exports = {
  clientId: 'YOUR_APPLICATION_CLIENT_ID',
  redirectUri: 'http://localhost',
  authApi: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  driveApi: 'https://graph.microsoft.com/v1.0/me/drive',
  scope: 'user.read files.read.all offline_access',
  cacheControlHeader: 'max-age=0, s-maxage=60, stale-while-revalidate',
}
```

Keep the client secret out of this file. It is read from the server-only `CLIENT_SECRET` environment variable.

The default endpoints target Microsoft Graph's worldwide cloud. Other Microsoft cloud environments require matching
OAuth and Graph endpoints.

### 4. Configure the site

Edit [`config/site.config.js`](config/site.config.js).

| Setting             | Used for                                                          |
| ------------------- | ----------------------------------------------------------------- |
| `userPrincipalName` | Owner identity loaded from `NEXT_PUBLIC_USER_PRINCIPLE_NAME`      |
| `icon`              | Navigation icon under `public/`                                   |
| `kvPrefix`          | Namespace applied to every Redis key                              |
| `title`             | Page and navigation title                                         |
| `baseDirectory`     | OneDrive directory exposed by the site                            |
| `maxItems`          | Maximum items requested per Graph page                            |
| `googleFontSans`    | Main interface font                                               |
| `googleFontMono`    | Monospace font used for code and metadata                         |
| `googleFontLinks`   | Stylesheets loaded for the configured fonts                       |
| `footer`            | Trusted HTML rendered at the bottom of every page                 |
| `protectedRoutes`   | Site-relative paths that require passwords                        |
| `email`             | Optional navigation email URL, such as `mailto:owner@example.com` |
| `links`             | External navigation links and matching Font Awesome brand names   |
| `datetimeFormat`    | Day.js format for file modification times                         |

Remove the two sample `protectedRoutes` unless you create the corresponding folders and `.password` files.

Only put trusted HTML in `footer`; the component renders this value as HTML.

### 5. Configure environment variables

Copy the template for local development:

```bash
cp .env.example .env.local
```

Fill in the values:

```dotenv
CLIENT_SECRET=your-microsoft-client-secret-value
REDIS_URL=rediss://default:password@redis-host.example:6379
KV_PREFIX=ovi:local:your-instance:
OWNER_USER_ID=
NEXT_PUBLIC_USER_PRINCIPLE_NAME=owner@example.com
```

| Variable                          | Required          | Description                                                               |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `CLIENT_SECRET`                   | Yes               | Microsoft app client-secret value; server only                            |
| `REDIS_URL`                       | Yes               | Writable Redis connection URL used by `ioredis`                           |
| `KV_PREFIX`                       | Local/self-hosted | Unique namespace for this deployment's Redis keys                         |
| `NEXT_PUBLIC_USER_PRINCIPLE_NAME` | Yes               | Exact UPN/email of the OneDrive owner                                     |
| `OWNER_USER_ID`                   | No, recommended   | Immutable Microsoft Graph user ID used for owner verification             |
| `TRUST_PROXY`                     | No                | Trust `X-Forwarded-For` only when set to `true` behind a controlled proxy |

The spelling `PRINCIPLE` in `NEXT_PUBLIC_USER_PRINCIPLE_NAME` is intentional and matches the source code. Because its
name begins with `NEXT_PUBLIC_`, the value is not secret.

The app refuses to initialize OAuth unless `NEXT_PUBLIC_USER_PRINCIPLE_NAME` is set. If `OWNER_USER_ID` is also set, the
immutable ID is used for the actual owner comparison; otherwise the UPN is compared case-insensitively.

`KV_PREFIX` must be unique when Redis is shared by multiple installations or environments. On Vercel, the project can
fall back to `VERCEL_PROJECT_ID`, but an explicit value makes environment separation clearer.

### 6. Install and start the project

Install the dependencies recorded in `package-lock.json`:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Open <http://localhost:3000>. Until tokens are stored, the file browser redirects to `/oauth/step-1`.

To test a production build locally:

```bash
npm run build
npm run start
```

### 7. Complete the OAuth wizard

OAuth initialization has three pages under `src/pages/oauth/`:

1. **Preparations** displays the configured client ID, redirect URI, endpoints, and scope.
2. **Get authorisation code** opens Microsoft's authorization page.
3. **Store tokens** verifies the Microsoft account and saves the tokens in Redis.

During step 2, Microsoft redirects the browser to a URL beginning with `http://localhost/?code=...`. A connection error
at that address is expected because the redirect is used only to expose the authorization code. Copy the entire URL,
return to the wizard, and paste it into the provided field.

The application extracts the code, exchanges it on the server, loads the Microsoft profile, verifies the configured
owner, and stores the access and refresh tokens under `KV_PREFIX`.

Repeat initialization for every deployment that uses a different Redis database or key prefix.

## Password-protected folders

Protection is configured in two places:

1. Add the site-relative directory to `protectedRoutes` in `config/site.config.js`.
2. Create a plain-text file named `.password` inside that OneDrive directory.

Example:

```js
protectedRoutes: ['/Documents/Private'],
```

```text
OneDrive
`-- public
    `-- Documents
        `-- Private
            |-- .password
            `-- report.pdf
```

The contents of `.password` are the password. Leading and trailing whitespace is ignored, and the file must not exceed
4 KiB. The route and every descendant are protected. If protected routes are nested, the most specific matching route
is used.

Successful authentication creates a random server-side Redis session and an `HttpOnly`, `SameSite=Lax` cookie. The
session lasts 12 hours. The logout action revokes the protected sessions represented by the browser's cookies; it does
not disconnect the site owner's Microsoft account.

The API allows 10 password attempts per protected route and client address in 10 minutes. Search is limited to 30
requests per client address per minute. These counters require Redis command support, including `EVAL`.

## Deployment

### Vercel

1. Import this project into Vercel.
2. Add `CLIENT_SECRET`, `REDIS_URL`, `NEXT_PUBLIC_USER_PRINCIPLE_NAME`, and preferably `OWNER_USER_ID` and `KV_PREFIX`.
3. Deploy the project.
4. Open the deployed URL and complete the OAuth wizard.

Use different `KV_PREFIX` values when production and preview deployments share Redis. Otherwise they will share OAuth
tokens, password sessions, and rate-limit counters.

### Other Node.js hosts

1. Install Node.js 22 or newer.
2. Supply the environment variables to the server process.
3. Run `npm ci`, `npm run build`, and `npm run start`.
4. Put the app behind HTTPS for production use.
5. Complete the OAuth wizard for that deployment's Redis namespace.

Set `TRUST_PROXY=true` only if the application is behind a proxy you control and that proxy removes any client-supplied
forwarding headers before setting `X-Forwarded-For`. Vercel is detected automatically.

## API routes

The browser interface uses these Pages Router handlers:

| Route              | Methods       | Purpose                                                    |
| ------------------ | ------------- | ---------------------------------------------------------- |
| `/api`             | `GET`, `HEAD` | Return file metadata or paginated folder children          |
| `/api`             | `POST`        | Exchange and store the first OAuth authorization code      |
| `/api/auth`        | `GET`         | Report whether any protected-folder session is active      |
| `/api/auth`        | `POST`        | Verify a folder password and create a session              |
| `/api/auth`        | `DELETE`      | Revoke the browser's protected-folder sessions             |
| `/api/item`        | `GET`, `HEAD` | Return safe item metadata for a OneDrive item ID           |
| `/api/search`      | `GET`, `HEAD` | Search inside `baseDirectory` and filter protected results |
| `/api/raw`         | `GET`, `HEAD` | Redirect to or proxy file content                          |
| `/api/thumbnail`   | `GET`, `HEAD` | Redirect to a OneDrive thumbnail                           |
| `/api/name/[name]` | `GET`, `HEAD` | Filename-friendly alias of `/api/raw`                      |

The `.password` filename is hidden from listings, direct metadata requests, search results, raw downloads, and
thumbnail routes.

## Development commands

| Command                | Action                                          |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Start the Next.js development server            |
| `npm run build`        | Create a production build                       |
| `npm run start`        | Serve the production build                      |
| `npm run lint`         | Run ESLint across the repository                |
| `npm run typecheck`    | Check TypeScript without emitting files         |
| `npm run format`       | Format supported source and configuration files |
| `npm run format:check` | Check formatting without changing files         |
| `npm run check`        | Run lint, typecheck, format check, and build    |
| `npm run extract`      | Extract translation keys and update i18n types  |

Run the complete validation before deploying code changes:

```bash
npm run check
```

## Localization

Runtime locale settings live in [`next-i18next.config.js`](next-i18next.config.js). Translation files are stored under
`public/locales/<locale>/common.json`.

After adding or changing translatable strings, run:

```bash
npm run extract
```

Review the resulting translations before committing them. English is the extraction source; empty values in other
locale files require translation.

## Security and operational notes

- The OneDrive index is public by default. Only routes listed in `protectedRoutes` are password protected.
- `Files.Read.All` grants the application read access beyond `baseDirectory`; the directory boundary is enforced by
  this application's API code.
- Keep `CLIENT_SECRET`, `REDIS_URL`, OAuth tokens, and Redis backups private.
- Use TLS Redis URLs such as `rediss://` outside trusted private networks.
- Rotate the Microsoft client secret before it expires and update the deployment environment.
- Active content proxied through `/api/raw` is forced to download instead of rendering under the site's origin.
- Protected responses use private, non-cacheable response headers.
- The configured `footer` is operator-controlled HTML and must never contain untrusted input.
- Multi-file and folder ZIPs are assembled in the visitor's browser and can consume significant memory for large
  downloads.

## Troubleshooting

### The site redirects to the OAuth wizard

Redis does not contain a usable access or refresh token for the active `KV_PREFIX`. Confirm the environment variables
and complete the wizard again.

### OAuth initialization fails

Check all of the following:

- `clientId` contains the application/client ID, not an object ID.
- `CLIENT_SECRET` contains the secret value, not the secret ID.
- The Entra Web redirect URI exactly matches `http://localhost`.
- The app registration has delegated `User.Read` and `Files.Read.All` permissions.
- `NEXT_PUBLIC_USER_PRINCIPLE_NAME` matches the account used during sign-in.
- `OWNER_USER_ID`, when present, belongs to the same account.
- Redis is reachable and the credential can write keys.

### The app reports that token storage is unavailable

Verify `REDIS_URL` and `KV_PREFIX`. The Redis account must support `GET`, `SET`, `DEL`, `INCR`, `EXPIRE`, and `EVAL`.

### A protected folder does not ask for a password

Confirm that its path in `protectedRoutes` is relative to `baseDirectory`. Restart or redeploy after changing the site
configuration.

### Password authentication fails

Confirm that `.password` is inside the protected OneDrive folder, is plain text, is no larger than 4 KiB, and contains
the expected value. Allow time for OneDrive changes to become visible through Microsoft Graph.

### Search returns fewer results than expected

Search is restricted to `baseDirectory`, capped by `maxItems`, and filters `.password`, paths outside the configured
base directory, and protected results for which the current browser has no valid session.

### Preview or ZIP download problems

Not every browser supports every media codec or preview format. ZIP creation happens locally in the browser, so use a
direct file download for very large files or folders.
