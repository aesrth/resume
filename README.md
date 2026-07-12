# tetikol.com

Personal site for **Serhat Tetikol, PhD** — a static site
(HTML + CSS + a little vanilla JS) hosted on GitHub Pages at
[tetikol.com](https://tetikol.com).

No build step, no framework. Edit the files, push, and the site updates.

The site is focused on **AI-driven drug discovery**: a concise homepage
highlighting that leadership, plus a weekly paper-review blog.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Homepage (hero, focus, experience, recognition, writing, contact) |
| `blog/index.html` | Blog listing — one card per post |
| `blog/welcome.html` | First post; also the template for new posts |
| `styles.css` | Styling, light/dark themes (shared by all pages) |
| `script.js` | Theme toggle + footer year |
| `CNAME` | Binds the site to `tetikol.com` (do not delete) |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Editing the homepage

Everything is in `index.html`, organized into numbered sections (Focus,
Experience, Recognition, Writing, Contact). Edit the text directly. The color
accent, fonts, and spacing are CSS variables at the top of `styles.css`.

## Adding a blog post

1. Copy `blog/welcome.html` to `blog/<slug>.html` (e.g. `blog/alphafold3.html`).
2. Edit the title, `<time>` date, tag, and body inside the `.post__body` block.
3. In `blog/index.html`, copy the `<li class="post-card">` block and paste a new
   one **at the top** of the `<ul class="post-list">` (newest first), pointing its
   link at your new file and updating the date, tag, title, and excerpt.

That's it — no build step. Commit and push, and the post is live.

## Publishing on GitHub Pages

1. Push this repo to GitHub (branch is fine).
2. Repo **Settings → Pages**.
3. Under **Build and deployment**, set **Source: Deploy from a branch**, pick
   the branch and `/ (root)` folder, then **Save**.
4. Under **Custom domain**, enter `tetikol.com` and Save. GitHub reads the
   `CNAME` file automatically; the domain will show there once DNS resolves.
5. Tick **Enforce HTTPS** once the certificate is issued (can take a few minutes
   to an hour).

## Keeping the domain (DNS)

Your domain is currently pointed at WordPress.com. To move it to GitHub Pages,
update the DNS records **at your domain registrar** (wherever `tetikol.com` is
registered — this may be WordPress.com/Automattic if you bought it through them):

**Apex domain (`tetikol.com`)** — four `A` records pointing at GitHub Pages:

```
A   @   185.199.108.153
A   @   185.199.109.153
A   @   185.199.110.153
A   @   185.199.111.153
```

(Optionally add the matching `AAAA`/IPv6 records: `2606:50c0:8000::153`,
`2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.)

**`www` subdomain** — a `CNAME` record:

```
CNAME   www   <your-github-username>.github.io.
```

Remove the old WordPress.com A/CNAME records so they don't conflict. DNS
propagation can take anywhere from a few minutes to 48 hours.

> **Note:** If the domain was registered *through WordPress.com*, you keep the
> registration there and only change the DNS records — you do **not** need to
> transfer the registrar. If you'd rather move the registrar too, that's a
> separate optional step.

Full reference:
<https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site>
