# W6-CANON report (stopped at the 11:56 hard stop, 20 Oct 2026)

Branch rf/w6-canon from fix/look-on-qr at 813b1a7.

## Done
1. Abraham, summer 2004 = long curls (Tom 14 Oct). shots.js:100 and missions.js were already fixed on the base; the last mention was the hangout.js LOOKS comment ("dreadlocks"), now "curls". No colour or mesh change.
2. Invented rivals off the grids and the ambush roster (D32):
   - src/game/ambush.js: roster is now ['sayyad'] (was sayyad, boucherk, beaulieu).
   - src/game/modes.js: the course that fielded Kevin Boucher now fields Adam (sunfire, skill dave) plus Sayyad; the one that fielded Big Dan Beaulieu now fields Sayyad (grid('sayyad')) plus Adam. Blocks marked [w6-canon].
   - The rivals.js table (12 rivals) is untouched, so smoke_modes rival checks still pass; nothing fields boucherk or beaulieu any more.

3. (wave 7, 27 Oct, commit 76de3cd) Norm Lafleur is now « le garagiste » everywhere a player can read it: NORM.name 'Le garagiste', NORM.shop 'Le garage', mechanic.json name and persona (no age, no family, no surname), story.js vitres speaker, verbjobs vitres (title « La vitre du garagiste », drop-off text « Le garage »), jobready patch line, Grisha's lines (grisha.json, upgrades.js fallback, economy.js note, which also drops « su' l'chemin d'Aylmer »), hangout.json Mike and Zahra lines plus their lang-allowlist rows, ui.json tip, joke, pause line and the dormant achievement « Client Platine chez le garagiste », russell.json comparisons, calls.json Tercel opening (« Garage, bonjour... »), campaign.json and story.json (unloaded authoring files). Sign key: 'Garage Norm Lafleur & Fils' became 'Garage Mécanique Générale' in storefronts.json, the signage.js fallback, the signage.js pin and smoke_signs. Saves: no save stores the name. The place id and giver id stay 'norm'; the only renamed string that is a storage key is the achievement, and it is dormant (not in flavour.js RULES), so nobody can hold it. Tests now assert the new canon: smoke_upgrades (name is « le garagiste », no Norm or Lafleur in name or shop; Tercel caller opens « Garage » with no name), smoke_story_rules KNOWN Norm surname max 14 -> 0, smoke_signs pin, smoke_lang speaker, smoke_canon retired-premise regex widened to the new wording.

4. (wave 7) Step 4 Kijiji in 2004: skipped on purpose, left as is, listed for Tom below.
5. (wave 7) The rest of story.md section 3, one item per commit:
   - 1af507f Sayyad: no Hawaiian shirt (Tom 12 Oct), and the avatar matches his looks card (Tom 14 Oct): hangout.js LOOKS (dark tee, black jeans, no palms) and avatars.js buildSayyad (fronds out, shirt closed as a dark tee, glasses out, grey temples recoloured to hair, stubble decals out, smartwatch out as a 2004 anachronism, red terry shorts and bare legs now black jeans and dark shoes). Geometry only shrinks (fewer decals and boxes), no new pass, no per-frame cost. smoke_avatars and smoke_hangout now assert the canon (no fronds, glasses, grey, stubble, shorts, smartwatch; dark tee and jeans present). The ring() helper in avatars.js is now unused; kept because Margaret's canon glasses will need it.
   - 61d92a5 Zahra is sixteen (L:66): hangout scale 0.86 -> 0.94, still the shortest of the five; « Zahra is thirteen » test replaced by « shortest of the five » plus « sixteen, not thirteen » (scale >= 0.92).
   - Mike's theories (shots.js) and the « LA PETITE SŒUR » kicker: already fixed on the base (kicker is « LA SŒUR DE SAYYAD », Mike's card is the speech). Nothing to do.
   - D31 radiator beat and Sayyad asleep in the truck: already cut on the base (campaign.js RETIRED, smoke_sp_sauna, smoke_arc). Nothing to do.
   - 923bb75 famouscars.js (D32, ledger s.3): the Si comment's 2001 police chase is gone; the Firebird is no longer Steve « Mullet » Boucher's or his brother's (who « La Principale », title « LE GTA DE LA PRINCIPALE », card with no people); the Leone is no longer M. Henderson's (who « Le dépanneur », title « LA LEONE DU VERGLAS », « quelqu'un » in the card); the five RUMOURS lost their invented owners (Big Dan Beaulieu, prof Roy, Pato Gagnon, oncle Marcel, Le Rat Lévesque) and the lost-permit crime, and the Mustang no longer runs on the Allumettières (opened 2007). Car ids unchanged, so saves keep their garages.
   - 2b71b73 2004 phones: radio.json:291 no longer says kids « textent » (now walkman earbuds); the « le cellulaire vibre: Zahra » lead in campaign.json became the Auberge's phone. campaign.json and story.json are not loaded by the game (no src reference), so both were unreachable anyway; « registres paroissiaux » left as is (unreachable).
   - 3a language rule (main cast English): NOT done here. It belongs to rf/w6-english2 (LEAD-LOG, wave 6/7 list); doing it here would collide with that branch.
   - STORY_CARDS « LES COMMANDES », « PREMIÈRE JOB »: still shown by StoryOpener on a new game (main.js:271). This is the B-11 design question, not a canon contradiction; left for the lead.
   - poutine and cv: retired ids in campaign.js RETIRED; text left in code, unreachable.
6. Merged fix/look-on-qr again (1c639b3) before the final full-suite run.

## Checks
- Wave 7 (27 Oct): full suite on the Colab VM at c8bc2ce (after merging fix/look-on-qr): 107/110, the 3 misses are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models), ct: RESULT GREEN. Log aylmer-madness/references/review/colab-test/logs/c8bc2ce-1027-013743.log. Named smokes at 1af507f also GREEN on the VM. Before the 00:55 rule change a few single smoke files ran on the Mac (step 3 only); nothing after.
- Note: smoke_story_rules reports 3 passed on the VM vs 8 on the Mac (the ledger-driven cast check seems to skip on the VM). The KNOWN Norm surname max 0 check is in that skipped part, so the lead should run smoke_story_rules on the Mac at merge.
- npm test through qa-slot (1 slot): ran 11:44 to 11:51; the visible tail showed every file ok. I did not see the final count line before the stop: the lead should confirm 97/97 or more.
- No browser jobs run (wave 6 rule).

## Not done (next, in order)
3. DONE in wave 7 (see above). Was: Norm Lafleur to a generic « le garagiste » in player-facing text. Wide: upgrades.js:437-448 (NORM.name, shop), verbjobs.js:46, signage.js:106 and :220 (sign name is also a lookup key), kijiji.js:325 caller text, assets/text/mechanic.json, story.json, hangout.json:45, ui.json, arc.js:698-699, lang-allowlist rows 478 and 901. Tests assert the old name and must be changed to assert the new canon (not loosened): smoke_upgrades.mjs:278 and :448, smoke_story_rules.mjs:202-205 (KNOWN surname hash for Norm). Also the "Norm" first name: D32 says cut every invented person, so the first name should go too; HUD « U - Garage Norm » (economy.js:704, hud.js:1119).
4. Kijiji in 2004 (Kijiji Canada launched 2005). Needs Tom, see below.
5. Rest of story.md section 3 not touched: language rule 3a, D31 radiator beat cut, Sayyad Hawaiian shirt (hangout.js:402-403), Zahra scale 0.86 and the « Zahra is thirteen » test, Mike's theories (shots.js:89-91), « LA PETITE SŒUR » kicker, « la Si » legend in famouscars.js, cell phone in story.json:164, « textent » radio line.

## Needs Tom
- Kijiji (step 4, skipped by instruction): rename the screen to generic « Les p'tites annonces » (keeps the feature, drops the 2005 anachronism) or keep Kijiji as a wink (E-06 « wink only »)? i18n already labels the key « Les p'tites annonces ».
- The garagiste: is « le garagiste » with no first name right? His shop panel label in economy.js already says « Le mécano » and the shop heading comes from SHOPS (economy.js:34) = « Garage Hugo Caumartin », 143 rue Principale, which is a real business label off the map. That ties the invented mechanic to a real garage (and maybe a real person's name). Safe default kept as is because it is a place label, not a character; Tom should say whether the heading becomes plain « Garage » or « Garage, 143 rue Principale ».
- The generated storefront sign that was « Garage Norm Lafleur & Fils » is now « Garage Mécanique Générale ». Other storefront names in storefronts.json also carry invented people (Ti-Guy, Yvon « Piston » Tremblay, Gendron, Roger Bouchard in garage.js). D32 may want them generic too; not done (out of section 3).
- Famous cars: Firebird is now « La Principale »'s and the Leone « Le dépanneur »'s. Is that fine, or should these two unlocks go entirely (D32 « famous cars only the real cast's »)? Removing them touches saves and the unlock economy, so I did not.
- Avatars beyond Sayyad: Margaret's avatar (navy tee, grey fleece, no glasses) contradicts her looks card (green sweater, thin oval glasses). Sayyad's hair is still short; canon is almost shoulder-length (needs new geometry). smoke_avatars asserts « Zahra is the shortest of the four » (shorter than Margaret), but the heights card has Margaret shortest. Needs an art pass, not done.
- Ambush: with only Sayyad on the roster the ambush is one person. Should other main cast challenge, and in which car?
- The other invented rivals in rivals.js (Kevin and Steve Boucher, Big Dan Beaulieu, Gagnon, Lévesque...): no grid fields Kevin or Big Dan; LEAD-LOG 27 Oct says w6-races left « Kevin Boucher tailgates not rams » (race.js:405 comment). D32 suggests removing the table. Confirm.
- Hawaiian shirt is still in three unloaded authoring files (campaign.json:14, support.json:41, places.json:16) and Boucher/Henderson/Beaulieu are still owners in mechanic.json « legends » (not loaded: loadMechanic reads only name, greetings, broke, wrecked, work). Unreachable; left.
- Story editor (tools/story-editor/extract.mjs, seed.json) still lists « Norm Lafleur » in its cast: tool for Tom, not the game; regenerate when the editor is next used.

## Browser checks for the lead (cloud)
- `--only course` harness run for the two changed race courses (grid shows Adam and Sayyad, no Kevin or Big Dan), bar: completes, 0 console errors.
- boot of both entries, 0 console errors.
