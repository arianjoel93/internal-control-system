import React from 'react';
import {createRoot} from 'react-dom/client';
import {ShippingPackingViewer} from '/src/features/shipping/ShippingPackingViewer';
import {generatePackingPlan} from '/supabase/functions/_shared/shipping-packing';
import '/src/styles.css';
const plan=generatePackingPlan([{lineId:1,productId:1,sku:'051025TD011P0000C1P2K5',productName:'Etiqueta 51 × 25',quantity:100,uom:'Millares',lengthCm:12.67,widthCm:12.67,heightCm:5.5,weightKg:.489,
logisticsMetadata:{version:1,physical_unit:'ROLLO',weight_origin:'ESTIMATED',dimensions_origin:'ESTIMATED',weight_method:'Ejemplo',dimensions_method:'Ejemplo',confidence:'LOW',source_sheet:null,notes:null,
standard_presentation:{units_per_box:36,length_cm:38,width_cm:38,height_cm:22,gross_weight_kg:18,origin:'DECLARED'}}}],
[{id:'box3',name:'Caja 3',internal_code:'CAJA3',is_active:true,sort_order:1,length:26,width:26,height:32,external_length:27,external_width:27,external_height:33,empty_weight:.4,dimension_unit:'CM',weight_unit:'KG',max_weight:10,max_fill_percent:90}]);
createRoot(document.getElementById('root')!).render(<div className="shipping-quotes-shell" style={{padding:20,fontFamily:'system-ui'}}><ShippingPackingViewer plan={plan}/></div>);
