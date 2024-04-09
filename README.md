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
