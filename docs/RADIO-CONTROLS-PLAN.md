# Recorded-radio controls — updated 27 September 2026

Confirmed by Thomas: **R toggles on/off; Shift+R changes to the next station.** Each station loops its available recordings. Off is not a station. This supersedes the September 22 R-next / Shift+R-previous proposal.

Full plan: AUDIO-IMPROVEMENT-PLAN.md. Recommended unspecified behavior: Shift+R while off selects the next station silently; R resumes that station. Remember per-station position, keep inactive stations frozen, and preserve power/selection through reload and vehicle changes. Default presets: CHEZ, CBC Radio One, Radio-Canada, Oldies 1310, CKMF Montréal. Majic and later Live 88.5 material are optional. No new sourcing needed.

Resolve Shift's existing look-back binding in both hold and toggle modes; the radio chord must not also toggle power or leave look-back latched. Use shared keyboard/menu commands, compact station feedback and existing volume controls.

Status: implemented and browser-tested on 28 September 2026; see AUDIO-IMPLEMENTATION-REPORT.md. Future multi-agent review prompt is saved in POST-AUDIO-TEAM-REVIEW-PROMPT.md; do not execute it until separately invoked after audio implementation.
