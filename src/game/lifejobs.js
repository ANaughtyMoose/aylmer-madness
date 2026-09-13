import {openMealShift} from './mealshift.js';
const close=(G)=>{G.mealShift?.close();G.mealShift=null;};
export const LIFE_MISSIONS=[{
  id:'stvincent',title:'Une bouchée à la fois',giver:'home',timeOfDay:'day',
  brief:'Le Ranger reste au stationnement de l’Hôpital St. Vincent, sur Cambridge. À l’intérieur, tu aides au repas en soins palliatifs : un corridor occupé, des fauteuils électriques et du monde qui prend son temps.',
  cleanup:close,
  build(){return [
    {text:'Hôpital St. Vincent — Cambridge',sub:'Suis le GPS jusqu’à Ottawa. Stationne-toi au repère, puis E pour entrer.',hint:'Le GPS mène à Cambridge Street North. Arrête-toi avant d’entrer.',at:'stvincent',radius:22,hold:true,holdText:'E — entrer pour le service du repas'},
    {kind:'meal',text:'Le service du repas',sub:'WASD pour marcher, Espace au signal vert pour servir une bouchée.',hint:'Approche un lit avec WASD. Espace quand le signal est vert. Trois bouchées par personne.',noTarget:true,noRoute:true,condition:()=>false,
      onEnter(G){G.mealShift=openMealShift();},onTick(G){if(G.mealShift?.state.done)return 'done';},onExit:close,
      money:40,toast:'Les plateaux sont ramassés. Le service est terminé. Bonus de défi : 40 $.'}
  ];}
},{
  id:'russellroyal',title:'Russell est encore congédié',giver:'home',timeOfDay:'day',
  brief:'Russell appelle du Royal Ottawa. Encore les carts de golf. Encore une dernière chance qui était vraiment la dernière. Va le chercher, puis ramène-le au 299 Fraser. Il paie le gaz.',
  build(){return [
    {text:'Va chercher Russell — Royal Ottawa',sub:'Suis le GPS jusqu’au club. Arrête-toi et appuie sur E pour le faire embarquer.',hint:'Le Royal Ottawa est sur le chemin d’Aylmer, vers Hull.',at:'royalottawa',radius:24,hold:true,passengers:1,
      gate:G=>G.veh.spec.twoWheel?'Russell a besoin d’une place. Reviens avec le Ranger.':null,
      toast:'« Le marshal a dit doucement. J’ai compris deux tours. » Russell embarque.'},
    {text:'Ramène Russell au 299 Fraser',sub:'Suis le GPS pour rentrer. Arrête-toi dans l’entrée, puis E.',hint:'Retour au 299 Fraser, avec Russell.',at:'home',radius:20,hold:true,passengers:-1,money:25,toast:'Russell te laisse 25 $ pour le gaz. « Ils vont me rappeler. »'}
  ];}
}];
