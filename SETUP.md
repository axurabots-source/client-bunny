# Obscura integration — setup guide (Docker-free / Render Native)

> This version avoids Docker entirely. If you'd rather use Docker, the
> `Dockerfile.obscura` and `entrypoint.sh` in this folder still work the
> same way — just skip to a Docker host instead of Render Native.

This replaces the Chromium browser that `gosom/google-maps-scraper` normally
launches with a connection to Obscura's CDP (Chrome DevTools Protocol)
server. It touches exactly one function (`newBrowser` in
`adapters/fetchers/jshttp/jshttp.go` inside the `scrapemate` library), behind
an `OBSCURA_CDP_URL` environment variable. If that variable is unset, the
code behaves exactly as before — this is an opt-in, reversible patch.

**Honest status:** the patch is syntactically valid Go (verified with
`gofmt`), and we proved against real Google Maps that Obscura itself renders
listings correctly with usable data (23 businesses, all fields intact, after
scrolling). What has **not** been tested yet is this patch wired end-to-end
with the real scraper — the sandbox this was written in has no network
access to Google or to the Go module proxy, so step 6 below (your own local
test) is the first real end-to-end run.

---

## 1. Fork scrapemate and apply the patch

```bash
# On GitHub: fork https://github.com/gosom/scrapemate to your account
git clone https://github.com/YOUR_USERNAME/scrapemate.git
cd scrapemate
git apply /path/to/jshttp-obscura.patch
git commit -am "Add Obscura CDP support via OBSCURA_CDP_URL"
git push
```

## 2. Fork google-maps-scraper and point it at your patched scrapemate

```bash
# On GitHub: fork https://github.com/gosom/google-maps-scraper to your account
git clone https://github.com/YOUR_USERNAME/google-maps-scraper.git
cd google-maps-scraper
```

Edit `go.mod` and add this line at the bottom (adjust the version/commit as
needed — a branch name works too during testing):

```
replace github.com/gosom/scrapemate => github.com/YOUR_USERNAME/scrapemate v1.4.0-obscura
```

If `go mod edit -replace` is easier for you:

```bash
go mod edit -replace github.com/gosom/scrapemate=github.com/YOUR_USERNAME/scrapemate@main
go mod tidy
git commit -am "Use patched scrapemate fork with Obscura support"
git push
```

## 3. Local test build — no Docker

You need Go 1.24+ installed (`go.mod` uses newer directives than 1.22).

```bash
git clone https://github.com/YOUR_USERNAME/google-maps-scraper.git
cd google-maps-scraper
go build -o google-maps-scraper .

# grab the obscura binary (same release you already tested with)
curl -sL -o obscura.tar.gz \
  https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz
tar xzf obscura.tar.gz   # extracts ./obscura

cp /path/to/start.sh .
chmod +x start.sh google-maps-scraper obscura
mkdir -p gmapsdata

PORT=8080 ./start.sh
```

You should see `[start] obscura is ready` then the scraper's normal startup
logs. Test it exactly as in step 6 below, against `http://localhost:8080`.

## 4. Deploy to Render — Native Environment (no Docker)

In the Render dashboard: **New → Web Service → connect your forked
`google-maps-scraper` repo** and choose **Environment: Go** (not Docker).
Then set:

| Setting | Value |
|---|---|
| Build Command | `go build -o google-maps-scraper . && curl -sL -o obscura.tar.gz https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz && tar xzf obscura.tar.gz && chmod +x obscura start.sh` |
| Start Command | `./start.sh` |
| Instance type | At least Starter (512 MB free tier may be tight once real traffic/scraping load hits — see note below) |

**Note on RAM:** Obscura itself only needs ~30 MB, far less than Chromium's
200+ MB, so Render's free 512 MB plan has a much better chance of working
now than it did with the original Chromium-based image. It's still not
guaranteed — the scraper's own Go process and concurrent job handling add to
that — so treat free tier as "try it first," not "definitely fine," and
watch the Render metrics tab for memory pressure during a real job.

Copy `start.sh` into the root of your forked `google-maps-scraper` repo
before deploying (Render builds straight from the repo, there's no Docker
context to copy files into). Commit it alongside the `go.mod` replace
directive from step 2.

Set these **Environment Variables** in Render's dashboard (not in a
Dockerfile, since there isn't one):

```
OBSCURA_STEALTH=true
```

(`OBSCURA_CDP_URL` is set automatically by `start.sh` itself — don't set it
manually, it needs to know the port `start.sh` chose.)

Render injects its own `PORT` variable automatically; `start.sh` already
reads it and passes it to the scraper via `-addr`.

## 5. Watch the deploy logs

In Render's **Logs** tab you should see `[start] obscura is ready` followed
by the scraper's own startup lines. If you see `[start] obscura did not
become ready in time`, Obscura failed to start — check the lines just above
that for its own error output (common cause: wrong binary for the instance
architecture, or insufficient RAM on a too-small plan).

## 6. Test for real — this is the step that actually proves it works

Replace `127.0.0.1:8080` with your Render service's URL once deployed.

```bash
curl -X POST http://127.0.0.1:8080/api/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-dentists-lahore",
    "data": ["dentists in lahore"],
    "max_depth": 5
  }'
```

Poll the job status and, once complete, check the results file the same way
you did with the original image. Compare: do you get the same style of
structured output (name, phone, rating, address) that the original
Chromium-based image gave you? If a field is consistently missing or
malformed, that tells us the CDP connection works but some Chromium-specific
assumption elsewhere in `gmaps/job.go` needs adjusting — report back what's
missing and we'll patch further.

## Rollback

If anything misbehaves:
- Change the Render **Start Command** back to `./google-maps-scraper -web
  -data-folder ./gmapsdata` (skipping `start.sh`) — without `OBSCURA_CDP_URL`
  set, the patched binary falls back to launching real Chromium exactly like
  the original, unpatched version. Note: without Chromium installed on a
  Native-Environment Render instance this fallback won't actually launch a
  browser — it's meant as a quick sanity check that the Obscura path is what
  changed, not a production fallback. For a real Chromium fallback, go back
  to the original `gosom/google-maps-scraper:v1.18.1` Docker image on a
  Docker host instead.

## Known unknowns to watch for in your test

- **Context-level `Proxy` option**: with `ConnectOverCDP`, Playwright's
  per-context proxy setting may not apply the same way it does when
  Playwright itself launches the browser. If you use `--socials` or a proxy
  pool, verify requests are actually going through the proxy.
- **Obscura's own flags** (`--stealth`, `--proxy`) are configured on the
  `obscura serve` process in `entrypoint.sh`/compose `environment`, not on
  the scraper side — the old `--no-sandbox` etc. Chromium launch args no
  longer apply and are silently ignored on the Obscura path.
- Only `dentists in lahore` has been verified against real Obscura output
  (manually, outside this patch). Test 2–3 other categories before trusting
  this in production.
