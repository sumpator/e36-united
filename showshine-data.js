/*
 * E36 United — Show & Shine category imagery
 * 2026-08-24: user-supplied category / interior / engine photos.
 * Photos illustrate the active category and judging area; they do not represent one single car.
 */
window.E36_SHOWSHINE = {
  activeCategory: 'sedan',
  categories: {
    sedan: {
      label:'Sedan', code:'SEDAN', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_sedan.webp',
      overview:'assets/images/showshine/ss_sedan.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_sedan_int.webp',wheels:null,engine:'assets/images/showshine/ss_sedan_eng.webp',impression:null},
      focus:{
        fit:{scale:1.55,x:9,y:1,focusX:62,focusY:48}, corrosion:{scale:1.9,x:-8,y:18,focusX:37,focusY:76},
        originality:{scale:1.18,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:10,y:4,focusX:64,focusY:45},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.1,x:-20,y:18,focusX:29,focusY:73},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.04,x:0,y:0,focusX:50,focusY:50}
      }
    },
    coupe: {
      label:'Coupé', code:'COUPE', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_coupe.webp',
      overview:'assets/images/showshine/ss_coupe.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_coupe_int.webp',wheels:null,engine:'assets/images/showshine/ss_coupe_eng.webp',impression:null},
      focus:{
        fit:{scale:1.52,x:7,y:1,focusX:60,focusY:47}, corrosion:{scale:1.86,x:-9,y:18,focusX:35,focusY:75},
        originality:{scale:1.16,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:10,y:4,focusX:63,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.06,x:-18,y:18,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    },
    touring: {
      label:'Touring', code:'TOURING', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_touring.webp',
      overview:'assets/images/showshine/ss_touring.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_touring_int.webp',wheels:null,engine:'assets/images/showshine/ss_touring_eng.webp',impression:null},
      focus:{
        fit:{scale:1.5,x:7,y:1,focusX:60,focusY:48}, corrosion:{scale:1.86,x:-9,y:18,focusX:34,focusY:76},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.58,x:9,y:3,focusX:62,focusY:45},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.04,x:-18,y:17,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    cabrio: {
      label:'Cabrio', code:'CABRIO', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_cabrio.webp',
      overview:'assets/images/showshine/ss_cabrio.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_cabrio_int.webp',wheels:null,engine:'assets/images/showshine/ss_cabrio_eng.webp',impression:null},
      focus:{
        fit:{scale:1.5,x:6,y:1,focusX:58,focusY:49}, corrosion:{scale:1.88,x:-10,y:19,focusX:34,focusY:76},
        originality:{scale:1.15,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.6,x:10,y:4,focusX:63,focusY:46},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.08,x:-19,y:17,focusX:30,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    },
    compact: {
      label:'Compact', code:'COMPACT', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_compact.webp',
      overview:'assets/images/showshine/ss_compact.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_compact_int.webp',wheels:null,engine:'assets/images/showshine/ss_compact_eng.webp',impression:null},
      focus:{
        fit:{scale:1.5,x:8,y:2,focusX:60,focusY:50}, corrosion:{scale:1.86,x:-10,y:19,focusX:34,focusY:76},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.6,x:10,y:4,focusX:62,focusY:46},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.08,x:-19,y:18,focusX:31,focusY:73},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    z3: {
      label:'Z3', code:'Z3', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_z3.webp',
      overview:'assets/images/showshine/ss_z3.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_z3_int.webp',wheels:null,engine:'assets/images/showshine/ss_z3_eng.webp',impression:null},
      focus:{
        fit:{scale:1.48,x:8,y:2,focusX:61,focusY:49}, corrosion:{scale:1.84,x:-9,y:18,focusX:36,focusY:75},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.58,x:11,y:3,focusX:64,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.02,x:-17,y:17,focusX:33,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    mpower: {
      label:'///M Power', code:'M POWER', winnerName:'Ukázka kategorie · vítěze 2026 doplníme', temporary:true,
      thumb:'assets/images/showshine/ss_mpower.webp',
      overview:'assets/images/showshine/ss_mpower.webp',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'assets/images/showshine/ss_mpower_int.webp',wheels:null,engine:'assets/images/showshine/ss_mpower_eng.webp',impression:null},
      focus:{
        fit:{scale:1.52,x:8,y:1,focusX:61,focusY:47}, corrosion:{scale:1.88,x:-10,y:19,focusX:35,focusY:76},
        originality:{scale:1.14,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:11,y:3,focusX:64,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.1,x:-19,y:17,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    }
  }
};
