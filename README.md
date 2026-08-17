# Garden on the Grave — web radio

The audio player for *Garden on the Grave*, a site-specific performance by WAUHAUS.
Listeners open a link on their own phone and hear the piece through their own headphones
while walking in a cemetery.

Premiered 2025 at Assistens Cemetery, Copenhagen. Riga, Great Cemetery, 2026.

This repository holds two things: **the source of the player**, and **a mirror of the audio**
under Releases, which the player falls back to when its primary host does not answer.

---

## The source of truth lives in Dropbox

    Dropbox/GARDEN ON THE GRAVE/RADIO/gotg-src/

That is the copy that gets edited. **This repository is a backup and a history**, updated at
milestones rather than on every deploy. If the two ever disagree, Dropbox is right — but check
the dates before assuming, because that is exactly the kind of thing that rots quietly.

## Building and deploying

    ./build.sh

One source file is copied into four folders. Each copy works out which language it is from the
address it was opened at, so they cannot drift apart.

    gotg-riga/        both languages, English interface   ->  garden.wauhaus.fi/
    gotg-riga/en/     English only                        ->  garden.wauhaus.fi/en/
    gotg-riga/lv/     Latvian only                        ->  garden.wauhaus.fi/lv/
    gotg-riga/lv-ad/  Latvian with audio description      ->  garden.wauhaus.fi/lv-ad/

Then drag the whole `gotg-riga` folder onto the Cloudflare Pages project `gotg-992`.
Not the files, the folder.

## How it works

Playback is **scheduled**, not on demand. Every listener who opens the page during a broadcast
window hears the same moment of the piece, so somebody arriving late joins where the group
already is rather than starting from the beginning. Seeking is blocked, in the page and from
the operating system's own controls.

Audio comes from `wauhausmedia.com`, a Cloudflare R2 bucket behind its own domain, with the
Releases here as a second source. If the first fails the player moves to the second on its own.

A dropout is survivable by design. The media buffer runs minutes ahead, and if sound does stop
the player retries on a randomised interval until it succeeds, then jumps back to wherever the
broadcast has reached. Nobody should be able to fall out of the performance permanently.

The service worker keeps the page itself openable without a network. It deliberately does not
touch the audio.

---

## Things that will bite you

**`CONFIG.durationFallback` is the most dangerous number in the file.** It alone decides when a
broadcast window closes. If it is smaller than the real audio, the entire audience drops out on
the same second. Measure the file, do not estimate, and update this by hand every time the
audio changes.

**Never reuse an audio filename.** The old name may still be sitting in somebody's browser
cache and they will hear the previous edit. Every export gets a new name.

**A 200 from Cloudflare Pages proves nothing.** It serves the root page for any unknown path,
with `content-type: text/html`. Verify a deploy by checksum or content type, never by status
code.

**A fresh deploy can look stale for a minute.** The edge cache takes a moment. Check
`gotg-992.pages.dev` directly, which bypasses it, before concluding anything is wrong. Do not
redeploy.

**iOS grants permission to play per media element, and only through a user gesture.** This is
why automatic recovery reuses the existing element instead of building a new one. A new element
created by a timer can neither load nor start on an iPhone.
