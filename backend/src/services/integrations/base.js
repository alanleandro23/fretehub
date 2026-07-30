function mockResult(carrierName, payload, base, days){
  const weight = Number(payload.pesoTotal || 1);
  const value = Number(payload.valorMercadoria || 0);
  const freightValue = Number((base + weight * 4.2 + value * 0.012).toFixed(2));
  return { carrierName, status:'success', freightValue, deadline:`${days} dias úteis`, modality: payload.modal || 'Rodoviário', message:null, rawResponse:{mock:true, carrierName, payloadHash: Date.now()} };
}
module.exports={mockResult};
