/*****
 * musicXML parser
 * 
 * Règles représentation musicale musicXML :
 *         1°) barline forward n'est pas implicite à la première mesure 
 *         2°) les reprises sont implicitement "senza replica" c'est-à-dire qu'elles ne seront pas rejouées une seconde fois après un D.S. ou une reprise
 *         3°) anacrouse interdite en entrée !
 *         4°) dès qu'il y a des DS to fine ou DC to fine, ça plante !
 * 
 *  références : https://www.w3.org/2021/06/musicxml40/
 *               https://fr.wikipedia.org/wiki/Tempo (Cut et Common en musicXML 2/2 et 4/4)
 *               https://www.saxonica.com/saxon-js/documentation2/index.html#!api/transform
 *               https://musescore.org/fr 
 * 
 *  ToDo Liste : 
 *        ne conserver que le stric minimum de "music" !
 *        Empaquetage "correct" (?? <=> une vraie CLASS)
 *        FAIRE une véritable fonction algorithmique de la "linéarisation de la musique" ! du moins avec les 'to FINE' !
 ****/

"use strict";

let Equiv = [];
Equiv['whole'] = 1;
Equiv['half'] = 2;
Equiv['quarter'] = 4;
Equiv['eighth'] = 8;
Equiv['16th'] = 16;
Equiv['32nd'] = 32;
Equiv['64th'] = 64;
Equiv['128th'] = 128;
Equiv['256th'] = 256;
Equiv['512th'] = 512;
Equiv['1024th'] = 1024;

async function musicXMLParse(file, fcb) { 

    // ----------------------------------initialise music
    // at last, only one single thing is require : music.paroles !  
    music.titre = "";
    music.nbinstrs = 0;
    music.indInstr = [];
    music.indInstnbPortees = [];
    music.nbPorteesPerId = [];
    music.nbMesures = 0;
    music.couplets = [];         // array of measures with more than one lyrics for one note (or more)
    music.staff = "";
    music.partLyric = "";
    music.tempos = [];
    music.divisions = 0;
    music.time = [0, 0];
    music.mesuresAlire = [];
    music.mesureslues = [];
    music.mesuresTempo = [];
    music.paroles = [];
    music.indexDur = 0;
    music.words = [];

    let i, j, k;
    var xmlDoc, parser, xml;
    var chant;
    var notes = [];
    var Allnotes = [];
    var note_en_moins;
    var dureetmp, parole, typeparole;
    var modtemps, metros, timeduration, mesure;

    function compareFn(a, b) {
      if (a[0] < b[0]) {
        return -1;
      } else {
        return 1;
      }
    }    

    // just to deal with import of .midi in museScore (perhaps with other application ?)
    // in this case, all lyrics are "single"
    function determine_typSyllS(){  //  single = syllabe se terminant par " ", end par défaut.
        if (music.paroles.length > 1){
            if ((music.paroles[0][3] == 'single') && (music.paroles[1][3] == 'end')){
                music.paroles[0][3] = 'single';
                music.paroles[1][3] = 'begin';  
            } else {
                if ((music.paroles[0][3] == 'end') && (music.paroles[1][3] == 'end')){
                    music.paroles[0][3] = 'begin';
                    music.paroles[1][3] = 'middle';  
                } else {
                    // pas de changement pour (single, single)
                    if ((music.paroles[0][3] == 'end') && (music.paroles[1][3] == 'single')){
                        music.paroles[0][3] = 'begin';
                        music.paroles[1][3] = 'end';  
                    }
                }
            }
            for (i=1; i<music.paroles.length - 1; i++){
                if (music.paroles[i][3] == 'begin'){
                    if (music.paroles[i+1][3] == 'end'){
                        music.paroles[i+1][3] = 'middle';
                    }
                    if (music.paroles[i+1][3] == 'single'){
                        music.paroles[i+1][3] = 'end';
                    }
                }
                if (music.paroles[i][3] == 'single'){
                    if (music.paroles[i+1][3] == 'end'){
                        music.paroles[i+1][3] = 'begin';
                    }
                }
                if (music.paroles[i][3] == 'middle'){
                    if (music.paroles[i+1][3] == 'end'){
                        music.paroles[i+1][3] = 'middle';
                    }
                    if (music.paroles[i+1][3] == 'single'){
                        music.paroles[i+1][3] = 'end';
                    }
                }
                if (music.paroles[i][3] == 'end'){
                    if (music.paroles[i+1][3] == 'end'){
                        music.paroles[i+1][3] = 'begin';
                    }
                }
            }
        }
    }

    // two uses of transform : 
    // one to "unroll" score with repetitions, one to converts from <score-timewise> to <score-partwise>
    async function transform(musicXml, transTyp) {
        var xslt;
        if (transTyp == "unroll") {
            xslt = './unroll_musicxml-midi.self.json';
        } else {
            xslt = './xls/timepart.sef';
        }
        /*****************************************
         *  Retourne systématiquement une chaîne de caractère car destination : 'serialized'
         *****************************************/
        SaxonJS.setLogLevel(10);
        var result = await SaxonJS.transform({
            stylesheetLocation: xslt,
            destination: 'serialized',
            sourceText: musicXml,
        }, "async");
        //transformeOK = true;
        let xml = result.principalResult;
        /*****************************************
         *  si "UNROLL", renvoit DOM Element, sinon, une chaîne
         *****************************************/
        if (transTyp == "unroll") {
            parser = new DOMParser();
            xmlDoc = parser.parseFromString(xml, "text/xml");
            return xmlDoc;
        } else {
            return xml;
        }
    }

    async function main(fcb) {
        let xml = file;
        parser = new DOMParser();
        let xmlDoc = parser.parseFromString(xml, "text/xml");   // version DOM Element
        xml = new XMLSerializer().serializeToString(xmlDoc);    // version TEXT
        /******************************************************
         *     fichier musicXML du type timewise ou partwise ?
         ******************************************************/
        if ((xmlDoc.doctype !== null) && (xmlDoc.doctype.name == "score-timewise") && (xmlDoc.charset == "UTF-8")) {
            // SI timewise : on le transforme d'abord en PARTWISE puis on le "linéarise"
            xml = await transform(xml, 'timewiseTopartwise');
            xmlDoc = await transform(xml, 'unroll');
        } else {
            // SI partwise : on le "linéarise" directement
            xmlDoc = await transform(xml, 'unroll');
        }
        /**************** for debug ************************************************/
        //xml = new XMLSerializer().serializeToString(xmlDoc);     // version TEXT
        //console.log(xml);
        /****************************************************************************/
        if ((xmlDoc.doctype !== null) && (xmlDoc.doctype.name == "score-partwise") && (xmlDoc.charset == "UTF-8")) {
            /******************************************************
             *     Structure principale Part-list, Parts et mesures
             ******************************************************/
            if (xmlDoc.querySelector("work-title") !== null) music.titre = xmlDoc.querySelector("work-title").textContent;
            // combien de part(ie)s ? : NOMBRE d'INSTRUMENTS
            music.nbinstrs = xmlDoc.querySelector("part-list").children.length;

            for (i = 0; i < music.nbinstrs; i++) {
                music.indInstr.push(xmlDoc.querySelector("part-list").children[i].id);
                music.indInstnbPortees.push(1); // par défaut
            }

            for (i = 0; i < music.nbinstrs; i++) {
                var instruments = xmlDoc.querySelectorAll("part");
                for (j = 0; j < instruments.length; j++) {
                    var nbmes = instruments[j].children.length;
                    if (music.nbMesures == 0) {
                        music.nbMesures = nbmes;
                    }
                    if (instruments[j].children[0].querySelector("staves") !== null) {
                        music.indInstnbPortees[j] = Number(instruments[j].children[0].querySelector("staves").textContent);
                    }
                }
            }

            for (i = 0; i < music.nbinstrs; i++) music.nbPorteesPerId[music.indInstr[i]] = music.indInstnbPortees[i];

            /******************************************************
             *     Paroles (lyrics) ?
             ******************************************************/
            for (i = 0; i < music.indInstr.length; i++) {
                for (j = 1; j < music.nbPorteesPerId[music.indInstr[i]] + 1; j++) {
                    if (music.nbPorteesPerId[music.indInstr[i]] == 1) { // pas de "staff"
                        l = "part[id='" + music.indInstr[i] + "']";
                        if (xmlDoc.querySelector(l) != null){
                            notes = xmlDoc.querySelector(l).querySelectorAll("note");
                            metros = 0;
                            note_en_moins = "";
                            for (modtemps = 0; modtemps < notes.length; modtemps++) {
                                if (notes[modtemps].querySelectorAll("lyric").length > 0) {
                                    metros += 1;
                                }
                            }
                        }
                        if (metros > 0) music.words.push([music.indInstr[i], 0, metros]);
                    } else {
                        l = "part[id='" + music.indInstr[i] + "']";
                        k = "staff='" + j + "'";
                        if (xmlDoc.querySelector(l) != null){
                            notes = xmlDoc.querySelector(l).querySelectorAll("note");
                            metros = 0;
                            for (modtemps = 0; modtemps < notes.length; modtemps++) {
                                if ((notes[modtemps].querySelectorAll("lyric").length > 0) && (notes[modtemps].querySelector("staff").textContent == j.toString())) {
                                    metros += 1;
                                }
                            }
                        }
                        if (metros > 0) music.words.push([music.indInstr[i], j, metros]);
                    }
                }
            }

            /****************************************************************************************
             *         le nombre de "lignes" correspondantes à des paroles est de music.words.length
             ****************************************************************************************/
            if (music.words.length == 0) {
                // this score have no lyric
                fcb('Cette partition ne possède pas de paroles !');
                return false;
            } else {
                if (music.words.length > 1) {
                    //  good score but more than one instrument with lyrics
                    fcb('Cette partition possède trop de "lignes de paroles" ... Veuillez à supprimer les lignes de paroles non souhaitées avant de reprendre cet exercice !');
                    return false;
                }
            }

            var firsttone = xmlDoc.querySelector("lyric").parentElement;
            music.partLyric = firsttone.parentElement.parentElement.id; //  Pi
            if (music.nbPorteesPerId[music.partLyric] > 1) music.staff = firsttone.querySelector("staff").textContent;

            /*************************************************************************
             *     mise à jour indication des numéros de mesure <=> music.mesureslues
             ************************************************************************/
            music.nummesure = [];
            music.nummesure.push("0");    // à numéro de mesure="0", on affecte 0 (nummesure[3] = "3")
            music.nummesnb = [];
            music.nummesnb.push(1);
            modtemps = instruments[0].querySelectorAll("measure");
            for (i = 0; i < modtemps.length; i++) {
                j = Number(modtemps[i].attributes[0].textContent); // j : index mesure
                music.mesureslues.push(j); // 1, 2, 3, ...
                var mesurenum = (i + 1).toString();
                modtemps[i].attributes[0].textContent = mesurenum;
                if (music.nummesure.indexOf(mesurenum) == -1){
                    // numéro de mesure non encore "enregistré"
                    music.nummesure.push(mesurenum);
                    music.nummesnb.push(1);
                }
            }

            /****************************************************************
             *  Indications de mesure, division (unité insécable) ET tempos !
             ***************************************************************/
            // beat duration (division <=> représentation note mini ... graphique mais aussi unité de temps !)
            music.divisions = Number(instruments[0].children[0].querySelector("divisions").textContent);
            music.time[0] = Number(instruments[0].children[0].querySelector("beats").textContent);
            music.time[1] = Number(instruments[0].children[0].querySelector("beat-type").textContent);

            modtemps = instruments[0].querySelectorAll("sound[tempo]"); // tous les sounds d'un instrument ayant un tempo !!
            metros = instruments[0].querySelectorAll("metronome");      // tous les métronomes

            mesure = -1;
            if (metros.length > 0) {
                mesure = Number(metros[0].parentElement.parentElement.parentElement.attributes[0].textContent)
            }

            // initialisation du tempo à 240 noires par minutes si pas de tempo ! ATTENTION mesure commence en 1
            if ((mesure == -1) || (mesure > 1)) {
                //music.tempos.push(0, 60, 0.5, 500) 0.5 <=> music.time[1] (beat-type) 500 = 60000 * 2 (beat unit) / ( 60 * 2 (blanche) * 2 (division))
                j = (120 / 4) * music.time[1];      // si blanche => 60, noire => 120, croche => 240, ... nbre d'unité de music.time[1] à la minute
                k = 1 / music.time[1];              // 1/4 si "à la noire", 1/2 si "à la blanche", 1/8 si "à la croche" ...
                timeduration = 60000 / (j * music.divisions);
                music.tempos.push([0, j, k, timeduration]);
            }

            for (i = 0; i < modtemps.length; i++) {
                j = Number(modtemps[i].parentNode.parentNode.attributes[0].textContent); // mesure n° (unroll)
                k = Equiv[metros[i].querySelector("beat-unit").textContent];             // équivalent de l'unité de [b]pm % ronde
                if (metros[i].querySelector("beat-unit-dot") !== null) {
                    k = (2 * k) / 3;                                                     // t = 1/k + 1/2k = 3/2k
                }
                // le 3ième chiffre représente le % de ronde. Or 2nd * 3ième <=> 60s donc temps d'une ronde = 60/(3ieme * 2nd).
                // mais une duration représente time[1]*divisions => 4ième chiffre
                timeduration = (60000 * k) / (parseFloat(modtemps[i].attributes[0].textContent) * music.time[1] * music.divisions); // en ms 60000*2 / (60 * 2 * 2)
                // attention 1ere valeur commence à 0
                music.tempos.push([j - 1, parseFloat(modtemps[i].attributes[0].textContent), 1 / k, timeduration]);
            }

            /******************************************************
             *     mesuresTempo : associe un tempo à chaque mesure
             ******************************************************/
            music.mesuresTempo.push([music.tempos[0][1], music.tempos[0][2], music.tempos[0][3]]);
            k = music.tempos[music.tempos.length - 1][0];
            j = 1;
            for (i = 1; i < music.nbMesures; i++) {
                if ((j < music.tempos.length) && (i < music.tempos[j][0])) {
                    music.mesuresTempo.push([music.mesuresTempo[i - 1][0], music.mesuresTempo[i - 1][1], music.mesuresTempo[i - 1][2]]);
                } else {
                    if (j < music.tempos.length - 1) {
                        j += 1;
                        music.mesuresTempo.push([music.tempos[j - 1][1], music.tempos[j - 1][2], music.tempos[j - 1][3]]);
                    } else {
                        if (j == music.tempos.length - 1) {
                            j += 1;
                            music.mesuresTempo.push([music.tempos[j - 1][1], music.tempos[j - 1][2], music.tempos[j - 1][3]]);
                        } else {
                            music.mesuresTempo.push([music.mesuresTempo[i - 1][0], music.mesuresTempo[i - 1][1], music.mesuresTempo[i - 1][2]]);
                        }
                    }
                }
            }
            // music.mesuresTempo commence à 0 (unroll)
            //libération mémoire / free memory
            modtemps = null;
            metros = null;

            /******************************************************
             *     recensement des paroles 
             ******************************************************/
            for (var imes = 0; imes < music.nbMesures; imes++) music.mesuresAlire.push(imes); // index et non number "normalement"

            // lecture des textes / paroles
            chant = xmlDoc.querySelectorAll("part")[music.indInstr.indexOf(music.partLyric)];
            notes = [];

            /******************************************************
             *     recensement des paroles on supprime les notes des autres staffs
             *     et on batit un couplet type (nécessaire si plusieurs paroles à chaque couplet)
             ******************************************************/
            dureetmp = 0;
            // Pour chaque mesure à lire
            var mesures_notes = [];
            for (var imes = 0; imes < music.mesuresAlire.length; imes++) {
                // passage en tableau d'une collection !!
                notes = Array.from(chant.children[music.mesuresAlire[imes]].querySelectorAll("note, backup"));
                // 1 - filtre les mauvais staff 
                    if (music.staff != "") { // si ligne multiple suppression mauvais staff
                        for (k = notes.length - 1; k > -1; k--) {
                            // on éradique les VRAIES NOTES de music.staff différent ... pas les backup !
                            if ((notes[k].children.length != 1) && (notes[k].querySelector("staff").textContent != music.staff)) {
                                note_en_moins = notes.splice(k, 1);
                            }
                        }
                        if (notes[notes.length-1].children.length == 1){
                            note_en_moins = notes.splice(notes.length-1, 1);    
                        }
                        mesures_notes.push(notes);
                        if (notes.length > 0){
                            for (var t = 0; t<notes.length; t++) {
                                if (notes[t].children[0].tagName == "pitch"){
                                    if (notes[t].children[0].children[1].tagName == "alter"){
                                        var alteration = "#";
                                        if (notes[t].children[0].children[1].txtContent == '-1'){
                                            alteration = "b";
                                        }
                                    }
                                }
                            }
                        }
                    }

                for (var jno = 0; jno < notes.length; jno++) {
                    Allnotes.push(notes[jno]);
                    var k = notes[jno].querySelectorAll("lyric").length;
                    if (k > 1) {
                        var lnum = music.mesureslues[Number(notes[jno].parentNode.attributes[0].textContent)];
                        const cenum = music.mesureslues[Number(notes[jno].parentNode.attributes[0].textContent) - 1];
                        if (music.couplets.indexOf(cenum) == -1) {
                            music.couplets.push(cenum);
                        }
                    }
                }
            }

            j = 0;          // index de toutes les notes !
            var mindAll = [];
            mindAll.push(-1); 
            mindAll.push(0);         // mesure 1 commence avec note indice 0
            var m = Number(Allnotes[j].parentNode.attributes[0].nodeValue);   // commence à mesure=1 !!
            while ((m != music.nbMesures + 1) && (j < Allnotes.length)) {
                notes = mesures_notes[m-1];
                while ((j < Allnotes.length) && (Number(Allnotes[j].parentNode.attributes[0].textContent) == m)) {
                    if ((Allnotes[j].children.length == 1) && (j != mindAll[m]+notes.length-1)){ 
                        dureetmp = Number(Allnotes[j].querySelector("duration").textContent) * music.mesuresTempo[m-1][2];
                        music.indexDur -= dureetmp;       
                    } else {
                        if (Allnotes[j].children.length != 1){
                            dureetmp = Number(Allnotes[j].querySelector("duration").textContent) * music.mesuresTempo[m-1][2];
                            if ((Allnotes[j].querySelector("rest") == null) && (Allnotes[j].querySelector("lyric") != null)) {
                                if (music.couplets.indexOf(music.mesureslues[m-1]) != -1) {
                                    modtemps = Allnotes[j].querySelectorAll("lyric");
                                    var kk = music.nummesnb[music.mesureslues[m-1]];
                                    var parole="";
                                    for (var s=0; s<modtemps.length; s++){
                                        if ((modtemps[s].hasAttribute('number')) && (modtemps[s].getAttribute("number") == kk.toString())){
                                            parole = modtemps[s].querySelector("text").textContent;
                                            typeparole = modtemps[s].querySelector("syllabic").textContent;
                                            break;
                                        }
                                    }
                                    if (parole == "") typeparole = "single";
                                } else {
                                    parole = Allnotes[j].querySelector("text").textContent;
                                    typeparole = Allnotes[j].querySelector("syllabic").textContent;
                                    var kk = 1;
                                }
                                music.paroles.push([music.indexDur, dureetmp, parole, typeparole]);
                            }
                            music.indexDur += dureetmp;                 
                        }
                    }   
                    music.duree = music.indexDur + dureetmp;
                    j += 1;
                }
                if (m < music.nbMesures){
                    mindAll.push(j);
                }
                // si m faisait partie des "couplets", alors "k" devient "k+1"
                if (music.couplets.indexOf(music.mesureslues[m-1]) != -1) {
                    music.nummesnb[music.mesureslues[m-1]] += 1;
                }
                m += 1;
            }

            // Détermination si musicXML original ou importation
            var nb_singles = 0; for (j=0; j<music.paroles.length; j++){
                if (music.paroles[j][3] == 'single') nb_singles += 1;
            }
            // traitement si toutes les syllabes sont des singles donc musicXML = importation de .midi ou .kar
            // toutes les syllabes en trim et middle si déjà trim
            if (music.paroles.length == nb_singles){
                //musixml est une importation de .midi (ou .kar ??)
                for (j=0; j<music.paroles.length; j++){
                    if (music.paroles[j][2].trim().length == music.paroles[j][2].length){
                        music.paroles[j][3] = "middle";
                    } else {
                        music.paroles[j][2] = music.paroles[j][2].trim();
                        music.paroles[j][3] = "single";
                    }
                }
            }
            music.paroles.sort(compareFn);
            // ***********-------------------------------------**********
            //     JUST for statistics
            //
            // à ce stade, paroles est prêt !!
            // statistiques nbre de caractères / temps. On rajoute un espace si paroles type est 'end' ou 'single'
            // Objectif : temps moyen de défilement d'un caractère j : nb de caractères total - k : durée de défilement de toutes les paroles
            j = 0;
            k = 0;
            music.alphabet = [' '];
            for (i = 0; i < music.paroles.length; i++) {
                if ((music.paroles[i][3] == 'single') || (music.paroles[i][3] == 'end')) {
                    music.paroles[i][2] += ' ';
                }
                j += music.paroles[i][2].length;
                for (l = 0; l < music.paroles[i][2].length; l++) {
                    if (music.alphabet.indexOf(music.paroles[i][2].substring(l, l + 1)) < 0) music.alphabet.push(music.paroles[i][2].substring(l, l + 1));
                }
                k += music.paroles[i][1];
            }
            if (music.paroles.length == nb_singles){
                //musixml est une importation de .midi (ou .kar ??) les singles ont déjà fait l'objet d'un espace final
                // ne reste plus qu'à considérer les 'middle' comme 'end' pour pouvoir traiter l'ensemble par determine_typSyllS
                for (j=0; j<music.paroles.length; j++){
                    if (music.paroles[j][3] == "middle") {
                        (music.paroles[j][3] = "end")
                    }
                }
                determine_typSyllS();
            }
            music.vitCar = j / k; // j : nombre de caractères, k = milisecondes
            // nettoyage de music : c'est là que vous vous débarassez de ce qui ne vous est pas utile pour la suite
            // Now, we can clean music !
            music.alphabet = null;
            fcb(null, music);;
        } else {
            //   ..... mauvais document musicXML
            // .... this is not a musicXML file
            fcb("Ce fichier n'est pas un fichier du type musicXML");
            return false;
        }
    }

    main(function(err, music) {
        fcb(err, music);
    });
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = musicXMLParse;
} else {
    if (typeof define === 'function' && define.amd) {
        define('musicXMLParse', [], function() {
            return musicXMLParse;
        });
    }
};