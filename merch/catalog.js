// Verified visual sources: docs/merch-shop.md. No prices/sizes/stock have been
// approved for these products. The old SVG placeholders are not this catalog.
const variant=(id,color,swatch,image)=>({id,color,swatch,image,priceMinor:null,sizes:[],availability:'unconfirmed'});
export const catalog=[
 {id:'united-u-polo',name:'United U',type:'Polo',category:'polo',description:'Polo s límečkem a motivem United U.',variants:[
  variant('u-polo-navy','Tmavě modrá / modré U','#14243d','polo-navy'),
  variant('u-polo-white','Bílá / zlaté U','#f5f3ec','polo-white'),
  variant('u-polo-blue','Modrá / bílé U','#0874b4','polo-blue')]},
 {id:'stay-united-men',name:'Stay United',type:'Pánské tričko · kulatý výstřih',category:'tee',description:'Motiv Stay United na pánském tričku.',variants:[variant('stay-men-black','Černá','#222','stay-men-black')]},
 {id:'stay-united-women-v',name:'Stay United',type:'Dámské tričko · V výstřih',category:'tee',description:'Motiv Stay United na dámském tričku s výstřihem do V.',variants:[
  variant('stay-women-black','Černá','#222','stay-women-black'),
  variant('stay-women-blue','Modrá','#2857b8','stay-women-blue'),
  variant('stay-women-pink','Růžová','#e88fb8','stay-women-pink')]},
 {id:'e36-cars-men',name:'E36 United',type:'Pánské tričko · kulatý výstřih',category:'tee',description:'Motiv aut E36 United na pánském tričku.',variants:[variant('cars-men-black','Černá','#222','cars-men-black')]},
 {id:'e36-cars-women-round',name:'E36 United',type:'Dámské tričko · kulatý výstřih',category:'tee',description:'Motiv aut E36 United na dámském tričku s kulatým výstřihem.',variants:[variant('cars-women-black','Černá','#222','cars-women-black')]},
 {id:'e36-cars-women-v',name:'E36 United',type:'Dámské tričko · V výstřih',category:'tee',description:'Motiv aut E36 United na dámském tričku s výstřihem do V.',variants:[variant('cars-women-grey-v','Šedá','#737373','cars-women-grey-v')]},
];
export const shopSettings={
 currency:'CZK',recipient:'united@e36united.cz',transport:'mailto',
 // A verified handover method must be supplied before checkout is enabled.
 fulfillment:null,
};
export function imageSource(variant,kind='card'){
 return `assets/images/merch/${variant.image}-${kind}.webp`;
}
export function productImages(variant){
 const main={src:imageSource(variant,'detail'),zoom:imageSource(variant,'zoom'),label:'Celá vizualizace'};
 return variant.image.startsWith('polo-')?[main,...['Motiv U','Límeček','Rukáv'].map((label,i)=>({src:imageSource(variant,`close-${i+1}`),zoom:imageSource(variant,`close-${i+1}`),label}))]:[main];
}
export function missingCommerce(variant){
 return [!Number.isSafeInteger(variant.priceMinor)||variant.priceMinor<=0?'cena':null,
  !variant.sizes.length?'velikosti':null,variant.availability!=='available'?'dostupnost':null].filter(Boolean);
}
export const money=value=>new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:2}).format(value/100);
