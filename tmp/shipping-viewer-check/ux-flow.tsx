import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {NewShippingQuoteSection,SettingsSection} from '../../src/features/shipping/ShippingQuotesDashboard';
import '../../src/styles.css';
const box={id:'box',name:'Caja',internal_code:'BOX',is_active:true,sort_order:1,length:20,width:20,height:20,internal_length:20,internal_width:20,internal_height:20,external_length:21,external_width:21,external_height:21,empty_weight:.12,max_weight:3,max_fill_percent:90,dimension_unit:'CM',weight_unit:'KG'};
const config={is_active:true,environment:'SANDBOX',origin_country_code:'MX',origin_postal_code:'44190',origin_city:'Guadalajara',origin_state_code:'JA',preferred_currency:'MXN'};
const row={id:'test-product',sku:'051025TD011P0000C1P2K5',product_name:'Etiqueta',length_cm:12.67,width_cm:12.67,height_cm:5.5,unit_weight_kg:.489,updated_at:'2026-11-12T12:00:00Z',source_row:51};
window.__calls={quotes:0,deletes:0};
window.__shippingMock=async(action)=>{
 if(action==='lookupOdooOrder')return {order:{id:1,name:'S123',amountTotal:100,currencyCode:'MXN'},destination:{name:'Cliente',postalCode:''},lines:[{lineId:1,productId:1,sku:row.sku,productName:'Etiqueta',quantity:1,uom:'Rollos',lengthCm:12.67,widthCm:12.67,heightCm:5.5,weightKg:.489,isEligibleForShipping:true,missingFields:[]}]};
 if(action==='createQuote'){window.__calls.quotes++;await new Promise(r=>setTimeout(r,100));throw Error('Error FedEx simulado para comprobar reintento manual');}
 if(action==='listProductDimensions')return {rows:[row],total:1};
 if(action==='deleteProductDimension'){window.__calls.deletes++;return {deleted:true};}
 return {};
};
const root=createRoot(document.getElementById('root')!),client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
window.__settings=()=>root.render(<QueryClientProvider client={client}><div className="shipping-quotes-shell"><SettingsSection bootstrap={{config,packageTypes:[box],access:{isAdmin:true,canAccess:true}}}/></div></QueryClientProvider>);
root.render(<QueryClientProvider client={client}><div className="shipping-quotes-shell" style={{padding:18}}><NewShippingQuoteSection config={config} packageTypes={[box]} isAdmin={true} onOpenSettings={()=>{}} onQuoted={()=>{}}/></div></QueryClientProvider>);
