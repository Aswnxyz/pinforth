# @pinforth/widget

The feedback widget that runs on a client's staging website. Guest reviewers
use it to pick an element on the page and report an issue into Pinforth.

## Installing it on a website

Add this to the website's `<head>`, **without `async` or `defer`**, so it reads
the review handoff before any client-side router changes the URL:

```html
<script src="https://<pinforth-web-origin>/widget/v1.js"></script>
```

It shows nothing to ordinary visitors. It only appears for a reviewer who
arrives through a Pinforth review link (`#pf_handoff=…`), and it only works on
the address set as the review round's environment URL.

Sites with a Content Security Policy must allow the Pinforth web origin in
`script-src` and the API origin in `connect-src`.

## Development

```sh
pnpm dev:api      # the API, on :4000
pnpm dev:widget   # rebuilds on change and serves a demo website on :5500
```

Add `http://127.0.0.1:5500` as an environment URL, create a review round and a
guest link, then open the link. Open it in a fresh tab: a handoff that only
changes the fragment of an already-open page doesn't reload the widget.

`pnpm build:widget` writes `dist/widget.js` and copies it to
`apps/web/public/widget/v1.js`, which the web app serves. The build fails if the
bundle grows past 30 KB gzipped. The API it talks to comes from
`NEXT_PUBLIC_API_URL`, the same variable the web app uses.
