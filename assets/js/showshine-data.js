/*
 * E36 United — Show & Shine data
 * --------------------------------
 * Až budou k dispozici fotografie skutečných vítězů, mění se primárně tento soubor.
 * Pro každou kategorii lze nastavit:
 * - winnerName: jméno / označení vozu
 * - thumb: miniatura vítěze
 * - overview: celkový pohled na stejné auto
 * - details: samostatné detailní fotky stejného auta (nebo nechat null = použije se zoom overview)
 * - focus: pozice kamery pro jednotlivé části auta
 */
window.E36_SHOWSHINE = {
  activeCategory: 'sedan',
  categories: {
    sedan: {
      label: 'Sedan',
      code: 'SEDAN',
      winnerName: 'Vítěz 2026 · foto doplníme',
      temporary: true,
      thumb: 'https://static.wixstatic.com/media/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg',
      overview: 'https://static.wixstatic.com/media/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_2643001dd52f4fdea45f31f25d3f2cde~mv2.jpeg',
      details: { exterior:null, interior:null, paint:null, wheels:null, engine:null },
      focus: {
        exterior:{scale:1.48,x:1,y:0,focusX:52,focusY:49}, interior:{scale:2.12,x:-7,y:5,focusX:43,focusY:47}, paint:{scale:2.32,x:10,y:2,focusX:59,focusY:45}, wheels:{scale:2.72,x:-22,y:17,focusX:31,focusY:68}, engine:{scale:2.28,x:24,y:-14,focusX:70,focusY:33}
      }
    },
    coupe: {
      label: 'Coupé', code:'COUPE', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_d34946fa7918436a9418ca49aaaf930a~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/united1.jpg',
      overview:'https://static.wixstatic.com/media/595239_d34946fa7918436a9418ca49aaaf930a~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/united1.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.5,x:0,y:0,focusX:51,focusY:48}, interior:{scale:2.15,x:-6,y:6,focusX:43,focusY:48}, paint:{scale:2.4,x:13,y:0,focusX:61,focusY:43}, wheels:{scale:2.76,x:-24,y:18,focusX:29,focusY:69}, engine:{scale:2.3,x:25,y:-14,focusX:72,focusY:33} }
    },
    touring: {
      label:'Touring', code:'TOURING', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_74ff92ac9591443684c3735a071a7ff7~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/Kopie%20johny_edited.jpg',
      overview:'https://static.wixstatic.com/media/595239_74ff92ac9591443684c3735a071a7ff7~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/Kopie%20johny_edited.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.44,x:0,y:0,focusX:53,focusY:49}, interior:{scale:2.05,x:-3,y:6,focusX:46,focusY:49}, paint:{scale:2.28,x:11,y:1,focusX:59,focusY:45}, wheels:{scale:2.65,x:-20,y:18,focusX:32,focusY:70}, engine:{scale:2.23,x:24,y:-13,focusX:70,focusY:34} }
    },
    cabrio: {
      label:'Cabrio', code:'CABRIO', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_377d5db21c10458f8a69bd9f3c6ae5b9~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/acs.jpg',
      overview:'https://static.wixstatic.com/media/595239_377d5db21c10458f8a69bd9f3c6ae5b9~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/acs.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.48,x:0,y:1,focusX:51,focusY:51}, interior:{scale:2.25,x:-5,y:0,focusX:45,focusY:41}, paint:{scale:2.38,x:11,y:3,focusX:59,focusY:47}, wheels:{scale:2.7,x:-21,y:18,focusX:31,focusY:70}, engine:{scale:2.25,x:24,y:-13,focusX:70,focusY:34} }
    },
    compact: {
      label:'Compact', code:'COMPACT', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_b8948cb0d5a54bcca7702e5ac25141b4~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/un2022.jpg',
      overview:'https://static.wixstatic.com/media/595239_b8948cb0d5a54bcca7702e5ac25141b4~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/un2022.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.52,x:0,y:1,focusX:52,focusY:50}, interior:{scale:2.15,x:-6,y:5,focusX:44,focusY:47}, paint:{scale:2.42,x:12,y:2,focusX:60,focusY:46}, wheels:{scale:2.8,x:-22,y:18,focusX:31,focusY:70}, engine:{scale:2.32,x:24,y:-14,focusX:70,focusY:33} }
    },
    z3: {
      label:'Z3', code:'Z3', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/u36_2.jpg',
      overview:'https://static.wixstatic.com/media/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/u36_2.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.46,x:1,y:0,focusX:53,focusY:48}, interior:{scale:2.26,x:-3,y:2,focusX:47,focusY:42}, paint:{scale:2.35,x:13,y:1,focusX:61,focusY:45}, wheels:{scale:2.74,x:-20,y:17,focusX:32,focusY:69}, engine:{scale:2.3,x:25,y:-13,focusX:71,focusY:34} }
    },
    mpower: {
      label:'///M Power', code:'M POWER', winnerName:'Vítěz 2026 · foto doplníme', temporary:true,
      thumb:'https://static.wixstatic.com/media/595239_ec7e6c1d65a34624af4d30d3bf4c4143~mv2.jpg/v1/fill/w_900%2Ch_650%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_ec7e6c1d65a34624af4d30d3bf4c4143~mv2.jpg',
      overview:'https://static.wixstatic.com/media/595239_ec7e6c1d65a34624af4d30d3bf4c4143~mv2.jpg/v1/fill/w_1600%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_ec7e6c1d65a34624af4d30d3bf4c4143~mv2.jpg',
      details:{exterior:null,interior:null,paint:null,wheels:null,engine:null},
      focus:{ exterior:{scale:1.5,x:0,y:0,focusX:52,focusY:49}, interior:{scale:2.2,x:-6,y:5,focusX:44,focusY:47}, paint:{scale:2.45,x:12,y:1,focusX:60,focusY:45}, wheels:{scale:2.82,x:-23,y:18,focusX:30,focusY:70}, engine:{scale:2.38,x:25,y:-14,focusX:71,focusY:33} }
    }
  }
};
