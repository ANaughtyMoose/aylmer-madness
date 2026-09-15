import {openMealShift} from './mealshift.js';
const close=(G)=>{G.mealShift?.close();G.mealShift=null;};
export const LIFE_MISSIONS=[{
  id:'margaretdental',title:'Les dents à finir',giver:'home',timeOfDay:'day',
  brief:'Margaret travaille comme technicienne dentaire chez le Dr Morin, sur Principale. Va chercher la boîte de prothèses : elle peut finir le travail à la maison pour un petit extra.',
  build(){return [
    {text:'Récupère le travail chez Dr Morin',sub:'Stationne-toi devant le cabinet, puis E pour prendre la boîte.',hint:'Le cabinet gris sur Principale, près du British.',at:'morin',radius:16,hold:true,toast:'La boîte de prothèses est prête. Margaret t’attend au 299 Fraser.'},
    {text:'Apporte la boîte à Margaret',sub:'Retour au 299 Fraser. E pour lui remettre le travail.',hint:'Margaret finit les prothèses à la maison.',at:'home',radius:20,hold:true,money:35,toast:'Margaret installe son travail à la maison. 35 $ de bonus pour la course !'}
  ];}
},{
  id:'solerrand',title:'Un arrêt chez Sol',giver:'sayyad',timeOfDay:'day',
  brief:'Sayyad et Zahra adorent Sol, le magasin d’aliments naturels à gauche du PFK. Va chercher leur commande au 195 Principale.',
  build(){return [
    {text:'La commande chez Sol',sub:'À gauche du PFK. Arrête-toi, puis E.',hint:'Cherche l’enseigne verte avec le soleil doré.',at:'sol',radius:18,hold:true,toast:'Le magasin est propre et accueillant. La commande de Sayyad et Zahra est prête.'},
    {text:'Retour chez Sayyad et Zahra',sub:'Rapporte le sac au 75 Denise-Friend, puis E pour le remettre.',hint:'Leur maison verte, avec le porche rouge.',at:'sayyad',radius:18,hold:true,money:15,toast:'« On adore ce magasin ! » 15 $ pour la course.'}
  ];}
},{
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
