const test=require('node:test'),assert=require('node:assert/strict');
const {books}=require('../js/trade-details.js');
const buy={symbol:'NCLH',role:'entry',side:'buy',qty:'65',filledQty:'65',price:'15.25',status:'filled',at:'2026-10-07T13:36:19.417578Z'};
const sell={...buy,role:'protective_stop',side:'sell',price:'15.19',at:'2026-10-07T13:36:47.638625Z'};
test('broker fills produce actual shares, cost, P/L and holding duration',()=>{
  const b=books([sell,buy])[0];
  assert.equal(b.shares,65);assert.equal(b.cost,991.25);assert.equal(b.closed,true);
  assert.ok(Math.abs(b.realizedPl+3.90)<1e-9);assert.ok(Math.abs(b.heldSeconds-28.221)<0.002);
  assert.equal(b.exitReason,'Protective stop');
});
test('pending, zero fills, and partial exits never claim a closed trade',()=>{
  assert.equal(books([{...buy,filledQty:'0',price:null,status:'new'}])[0].closed,false);
  assert.equal(books([buy,{...sell,filledQty:'20'}])[0].realizedPl,null);
});
test('canceled unrelated order and multiple symbols do not contaminate totals',()=>{
  const b=books([buy,sell,{...sell,role:'unrelated',filledQty:'100'}])[0];
  assert.equal(b.sold,65);
});
