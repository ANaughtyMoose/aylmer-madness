// Wave 3: six jobs that are not deliveries. Each one is a verb from verbs.js
// with a real person and a real place on it. The cast is the cast (docs/PLAN.md
// — never invent a fact about them); Mike alone gets to make a speech.
import { follow, loseThem, find, fragile, lift, dropoffs } from './verbs.js';

// 1 — Keep up with Sayyad. He is going to the beach and he is not waiting.
const suis = {
  id: 'suis',
  title: 'Suis Sayyad',
  brief: 'Sayyad connaît un chemin pour la plage. Il te le montre une fois, pis il t’attend pas.',
  giver: 'sayyad',
  timeOfDay: 'day',
  build() {
    return [follow({
      carId: 'civic', roster: 'sayyad', name: 'Sayyad', from: 'sayyad', to: 'beach', pace: 0.5,
      car: 'la Civic ROUGE', wait: 6, go: 'Envoye, suis-moé!',
      text: 'Suis la Civic ROUGE jusqu’à la Plage des Cèdres',
      sub: 'W à fond, reste en arrière de lui. Il t’attend pas. Il t’a dit qu’il t’attendrait pas.',
      hint: 'Il coupe par les petites rues. Colle-le, pis regarde la ligne bleue si tu le perds.',
      start: 'Suis-moé. Pis essaie de pas avoir l’air d’un touriste.',
      money: 35,
      toast: 'Sayyad: « Bon. Astheure tu le sais. » +35 $ — il t’avait gagé que tu le perdrais.',
      failWhy: 'Sayyad t’a perdu. Il va te le rappeler jusqu’en septembre.',
    })];
  },
};

// 2 — La tournée des dames (story.json, vehicleJobs: the Saturn's job). Margaret
// gets in and talks; you drive her to the church and you listen.
const dames = {
  id: 'dames',
  title: 'La tournée des dames',
  brief: 'Margaret a le bingo de l’église pis pas de char. Elle parle. Tu conduis.',
  giver: 'margaret',
  timeOfDay: 'dusk',
  build() {
    return lift({
      who: 'Margaret', from: 'margaret', to: 'church',
      pickText: 'Margaret — 299 Chemin Fraser', pickSub: 'Arrête-toi devant, E quand elle est prête',
      text: 'Église Saint-Paul, rue Principale', sub: 'Doucement sur le W. Elle a son sac de bingo sur les genoux.',
      pickHint: 'Elle est sur le perron. Recule (S) jusqu’au bord du chemin.',
      hint: 'Principale, dans le Vieux. Le clocher, tu peux pas le manquer.',
      lines: [
        'Ton père a dit que t’avais acheté des jantes. J’ai rien dit.',
        'À ton âge, ton oncle Denis a vendu sa Duster pour aller à Trois-Rivières. Y est revenu en bus.',
        'Sayyad, c’est un bon gars. Sa mère s’inquiète, mais c’est un bon gars.',
        'Tourne pas trop vite, j’ai pas mis ma ceinture. …Bon, là je l’ai mise.',
        'Tu vas partir en septembre. Je le sais. Tout le monde le sait. C’est correct.',
      ],
      money: 30,
      toast: 'Margaret: « Merci, mon grand. » Elle te laisse dix piasses pour le gaz. +30 $',
    });
  },
};

// 3 — Fragile. A pane of glass from the Canadian Tire to Norm's, for the truck
// window Sayyad's bat went through. The driving is the job.
const vitres = {
  id: 'vitres',
  title: 'La vitre de Norm',
  brief: 'Norm a commandé une vitre au Canadian Tire. Elle rentre pas dans son char. Elle rentre dans ton truck, à plat, si tu la casses pas.',
  giver: 'norm',
  timeOfDay: 'morning',
  build() {
    return fragile({
      from: 'ctire', to: 'norm', tolerance: 6,
      loadText: 'Canadian Tire — la commande de Norm', loadSub: 'Arrête-toi (S) devant le magasin pis E', loadHint: 'Chemin d’Aylmer. Le gars du comptoir sait c’est quoi.',
      holdText: 'E — charger la vitre', loadToast: 'Deux gars la déposent dans la boîte sur une couverte. « Roule pas comme un fou. »',
      text: 'Garage Norm Lafleur & Fils', sub: 'Doux sur le W pis le S. Pas de coups, pas de trottoirs, pas de sauts. Regarde le compteur.',
      hint: 'Rue Principale, l’enseigne rouge. Reste sur l’asphalte.',
      money: 40,
      toast: 'Norm la regarde de bord en bord. « …Correct. » +40 $ — pis un café.',
      failWhy: 'Ça a fait un bruit que tu vas entendre longtemps.',
      airWhy: 'La vitre a décollé de la couverte. Norm t’a entendu d’ici.',
    });
  },
};

// 4 — Don't get caught. Mike's dare: get the police on you on purpose, lose
// them in the streets, then meet at the beach like nothing happened.
const seme = {
  id: 'seme',
  title: 'Sème-les',
  brief: 'Mike a une théorie: la police d’Aylmer lâche après deux rues si tu connais les rues. Il veut que tu la testes. Lui, il regarde.',
  giver: 'mike',
  timeOfDay: 'night',
  build() {
    return loseThem({
      stars: 2, why: 'le défi de Mike', time: 160, to: 'beach', radius: 18,
      text: 'Sème la police', sub: 'W à fond. Les petites rues, les ruelles, le parc. Pas le chemin d’Aylmer.',
      hint: 'Coupe par Frank-Robinson pis les rues derrière. Hors de vue douze secondes pis y lâchent.',
      lostToast: 'Y t’ont perdu. Mike va dire que c’est sa théorie qui marche.',
      thenText: 'Plage des Cèdres — Mike t’attend', thenSub: 'Tranquille sur le W, astheure. T’as rien fait.',
      thenHint: 'La plage, au bout de la rue du Golf.',
      money: 45,
      toast: 'Mike: « Deux rues. Je te l’avais dit. Je vais écrire quelque chose là-dessus. » +45 $',
      failWhy: 'Y t’ont eu. Mike dit que c’est pas sa théorie, c’est toi.',
    });
  },
};

// 5 — Find it from a description. Adam left the Sunfire "au bord de l'eau,
// proche du belvédère, là où on était l'an passé" and went home on the 40.
const sunfire = {
  id: 'sunfire',
  title: 'Le Sunfire d’Adam',
  brief: 'Adam a laissé le Sunfire « au bord de l’eau, proche du belvédère, là où on était l’an passé » pis il est reparti à Mayo en bus. Y a pas de GPS pour ça.',
  giver: 'principale',
  timeOfDay: 'day',
  build() {
    return [find({
      target: 'lookout', radius: 20, time: 420,
      text: 'Trouve le Sunfire', sub: 'Pas de marqueur. Roule (W), arrête-toi (S) quand c’est brûlant. « Au bord de l’eau, proche du belvédère. »',
      hint: 'Le belvédère, c’est au bout du chemin, vers l’ouest. L’an passé, c’était le feu sur la grève.',
      clue: '— au bord de l’eau, proche du belvédère.',
      money: 35,
      toast: 'Le Sunfire. Une contravention sous l’essuie-glace. Adam va la payer en septembre, il dit. +35 $',
      failWhy: 'Le soleil est couché. Adam va venir le chercher lui-même.',
    })];
  },
};

// 6 — Four people, four places, the order is yours. The end of a night at
// Mike's: everybody in the truck, everybody home. Mike gets his speech.
const quatre = {
  id: 'quatre',
  title: 'Quatre à ramener',
  brief: 'Fin de veillée chez Mike. Sayyad, Margaret, Adam pis Tyler dans le truck. Ramène-les, dans l’ordre que tu veux.',
  giver: 'mike',
  timeOfDay: 'night',
  build() {
    return [dropoffs({
      text: 'Ramène tout le monde', sub: 'Dans l’ordre que tu veux. Arrête-toi (S) devant chez eux.',
      hint: 'Sayyad sur Denise-Friend, Margaret chez vous, Adam au quai de la marina, Tyler sur la Principale — elle marche le reste.',
      time: 600,
      stops: [
        { who: 'Sayyad', at: 'sayyad', line: 'Sayyad: « Demain. Le pont. Fais-toi pas prendre. »' },
        { who: 'Margaret', at: 'margaret', line: 'Margaret: « T’as vu l’heure? …Non, c’est correct. Bonne nuit. »' },
        { who: 'Adam', at: 'marina', line: 'Adam: « Mon père vient me chercher au quai. Dis-y rien. »' },
        { who: 'Tyler', at: 'principale', line: 'Tyler: « Ma tante dort. Je rentre par en arrière. Merci. »' },
      ],
      money: 40,
      toast: 'Mike, au téléphone: « Tout le monde est rentré? Bon. Tu sais ce que ça veut dire, ça? Ça veut dire que t’es le gars qui a le char. Pis le gars qui a le char, c’est lui qui décide quand la soirée finit. Pense à ça. » +40 $',
      failWhy: 'Trop tard. Quelqu’un a appelé quelqu’un.',
    })];
  },
};

export const VERB_MISSIONS = [suis, dames, vitres, seme, sunfire, quatre];
