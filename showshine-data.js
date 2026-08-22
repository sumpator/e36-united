/*
 * E36 United — Show & Shine reference data
 * v13: body-type accurate reference photos + 8 judging focus points.
 * Reference photos are used until real 2026 winner photos are supplied.
 */
window.E36_SHOWSHINE = {
  activeCategory: 'sedan',
  categories: {
    sedan: {
      label:'Sedan', code:'SEDAN', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW-E36-sedan.jpg?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW-E36-sedan.jpg?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20interior.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/328I%20engine%20bay%20e36.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.55,x:9,y:1,focusX:62,focusY:48}, corrosion:{scale:1.9,x:-8,y:18,focusX:37,focusY:76},
        originality:{scale:1.18,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:10,y:4,focusX:64,focusY:45},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.1,x:-20,y:18,focusX:29,focusY:73},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.04,x:0,y:0,focusX:50,focusY:50}
      }
    },
    coupe: {
      label:'Coupé', code:'COUPE', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20Coupe.JPG?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20Coupe.JPG?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20interior.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/Bmw%20316%20e36%20engine%20bay-1.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.52,x:7,y:1,focusX:60,focusY:47}, corrosion:{scale:1.86,x:-9,y:18,focusX:35,focusY:75},
        originality:{scale:1.16,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:10,y:4,focusX:63,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.06,x:-18,y:18,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    },
    touring: {
      label:'Touring', code:'TOURING', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/E36touring.JPG?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/E36touring.JPG?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20interior.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/328I%20engine%20bay%20e36.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.5,x:7,y:1,focusX:60,focusY:48}, corrosion:{scale:1.86,x:-9,y:18,focusX:34,focusY:76},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.58,x:9,y:3,focusX:62,focusY:45},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.04,x:-18,y:17,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    cabrio: {
      label:'Cabrio', code:'CABRIO', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/%2797-%2799%20BMW%20E36%20Cabrio.jpg?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/%2797-%2799%20BMW%20E36%20Cabrio.jpg?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/Int%C3%A9rieur%20E36%20cabriolet.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/Bmw%20316%20e36%20engine%20bay-1.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.5,x:6,y:1,focusX:58,focusY:49}, corrosion:{scale:1.88,x:-10,y:19,focusX:34,focusY:76},
        originality:{scale:1.15,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.6,x:10,y:4,focusX:63,focusY:46},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.08,x:-19,y:17,focusX:30,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    },
    compact: {
      label:'Compact', code:'COMPACT', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20E36%20Compact.jpg?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20E36%20Compact.jpg?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20interior.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/Bmw%20316%20e36%20engine%20bay-1.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.5,x:8,y:2,focusX:60,focusY:50}, corrosion:{scale:1.86,x:-10,y:19,focusX:34,focusY:76},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.6,x:10,y:4,focusX:62,focusY:46},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.08,x:-19,y:18,focusX:31,focusY:73},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    z3: {
      label:'Z3', code:'Z3', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/1996-1998%20BMW%20Z3%20Roadster.jpg?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/1996-1998%20BMW%20Z3%20Roadster.jpg?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20Z3%2020i%201999%20Innenraum%200907.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20Z3%2020i%201999%20Motorraum%200913.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.48,x:8,y:2,focusX:61,focusY:49}, corrosion:{scale:1.84,x:-9,y:18,focusX:36,focusY:75},
        originality:{scale:1.12,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.58,x:11,y:3,focusX:64,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.02,x:-17,y:17,focusX:33,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.02,x:0,y:0,focusX:50,focusY:50}
      }
    },
    mpower: {
      label:'///M Power', code:'M POWER', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20M3%20%28E36%2C%201998%29%20%2855207349456%29.jpg?width=1200',
      overview:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20M3%20%28E36%2C%201998%29%20%2855207349456%29.jpg?width=1800',
      details:{fit:null,corrosion:null,originality:null,paint:null,interior:'https://commons.wikimedia.org/wiki/Special:FilePath/E36%20interior.jpg?width=1600',wheels:null,engine:'https://commons.wikimedia.org/wiki/Special:FilePath/BMW%20S50B32.jpg?width=1600',impression:null},
      focus:{
        fit:{scale:1.52,x:8,y:1,focusX:61,focusY:47}, corrosion:{scale:1.88,x:-10,y:19,focusX:35,focusY:76},
        originality:{scale:1.14,x:0,y:0,focusX:50,focusY:50}, paint:{scale:1.62,x:11,y:3,focusX:64,focusY:44},
        interior:{scale:1,x:0,y:0,focusX:50,focusY:50}, wheels:{scale:2.1,x:-19,y:17,focusX:31,focusY:72},
        engine:{scale:1,x:0,y:0,focusX:50,focusY:50}, impression:{scale:1.03,x:0,y:0,focusX:50,focusY:50}
      }
    }
  }
};
