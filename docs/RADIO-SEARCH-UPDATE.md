# Radio decisions and findings — 19 September 2026

This supersedes the outreach and clock-matching proposals in RADIO-ACQUISITION-PLAN.md and the older Gemini prompt.

Confirmed: personal research only, no distribution planned, **do not message anyone**. Prioritize CHEZ 106, English CBC, French CBC/Radio-Canada and Live 88.5's musical feel. Seek substantial period Canadian music, especially the Tragically Hip, and funny authentic period ads where appropriate. Broadcast times need not match the accelerated game clock. Search YouTube and RSS; watch for modern advertising inserted into old shows. If recordings cannot be found, tell Thomas so he can choose another approach.

Live 88.5 launched December 26, 2005, so it cannot supply actual summer-2004 broadcasts. Treat it as a musical reference unless Thomas explicitly chooses later audio. Source: https://en.wikipedia.org/wiki/CILV-FM ; contemporary December 2004 CRTC hearings discuss it as a proposed station: https://crtc.gc.ca/eng/transcripts/2004/tb1206.htm . Station-history links failed to open during this pass.

## Findings

- https://archive.org/details/wiretap is a public collection listing audio downloads and season-one episodes, with collection metadata dated July 3, 2004. https://fourble.co.uk/podcast/wiretap supplies audio links and an RSS wrapper. Strong CBC lead, not an off-air recording of the complete Ottawa station. Direct audio access through the web tool failed; playback and absence of modern ads remain unverified.
- https://podcasts.apple.com/ca/podcast/s1e07-broken-telephone/id1530859807?i=1000490387467 dates Broken Telephone to August 14, 2004. Useful episode cross-check; it doesn't establish that all redistributed files are unchanged.
- https://www.souverains.qc.ca/abla-farhoud is indexed as a 2004 Macadam tribus/Radio-Canada report. Opening it encountered a verification page; no audio verified. French lead only.
- No matching summer-2004 CHEZ full broadcast, French CBC full programme or funny ad set was verified in this bounded search. YouTube-targeted web searches did not produce a verified matching recording. This does not prove none exist.

## Next public-source work

Audit WireTap season-one media and dates first. Inspect RSS original dates versus reissue dates, enclosure URLs and all audio breaks for modern inserted ads/intros; retain unedited archival files where available. Search French programme names and CHEZ callsign variants directly on YouTube. Keep period ads with appropriate commercial programming rather than inserting them into CBC. CanCon is a strong editorial requirement; verify historical station-specific rules before asserting numerical quotas.

Updated Gemini prompt: outputs/Gemini-radio-public-search.txt in the parent workspace. Prepared for the user to run; no Gemini integration was available and it has not been submitted. No contacts messaged, purchases made or audio added to the game.


## Gemini report audit and earlier-date fallback — 19 September 2026

Thomas accepts strong authentic 2002–2003 audio, with 2004 still preferred. No outreach; clock mismatch accepted. Read RADIO-GEMINI-AUDIT.md: supplied report contains useful leads but unsupported playable labels, durations, prices and holdings claims. Preserve the report privately; do not promote its assertions to verified facts. No new suitable audio verified or acquired in this audit.


## Local radio recordings acquired — 22 September 2026

Thomas supplied Gemini's completed acquisition report. Independently checked /Users/thomaslever/.gemini/antigravity-ide/scratch/audio: all 15 reported MP3 files exist and ffprobe recognises their MP3 audio streams/durations. Detailed local verification: outputs/Radio-local-file-verification.json in the parent workspace. Original supplied report saved privately in references/radio/gemini-acquired-audio-report-2026-09-22.txt. These findings supersede earlier statements that no actual files had been acquired.

Key files: CHEZ 106.1 Ottawa - August 20, 2004 (37:33); CIWW Oldies 1310 Ottawa - August 19, 2004 (43:26); CKMF Montréal 2004 (31:45); two CBC WireTap episodes (27:04 and 22:16); CBC Mystery Project (28:21); Radio-Canada Macadam tribus / Abla Farhoud (11:23); Majic 100.3 2003 (2:13); Bud Light spot (1:04); six later/current Live 88.5 reference files. Dates and programme descriptions here come from filenames/supplied report, not independent auditory verification.

Verification limits: ffprobe confirms media structure and reported duration, not complete decode/playback, broadcast date, tracklist, Canadian-content qualification or absence of modern ads. A 32kbps mono encoding cannot by itself prove a 2004 encoding date or an ad-free original. Bud Light's claimed CHEZ rotation remains unverified. CKMF Montréal must retain its real identity rather than be relabelled CKTF Gatineau. Later/current Live 88.5 remains reference material, not period broadcast evidence. No game preset integration was performed or verified by this task; the report's implementation section is a proposal. Keep personal audio outside public GitHub/bundles. No outreach.

Next useful work if requested: verify source-to-file provenance and audition, then connect station presets to the private local library, preserving source labels and normal audio speed. Avoid restarting the earlier broad acquisition search before using these files.
