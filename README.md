# musiXMLparse
musicXML parser to extract lyrics - make a karaoke from musicXML

# dependances :
musicXMLparse require :
 - SaxonJS2 (v2.5) from Saxonica ( license : https://www.saxonica.com/saxon-js/documentation2/index.html#!conditions/public-license ) 
 - unroll_musicxml-midi.self.json and xls/timepart.sef ( https://github.com/infojunkie/musicxml-midi )
to unroll repetitions and transform from <score-timewise> to <score-partwise>

# import :
 <script type="text/javascript" src="musicXMLparse_public.js"></script>
 <!-- from https://www.saxonica.com/download/javascript.xml for musicXMLParse.js only -->       
 <script src="Saxon/SaxonJS2.rt.js"></script>    

# in your browser :

  function main(file){
    ficNam1 = file.name;
    let fileReader = new FileReader();
    music.paroles = [];
    if (ficNam1.substring(ficNam1.length - 9) == ".musicxml") {
        fileReader.onload = function() {
            musicXML = fileReader.result;
            musicXMLParse(musicXML, function(err, musicres) {
                if (err) {
                    console.log('error : ' + err);
                } else {
                    music = musicres;
                    musicres = {};
                    if (music.titre == "") music.titre = ficNam1.substring(0, ficNam1.length - 9);
                }
            });
          }
          fileReader.readAsText(file);
    } else {
        console.log(' not an .musicXML file !');
    }
  }

# result :
    music.paroles : array of
      [0] time begin syllabe (ms) : float
      [1] duration note (ms) : float
      [2] lyric : text
      [3] type of syllabe : text 
          'single' <=> begin and end of word / word monosyllabic
          'end'    <=> last syllabe of word
          'begin'  <=> first syllabe of word
          'middle' <=> syllabe between 'begin' and 'end'

  nota : if all lyrics from musicXML are 'single', musicXMLparse try to make them words 

# test 
    musicXMLparse in application : http://aroug.eu/MyKaraOk  
      
    
