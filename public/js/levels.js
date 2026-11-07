// Het verhaal: Shane heeft twee frikandelbroodjes gestolen bij de Plus General Store in Hatert Town.
// Er staat een premie op zijn hoofd en hij moet het land uit, naar de grens bij Kleve.
//
// sectietypes: fight (alles opruimen), escape (haal het einde), defend (houd vol), ride (te paard/wagen/trein/boot),
//              boss (baas + hulpjes), duel
// vijandcodes in waves: g = gunman, r = rifleman, R = rifleman op een dak/rots, s = shotgun, b = brute (mes),
//                       d = dynamiet-gooier, h = ruiter

export const WEAPONS = {
  revolver: { name: 'Cattleman Revolver', key: 1, mag: 6, reserve: 60, maxReserve: 96, dmg: 40, head: 2.6, rate: 0.3, reload: 1.6, spread: 0.035, aimSpread: 0.006, zoom: 48, range: 70, falloff: 35, sound: 'revolver' },
  lever: { name: 'Lever-Action Rifle', key: 2, mag: 8, reserve: 32, maxReserve: 64, dmg: 72, head: 2.2, rate: 0.8, reload: 2.5, spread: 0.06, aimSpread: 0.0015, zoom: 30, range: 150, falloff: 200, sound: 'rifle' },
  shotgun: { name: 'Double-Barrel Shotgun', key: 3, mag: 2, reserve: 20, maxReserve: 40, dmg: 18, pellets: 9, head: 1.5, rate: 0.3, reload: 2.1, spread: 0.08, aimSpread: 0.06, zoom: 52, range: 30, falloff: 7, sound: 'shotgun' },
  dynamite: { name: 'Dynamiet', key: 4, mag: 1, reserve: 3, maxReserve: 6, dmg: 190, radius: 6.5, fuse: 2.2, rate: 0.9, throwable: true, zoom: 55, sound: 'throw' },
  knife: { name: 'Mes', key: 5, melee: true, dmg: 110, range: 2.5, rate: 0.55, zoom: 55, sound: 'knife' },
};
export const WEAPON_ORDER = ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'];

export const ENEMY = {
  g: { kind: 'gunman', hp: 100, gun: 'revolver', dmg: 8, rate: 1.3, burst: 2, range: [8, 22], acc: 0.42, speed: 3.6 },
  r: { kind: 'rifleman', hp: 90, gun: 'rifle', dmg: 15, rate: 2.6, burst: 1, range: [16, 40], acc: 0.55, speed: 3.2 },
  R: { kind: 'rifleman', hp: 90, gun: 'rifle', dmg: 15, rate: 2.8, burst: 1, range: [0, 99], acc: 0.5, speed: 0, perch: true },
  s: { kind: 'shotgunner', hp: 140, gun: 'shotgun', dmg: 22, rate: 1.8, burst: 1, range: [3, 8], acc: 0.7, speed: 4.3, maxRange: 14 },
  b: { kind: 'brute', hp: 220, gun: 'knife', dmg: 28, rate: 1.1, burst: 1, range: [0, 1.6], acc: 1, speed: 4.9, melee: true },
  d: { kind: 'thrower', hp: 100, gun: 'dynamite', dmg: 0, rate: 6.5, burst: 1, range: [12, 24], acc: 1, speed: 3.4, throws: true },
  h: { kind: 'rider', hp: 120, gun: 'revolver', dmg: 8, rate: 1.4, burst: 2, range: [9, 18], acc: 0.4, speed: 8, rider: true },
};

const BOUNTY = [2.49, 500, 750, 1000, 1250, 1600, 2000, 2400, 2900, 3500, 4200, 5000, 5800, 6700, 7700, 8800, 10000, 12000, 14500, 17500, 25000];
export const bountyFor = (i) => BOUNTY[Math.min(BOUNTY.length - 1, i)];

export const LEVELS = [
  // ===================== AKTE I – HATERT TOWN =====================
  {
    name: 'Fifty Fifty', place: 'Hatert Town', theme: 'town', time: 'day', faction: 'gang', weapons: ['revolver', 'knife'], seed: 11, bar: true,
    intro: 'bar',
    sections: [
      { t: 'duel', len: 24, duel: 'tex' },
      { t: 'fight', len: 60, obj: 'Overleef de Hatert Town gang', waves: ['g4', 'g3 r2', 'g3 s1'],
        say: [['Hatert Town Gang', 'They shot Mo Hemmet! Get that bun-headed sonofagun!'], ['Shane', 'Ah, come on. He drew first.']] },
      { t: 'escape', len: 70, obj: 'Vlucht naar de stallen', waves: ['g3', 'g2 s1', 'g3'], say: [['Shane', 'Two frikandelbroodjes. That\'s all it was. Two.']] },
      { t: 'fight', len: 55, obj: 'Breek door de barricade bij de stadspoort', waves: ['g4 r2', 'g3 s2', 'b1 g3'],
        say: [['Hatert Town Gang', 'Nobody leaves Hatert Town, Shane!']] },
    ],
    outro: [['Shane', 'Hatert Town. Fifty Fifty. Best chocomel west of the Maas.'], ['Shane', 'Gonna miss it.']],
  },
  {
    name: 'Hatert Town Burning', place: 'Hatert Town – Livery', theme: 'town', time: 'dusk', faction: 'gang', weapons: ['revolver', 'knife'], seed: 22,
    intro: [['Shane', 'Can\'t run to the border on foot. Need my horse.'], ['Shane', 'Bitterbal\'s still in the livery. If the Hemmets didn\'t eat her.'], ['Hatert Town Gang', 'Burn the stables! He\'ll come for that horse!']],
    sections: [
      { t: 'fight', len: 55, obj: 'Bereik de livery', waves: ['g4', 'g4 R1', 'g3 d1'] },
      { t: 'fight', len: 50, obj: 'Ruim het plein op', waves: ['g4 s1', 'g3 R2', 'b2 g2'], say: [['Shane', 'Simmer down, cowboys. Simmer down.']] },
      { t: 'defend', len: 30, time: 40, obj: 'Bescherm Bitterbal terwijl je zadelt', waves: ['g3', 'g3 s1', 'g4', 'b1 g3'], say: [['Shane', 'Easy girl. Easy. Just a few more buckles.']] },
      { t: 'ride', len: 320, vehicle: 'horse', obj: 'Rijd Hatert Town uit', waves: ['h3', 'h3', 'h4', 'h2 g3'], say: [['Shane', 'Hyah! Go, Bitterbal, go!']] },
    ],
    outro: [['Shane', 'Good girl. Good girl.'], ['Shane', 'Next stop: anywhere but here.']],
  },
  {
    name: 'Dukenburg Gulch', place: 'Dukenburg Gulch', theme: 'canyon', time: 'day', faction: 'gang', weapons: ['revolver', 'knife'], seed: 33,
    intro: [['Shane', 'Dukenburg Gulch. Only way south.'], ['Shane', 'Perfect place for an ambush. Which means there\'s an ambush.'], ['Bruiser Bart', 'MO WAS MY COUSIN, SHANE! MY FAVOURITE COUSIN!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Baan je een weg door de kloof', waves: ['g3 R2', 'g4', 'g2 R2 s1'] },
      { t: 'escape', len: 70, obj: 'Ontsnap aan de lawine van kogels', waves: ['g3 R1', 'g2 s2', 'g3 R2'] },
      { t: 'fight', len: 60, obj: 'Vecht je door het kamp van de Hemmets', waves: ['g4 d1', 'g3 s2', 'R3 g2'] },
      { t: 'boss', len: 50, obj: 'Versla Bruiser Bart', boss: 'bart', waves: ['g3', 'g2 b2'] },
    ],
    outro: [['Bruiser Bart', 'The... Plus... they doubled the bounty... you\'re worth a fortune now...'], ['Shane', 'The Plus? For two broodjes?'], ['Shane', 'Hm. Better get my lever-action outta storage, then.']],
  },
  // ===================== AKTE II – DE SPOORLIJN =====================
  {
    name: 'Lindenholt Junction', place: 'Lindenholt Junction', theme: 'rail', time: 'day', faction: 'hunter', weapons: ['revolver', 'knife'], seed: 44,
    intro: [['Shane', 'Lindenholt Junction. Trains go east from here.'], ['Bounty Hunter', 'Wanted poster says two frikandelbroodjes. Price says rich man. Spread out, boys!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Steek het rangeerterrein over', waves: ['g4', 'g3 r2', 'g3 s1'] },
      { t: 'fight', len: 50, obj: 'Zoek de stervende marshal bij de watertoren', waves: ['g3 R2', 'g4 r1'], give: 'lever',
        giveSay: [['Marshal Peters', 'Son... take my rifle... they shot me for a ham sandwich...'], ['Shane', 'Frikandelbroodje, Marshal.'], ['Marshal Peters', '...whatever. Make it count.']] },
      { t: 'fight', len: 60, obj: 'Probeer je nieuwe lever-action', waves: ['r3 g2', 'R3 g3', 'r2 s2'] },
      { t: 'defend', len: 30, time: 45, obj: 'Houd het perron tot de trein er is', waves: ['g4', 'g3 r2', 's2 g3', 'b1 g4'] },
    ],
    outro: [['Shane', 'All aboard. Hopefully.']],
  },
  {
    name: 'De 4:15 Express', place: 'Op de trein naar Nijmegen City', theme: 'prairie', time: 'day', faction: 'hunter', weapons: ['revolver', 'lever', 'knife'], seed: 55,
    intro: [['Conductor', 'Tickets please— oh no. It\'s HIM.'], ['Shane', 'Relax. I paid for this one.'], ['Shane', '...Probably.']],
    sections: [
      { t: 'ride', len: 380, vehicle: 'train', obj: 'Verdedig de trein tegen ruiters', waves: ['h3', 'h4', 'h3', 'h5'] },
      { t: 'ride', len: 340, vehicle: 'train', obj: 'Houd vol tot de brug', waves: ['h4', 'h4', 'h5 g2'] },
      { t: 'fight', len: 60, obj: 'De trein is gestopt – ruim het station op', waves: ['g4 r2', 'g3 s2', 'R2 g4'] },
    ],
    outro: [['Conductor', 'You\'re getting off here, mister. Please. I beg you.'], ['Shane', 'Fair enough.']],
  },
  {
    name: 'Goffert Woods', place: 'Goffert Woods', theme: 'forest', time: 'night', faction: 'hunter', weapons: ['revolver', 'lever', 'knife'], seed: 66,
    intro: [['Shane', 'Goffert Woods at night. Lovely.'], ['Hound-Dog Henk', 'I can smell that frikandel on your breath, boy! Ol\' Henk never loses a scent!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Sluip door het bos', waves: ['g3', 'g2 r2', 'g3 b1'] },
      { t: 'fight', len: 65, obj: 'Volg het pad naar de open plek', waves: ['g4 r1', 's2 g2', 'g3 r2'] },
      { t: 'escape', len: 70, obj: 'Ontsnap uit de val', waves: ['g3', 'b2 g2', 's2 g2'] },
      { t: 'boss', len: 55, obj: 'Versla Hound-Dog Henk', boss: 'henk', waves: ['g3', 'b2 g2', 's2'] },
    ],
    outro: [['Hound-Dog Henk', 'Smelled... like... mustard...'], ['Shane', 'Curry, actually.']],
  },
  {
    name: 'Malden Mine', place: 'Malden Mine', theme: 'mine', time: 'night', faction: 'hunter', weapons: ['revolver', 'lever', 'knife'], seed: 77,
    intro: [['Shane', 'Old Malden Mine goes right under the hills. Nobody\'ll follow me down there.'], ['Bounty Hunter', 'He went into the mine! Follow him!'], ['Shane', '...Course they will.']],
    sections: [
      { t: 'fight', len: 50, obj: 'Ga de mijn in', waves: ['g3', 'g3 s1'] },
      { t: 'fight', len: 50, obj: 'Vind de oude mijnwerker', waves: ['g3 b1', 'g4'], give: 'shotgun',
        giveSay: [['Ouwe Gerrit', 'You the frikandel fella? Ha! Took two myself back in \'71.'], ['Ouwe Gerrit', 'Here. Double-barrel. Up close, nothing beats her.'], ['Shane', 'Thanks, Gerrit.']] },
      { t: 'fight', len: 55, obj: 'Test de shotgun in de smalle gangen', waves: ['g4 b1', 's2 g3', 'b3'] },
      { t: 'fight', len: 50, obj: 'Bereik de liftschacht', waves: ['g4 d1', 'g3 s2', 'b2 g3'] },
      { t: 'defend', len: 25, time: 40, obj: 'Houd ze tegen tot de lift boven is', waves: ['g4', 's2 g2', 'b2 g3', 'g5'] },
    ],
    outro: [['Shane', 'Fresh air. Never take it for granted.']],
  },
  {
    name: 'Heyendaal Heights', place: 'Heyendaal Heights', theme: 'canyon', time: 'dawn', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'knife'], seed: 88,
    intro: [['Shane', 'Heyendaal Heights. High ground everywhere.'], ['Shane', 'And on every bit of high ground, some fella with a rifle.']],
    sections: [
      { t: 'fight', len: 60, obj: 'Schakel de scherpschutters uit', waves: ['R3 g2', 'R3 r2', 'g4'] },
      { t: 'fight', len: 65, obj: 'Klim naar de pas', waves: ['R2 g3', 'r3 s1', 'R3 g3'] },
      { t: 'escape', len: 70, obj: 'Ren naar beneden', waves: ['g3 R2', 'g2 s2', 'h3'] },
      { t: 'ride', len: 300, vehicle: 'horse', obj: 'Galoppeer naar het fort', waves: ['h3', 'h4', 'h3 R2'] },
    ],
    outro: [['Shane', 'Fort Brakkenstein. Army\'s there. Maybe they\'ll help.'], ['Shane', 'Maybe they\'ve heard about the broodjes.']],
  },
  {
    name: 'Fort Brakkenstein', place: 'Fort Brakkenstein', theme: 'fort', time: 'dusk', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'knife'], seed: 99,
    intro: [['Captain Brakken', 'Halt! Ah. You. The Plus pays the Army better than Washington does, son.'], ['Shane', 'Course they do.']],
    sections: [
      { t: 'fight', len: 60, obj: 'Breek in bij de buitenmuur', waves: ['g4 R2', 'r3 g2', 's2 g3'] },
      { t: 'fight', len: 60, obj: 'Neem de binnenplaats in', waves: ['g5', 'R3 g3', 'd1 s2 g2'] },
      { t: 'defend', len: 30, time: 50, obj: 'Houd de poort tegen de tegenaanval', waves: ['g4', 'g3 d1', 's2 g3', 'b2 g3', 'r2 g3'] },
      { t: 'boss', len: 50, obj: 'Versla Captain Brakken', boss: 'brakken', waves: ['g3 r1', 'g3 s1'] },
    ],
    outro: [['Captain Brakken', 'They... said... it was a fair bounty...'], ['Shane', 'It\'s two frikandelbroodjes, Captain. Nothing about this is fair.']],
  },
  {
    name: 'High Noon in Nijmegen City', place: 'Nijmegen City', theme: 'city', time: 'day', faction: 'law', weapons: ['revolver', 'lever', 'shotgun', 'knife'], seed: 110,
    intro: [['Sheriff Wilma Krul', 'Shane! This is my city. You don\'t walk through it.'], ['Shane', 'Then I\'ll run, ma\'am.'], ['Sheriff Wilma Krul', 'High noon. Main Street. Just you and me.']],
    sections: [
      { t: 'duel', len: 24, duel: 'krul' },
      { t: 'fight', len: 60, obj: 'De hulpsheriffs komen eraan', waves: ['g4 R2', 'g4 s1', 'r2 g3'], give: 'dynamite',
        giveSay: [['Dynamiet Dorus', 'Psst! Mister! Sheriff locked up my dynamite. You set me free, it\'s yours!'], ['Shane', 'Deal. What could go wrong.']] },
      { t: 'fight', len: 60, obj: 'Blaas de barricade op', waves: ['g5', 'g4 R2', 'd2 g3'] },
      { t: 'escape', len: 70, obj: 'Vlucht door de straten van Nijmegen City', waves: ['g3 s1', 'g4', 'h3 g2'] },
      { t: 'fight', len: 55, obj: 'Bereik de haven', waves: ['g4 r2', 's2 b2', 'g5 R2'] },
    ],
    outro: [['Shane', 'Dynamite. Should\'ve started with dynamite.']],
  },
  // ===================== AKTE III – DE RIVIER =====================
  {
    name: 'Waal River Docks', place: 'Waal River Docks', theme: 'docks', time: 'night', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 121,
    intro: [['Shane', 'Steamboat leaves at midnight. Gotta be on it.'], ['Dockworker', 'Bounty\'s up to three thousand! THREE THOUSAND for broodjes!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Steek de kades over', waves: ['g4', 'g3 r2', 'd1 g3'] },
      { t: 'fight', len: 60, obj: 'Vecht je door de pakhuizen', waves: ['s2 g3', 'b2 g3', 'g4 R2'] },
      { t: 'fight', len: 55, obj: 'Bereik de steiger', waves: ['g5', 'd2 g3', 's2 R2 g2'] },
      { t: 'defend', len: 30, time: 45, obj: 'Houd de steiger tot de boot vertrekt', waves: ['g4', 'g4 d1', 's2 b2', 'g5 r2'] },
    ],
    outro: [['Captain Snelbinder', 'Welcome aboard the Snelbinder! Do NOT shoot my boat.'], ['Shane', 'Can\'t promise anything.']],
  },
  {
    name: 'De Snelbinder', place: 'Stoomboot op de Waal', theme: 'river', time: 'day', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 132,
    intro: [['Captain Snelbinder', 'Riders on both banks! What did you DO, mister?'], ['Shane', 'Lunch.']],
    sections: [
      { t: 'ride', len: 380, vehicle: 'boat', obj: 'Verdedig de stoomboot', waves: ['h3', 'h4 R2', 'h4', 'R3 h2'] },
      { t: 'ride', len: 380, vehicle: 'boat', obj: 'Houd vol tot Lent', waves: ['h4', 'R3 h3', 'h5', 'h4 R2'] },
    ],
    outro: [['Captain Snelbinder', 'This is where you get off. My boat has more holes than a cheese.'], ['Shane', 'Sorry, captain.']],
  },
  {
    name: 'Lent Marshes', place: 'Lent Marshes', theme: 'marsh', time: 'fog', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 143,
    intro: [['Shane', 'Can\'t see ten feet in this fog.'], ['Shane', 'Neither can they. That\'s something.']],
    sections: [
      { t: 'fight', len: 60, obj: 'Waad door het moeras', waves: ['g3 b1', 'g3 s1', 'b2 g2'] },
      { t: 'fight', len: 60, obj: 'Vind de vissershut', waves: ['g4', 'r2 g3', 'd1 b2'] },
      { t: 'escape', len: 75, obj: 'Ontsnap uit de mist', waves: ['b2 g2', 's2 g2', 'g4', 'b3'] },
      { t: 'fight', len: 55, obj: 'Steek de oude brug over', waves: ['g5', 'g3 r2', 'd2 s2'] },
    ],
    outro: [['Shane', 'Boots are ruined. Socks are ruined. Spirit is... mostly fine.']],
  },
  {
    name: 'Ooij Prairie', place: 'Ooij Prairie', theme: 'prairie', time: 'day', faction: 'hunter', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 154,
    intro: [['Farmer Jansje', 'You there! Hunters are burning my farm hunting for you! Help me get my wagon out!'], ['Shane', 'Least I can do, ma\'am.']],
    sections: [
      { t: 'fight', len: 65, obj: 'Verjaag de jagers van de boerderij', waves: ['g4 h2', 'g3 r2', 'h4'] },
      { t: 'defend', len: 30, time: 45, obj: 'Bescherm de boerderij', waves: ['h3 g2', 'g4 d1', 'h4', 's2 g3'] },
      { t: 'ride', len: 380, vehicle: 'wagon', obj: 'Begeleid de wagen over de prairie', waves: ['h4', 'h4', 'h5', 'h3 R2'] },
    ],
    outro: [['Farmer Jansje', 'Bless you, frikandel man.'], ['Shane', 'Just Shane, ma\'am.'], ['Farmer Jansje', 'There\'s a ghost town east. Nobody goes there. Somebody\'s waiting for you, they say.']],
  },
  {
    name: 'Ghost Town Persingen', place: 'Persingen', theme: 'ghost', time: 'night', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 165,
    intro: [['The Bonuskaart Kid', 'Evening, Shane. I\'m the Bonuskaart Kid. Every kill gets me points.'], ['The Bonuskaart Kid', 'You\'re worth a LOT of points.'], ['Shane', 'Simmer down, kid.']],
    sections: [
      { t: 'fight', len: 60, obj: 'Loop door het spookstadje', waves: ['g4', 'g3 R2', 's2 g2'] },
      { t: 'fight', len: 60, obj: 'Vind de Bonuskaart Kid', waves: ['g5', 'b2 g3', 'R3 g2'] },
      { t: 'duel', len: 24, duel: 'kid' },
      { t: 'fight', len: 60, obj: 'De Plus Pinkertons komen', waves: ['g4 r2', 's2 g3', 'd2 g3', 'g5'],
        say: [['Pinkerton', 'Plus Detective Agency! Lay down your arms, thief!'], ['Shane', 'Plus has its own army now? Jesus.']] },
    ],
    outro: [['Shane', 'Baron Van der Plus. Owner of every Plus west of the Rhine.'], ['Shane', 'He wants me that bad, he can come get me himself.']],
  },
  // ===================== AKTE IV – DE GRENS =====================
  {
    name: 'Groesbeek Pass', place: 'Groesbeek Pass', theme: 'snow', time: 'day', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 176,
    intro: [['Shane', 'Snow. In Groesbeek. Course there\'s snow.'], ['Pinkerton', 'Blockade at the pass! He can\'t get through!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Klim door de besneeuwde pas', waves: ['g4 R2', 'r3 g2', 's2 g3'] },
      { t: 'fight', len: 65, obj: 'Breek door de blokkade', waves: ['g5 d1', 'R3 g3', 'b2 s2'] },
      { t: 'escape', len: 75, obj: 'Ren voor de lawine van dynamiet', waves: ['d2 g2', 'g4', 'd2 s2'] },
      { t: 'ride', len: 320, vehicle: 'horse', obj: 'Rijd de pas af', waves: ['h4', 'h4 R2', 'h5'] },
    ],
    outro: [['Shane', 'Almost there, Bitterbal. Almost.']],
  },
  {
    name: 'Mookerheide', place: 'Mookerheide', theme: 'heath', time: 'dusk', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 187,
    intro: [['Pinkerton', 'He\'s on the heath! Riders, go go go!']],
    sections: [
      { t: 'fight', len: 70, obj: 'Steek de heide over', waves: ['h3 g2', 'g4 r2', 'h4'] },
      { t: 'fight', len: 65, obj: 'Neem het kamp van de Pinkertons in', waves: ['g5', 'd2 g3', 's2 b2', 'R3 g3'] },
      { t: 'defend', len: 30, time: 50, obj: 'Houd stand op de heuvel', waves: ['h4', 'g5', 'h3 d2', 'b3 g3', 'h5'] },
      { t: 'escape', len: 75, obj: 'Vlucht naar de molen', waves: ['h3 g2', 'g4 s1', 'h4'] },
    ],
    outro: [['Shane', 'Wyler Mill. Then the border.']],
  },
  {
    name: 'Wyler Mill', place: 'Wyler Mill', theme: 'prairie', time: 'storm', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 198, mill: true,
    intro: [['Shane', 'Storm\'s coming. So are they.'], ['Pinkerton Sergeant', 'Baron says: whoever brings back the broodjes gets a lifetime bonus card!']],
    sections: [
      { t: 'fight', len: 60, obj: 'Bereik de molen', waves: ['g5', 'r3 g2', 's2 d1 g2'] },
      { t: 'defend', len: 30, time: 55, obj: 'Verdedig de molen', waves: ['g5', 'g4 d2', 's3 g2', 'b3 g3', 'h4 g2'] },
      { t: 'fight', len: 65, obj: 'Breek uit', waves: ['g5 R2', 'b2 s2 g2', 'd2 g4'] },
      { t: 'boss', len: 55, obj: 'Versla Sergeant Spaarzegel', boss: 'sergeant', waves: ['g4', 's2 g2', 'b2 g2'] },
    ],
    outro: [['Sergeant Spaarzegel', 'The Baron... is waiting... at Fort Plus...'], ['Shane', 'Then I\'ll stop by.']],
  },
  {
    name: 'Fort Plus', place: 'Hoofdkwartier van de Plus', theme: 'fort', time: 'storm', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 209,
    intro: [['Shane', 'Fort Plus. The Baron\'s house.'], ['Shane', 'Every Plus in the West sends its money here.'], ['Shane', 'Time to return the favour.']],
    sections: [
      { t: 'fight', len: 65, obj: 'Bestorm de poort', waves: ['g5 R2', 'd2 g3', 's2 g4'] },
      { t: 'fight', len: 65, obj: 'Vecht je door het magazijn', waves: ['g5', 'b3 g2', 'R3 s2', 'g6'] },
      { t: 'fight', len: 60, obj: 'Blaas de kluis op', waves: ['g5 d1', 's3 g3', 'b2 R2 g3'] },
      { t: 'defend', len: 30, time: 50, obj: 'Houd stand in de binnenplaats', waves: ['g5', 'd2 g4', 'b3 s2', 'g5 R2', 'h4 g2'] },
      { t: 'escape', len: 70, obj: 'De Baron vlucht naar de grens – achtervolg hem', waves: ['g4 s1', 'h4', 'g5'] },
    ],
    outro: [['Shane', 'He\'s running to Kleve. Course he is.'], ['Shane', 'Let\'s finish this.']],
  },
  {
    name: 'De Grens bij Kleve', place: 'Grens bij Kleve', theme: 'border', time: 'dusk', faction: 'plus', weapons: ['revolver', 'lever', 'shotgun', 'dynamite', 'knife'], seed: 220,
    intro: [['Baron Van der Plus', 'Shane! Two frikandelbroodjes! Do you know what they COST me?'], ['Shane', 'About two-fifty.'], ['Baron Van der Plus', 'TWENTY-FIVE THOUSAND DOLLARS, SHANE! In bounties!'], ['Shane', 'Sounds like a you problem, Baron.']],
    sections: [
      { t: 'fight', len: 65, obj: 'Vecht je naar de grenspost', waves: ['g5 R2', 's2 g4', 'd2 g4', 'h4 g2'] },
      { t: 'fight', len: 60, obj: 'Breek door de laatste linie', waves: ['g6', 'b3 s2', 'R3 g4', 'd2 g4'] },
      { t: 'duel', len: 24, duel: 'baron' },
      { t: 'boss', len: 55, obj: 'Versla Baron Van der Plus', boss: 'baron', waves: ['g4 s2', 'b2 g3', 'g5 d1'] },
      { t: 'escape', len: 50, obj: 'Steek de grens over', waves: ['g3'] },
    ],
    outro: 'ending',
  },
];

// bazen
export const BOSSES = {
  bart: { name: 'Bruiser Bart', hp: 900, look: { skin: '#d8a080', hair: 'bald', bigBeard: true, beardColor: '#1a1008', shirt: '#6a2a1a', pants: '#2a2a2a', vest: '#1a1a1a', scale: 1.35, belly: true, bandana: '#8a1a1a', thickBrow: true }, gun: 'shotgun', melee: true, dmg: 22, rate: 1.6, speed: 4.2, acc: 0.65, range: [2, 9], lines: ['FOR MO!', 'COME HERE, BUN-HEAD!', 'I\'LL MASH YOU INTO A FRIKANDEL!'] },
  henk: { name: 'Hound-Dog Henk', hp: 1000, look: { skin: '#d4a07a', hair: 'long', hairColor: '#8a8a7a', beard: true, beardColor: '#9a9a8a', hat: 'cowboy', hatColor: '#4a3a2a', coat: '#5a4a30', long: true, shirt: '#7a6a4a', scale: 1.1 }, gun: 'shotgun', dmg: 24, rate: 1.4, speed: 4.6, acc: 0.65, range: [3, 10], lines: ['I SMELL YA!', 'Here, piggy piggy!', 'Ol\' Henk always gets his broodje!'] },
  brakken: { name: 'Captain Brakken', hp: 1150, look: { skin: '#e0b090', hair: 'short', hairColor: '#aaa', stache: true, beardColor: '#bbb', hat: 'cowboy', hatColor: '#1e2a4a', shirt: '#2a3a6a', pants: '#2a3a6a', coat: '#1e2a4a', scale: 1.1 }, gun: 'rifle', dmg: 16, rate: 1.2, speed: 3.4, acc: 0.6, range: [12, 30], dyn: true, lines: ['FOR THE PLUS AND THE FLAG!', 'Artillery! Where is my artillery!', 'Hold the line!'] },
  sergeant: { name: 'Sergeant Spaarzegel', hp: 1300, look: { skin: '#c8946a', hair: 'short', hairColor: '#2a1a10', stache: true, hat: 'bowler', hatColor: '#1a1a1a', shirt: '#d8d8d8', vest: '#c8202a', coat: '#1e2e5a', scale: 1.15 }, gun: 'shotgun', dmg: 24, rate: 1.3, speed: 4.4, acc: 0.65, range: [3, 10], dyn: true, lines: ['Spaarzegels for everyone!', 'Your bonus card is EXPIRED!', 'Clean up in aisle YOU!'] },
  baron: { name: 'Baron Van der Plus', hp: 1800, look: { skin: '#f0c8a8', hair: 'short', hairColor: '#e8e8e8', stache: true, beardColor: '#e8e8e8', hat: 'stetson', hatColor: '#c8202a', shirt: '#f4f4f4', vest: '#c8202a', coat: '#1e2e5a', long: true, chain: true, scale: 1.12, belly: true }, gun: 'rifle', dmg: 18, rate: 0.9, speed: 3.8, acc: 0.6, range: [8, 22], dyn: true, lines: ['THOSE WERE PREMIUM BROODJES!', 'Every Plus in the West is MINE!', 'Two-fifty, Shane! TWO-FIFTY!'] },
};

export const DUELS = {
  tex: { name: 'Big Tex Tolliver', look: 'tex', extra: 'mo', draw: 2.0,
    pre: [['Big Tex Tolliver', 'Out here in the street, Shane. Face me like a man.'], ['Mo Hemmet', 'And me. The Hemmet gang always gets its money, Shane.'], ['Shane', 'Can I at least finish my chocomel first?'], ['Big Tex Tolliver', 'NO.']] },
  krul: { name: 'Sheriff Wilma Krul', look: { skin: '#e8c0a0', hair: 'long', hairColor: '#8a4a20', hat: 'cowboy', hatColor: '#3a2a1a', shirt: '#cfc4a8', vest: '#2a2a2a', pants: '#3a3226', coat: '#5a3a22' }, draw: 1.6,
    pre: [['Sheriff Wilma Krul', 'Last chance, Shane. Pay for those broodjes.'], ['Shane', 'Can\'t. Ate \'em.']] },
  kid: { name: 'The Bonuskaart Kid', look: { skin: '#f0c8a8', hair: 'short', hairColor: '#e0c060', hat: 'cowboy', hatColor: '#f0f0f0', shirt: '#c8202a', vest: '#f0f0f0', pants: '#1e2e5a' }, draw: 1.35, guards: 2,
    pre: [['The Bonuskaart Kid', 'Fastest draw in Persingen. And my friends here are pretty fast too.'], ['Shane', 'Should\'ve brought more friends.']] },
  baron: { name: 'Baron Van der Plus', look: 'baron', draw: 1.25, guards: 3, survive: true,
    pre: [['Baron Van der Plus', 'One more chance. Give me back my broodjes.'], ['Shane', 'Baron... they\'re gone. It\'s been weeks.'], ['Baron Van der Plus', 'THEN YOU PAY IN BLOOD!']] },
};
