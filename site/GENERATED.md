# This directory is built, not written

Everything in `site/` is the output of `npm run build` in `landing/`, committed
so that deploying is a `git pull` and nothing on the host has to run Node.

**Do not edit these files.** The next build overwrites them without asking. The
source is one directory over:

    landing/src/pages/       the pages
    landing/src/components/  the pieces they are built from
    landing/src/styles/      the tokens, which are docs/brand.md

See `landing/README.md`.
