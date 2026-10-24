# Radio that belongs in Aylmer, 2004

## Available now

The prototype panel accepts local MP3, M4A, OGG, WAV and other browser-supported audio files. Expand the bottom panel, choose files, then Écouter. One long programme recording can include music, announcers, adverts and station IDs in its original sequence. Multiple files play in the chosen order and wrap. Files are stored locally in IndexedDB when space permits, never uploaded. Clearing browser data removes them; another hostname/port/browser has a separate library. Large files may play for the session even when storage is full.

The underlying game already supported assets/radio/playlist.json; that path still works. The new picker removes the need to edit JSON. Audio runs at normal playback speed even though a game hour lasts a real minute. Pause/menu suspend playback; the deck resumes within a session. Exact audio position is not yet stored across browser reloads.

## Strongest recommendation

Use an **aircheck**: a recording of an actual broadcast, ideally Ottawa–Gatineau in summer 2004. That preserves the announcer, pacing, station IDs, song transitions, ads and incidental local references better than a shuffled music list. No authentic 2004 aircheck was obtained during this session; the working importer is not a claim that period content ships with it.

For a curated station, gather owned/downloadable music released by the current game date, period ads and idents, and genuine archived spoken audio. Record provenance and distinguish authentic recordings from newly written/recreated material. Program short station sequences rather than play synthesized loops. Start with one excellent station, then add others. Use appropriate permission/licensing for any audio bundled in a public release; a local file picker avoids redistributing the player's personal files.

## Services and sources checked, 18 September 2026

- Spotify: its developer policy explicitly says not to create games. Do not build the game radio on Spotify. https://developer.spotify.com/policy
- Apple Music / MusicKit: web playback exists, with subscriber authorization and developer setup. This is technically an option to investigate, not clearance to bundle or synchronize music in a game. It also does not supply the local 2004 advertising/announcer atmosphere. https://developer.apple.com/musickit/
- Library and Archives Canada has a CHEZ-FM fonds with programme recordings, but the catalog covers 1981–1998, **not 2004**, and is not an immediate MP3 service. Useful research lead only. https://recherche-collection-search.bac-lac.gc.ca/eng/home/record?app=FonAndCol&ecopy=&idnumber=189952
- McMaster's Pirate Archive has a dated March 31, 2004 advertising entry listing Ottawa Sears radio spots. A catalog lead, not an acquired audio file or reuse permission. https://library.mcmaster.ca/archives/pirate-archive/2004033109
- Modern live streams play present-day music/news/ads. They are easy to mismatch with the summer setting, depend on network/CORS, and do not solve historical authenticity.

## Next implementation

1. Import one real programme or a representative local playlist and listen in the Ranger while driving, pausing and changing cars.
2. Level-match music and speech; add a restrained in-car speaker EQ, a limiter and conversation ducking. Avoid heavy radio distortion on already-compressed broadcasts.
3. Add seek/resume across sessions and independently advancing station schedules. Station music stays real-time; dated local news can be selected separately by the game date.
4. Build a manifest with file, title, artist, station, type (music/ident/ad/news), recording/release date, source and reuse status. Never let future releases leak into earlier days.
5. Verify period station names, frequencies and DJs before replacing fictional labels. Collect Thomas's remembered stations to set the editorial direction.
